
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");

// ========================================
// ROTAS
// ========================================

const checkoutRoutes = require("./src/routes/checkoutRoutes");
const webhookRoutes = require("./src/routes/webhookRoutes");
const usuariosRoutes = require("./src/routes/usuariosRoutes");
const perfisRoutes = require("./src/routes/perfisRoutes");

const app = express();

const PORT = Number(process.env.PORT || 3001);

// ========================================
// ORIGENS AUTORIZADAS
// ========================================

const origensPermitidas = [
  "http://localhost:5173",
  "http://localhost:5174",

  ...(process.env.FRONTEND_URL || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean),

  ...(process.env.FRONTEND_URLS || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean),
];

const origensUnicas = [...new Set(origensPermitidas)];

console.log("Origens autorizadas pelo CORS:", origensUnicas);

// ========================================
// SEGURANÇA
// ========================================

app.use(helmet());

// ========================================
// CORS
// ========================================

app.use(
  cors({
    origin: (origin, callback) => {
      // Permite requisições sem Origin, como verificações internas.
      if (!origin) {
        return callback(null, true);
      }

      if (origensUnicas.includes(origin)) {
        return callback(null, true);
      }

      console.error("Origem bloqueada pelo CORS:", origin);

      return callback(
        new Error("Origem não autorizada pelo CORS.")
      );
    },

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
    ],

    optionsSuccessStatus: 204,
  })
);

// ========================================
// LIMITADOR DE REQUISIÇÕES
// ========================================

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  })
);

// ========================================
// LEITURA DO CORPO DAS REQUISIÇÕES
// ========================================

app.use(express.json({ limit: "1mb" }));

// ========================================
// ROTAS DO SISTEMA
// ========================================

// Checkout e criação de pedidos Pagar.me
app.use("/api/checkout", checkoutRoutes);

// Webhook de notificações da Pagar.me
app.use("/api/webhooks/pagarme", webhookRoutes);

// Gerenciamento de usuários
app.use("/api/usuarios", usuariosRoutes);

// Gerenciamento de perfis e permissões
app.use("/api/perfis", perfisRoutes);

// ========================================
// VERIFICAÇÃO DE FUNCIONAMENTO
// ========================================

app.get("/api/health", (req, res) => {
  res.json({
    sucesso: true,
    mensagem: "Backend Gestão Doutor Saúde Familiar funcionando.",
    ambiente: process.env.NODE_ENV || "development",
  });
});

// ========================================
// ROTA NÃO ENCONTRADA
// ========================================

app.use((req, res) => {
  res.status(404).json({
    sucesso: false,
    mensagem: "Rota não encontrada.",
    caminho: req.originalUrl,
    metodo: req.method,
  });
});

// ========================================
// TRATAMENTO GLOBAL DE ERROS
// ========================================

app.use((error, req, res, next) => {
  console.error("Erro no servidor:", error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(error.status || 500).json({
    sucesso: false,
    mensagem:
      error.status && error.status < 500
        ? error.message
        : "Erro interno do servidor.",
  });
});

// ========================================
// INICIALIZAÇÃO DO SERVIDOR
// ========================================

app.listen(PORT, () => {
  console.log("------------------------------------");
  console.log("GESTÃO DOUTOR SAÚDE FAMILIAR");
  console.log("------------------------------------");
  console.log(`Servidor iniciado na porta ${PORT}`);
  console.log(`Ambiente: ${process.env.NODE_ENV || "development"}`);
  console.log("Health: /api/health");
  console.log("Checkout: /api/checkout");
  console.log("Webhook: /api/webhooks/pagarme");
  console.log("Usuários: /api/usuarios");
  console.log("Perfis: /api/perfis");
  console.log("------------------------------------");
});
