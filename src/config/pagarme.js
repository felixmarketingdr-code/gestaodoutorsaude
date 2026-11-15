
// ============================================
// CONFIGURAÇÃO DA PAGAR.ME
// ============================================

// Ambiente:
// test       = testes
// production = produção

const ambiente = String(
  process.env.PAGARME_ENV || "test"
)
  .trim()
  .toLowerCase();

if (!["test", "production"].includes(ambiente)) {
  throw new Error(
    "PAGARME_ENV deve ser test ou production."
  );
}

// ============================================
// CHAVES DE ACESSO
// ============================================

const secretKey = String(
  process.env.PAGARME_SECRET_KEY || ""
).trim();

const publicKey = String(
  process.env.PAGARME_PUBLIC_KEY || ""
).trim();

if (!secretKey) {
  throw new Error(
    "PAGARME_SECRET_KEY não configurada."
  );
}

// ============================================
// URL DA API
// ============================================

const baseURL = "https://api.pagar.me/core/v5";

// ============================================
// EXPORTAÇÃO
// ============================================

module.exports = {
  ambiente,
  baseURL,
  secretKey,
  publicKey,
};
