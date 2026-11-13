
const { auth } = require("../config/firebase");

async function concederAdministrador() {
  const uid = process.argv[2];

  if (!uid) {
    console.error("Informe o UID do usuário.");
    console.error("Exemplo: node src/scripts/concederAdmin.js UID_DO_USUARIO");
    process.exit(1);
  }

  try {
    const usuario = await auth.getUser(uid);

    // Preserva outras custom claims que já existam.
    const claimsAtuais = usuario.customClaims || {};

    await auth.setCustomUserClaims(uid, {
      ...claimsAtuais,
      admin: true,
    });

    console.log("Administrador configurado com sucesso.");
    console.log("E-mail:", usuario.email || "Não informado");
    console.log("UID:", usuario.uid);
    console.log("Claim admin: true");
    console.log("Peça ao usuário para sair e entrar novamente.");
  } catch (error) {
    console.error("Erro ao conceder administrador:", error.message);
    process.exitCode = 1;
  }
}

concederAdministrador();
