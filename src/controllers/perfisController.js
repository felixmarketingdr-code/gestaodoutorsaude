
const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

const ACOES_VALIDAS = [
  "visualizar",
  "incluir",
  "editar",
  "excluir",
];

function normalizarPermissoes(permissoes) {
  const resultado = {};

  if (
    !permissoes ||
    typeof permissoes !== "object" ||
    Array.isArray(permissoes)
  ) {
    return resultado;
  }

  for (const [modulo, acoes] of Object.entries(permissoes)) {
    if (
      !modulo ||
      !acoes ||
      typeof acoes !== "object" ||
      Array.isArray(acoes)
    ) {
      continue;
    }

    resultado[modulo] = {};

    for (const acao of ACOES_VALIDAS) {
      resultado[modulo][acao] = acoes[acao] === true;
    }
  }

  return resultado;
}

function responderErro(res, status, mensagem) {
  return res.status(status).json({
    sucesso: false,
    mensagem,
  });
}

// GET /api/perfis
async function listarPerfis(req, res) {
  try {
    const snapshot = await db.collection("perfis").get();

    const perfis = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    perfis.sort((a, b) =>
      String(a.nome || "").localeCompare(
        String(b.nome || ""),
        "pt-BR"
      )
    );

    return res.json({
      sucesso: true,
      perfis,
    });
  } catch (error) {
    console.error("Erro ao listar perfis:", error);

    return responderErro(
      res,
      500,
      "Não foi possível listar os perfis."
    );
  }
}

// POST /api/perfis
async function criarPerfil(req, res) {
  try {
    const nome = String(req.body.nome || "").trim();
    const descricao = String(req.body.descricao || "").trim();

    if (!nome) {
      return responderErro(
        res,
        400,
        "Informe o nome do perfil."
      );
    }

    const existente = await db
      .collection("perfis")
      .where("nomeNormalizado", "==", nome.toLowerCase())
      .limit(1)
      .get();

    if (!existente.empty) {
      return responderErro(
        res,
        409,
        "Já existe um perfil com esse nome."
      );
    }

    const permissoes = normalizarPermissoes(
      req.body.permissoes
    );

    const novoPerfil = {
      nome,
      nomeNormalizado: nome.toLowerCase(),
      descricao,
      permissoes,
      ativo: true,
      criadoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
      criadoPor: req.usuario.uid,
    };

    const referencia = await db
      .collection("perfis")
      .add(novoPerfil);

    return res.status(201).json({
      sucesso: true,
      mensagem: "Perfil criado com sucesso.",
      perfil: {
        id: referencia.id,
        ...novoPerfil,
      },
    });
  } catch (error) {
    console.error("Erro ao criar perfil:", error);

    return responderErro(
      res,
      500,
      "Não foi possível criar o perfil."
    );
  }
}

// PUT /api/perfis/:id
async function editarPerfil(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    const nome = String(req.body.nome || "").trim();
    const descricao = String(req.body.descricao || "").trim();

    if (!id || !nome) {
      return responderErro(
        res,
        400,
        "Informe o ID e o nome do perfil."
      );
    }

    const referencia = db.collection("perfis").doc(id);
    const documento = await referencia.get();

    if (!documento.exists) {
      return responderErro(
        res,
        404,
        "Perfil não encontrado."
      );
    }

    const existente = await db
      .collection("perfis")
      .where("nomeNormalizado", "==", nome.toLowerCase())
      .limit(2)
      .get();

    const conflito = existente.docs.some(
      (doc) => doc.id !== id
    );

    if (conflito) {
      return responderErro(
        res,
        409,
        "Já existe outro perfil com esse nome."
      );
    }

    const permissoes = normalizarPermissoes(
      req.body.permissoes
    );

    await referencia.update({
      nome,
      nomeNormalizado: nome.toLowerCase(),
      descricao,
      permissoes,
      atualizadoEm: FieldValue.serverTimestamp(),
      atualizadoPor: req.usuario.uid,
    });

    // Atualiza o nome do perfil nos cadastros dos usuários.
    const usuarios = await db
      .collection("usuarios")
      .where("perfilId", "==", id)
      .get();

    const lote = db.batch();

    usuarios.docs.forEach((doc) => {
      lote.update(doc.ref, {
        perfilNome: nome,
        atualizadoEm: FieldValue.serverTimestamp(),
      });
    });

    if (!usuarios.empty) {
      await lote.commit();
    }

    return res.json({
      sucesso: true,
      mensagem: "Perfil atualizado com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao editar perfil:", error);

    return responderErro(
      res,
      500,
      "Não foi possível atualizar o perfil."
    );
  }
}

// DELETE /api/perfis/:id
async function excluirPerfil(req, res) {
  try {
    const id = String(req.params.id || "").trim();

    if (!id) {
      return responderErro(
        res,
        400,
        "ID do perfil não informado."
      );
    }

    const referencia = db.collection("perfis").doc(id);
    const documento = await referencia.get();

    if (!documento.exists) {
      return responderErro(
        res,
        404,
        "Perfil não encontrado."
      );
    }

    const usuarios = await db
      .collection("usuarios")
      .where("perfilId", "==", id)
      .limit(1)
      .get();

    if (!usuarios.empty) {
      return responderErro(
        res,
        409,
        "Este perfil está atribuído a usuários. Altere o perfil desses usuários antes de excluí-lo."
      );
    }

    await referencia.delete();

    return res.json({
      sucesso: true,
      mensagem: "Perfil excluído com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao excluir perfil:", error);

    return responderErro(
      res,
      500,
      "Não foi possível excluir o perfil."
    );
  }
}

module.exports = {
  listarPerfis,
  criarPerfil,
  editarPerfil,
  excluirPerfil,
};
