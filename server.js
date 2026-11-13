
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");

// Rotas
const checkoutRoutes = require("./src/routes/checkoutRoutes");
const webhookRoutes = require("./src/routes/webhookRoutes");

const app = express();

const PORT = Number(process.env.PORT || 3001);

// ========================================
// SEGURANÇA
// ========================================

app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => {
      const permitidas = [
        process.env.FRONTEND_URL || "http://localhost:5173",
      ];

      if (!origin || permitidas.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origem não autorizada pelo CORS."));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
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

// Verificação de funcionamento do backend
app.get("/api/health", (req, res) => {
  res.json({
    sucesso: true,
    mensagem: "Backend Doutor de Todos funcionando.",
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
  console.log("DOUTOR DE TODOS - BACKEND");
  console.log("------------------------------------");
  console.log(`Servidor iniciado na porta ${PORT}`);
  console.log(`Ambiente: ${process.env.NODE_ENV || "development"}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  console.log(`Checkout: http://localhost:${PORT}/api/checkout`);
  console.log(`Webhook: /api/webhooks/pagarme`);
  console.log("------------------------------------");
});
