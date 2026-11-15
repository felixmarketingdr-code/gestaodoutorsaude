
const fs = require("fs");
const path = require("path");

// ======================================================
// 1. CAMINHOS REAIS DO PROJETO
// ======================================================

const BACKEND_DIR = path.resolve(__dirname, "../../..");

const ENV_PATH = path.join(BACKEND_DIR, ".env");

const CREDENTIAL_PATH = path.join(
  BACKEND_DIR,
  "credentials",
  "firebase-service-account.json"
);

// ======================================================
// 2. CARREGAR O .ENV
// ======================================================

if (!fs.existsSync(ENV_PATH)) {
  console.error("Arquivo .env não encontrado:", ENV_PATH);
  process.exit(1);
}

require("dotenv").config({
  path: ENV_PATH,
  override: true,
  quiet: true,
});

const projectId = process.env.FIREBASE_PROJECT_ID;

if (!projectId) {
  console.error("FIREBASE_PROJECT_ID não encontrado no .env.");
  process.exit(1);
}

// ======================================================
// 3. IMPORTAR FIREBASE ADMIN
// ======================================================

const {
  initializeApp,
  cert,
  getApps,
} = require("firebase-admin/app");

const {
  getFirestore,
  FieldValue,
} = require("firebase-admin/firestore");

// ======================================================
// 4. RECEBER OS PARÂMETROS
// ======================================================

const [contratoId, ...descricaoPartes] = process.argv.slice(2);

const descricao = descricaoPartes.join(" ").trim();

if (!contratoId || !descricao) {
  console.error(
    '\nUso:\nnode src/scripts/criarHistorico.js CONTRATO_ID "Descrição"\n'
  );
  process.exit(1);
}

// ======================================================
// 5. VALIDAR CREDENCIAL
// ======================================================

if (!fs.existsSync(CREDENTIAL_PATH)) {
  console.error("\nCredencial Firebase não encontrada:");
  console.error(CREDENTIAL_PATH);
  process.exit(1);
}

let serviceAccount;

try {
  serviceAccount = JSON.parse(
    fs.readFileSync(CREDENTIAL_PATH, "utf8")
  );
} catch (error) {
  console.error("Erro ao ler a credencial:", error.message);
  process.exit(1);
}

if (
  !serviceAccount.project_id ||
  !serviceAccount.client_email ||
  !serviceAccount.private_key
) {
  console.error(
    "O JSON não contém uma credencial válida de conta de serviço."
  );
  process.exit(1);
}

if (serviceAccount.project_id !== projectId) {
  console.error("\nOs projetos Firebase não correspondem.");
  console.error("Projeto do .env:", projectId);
  console.error("Projeto da credencial:", serviceAccount.project_id);
  process.exit(1);
}

// ======================================================
// 6. INICIALIZAR FIREBASE
// ======================================================

const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert(serviceAccount),
        projectId,
      });

const db = getFirestore(app);

// ======================================================
// 7. CRIAR HISTÓRICO
// ======================================================

async function criarHistorico() {
  console.log("\n======================================");
  console.log("CRIANDO HISTÓRICO DO CONTRATO");
  console.log("======================================");

  console.log("Projeto:", projectId);
  console.log("Contrato:", contratoId);

  // Localiza o contrato.
  const contratoRef = db
    .collection("contratos")
    .doc(contratoId);

  const contratoSnap = await contratoRef.get();

  if (!contratoSnap.exists) {
    throw new Error(
      `Contrato ${contratoId} não encontrado na coleção contratos.`
    );
  }

  const contrato = contratoSnap.data() || {};

  // Obtém o clienteId do próprio contrato.
  // Não procura o cliente na coleção clientes.
  const clienteId = contrato.clienteId || null;

  // ====================================================
  // 8. COLEÇÃO GENÉRICA DE HISTÓRICOS
  // ====================================================

  const historicoRef = db
    .collection("historicoContratos")
    .doc(contratoId);

  const eventoRef = historicoRef
    .collection("eventos")
    .doc();

  const evento = {
    eventoId: eventoRef.id,

    contratoId,
    clienteId,

    tipo: "registro_manual",
    descricao,

    usuarioId: "administrador_terminal",
    usuarioNome: "Administrador",

    origem: "terminal_admin",

    criadoEm: FieldValue.serverTimestamp(),
  };

  // ====================================================
  // 9. GRAVAÇÃO ATÔMICA
  // ====================================================

  const batch = db.batch();

  // Documento principal do histórico.
  batch.set(
    historicoRef,
    {
      contratoId,
      clienteId,
      atualizadoEm: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Registra o evento.
  batch.set(eventoRef, evento);

  // Atualiza referência do último evento no contrato.
  batch.set(
    contratoRef,
    {
      ultimoEventoHistoricoId: eventoRef.id,
      ultimoEventoHistoricoEm: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await batch.commit();

  // ====================================================
  // 10. CONFIRMAÇÃO
  // ====================================================

  console.log("\n======================================");
  console.log("HISTÓRICO CRIADO COM SUCESSO!");
  console.log("======================================");

  console.log("Projeto:", projectId);
  console.log("Contrato:", contratoId);
  console.log("Cliente:", clienteId || "Não informado");
  console.log("Evento:", eventoRef.id);
  console.log("Descrição:", descricao);

  console.log("\nCaminho no Firestore:");
  console.log(
    `historicoContratos/${contratoId}/eventos/${eventoRef.id}`
  );

  console.log("\n======================================");
}

// ======================================================
// 11. EXECUÇÃO
// ======================================================

criarHistorico()
  .catch((error) => {
    console.error("\nERRO AO CRIAR HISTÓRICO:");
    console.error(error.message || error);

    if (
      error.code === 7 ||
      error.code === "permission-denied"
    ) {
      console.error(
        "Verifique as permissões da conta de serviço no Firestore."
      );
    }

    if (
      error.code === 16 ||
      error.code === "UNAUTHENTICATED"
    ) {
      console.error("Verifique a credencial Firebase.");
    }

    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await app.delete();
    } catch (_) {
      // Não altera o resultado da operação.
    }
  });
