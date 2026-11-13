
const ambiente = process.env.PAGARME_ENV || "test";

if (!["test", "production"].includes(ambiente)) {
  throw new Error("PAGARME_ENV deve ser test ou production.");
}

const secretKey = process.env.PAGARME_SECRET_KEY;

if (!secretKey) {
  throw new Error("PAGARME_SECRET_KEY não configurada.");
}

module.exports = {
  baseURL: "https://api.pagar.me/core/v5",
  secretKey,
  publicKey: process.env.PAGARME_PUBLIC_KEY || "",
  ambiente,
};
