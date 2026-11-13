
const axios = require("axios");
const pagarmeConfig = require("../config/pagarme");

// ============================================
// CONFIGURAÇÃO DA PAGAR.ME
// ============================================

const { baseURL, secretKey } = pagarmeConfig;

if (!baseURL) {
  throw new Error("URL da API Pagar.me não configurada.");
}

if (!secretKey) {
  throw new Error("PAGARME_SECRET_KEY não configurada.");
}

const api = axios.create({
  baseURL,
  timeout: 30000,

  // Autenticação Basic Auth:
  // usuário = secret key
  // senha = vazia
  auth: {
    username: secretKey,
    password: "",
  },

  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// ============================================
// TRATAMENTO DE ERROS
// ============================================

function tratarErroPagarme(error) {
  const status = error.response?.status || 502;
  const resposta = error.response?.data;

  console.error("Erro na API Pagar.me:", {
    status,
    mensagem: resposta?.message || error.message,
    detalhes: resposta?.errors || null,
  });

  const erro = new Error(
    resposta?.message ||
      "Não foi possível comunicar com a Pagar.me."
  );

  erro.status = status;
  erro.detalhes = resposta?.errors || null;

  return erro;
}

// ============================================
// VALIDAÇÃO DE RESPOSTAS
// ============================================

function validarResposta(resposta, operacao) {
  if (!resposta || typeof resposta !== "object") {
    throw new Error(
      `A Pagar.me retornou uma resposta inválida em ${operacao}.`
    );
  }

  return resposta;
}

// ============================================
// VALIDAR PEDIDO
// ============================================

function validarPedido(dados) {
  if (!dados || typeof dados !== "object") {
    throw new Error("Dados do pedido não informados.");
  }

  if (!Array.isArray(dados.items) || dados.items.length === 0) {
    throw new Error(
      "O pedido precisa possuir pelo menos um item."
    );
  }

  if (!Array.isArray(dados.payments) || dados.payments.length === 0) {
    throw new Error(
      "Informe pelo menos uma forma de pagamento."
    );
  }

  if (!dados.customer) {
    throw new Error(
      "Informe os dados do cliente para criar o pedido."
    );
  }

  for (const item of dados.items) {
    if (
      !Number.isInteger(item.amount) ||
      item.amount <= 0
    ) {
      throw new Error(
        "O valor de cada item deve ser informado em centavos."
      );
    }

    if (
      !Number.isInteger(item.quantity) ||
      item.quantity < 1
    ) {
      throw new Error(
        "A quantidade do item deve ser um número inteiro positivo."
      );
    }
  }

  return true;
}

// ============================================
// CRIAR PEDIDO
// ============================================

async function criarPedido(dados) {
  try {
    validarPedido(dados);

    const resposta = await api.post("/orders", dados);

    return validarResposta(
      resposta.data,
      "criação do pedido"
    );
  } catch (error) {
    if (error.response) {
      throw tratarErroPagarme(error);
    }

    throw error;
  }
}

// ============================================
// CONSULTAR PEDIDO
// ============================================

async function consultarPedido(orderId) {
  try {
    if (
      typeof orderId !== "string" ||
      !orderId.trim()
    ) {
      throw new Error(
        "Informe um identificador válido do pedido."
      );
    }

    const resposta = await api.get(
      `/orders/${encodeURIComponent(orderId.trim())}`
    );

    return validarResposta(
      resposta.data,
      "consulta do pedido"
    );
  } catch (error) {
    if (error.response) {
      throw tratarErroPagarme(error);
    }

    throw error;
  }
}

// ============================================
// CONSULTAR COBRANÇA
// ============================================

async function consultarCobranca(chargeId) {
  try {
    if (
      typeof chargeId !== "string" ||
      !chargeId.trim()
    ) {
      throw new Error(
        "Informe um identificador válido da cobrança."
      );
    }

    const resposta = await api.get(
      `/charges/${encodeURIComponent(chargeId.trim())}`
    );

    return validarResposta(
      resposta.data,
      "consulta da cobrança"
    );
  } catch (error) {
    if (error.response) {
      throw tratarErroPagarme(error);
    }

    throw error;
  }
}

// ============================================
// EXPORTAÇÕES
// ============================================

module.exports = {
  criarPedido,
  consultarPedido,
  consultarCobranca,
};
