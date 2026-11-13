const { auth } = require("../config/firebase");

async function autenticarUsuario(req, res, next) {
  try {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        sucesso: false,
        mensagem: "Token de autenticação não informado.",
      });
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        sucesso: false,
        mensagem: "Token inválido.",
      });
    }

    const decodedToken = await auth.verifyIdToken(token);

    req.usuario = {
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      nome: decodedToken.name || null,
      claims: decodedToken,
    };

    return next();
  } catch (error) {
    console.error("Erro na autenticação:", error.message);

    return res.status(401).json({
      sucesso: false,
      mensagem: "Sessão inválida ou expirada. Faça login novamente.",
    });
  }
}

module.exports = autenticarUsuario;