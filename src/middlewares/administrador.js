
const { auth } = require("../config/firebase");

async function autenticar(req, res, next) {
  try {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        mensagem: "Autenticação necessária.",
      });
    }

    const token = authorization.substring(7);

    const decoded = await auth.verifyIdToken(token);

    req.usuario = decoded;

    next();
  } catch (error) {
    console.error("Erro de autenticação:", error.message);

    return res.status(401).json({
      mensagem: "Sessão inválida ou expirada.",
    });
  }
}

function somenteAdministrador(req, res, next) {
  if (!req.usuario || req.usuario.admin !== true) {
    return res.status(403).json({
      mensagem: "Acesso permitido somente para administradores.",
    });
  }

  next();
}

module.exports = {
  autenticar,
  somenteAdministrador,
};
