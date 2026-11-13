
const { db } = require("../config/firebase");
const pagarmeService = require("../services/pagarmeService");
const { FieldValue } = require("firebase-admin/firestore");

const COLECAO_PLANOS = "planos";
const COLECAO_CONTRATOS = "contratos";

// Converte reais para centavos.
function paraCentavos(valor) {
  const numero = Number(valor);

  if (!Number.isFinite(numero) || numero <= 0) {
    throw new Error("Valor do plano inválido.");
  }

  return Math.round(numero * 100);
}

// Obtém o valor oficial do plano diretamente do Firestore.
function calcularValorPlano(plano, modalidade) {
  if (modalidade === "mensal") {
    if (!plano.modalidadeMensal) {
      throw new Error("Este plano não permite pagamento mensal.");
    }

    return {
      valor: Number(plano.valorMensal),
      parcelas: 1,
      total: Number(plano.valorMensal),
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
      total: Number((valorParcela * quantidadeParcelas).toFixed(2)),
    };
  }

  throw new Error("Modalidade inválida. Utilize mensal ou anual.");
}

// Validação básica dos dados do cliente.
function validarCliente(cliente) {
  if (!cliente || typeof cliente !== "object") {
    throw new Error("Informe os dados do cliente.");
  }

  const nome = String(cliente.nome || "").trim();
  const email = String(cliente.email || "").trim().toLowerCase();
  const documento = String(cliente.documento || "")
    .replace(/\D/g, "");

  if (nome.length < 3) {
    throw new Error("Informe o nome completo do cliente.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Informe um e-mail válido.");
  }

  if (![11, 14].includes(documento.length)) {
    throw new Error("Informe um CPF ou CNPJ válido.");
  }

  return {
    nome,
    email,
    documento,
    tipoDocumento: documento.length === 11 ? "individual" : "company",
    telefone: String(cliente.telefone || "").replace(/\D/g, ""),
  };
}

// Formata telefone no padrão esperado pela Pagar.me.
function formatarTelefone(telefone) {
  if (!telefone || telefone.length < 10 || telefone.length > 11) {
    throw new Error("Informe um telefone com DDD válido.");
  }

  return {
    country_code: "55",
    area_code: telefone.slice(0, 2),
    number: telefone.slice(2),
  };
}

// Cria um pedido e um contrato.
async function criarCheckout(req, res) {
  let contratoRef = null;

  try {
    const uid = req.usuario?.uid;

    if (!uid) {
      return res.status(401).json({
        sucesso: false,
        mensagem: "Usuário não autenticado.",
      });
    }

    const {
      planoId,
      modalidade,
      metodoPagamento,
      cliente: clienteRecebido,
      cardToken,
    } = req.body;

    if (!planoId || !modalidade || !metodoPagamento) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Informe o plano, a modalidade e a forma de pagamento.",
      });
    }

    if (!["pix", "credit_card"].includes(metodoPagamento)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Forma de pagamento não suportada.",
      });
    }

    // Cartão deve ser tokenizado no frontend.
    // Nunca receber ou armazenar número completo e CVV neste controller.
    if (metodoPagamento === "credit_card" && !cardToken) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Token do cartão não informado.",
      });
    }

    const cliente = validarCliente(clienteRecebido);

    if (cliente.telefone.length < 10 || cliente.telefone.length > 11) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Informe um telefone válido com DDD.",
      });
    }

    // 1. Buscar plano oficial no Firestore.
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

    // 2. Calcular o valor sem confiar no frontend.
    const condicoes = calcularValorPlano(plano, modalidade);

    let valorCobranca;

    if (metodoPagamento === "pix") {
      // PIX anual cobra o valor total da contratação.
      valorCobranca =
        modalidade === "anual"
          ? condicoes.total
          : condicoes.valor;
    } else {
      // Cartão anual utiliza o valor total com parcelamento.
      valorCobranca =
        modalidade === "anual"
          ? condicoes.total
          : condicoes.valor;
    }

    const valorCentavos = paraCentavos(valorCobranca);

    // 3. Criar contrato inicialmente em cadastramento.
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
      valorParcela:
        modalidade === "anual" ? condicoes.valor : condicoes.valor,
      quantidadeParcelas:
        metodoPagamento === "credit_card" && modalidade === "anual"
          ? condicoes.parcelas
          : 1,
      valorTotal: valorCobranca,
      status: "Em Cadastramento",
      statusPagamento: "Aguardando pagamento",
      pagamentoConfirmado: false,
      criadoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
    };

    await contratoRef.set(dadosContrato);

    // 4. Montar dados do pedido Pagar.me.
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
          description: `${plano.nome || plano.planoNome} - ${modalidade}`,
          quantity: 1,
          code: planoId,
        },
      ],
      payments: [],
      metadata: {
        contratoId: contratoRef.id,
        usuarioUid: uid,
        planoId,
      },
    };

    // 5. Configurar forma de pagamento.
    if (metodoPagamento === "pix") {
      pedido.payments.push({
        payment_method: "pix",
        pix: {
          expires_in: 3600,
        },
      });
    }

    if (metodoPagamento === "credit_card") {
      pedido.payments.push({
        payment_method: "credit_card",
        credit_card: {
          installments:
            modalidade === "anual" ? condicoes.parcelas : 1,
          card_token: cardToken,
          statement_descriptor: "DOUTOR DE TODOS",
        },
      });
    }

    // 6. Criar pedido na Pagar.me.
    const resultado = await pagarmeService.criarPedido(pedido);

    // 7. Atualizar contrato com os identificadores retornados.
    const cobranca = resultado.charges?.[0] || null;
    const transacao = cobranca?.last_transaction || null;

    await contratoRef.update({
      pagarmeOrderId: resultado.id || null,
      pagarmeChargeId: cobranca?.id || null,
      status: "Pendente",
      statusPagamento: "Aguardando pagamento",
      checkoutCriadoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
    });

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
        pix: transacao
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

    // Se o pedido não for criado, não deixar o contrato como pendente.
    if (contratoRef) {
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

    const status = error.status || 400;

    return res.status(status >= 400 && status < 600 ? status : 500).json({
      sucesso: false,
      mensagem: error.message || "Não foi possível criar o checkout.",
      detalhes: error.detalhes || undefined,
    });
  }
}

module.exports = {
  criarCheckout,
};
