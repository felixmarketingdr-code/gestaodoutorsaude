
const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

const COLECAO_PERFIS = "perfis";
const COLECAO_USUARIOS = "usuarios";

const ACOES_VALIDAS = [
  "visualizar",
  "incluir",
  "editar",
  "excluir",
];

// ========================================
// FUNÇÕES AUXILIARES
// ========================================

function responderErro(res, status, mensagem) {
  return res.status(status).json({
    sucesso: false,
    mensagem,
  });
}

function normalizarTexto(valor) {
  return String(valor || "").trim();
}

function normalizarNome(valor) {
  return normalizarTexto(valor).toLocaleLowerCase("pt-BR");
}

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
    const nomeModulo = normalizarTexto(modulo);

    if (
      !nomeModulo ||
      !acoes ||
      typeof acoes !== "object" ||
      Array.isArray(acoes)
    ) {
      continue;
    }

    resultado[nomeModulo] = {};

    for (const acao of ACOES_VALIDAS) {
      resultado[nomeModulo][acao] = acoes[acao] === true;
    }
  }

  return resultado;
}

function formatarPerfil(documento) {
  const dados = documento.data();

  return {
    id: documento.id,
    nome: dados.nome || dados.perfilNome || "",
    descricao: dados.descricao || "",
    permissoes: normalizarPermissoes(dados.permissoes),
    ativo: dados.ativo !== false,
    criadoEm: dados.criadoEm || null,
    atualizadoEm: dados.atualizadoEm || null,
    criadoPor: dados.criadoPor || null,
  };
}

function validarAdministrador(req, res) {
  if (!req.usuario?.uid) {
    responderErro(
      res,
      401,
      "Usuário não autenticado."
    );

    return false;
  }

  return true;
}

// Verifica se já existe outro perfil com o mesmo nome.
// Também considera documentos antigos sem nomeNormalizado.
async function verificarNomeDuplicado(nome, idIgnorado = null) {
  const snapshot = await db
    .collection(COLECAO_PERFIS)
    .get();

  const nomeNormalizado = normalizarNome(nome);

  return snapshot.docs.some((documento) => {
    if (idIgnorado && documento.id === idIgnorado) {
      return false;
    }

    const dados = documento.data();

    const nomeExistente = normalizarNome(
      dados.nome || dados.perfilNome || ""
    );

    const nomeSalvo = normalizarNome(
      dados.nomeNormalizado || ""
    );

    return (
      nomeExistente === nomeNormalizado ||
      nomeSalvo === nomeNormalizado
    );
  });
}

// Busca usuários vinculados ao perfil.
// Considera tanto perfilId quanto perfil para compatibilidade.
async function buscarUsuariosDoPerfil(perfilId) {
  const [porPerfilId, porPerfil] = await Promise.all([
    db
      .collection(COLECAO_USUARIOS)
      .where("perfilId", "==", perfilId)
      .get(),

    db
      .collection(COLECAO_USUARIOS)
      .where("perfil", "==", perfilId)
      .get(),
  ]);

  const documentos = new Map();

  porPerfilId.docs.forEach((doc) => {
    documentos.set(doc.id, doc);
  });

  porPerfil.docs.forEach((doc) => {
    documentos.set(doc.id, doc);
  });

  return Array.from(documentos.values());
}

// ========================================
// GET /api/perfis
// LISTAR PERFIS
// ========================================

async function listarPerfis(req, res) {
  try {
    if (!validarAdministrador(req, res)) {
      return;
    }

    const snapshot = await db
      .collection(COLECAO_PERFIS)
      .get();

    const perfis = snapshot.docs
      .map(formatarPerfil)
      .sort((a, b) =>
        a.nome.localeCompare(b.nome, "pt-BR")
      );

    return res.status(200).json({
      sucesso: true,
      total: perfis.length,
      perfis,
    });
  } catch (error) {
    console.error(
      "Erro ao listar perfis:",
      error
    );

    return responderErro(
      res,
      500,
      "Não foi possível carregar os perfis."
    );
  }
}

// ========================================
// POST /api/perfis
// CRIAR PERFIL
// ========================================

async function criarPerfil(req, res) {
  try {
    if (!validarAdministrador(req, res)) {
      return;
    }

    const nome = normalizarTexto(req.body?.nome);
    const descricao = normalizarTexto(req.body?.descricao);

    if (!nome) {
      return responderErro(
        res,
        400,
        "Informe o nome do perfil."
      );
    }

    if (nome.length > 80) {
      return responderErro(
        res,
        400,
        "O nome do perfil deve ter no máximo 80 caracteres."
      );
    }

    const duplicado = await verificarNomeDuplicado(nome);

    if (duplicado) {
      return responderErro(
        res,
        409,
        "Já existe um perfil com esse nome."
      );
    }

    const permissoes = normalizarPermissoes(
      req.body?.permissoes
    );

    const dadosPerfil = {
      nome,
      nomeNormalizado: normalizarNome(nome),
      descricao,
      permissoes,
      ativo: true,
      criadoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
      criadoPor: req.usuario.uid,
    };

    const referencia = await db
      .collection(COLECAO_PERFIS)
      .add(dadosPerfil);

    return res.status(201).json({
      sucesso: true,
      mensagem: "Perfil criado com sucesso.",
      perfil: {
        id: referencia.id,
        nome,
        nomeNormalizado: normalizarNome(nome),
        descricao,
        permissoes,
        ativo: true,
      },
    });
  } catch (error) {
    console.error(
      "Erro ao criar perfil:",
      error
    );

    return responderErro(
      res,
      500,
      "Não foi possível criar o perfil."
    );
  }
}

// ========================================
// PUT /api/perfis/:id
// EDITAR PERFIL
// ========================================

async function editarPerfil(req, res) {
  try {
    if (!validarAdministrador(req, res)) {
      return;
    }

    const id = normalizarTexto(req.params.id);
    const nome = normalizarTexto(req.body?.nome);
    const descricao = normalizarTexto(req.body?.descricao);

    if (!id || !nome) {
      return responderErro(
        res,
        400,
        "Informe o ID e o nome do perfil."
      );
    }

    if (nome.length > 80) {
      return responderErro(
        res,
        400,
        "O nome do perfil deve ter no máximo 80 caracteres."
      );
    }

    const referencia = db
      .collection(COLECAO_PERFIS)
      .doc(id);

    const documento = await referencia.get();

    if (!documento.exists) {
      return responderErro(
        res,
        404,
        "Perfil não encontrado."
      );
    }

    const duplicado = await verificarNomeDuplicado(
      nome,
      id
    );

    if (duplicado) {
      return responderErro(
        res,
        409,
        "Já existe outro perfil com esse nome."
      );
    }

    const permissoes = normalizarPermissoes(
      req.body?.permissoes
    );

    // Atualiza o perfil sem modificar seu ID.
    await referencia.update({
      nome,
      nomeNormalizado: normalizarNome(nome),
      descricao,
      permissoes,
      atualizadoEm: FieldValue.serverTimestamp(),
      atualizadoPor: req.usuario.uid,
    });

    // Atualiza o nome nos usuários vinculados.
    const usuarios = await buscarUsuariosDoPerfil(id);

    // O Firestore permite no máximo 500 operações por lote.
    for (let inicio = 0; inicio < usuarios.length; inicio += 450) {
      const lote = db.batch();

      const grupo = usuarios.slice(
        inicio,
        inicio + 450
      );

      grupo.forEach((usuarioDoc) => {
        lote.update(usuarioDoc.ref, {
          perfilId: id,
          perfil: id,
          perfilNome: nome,
          atualizadoEm: FieldValue.serverTimestamp(),
        });
      });

      await lote.commit();
    }

    return res.status(200).json({
      sucesso: true,
      mensagem: "Perfil atualizado com sucesso.",
      perfil: {
        id,
        nome,
        nomeNormalizado: normalizarNome(nome),
        descricao,
        permissoes,
      },
      usuariosAtualizados: usuarios.length,
    });
  } catch (error) {
    console.error(
      "Erro ao editar perfil:",
      error
    );

    return responderErro(
      res,
      500,
      "Não foi possível atualizar o perfil."
    );
  }
}

// ========================================
// DELETE /api/perfis/:id
// EXCLUIR PERFIL
// ========================================

async function excluirPerfil(req, res) {
  try {
    if (!validarAdministrador(req, res)) {
      return;
    }

    const id = normalizarTexto(req.params.id);

    if (!id) {
      return responderErro(
        res,
        400,
        "ID do perfil não informado."
      );
    }

    const referencia = db
      .collection(COLECAO_PERFIS)
      .doc(id);

    const documento = await referencia.get();

    if (!documento.exists) {
      return responderErro(
        res,
        404,
        "Perfil não encontrado."
      );
    }

    const usuarios = await buscarUsuariosDoPerfil(id);

    if (usuarios.length > 0) {
      return responderErro(
        res,
        409,
        `Este perfil está atribuído a ${usuarios.length} usuário(s). Altere o perfil desses usuários antes de excluí-lo.`
      );
    }

    await referencia.delete();

    return res.status(200).json({
      sucesso: true,
      mensagem: "Perfil excluído com sucesso.",
    });
  } catch (error) {
    console.error(
      "Erro ao excluir perfil:",
      error
    );

    return responderErro(
      res,
      500,
      "Não foi possível excluir o perfil."
    );
  }
}

// ========================================
// EXPORTAÇÕES
// ========================================

module.exports = {
  listarPerfis,
  criarPerfil,
  editarPerfil,
  excluirPerfil,
};
