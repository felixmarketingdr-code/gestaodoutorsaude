
const axios = require("axios");
const crypto = require("crypto");

const pagarmeConfig = require("../config/pagarme");

const { baseURL, secretKey } = pagarmeConfig;

if (!baseURL || !secretKey) {
  throw new Error("Configuração da Pagar.me incompleta.");
}

// Autenticação Basic da API Core v5.
const api = axios.create({
  baseURL,
  timeout: 30000,
  auth: {
    username: secretKey,
    password: "",
  },
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// Padroniza os erros retornados pela Pagar.me.
function tratarErroPagarme(error) {
  const status = error.response?.status;
  const resposta = error.response?.data;

  console.error("Erro na API Pagar.me:", {
    status,
    mensagem: resposta?.message || error.message,
    detalhes: resposta?.errors || null,
  });

  const erro = new Error(
    resposta?.message || "Não foi possível processar a solicitação de pagamento."
  );

  erro.status = status || 502;
  erro.detalhes = resposta?.errors || null;

  return erro;
}

// Cria um pedido na Pagar.me.
async function criarPedido(dados) {
  try {
    if (!dados || !Array.isArray(dados.items) || dados.items.length === 0) {
      throw new Error("O pedido precisa possuir pelo menos um item.");
    }

    if (!Array.isArray(dados.payments) || dados.payments.length === 0) {
      throw new Error("Informe pelo menos uma forma de pagamento.");
    }

    const resposta = await api.post("/orders", dados);

    return resposta.data;
  } catch (error) {
    if (error.response) {
      throw tratarErroPagarme(error);
    }

    throw error;
  }
}

// Consulta um pedido pelo identificador Pagar.me.
async function consultarPedido(orderId) {
  try {
    if (!orderId) {
      throw new Error("Informe o identificador do pedido.");
    }

    const resposta = await api.get(
      `/orders/${encodeURIComponent(orderId)}`
    );

    return resposta.data;
  } catch (error) {
    if (error.response) {
      throw tratarErroPagarme(error);
    }

    throw error;
  }
}

// Consulta uma cobrança pelo identificador.
async function consultarCobranca(chargeId) {
  try {
    if (!chargeId) {
      throw new Error("Informe o identificador da cobrança.");
    }

    const resposta = await api.get(
      `/charges/${encodeURIComponent(chargeId)}`
    );

    return resposta.data;
  } catch (error) {
    if (error.response) {
      throw tratarErroPagarme(error);
    }

    throw error;
  }
}

// Verifica a assinatura HMAC SHA-256 de um webhook.
// A configuração do cabeçalho e do segredo deverá seguir
// o mecanismo de assinatura habilitado na conta Pagar.me.
function verificarAssinaturaWebhook(payload, assinatura, segredo) {
  if (!payload || !assinatura || !segredo) {
    return false;
  }

  const assinaturaRecebida = String(assinatura)
    .replace(/^sha256=/i, "")
    .trim()
    .toLowerCase();

  const assinaturaCalculada = crypto
    .createHmac("sha256", segredo)
    .update(
      typeof payload === "string"
        ? payload
        : JSON.stringify(payload)
    )
    .digest("hex");

  if (
    assinaturaRecebida.length !== assinaturaCalculada.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(assinaturaRecebida, "hex"),
    Buffer.from(assinaturaCalculada, "hex")
  );
}

module.exports = {
  criarPedido,
  consultarPedido,
  consultarCobranca,
  verificarAssinaturaWebhook,
};
