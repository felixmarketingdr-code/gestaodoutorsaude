
const { db } = require("../config/firebase");
const pagarmeService = require("../services/pagarmeService");
const { FieldValue } = require("firebase-admin/firestore");

const COLECAO_PLANOS = "planos";
const COLECAO_CONTRATOS = "contratos";

// ========================================
// CONVERSÃO DE VALORES
// ========================================

function paraCentavos(valor) {
  const numero = Number(valor);

  if (!Number.isFinite(numero) || numero <= 0) {
    throw new Error("Valor do plano inválido.");
  }

  return Math.round(numero * 100);
}

// ========================================
// CÁLCULO DO VALOR DO PLANO
// ========================================

function calcularValorPlano(plano, modalidade) {
  if (modalidade === "mensal") {
    if (!plano.modalidadeMensal) {
      throw new Error("Este plano não permite pagamento mensal.");
    }

    const valor = Number(plano.valorMensal);

    if (!Number.isFinite(valor) || valor <= 0) {
      throw new Error("Valor mensal do plano inválido.");
    }

    return {
      valor,
      parcelas: 1,
      total: valor,
    };
  }

  if (modalidade === "anual") {
    if (!plano.modalidadeAnual) {
      throw new Error("Este plano não permite contratação anual.");
    }

    const valorParcela = Number(plano.valorParcelaAnual);
    const quantidadeParcelas = Number(plano.parcelasAnuais || 12);

    if (
      !Number.isFinite(valorParcela) ||
      valorParcela <= 0 ||
      !Number.isInteger(quantidadeParcelas) ||
      quantidadeParcelas < 1 ||
      quantidadeParcelas > 12
    ) {
      throw new Error("Condições anuais do plano inválidas.");
    }

    return {
      valor: valorParcela,
      parcelas: quantidadeParcelas,
      total: Number(
        (valorParcela * quantidadeParcelas).toFixed(2)
      ),
    };
  }

  throw new Error("Modalidade inválida. Utilize mensal ou anual.");
}

// ========================================
// VALIDAÇÃO DO CLIENTE
// ========================================

function validarCliente(cliente) {
  if (!cliente || typeof cliente !== "object") {
    throw new Error("Informe os dados do cliente.");
  }

  const nome = String(cliente.nome || "").trim();
  const email = String(cliente.email || "").trim().toLowerCase();

  const documento = String(cliente.documento || "").replace(/\D/g, "");

  const telefone = String(cliente.telefone || "").replace(/\D/g, "");

  if (nome.length < 3) {
    throw new Error("Informe o nome completo do cliente.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Informe um e-mail válido.");
  }

  if (![11, 14].includes(documento.length)) {
    throw new Error("Informe um CPF ou CNPJ válido.");
  }

  if (telefone.length < 10 || telefone.length > 11) {
    throw new Error("Informe um telefone válido com DDD.");
  }

  return {
    nome,
    email,
    documento,
    tipoDocumento:
      documento.length === 11 ? "individual" : "company",
    telefone,
  };
}

// ========================================
// FORMATAÇÃO DO TELEFONE
// ========================================

function formatarTelefone(telefone) {
  return {
    country_code: "55",
    area_code: telefone.slice(0, 2),
    number: telefone.slice(2),
  };
}

// ========================================
// CRIAÇÃO DO CHECKOUT
// ========================================

async function criarCheckout(req, res) {
  let contratoRef = null;
  let pedidoCriado = false;

  try {
    // ------------------------------------
    // 1. IDENTIFICAR USUÁRIO
    // ------------------------------------

    const uid = req.usuario?.uid;

    if (!uid) {
      return res.status(401).json({
        sucesso: false,
        mensagem: "Usuário não autenticado.",
      });
    }

    // ------------------------------------
    // 2. RECEBER DADOS
    // ------------------------------------

    const {
      planoId,
      modalidade,
      metodoPagamento,
      cliente: clienteRecebido,
      cardToken,
    } = req.body || {};

    if (!planoId || !modalidade || !metodoPagamento) {
      return res.status(400).json({
        sucesso: false,
        mensagem:
          "Informe o plano, a modalidade e a forma de pagamento.",
      });
    }

    if (!["pix", "credit_card"].includes(metodoPagamento)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Forma de pagamento não suportada.",
      });
    }

    if (
      metodoPagamento === "credit_card" &&
      (typeof cardToken !== "string" || !cardToken.trim())
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Token do cartão não informado.",
      });
    }

    const cliente = validarCliente(clienteRecebido);

    // ------------------------------------
    // 3. BUSCAR PLANO NO FIRESTORE
    // ------------------------------------

    const planoRef = db.collection(COLECAO_PLANOS).doc(planoId);
    const planoSnapshot = await planoRef.get();

    if (!planoSnapshot.exists) {
      return res.status(404).json({
        sucesso: false,
        mensagem: "Plano não encontrado.",
      });
    }

    const plano = planoSnapshot.data();

    if (plano.ativo === false) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Este plano não está disponível para contratação.",
      });
    }

    // ------------------------------------
    // 4. CALCULAR VALORES NO SERVIDOR
    // ------------------------------------

    const condicoes = calcularValorPlano(plano, modalidade);

    let valorCobranca;

    if (modalidade === "anual") {
      valorCobranca = condicoes.total;
    } else {
      valorCobranca = condicoes.valor;
    }

    const valorCentavos = paraCentavos(valorCobranca);

    const quantidadeParcelas =
      metodoPagamento === "credit_card" && modalidade === "anual"
        ? condicoes.parcelas
        : 1;

    // ------------------------------------
    // 5. CRIAR CONTRATO NO FIRESTORE
    // ------------------------------------

    contratoRef = db.collection(COLECAO_CONTRATOS).doc();

    const dadosContrato = {
      usuarioUid: uid,

      cliente: {
        nome: cliente.nome,
        email: cliente.email,
        documento: cliente.documento,
        telefone: cliente.telefone,
      },

      planoId,
      planoNome: plano.nome || plano.planoNome || "Plano",

      modalidade,
      metodoPagamento,

      valorParcela: condicoes.valor,
      quantidadeParcelas,
      valorTotal: valorCobranca,

      status: "Em Cadastramento",
      statusPagamento: "Aguardando pagamento",
      pagamentoConfirmado: false,

      pagarmeOrderId: null,
      pagarmeChargeId: null,

      pagarmeUltimoEvento: null,

      criadoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
    };

    await contratoRef.set(dadosContrato);

    // ------------------------------------
    // 6. MONTAR PEDIDO PAGAR.ME
    // ------------------------------------

    const pedido = {
      code: contratoRef.id,

      customer: {
        name: cliente.nome,
        email: cliente.email,
        document: cliente.documento,
        type: cliente.tipoDocumento,

        phones: {
          mobile_phone: formatarTelefone(cliente.telefone),
        },
      },

      items: [
        {
          amount: valorCentavos,
          description: `${plano.nome || plano.planoNome || "Plano"} - ${modalidade}`,
          quantity: 1,
          code: planoId,
        },
      ],

      payments: [],

      metadata: {
        contratoId: contratoRef.id,
        usuarioUid: uid,
        planoId,
        modalidade,
        metodoPagamento,
      },
    };

    // ------------------------------------
    // 7. CONFIGURAR PIX
    // ------------------------------------

    if (metodoPagamento === "pix") {
      pedido.payments.push({
        payment_method: "pix",
        pix: {
          expires_in: 3600,
        },
      });
    }

    // ------------------------------------
    // 8. CONFIGURAR CARTÃO
    // ------------------------------------

    if (metodoPagamento === "credit_card") {
      pedido.payments.push({
        payment_method: "credit_card",
        credit_card: {
          installments: quantidadeParcelas,
          card_token: cardToken.trim(),
          statement_descriptor: "DOUTOR DE TODOS",
        },
      });
    }

    // ------------------------------------
    // 9. CRIAR PEDIDO NA PAGAR.ME
    // ------------------------------------

    const resultado = await pagarmeService.criarPedido(pedido);

    if (!resultado || !resultado.id) {
      throw new Error(
        "A Pagar.me não retornou o identificador do pedido."
      );
    }

    pedidoCriado = true;

    const cobranca = resultado.charges?.[0] || null;
    const transacao = cobranca?.last_transaction || null;

    // ------------------------------------
    // 10. ATUALIZAR CONTRATO
    // ------------------------------------

    await contratoRef.update({
      pagarmeOrderId: resultado.id,
      pagarmeChargeId: cobranca?.id || null,

      status: "Pendente",
      statusPagamento: "Aguardando pagamento",
      pagamentoConfirmado: false,

      checkoutCriadoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
    });

    // ------------------------------------
    // 11. RETORNAR RESULTADO AO FRONTEND
    // ------------------------------------

    return res.status(201).json({
      sucesso: true,
      mensagem: "Pedido de pagamento criado.",

      contratoId: contratoRef.id,
      pedidoId: resultado.id,

      status: "Pendente",
      statusPagamento: "Aguardando pagamento",

      pagamento: {
        metodo: metodoPagamento,
        valor: valorCobranca,
        valorCentavos,

        parcelas: quantidadeParcelas,

        pix:
          metodoPagamento === "pix" && transacao
            ? {
                codigo: transacao.qr_code || null,
                imagem: transacao.qr_code_url || null,
                copiaECola: transacao.qr_code || null,
                expiracao: transacao.expires_at || null,
              }
            : null,
      },
    });
  } catch (error) {
    console.error("Erro ao criar checkout:", {
      mensagem: error.message,
      status: error.status || null,
      detalhes: error.detalhes || null,
    });

    // Se o pedido já foi criado na Pagar.me,
    // não marcar o contrato como pagamento falho.
    // Ele precisa ser conciliado para evitar duplicidade.

    if (contratoRef && !pedidoCriado) {
      try {
        await contratoRef.update({
          status: "Em Cadastramento",
          statusPagamento: "Falha na criação do pagamento",
          erroCheckout: error.message,
          atualizadoEm: FieldValue.serverTimestamp(),
        });
      } catch (erroAtualizacao) {
        console.error(
          "Não foi possível atualizar o contrato:",
          erroAtualizacao.message
        );
      }
    }

    const status = error.status || 500;

    return res
      .status(status >= 400 && status < 600 ? status : 500)
      .json({
        sucesso: false,
        mensagem:
          pedidoCriado
            ? "O pedido foi criado, mas houve uma falha ao atualizar o contrato. É necessária uma conferência antes de tentar novamente."
            : error.message || "Não foi possível criar o checkout.",
      });
  }
}

module.exports = {
  criarCheckout,
};
