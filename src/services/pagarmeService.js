
const axios = require("axios");
const pagarmeConfig = require("../config/pagarme");

// ============================================
// CONFIGURAÇÃO DA PAGAR.ME
// ============================================

const { baseURL, secretKey } = pagarmeConfig;

if (!baseURL) {
  throw new Error(
    "URL da API Pagar.me não configurada."
  );
}

if (!secretKey) {
  throw new Error(
    "PAGARME_SECRET_KEY não configurada."
  );
}

const api = axios.create({
  baseURL: baseURL.replace(/\/+$/, ""),
  timeout: 30000,

  // Autenticação Basic Auth:
  // usuário = Secret Key
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

  const mensagem =
    resposta?.message ||
    resposta?.error ||
    error.message ||
    "Não foi possível comunicar com a Pagar.me.";

  console.error("Erro na API Pagar.me:", {
    status,
    mensagem,
    detalhes: resposta?.errors || null,
    codigo: resposta?.code || null,
  });

  const erro = new Error(mensagem);

  erro.status = status;
  erro.detalhes = resposta?.errors || null;
  erro.codigo = resposta?.code || null;

  return erro;
}

// ============================================
// VALIDAÇÃO DE RESPOSTAS
// ============================================

function validarResposta(resposta, operacao) {
  if (
    !resposta ||
    typeof resposta !== "object" ||
    Array.isArray(resposta)
  ) {
    throw new Error(
      `A Pagar.me retornou uma resposta inválida em ${operacao}.`
    );
  }

  return resposta;
}

// ============================================
// VALIDAR IDENTIFICADORES
// ============================================

function validarIdentificador(valor, campo) {
  if (
    typeof valor !== "string" ||
    !valor.trim()
  ) {
    throw new Error(
      `Informe um identificador válido para ${campo}.`
    );
  }

  return valor.trim();
}

// ============================================
// VALIDAR PEDIDO
// ============================================

function validarPedido(dados) {
  if (
    !dados ||
    typeof dados !== "object" ||
    Array.isArray(dados)
  ) {
    throw new Error(
      "Dados do pedido não informados ou inválidos."
    );
  }

  if (
    !Array.isArray(dados.items) ||
    dados.items.length === 0
  ) {
    throw new Error(
      "O pedido precisa possuir pelo menos um item."
    );
  }

  if (
    !Array.isArray(dados.payments) ||
    dados.payments.length === 0
  ) {
    throw new Error(
      "Informe pelo menos uma forma de pagamento."
    );
  }

  if (
    !dados.customer ||
    typeof dados.customer !== "object"
  ) {
    throw new Error(
      "Informe os dados do cliente para criar o pedido."
    );
  }

  for (const item of dados.items) {
    if (
      !item ||
      !Number.isInteger(item.amount) ||
      item.amount <= 0
    ) {
      throw new Error(
        "O valor de cada item deve ser informado em centavos e ser maior que zero."
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

    if (
      typeof item.description !== "string" ||
      !item.description.trim()
    ) {
      throw new Error(
        "Informe a descrição de cada item do pedido."
      );
    }
  }

  for (const pagamento of dados.payments) {
    if (
      !pagamento ||
      typeof pagamento !== "object" ||
      !pagamento.payment_method
    ) {
      throw new Error(
        "Cada pagamento precisa informar payment_method."
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

    const resposta = await api.post(
      "/orders",
      dados
    );

    const pedido = validarResposta(
      resposta.data,
      "criação do pedido"
    );

    if (!pedido.id) {
      throw new Error(
        "A Pagar.me não retornou o identificador do pedido."
      );
    }

    return pedido;

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
    const id = validarIdentificador(
      orderId,
      "pedido"
    );

    const resposta = await api.get(
      `/orders/${encodeURIComponent(id)}`
    );

    const pedido = validarResposta(
      resposta.data,
      "consulta do pedido"
    );

    if (
      !pedido.id ||
      String(pedido.id) !== String(id)
    ) {
      throw new Error(
        "O identificador retornado pela Pagar.me não corresponde ao pedido consultado."
      );
    }

    return pedido;

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
    const id = validarIdentificador(
      chargeId,
      "cobrança"
    );

    const resposta = await api.get(
      `/charges/${encodeURIComponent(id)}`
    );

    const cobranca = validarResposta(
      resposta.data,
      "consulta da cobrança"
    );

    if (
      !cobranca.id ||
      String(cobranca.id) !== String(id)
    ) {
      throw new Error(
        "O identificador retornado pela Pagar.me não corresponde à cobrança consultada."
      );
    }

    return cobranca;

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
