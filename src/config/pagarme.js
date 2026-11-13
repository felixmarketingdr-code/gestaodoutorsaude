const ambiente = process.env.PAGARME_ENV || "test";

const configuracoes = {
  test: {
    baseURL: "https://sdx-api.pagar.me/core/v5",
  },
  production: {
    baseURL: "https://api.pagar.me/core/v5",
  },
};

const config = configuracoes[ambiente];

if (!config) {
  throw new Error("PAGARME_ENV deve ser test ou production.");
}

const secretKey = process.env.PAGARME_SECRET_KEY;

if (!secretKey) {
  throw new Error("PAGARME_SECRET_KEY não configurada.");
}

module.exports = {
  baseURL: config.baseURL,
  secretKey,
  publicKey: process.env.PAGARME_PUBLIC_KEY || "",
};