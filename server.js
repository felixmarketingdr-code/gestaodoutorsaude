
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

function separarOrigens(valor) {
  return (valor || "")
    .split(/[,\s]+/)
    .map((url) => url.trim())
    .filter(Boolean);
}

function normalizarOrigem(valor) {
  try {
    return new URL(valor).origin;
  } catch {
    console.warn("Origem inválida ignorada:", valor);
    return null;
  }
}

const origensConfiguradas = [
  "http://localhost:5173",
  "http://localhost:5174",

  ...separarOrigens(process.env.FRONTEND_URL),
  ...separarOrigens(process.env.FRONTEND_URLS),
];

const origensPermitidas = [
  ...new Set(
    origensConfiguradas
      .map(normalizarOrigem)
      .filter(Boolean)
  ),
];

console.log("------------------------------------");
console.log("ORIGENS AUTORIZADAS PELO CORS:");
console.log(origensPermitidas);
console.log("------------------------------------");

// ========================================
// CONFIGURAÇÃO DO CORS
// ========================================

const corsOptions = {
  origin: (origin, callback) => {
    // Permite requisições sem Origin, como chamadas internas.
    if (!origin) {
      return callback(null, true);
    }

    const origemNormalizada = normalizarOrigem(origin);

    if (
      origemNormalizada &&
      origensPermitidas.includes(origemNormalizada)
    ) {
      return callback(null, true);
    }

    console.error("ORIGEM BLOQUEADA PELO CORS:", origin);

    const erro = new Error("Origem não autorizada pelo CORS.");
    erro.status = 403;

    return callback(erro);
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
};

// ========================================
// SEGURANÇA
// ========================================

app.use(helmet());

// ========================================
// CORS
// ========================================

// Deve ficar antes do limitador e de todas as rotas.
// O middleware cors responde automaticamente às requisições
// OPTIONS de preflight do navegador.

app.use(cors(corsOptions));

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
  res.status(200).json({
    sucesso: true,
    mensagem: "Backend Gestão Doutor Saúde Familiar funcionando.",
    ambiente: process.env.NODE_ENV || "development",
    data: new Date().toISOString(),
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

  const status = error.status || 500;

  res.status(status).json({
    sucesso: false,
    mensagem:
      status < 500
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
  console.log("Checkout exames: /api/checkout/exames");
  console.log("Checkout consultas: /api/checkout/consultas");
  console.log("Webhook: /api/webhooks/pagarme");
  console.log("Usuários: /api/usuarios");
  console.log("Perfis: /api/perfis");
  console.log("------------------------------------");
});
