
const { auth, db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

function responderErro(res, status, mensagem) {
  return res.status(status).json({
    sucesso: false,
    mensagem,
  });
}

function normalizarTexto(valor) {
  return String(valor || "").trim();
}

async function buscarPerfilAtivo(perfilId) {
  if (!perfilId) return null;

  const documento = await db
    .collection("perfis")
    .doc(String(perfilId))
    .get();

  if (!documento.exists) return null;

  const perfil = documento.data();

  if (perfil.ativo === false) return null;

  return {
    id: documento.id,
    ...perfil,
  };
}

// GET /api/usuarios
async function listarUsuarios(req, res) {
  try {
    const snapshot = await db.collection("usuarios").get();

    const usuarios = snapshot.docs.map((doc) => {
      const dados = doc.data();

      return {
        uid: doc.id,
        ...dados,
        senha: undefined,
        senhaTemporaria: undefined,
      };
    });

    usuarios.sort((a, b) =>
      String(a.nome || "").localeCompare(
        String(b.nome || ""),
        "pt-BR"
      )
    );

    return res.json({
      sucesso: true,
      usuarios,
    });
  } catch (error) {
    console.error("Erro ao listar usuários:", error);

    return responderErro(
      res,
      500,
      "Não foi possível listar os usuários."
    );
  }
}

// POST /api/usuarios
async function criarUsuario(req, res) {
  let usuarioAuthCriado = null;

  try {
    const primeiroNome = normalizarTexto(req.body.primeiroNome);
    const segundoNome = normalizarTexto(req.body.segundoNome);
    const nome = `${primeiroNome} ${segundoNome}`.trim();
    const email = normalizarTexto(req.body.email).toLowerCase();
    const usuario = normalizarTexto(req.body.usuario);
    const senha = String(req.body.senha || "");

    const perfilId = normalizarTexto(
      req.body.perfilId || req.body.perfil
    );

    const ativo = req.body.ativo !== false;

    if (
      !primeiroNome ||
      !segundoNome ||
      !email ||
      !usuario ||
      !perfilId ||
      !senha
    ) {
      return responderErro(
        res,
        400,
        "Preencha todos os campos obrigatórios."
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return responderErro(res, 400, "E-mail inválido.");
    }

    if (senha.length < 6) {
      return responderErro(
        res,
        400,
        "A senha deve ter pelo menos 6 caracteres."
      );
    }

    const perfil = await buscarPerfilAtivo(perfilId);

    if (!perfil) {
      return responderErro(
        res,
        400,
        "O perfil selecionado não existe ou está desativado."
      );
    }

    const usuarioExistente = await db
      .collection("usuarios")
      .where("usuarioNormalizado", "==", usuario.toLowerCase())
      .limit(1)
      .get();

    if (!usuarioExistente.empty) {
      return responderErro(
        res,
        409,
        "Este nome de usuário já está cadastrado."
      );
    }

    // Cria a conta no Firebase Authentication
    // utilizando a senha definida no formulário.
    usuarioAuthCriado = await auth.createUser({
      email,
      password: senha,
      displayName: nome,
      disabled: !ativo,
      emailVerified: false,
    });

    const uid = usuarioAuthCriado.uid;

    const dadosUsuario = {
      uid,
      primeiroNome,
      segundoNome,
      nome,
      email,
      usuario,
      usuarioNormalizado: usuario.toLowerCase(),
      perfilId,
      perfil: perfilId,
      perfilNome: perfil.nome || "",
      ativo,
      admin: false,
      papel: "colaborador",
      criadoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
      criadoPor: req.usuario.uid,
      ultimoAcesso: null,
    };

    // Salva os dados do usuário no Firestore.
    await db.collection("usuarios").doc(uid).set(dadosUsuario);

    return res.status(201).json({
      sucesso: true,
      mensagem: "Usuário criado com sucesso.",
      usuario: {
        uid,
        nome,
        email,
        usuario,
        perfilId,
        perfilNome: perfil.nome || "",
        ativo,
      },
    });

  } catch (error) {
    console.error("Erro ao criar usuário:", error);

    // Se o Firestore falhar depois da criação no Auth,
    // remove a conta criada para evitar cadastro incompleto.
    if (usuarioAuthCriado?.uid) {
      try {
        await auth.deleteUser(usuarioAuthCriado.uid);
      } catch (erroExclusao) {
        console.error(
          "Erro ao desfazer criação do usuário:",
          erroExclusao.message
        );
      }
    }

    if (error.code === "auth/email-already-exists") {
      return responderErro(
        res,
        409,
        "Já existe uma conta com este e-mail."
      );
    }

    if (error.code === "auth/invalid-password") {
      return responderErro(
        res,
        400,
        "A senha informada não é válida."
      );
    }

    return responderErro(
      res,
      500,
      "Não foi possível criar o usuário."
    );
  }
}

// PUT /api/usuarios/:uid
async function editarUsuario(req, res) {
  try {
    const uid = normalizarTexto(req.params.uid);

    if (!uid) {
      return responderErro(res, 400, "UID não informado.");
    }

    const usuarioRef = db.collection("usuarios").doc(uid);
    const usuarioDoc = await usuarioRef.get();

    if (!usuarioDoc.exists) {
      return responderErro(res, 404, "Usuário não encontrado.");
    }

    const atual = usuarioDoc.data();

    const primeiroNome = normalizarTexto(
      req.body.primeiroNome ?? atual.primeiroNome
    );

    const segundoNome = normalizarTexto(
      req.body.segundoNome ?? atual.segundoNome
    );

    const nome = `${primeiroNome} ${segundoNome}`.trim();

    const email = normalizarTexto(
      req.body.email ?? atual.email
    ).toLowerCase();

    const usuario = normalizarTexto(
      req.body.usuario ?? atual.usuario
    );

    const perfilId = normalizarTexto(
      req.body.perfilId ??
      req.body.perfil ??
      atual.perfilId ??
      atual.perfil
    );

    if (
      !primeiroNome ||
      !segundoNome ||
      !email ||
      !usuario ||
      !perfilId
    ) {
      return responderErro(
        res,
        400,
        "Preencha todos os campos obrigatórios."
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return responderErro(res, 400, "E-mail inválido.");
    }

    const perfil = await buscarPerfilAtivo(perfilId);

    if (!perfil) {
      return responderErro(
        res,
        400,
        "O perfil selecionado não existe ou está desativado."
      );
    }

    const usuarioExistente = await db
      .collection("usuarios")
      .where("usuarioNormalizado", "==", usuario.toLowerCase())
      .limit(2)
      .get();

    const conflito = usuarioExistente.docs.some(
      (doc) => doc.id !== uid
    );

    if (conflito) {
      return responderErro(
        res,
        409,
        "Este nome de usuário já está sendo utilizado."
      );
    }

    const ativo = req.body.ativo === undefined
      ? atual.ativo !== false
      : req.body.ativo === true;

    // Atualiza os dados no Firebase Authentication.
    // Não altera a senha do usuário.
    await auth.updateUser(uid, {
      email,
      displayName: nome,
      disabled: !ativo,
    });

    const dadosAtualizados = {
      primeiroNome,
      segundoNome,
      nome,
      email,
      usuario,
      usuarioNormalizado: usuario.toLowerCase(),
      perfilId,
      perfil: perfilId,
      perfilNome: perfil.nome || "",
      ativo,
      atualizadoEm: FieldValue.serverTimestamp(),
      atualizadoPor: req.usuario.uid,
    };

    // Não aceita alteração de admin, papel ou UID enviada pelo navegador.
    await usuarioRef.update(dadosAtualizados);

    return res.json({
      sucesso: true,
      mensagem: "Usuário atualizado com sucesso.",
      usuario: {
        uid,
        ...dadosAtualizados,
      },
    });

  } catch (error) {
    console.error("Erro ao editar usuário:", error);

    if (error.code === "auth/user-not-found") {
      return responderErro(
        res,
        404,
        "Conta de autenticação não encontrada."
      );
    }

    if (error.code === "auth/email-already-exists") {
      return responderErro(
        res,
        409,
        "Este e-mail já está sendo utilizado."
      );
    }

    return responderErro(
      res,
      500,
      "Não foi possível atualizar o usuário."
    );
  }
}

// PATCH /api/usuarios/:uid/status
async function alterarStatusUsuario(req, res) {
  try {
    const uid = normalizarTexto(req.params.uid);
    const ativo = req.body.ativo;

    if (!uid || typeof ativo !== "boolean") {
      return responderErro(
        res,
        400,
        "Informe o UID e o novo status do usuário."
      );
    }

    if (uid === req.usuario.uid && ativo === false) {
      return responderErro(
        res,
        400,
        "Você não pode bloquear sua própria conta por esta operação."
      );
    }

    const usuarioRef = db.collection("usuarios").doc(uid);
    const usuarioDoc = await usuarioRef.get();

    if (!usuarioDoc.exists) {
      return responderErro(res, 404, "Usuário não encontrado.");
    }

    const dados = usuarioDoc.data();

    if (dados.admin === true && ativo === false) {
      return responderErro(
        res,
        403,
        "Esta conta administrativa não pode ser bloqueada por esta tela."
      );
    }

    await auth.updateUser(uid, {
      disabled: !ativo,
    });

    await usuarioRef.update({
      ativo,
      atualizadoEm: FieldValue.serverTimestamp(),
      atualizadoPor: req.usuario.uid,
    });

    // Revoga sessões existentes ao bloquear o usuário.
    if (!ativo) {
      await auth.revokeRefreshTokens(uid);
    }

    return res.json({
      sucesso: true,
      mensagem: ativo
        ? "Usuário reativado com sucesso."
        : "Usuário bloqueado com sucesso.",
    });

  } catch (error) {
    console.error("Erro ao alterar status do usuário:", error);

    if (error.code === "auth/user-not-found") {
      return responderErro(
        res,
        404,
        "Conta de autenticação não encontrada."
      );
    }

    return responderErro(
      res,
      500,
      "Não foi possível alterar o status do usuário."
    );
  }
}

module.exports = {
  listarUsuarios,
  criarUsuario,
  editarUsuario,
  alterarStatusUsuario,
};
