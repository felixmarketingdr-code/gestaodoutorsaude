
const { db } = require("../config/firebase");

/**
 * Busca o cadastro e as permissões do usuário autenticado.
 *
 * Espera que:
 * - A coleção "usuarios" tenha documentos identificados pelo UID.
 * - O usuário possua o campo perfilId ou perfil.
 * - A coleção "perfis" tenha documentos com as permissões.
 */
async function carregarPermissoes(req, res, next) {
  try {
    const uid = req.usuario?.uid;

    if (!uid) {
      return res.status(401).json({
        sucesso: false,
        mensagem: "Usuário não autenticado.",
      });
    }

    const usuarioRef = db.collection("usuarios").doc(uid);
    const usuarioDoc = await usuarioRef.get();

    if (!usuarioDoc.exists) {
      return res.status(403).json({
        sucesso: false,
        mensagem: "Cadastro de usuário não encontrado.",
      });
    }

    const dadosUsuario = usuarioDoc.data();

    if (
      dadosUsuario.ativo === false ||
      dadosUsuario.bloqueado === true
    ) {
      return res.status(403).json({
        sucesso: false,
        mensagem: "Seu acesso ao sistema está bloqueado.",
      });
    }

    const perfilId =
      dadosUsuario.perfilId ||
      dadosUsuario.perfil ||
      null;

    if (!perfilId) {
      return res.status(403).json({
        sucesso: false,
        mensagem: "Nenhum perfil de acesso foi atribuído ao usuário.",
      });
    }

    const perfilDoc = await db
      .collection("perfis")
      .doc(String(perfilId))
      .get();

    if (!perfilDoc.exists) {
      return res.status(403).json({
        sucesso: false,
        mensagem: "Perfil de acesso não encontrado.",
      });
    }

    const dadosPerfil = perfilDoc.data();

    if (dadosPerfil.ativo === false) {
      return res.status(403).json({
        sucesso: false,
        mensagem: "Este perfil está desativado.",
      });
    }

    const ehAdministrador =
      dadosUsuario.admin === true ||
      dadosUsuario.papel === "administrador" ||
      dadosPerfil.papel === "administrador";

    req.usuario = {
      ...req.usuario,
      ...dadosUsuario,
      uid,
      perfilId,
      perfilNome: dadosPerfil.nome || "",
      permissoes: dadosPerfil.permissoes || {},
      admin: ehAdministrador,
    };

    req.perfil = dadosPerfil;

    return next();
  } catch (error) {
    console.error(
      "Erro ao carregar permissões:",
      error
    );

    return res.status(500).json({
      sucesso: false,
      mensagem: "Não foi possível verificar as permissões do usuário.",
    });
  }
}

/**
 * Verifica a permissão de um módulo e de uma ação.
 *
 * Exemplo:
 * router.get(
 *   "/",
 *   autenticarUsuario,
 *   carregarPermissoes,
 *   verificarPermissao("Relatórios", "visualizar"),
 *   controller.listar
 * );
 */
function verificarPermissao(modulo, acao = "visualizar") {
  return function (req, res, next) {
    try {
      const acoesPermitidas = [
        "visualizar",
        "incluir",
        "editar",
        "excluir",
      ];

      if (!acoesPermitidas.includes(acao)) {
        return res.status(400).json({
          sucesso: false,
          mensagem: "Ação de permissão inválida.",
        });
      }

      if (!req.usuario) {
        return res.status(401).json({
          sucesso: false,
          mensagem: "Usuário não autenticado.",
        });
      }

      // Administrador possui acesso total.
      if (req.usuario.admin === true) {
        return next();
      }

      const permissoes = req.usuario.permissoes || {};
      const permissaoModulo = permissoes[modulo];

      if (
        !permissaoModulo ||
        permissaoModulo[acao] !== true
      ) {
        return res.status(403).json({
          sucesso: false,
          mensagem: `Você não tem permissão para ${acao} no módulo ${modulo}.`,
        });
      }

      return next();
    } catch (error) {
      console.error(
        "Erro ao verificar permissão:",
        error
      );

      return res.status(500).json({
        sucesso: false,
        mensagem: "Erro ao validar permissão.",
      });
    }
  };
}

module.exports = {
  carregarPermissoes,
  verificarPermissao,
};
