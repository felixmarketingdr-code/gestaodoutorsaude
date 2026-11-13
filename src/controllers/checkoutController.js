
const { db } = require("../config/firebase");
const pagarmeService = require("../services/pagarmeService");
const { FieldValue } = require("firebase-admin/firestore");

const COLECAO_PLANOS = "planos";
const COLECAO_CONTRATOS = "contratos";
const COLECAO_CLIENTES = "clientes";

const METODOS_PAGAMENTO = ["pix", "credit_card", "boleto"];

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

function somenteNumeros(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function paraCentavos(valor) {
  const numero = Number(valor);

  if (!Number.isFinite(numero) || numero <= 0) {
    throw new Error("Valor do plano inválido.");
  }

  return Math.round(numero * 100);
}

function normalizarMetodoPagamento(valor) {
  const metodo = String(valor || "")
    .trim()
    .toLowerCase();

  const aliases = {
    pix: "pix",
    credit_card: "credit_card",
    cartao: "credit_card",
    "cartão": "credit_card",
    "cartao de credito": "credit_card",
    "cartão de crédito": "credit_card",
    boleto: "boleto",
    bank_slip: "boleto",
    "boleto bancario": "boleto",
    "boleto bancário": "boleto",
  };

  return aliases[metodo] || metodo;
}

// =====================================================
// VALIDAR CLIENTE
// =====================================================

function validarCliente(cliente) {
  if (!cliente || typeof cliente !== "object") {
    throw new Error("Informe os dados do cliente.");
  }

  const nome = String(
    cliente.nome || cliente.nomeCompleto || ""
  ).trim();

  const email = String(cliente.email || "")
    .trim()
    .toLowerCase();

  const documento = somenteNumeros(
    cliente.documento || cliente.cpf || cliente.cnpj
  );

  const telefone = somenteNumeros(
    cliente.telefone ||
    cliente.celular ||
    cliente.whatsapp
  );

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
    throw new Error("Informe um telefone com DDD válido.");
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

// =====================================================
// TELEFONE PARA PAGAR.ME
// =====================================================

function formatarTelefone(telefone) {
  return {
    country_code: "55",
    area_code: telefone.slice(0, 2),
    number: telefone.slice(2),
  };
}

// =====================================================
// CALCULAR VALORES
// =====================================================

function calcularValorPlano(plano, modalidade) {
  if (modalidade === "mensal") {
    if (plano.modalidadeMensal === false) {
      throw new Error(
        "Este plano não permite pagamento mensal."
      );
    }

    const valor = Number(plano.valorMensal);

    if (!Number.isFinite(valor) || valor <= 0) {
      throw new Error("Valor mensal do plano inválido.");
    }

    return {
      valorParcela: valor,
      parcelas: 1,
      total: valor,
    };
  }

  if (modalidade === "anual") {
    if (plano.modalidadeAnual === false) {
      throw new Error(
        "Este plano não permite contratação anual."
      );
    }

    const valorParcela = Number(plano.valorParcelaAnual);
    const parcelas = Number(plano.parcelasAnuais || 12);

    if (
      !Number.isFinite(valorParcela) ||
      valorParcela <= 0 ||
      !Number.isInteger(parcelas) ||
      parcelas < 1 ||
      parcelas > 12
    ) {
      throw new Error(
        "Condições anuais do plano inválidas."
      );
    }

    return {
      valorParcela,
      parcelas,
      total: Number(
        (valorParcela * parcelas).toFixed(2)
      ),
    };
  }

  throw new Error(
    "Modalidade inválida. Utilize mensal ou anual."
  );
}

// =====================================================
// NORMALIZAR ENDEREÇO
// =====================================================

function normalizarEndereco(endereco) {
  if (!endereco || typeof endereco !== "object") {
    return null;
  }

  const rua =
    endereco.rua ||
    endereco.logradouro ||
    endereco.street ||
    endereco.line_1 ||
    "";

  const numero =
    endereco.numero ||
    endereco.number ||
    "";

  const complemento =
    endereco.complemento ||
    endereco.complement ||
    endereco.line_2 ||
    "";

  const bairro =
    endereco.bairro ||
    endereco.neighborhood ||
    "";

  const cidade =
    endereco.cidade ||
    endereco.city ||
    "";

  const estado =
    endereco.estado ||
    endereco.uf ||
    endereco.state ||
    "";

  const cep = somenteNumeros(
    endereco.cep ||
    endereco.cepCodigo ||
    endereco.zip_code
  );

  if (
    !rua ||
    !numero ||
    !bairro ||
    !cidade ||
    !estado ||
    cep.length !== 8
  ) {
    return null;
  }

  return {
    line_1: `${String(rua).trim()}, ${String(numero).trim()}`,

    ...(complemento
      ? { line_2: String(complemento).trim() }
      : {}),

    zip_code: cep,
    city: String(cidade).trim(),
    state: String(estado).trim().toUpperCase(),
    country: "BR",
  };
}

// =====================================================
// CLIENTE PARA PAGAR.ME
// =====================================================

function montarClientePagarme(cliente, endereco) {
  const customer = {
    name: cliente.nome,
    email: cliente.email,
    document: cliente.documento,
    type: cliente.tipoDocumento,

    document_type:
      cliente.tipoDocumento === "individual"
        ? "CPF"
        : "CNPJ",

    phones: {
      mobile_phone: formatarTelefone(cliente.telefone),
    },
  };

  if (endereco) {
    customer.address = endereco;
  }

  return customer;
}

// =====================================================
// MONTAR PAGAMENTO
// =====================================================

function montarPagamento({
  metodoPagamento,
  parcelas,
  cardToken,
}) {
  if (metodoPagamento === "pix") {
    return {
      payment_method: "pix",

      pix: {
        expires_in: 3600,
      },
    };
  }

  if (metodoPagamento === "credit_card") {
    if (!cardToken || typeof cardToken !== "string") {
      throw new Error("Token do cartão não informado.");
    }

    return {
      payment_method: "credit_card",

      credit_card: {
        installments: parcelas,
        statement_descriptor: "DOUTOR DE TODOS",
        card_token: cardToken,
      },
    };
  }

  if (metodoPagamento === "boleto") {
    const vencimento = new Date();

    vencimento.setDate(vencimento.getDate() + 3);

    return {
      payment_method: "boleto",

      boleto: {
        due_at: vencimento.toISOString(),

        instructions:
          "Pagamento referente à contratação do plano Doutor de Todos.",

        type: "DM",
      },
    };
  }

  throw new Error(
    `Forma de pagamento não suportada: ${metodoPagamento || "não informada"}.`
  );
}

// =====================================================
// EXTRAIR DADOS DO PAGAMENTO
// =====================================================

function extrairDadosPagamento(pedido) {
  const cobranca =
    pedido?.charges?.[0] ||
    pedido?.charge ||
    {};

  const transacao =
    cobranca?.last_transaction ||
    cobranca?.transaction ||
    pedido?.last_transaction ||
    {};

  return {
    orderId: pedido?.id || null,

    chargeId: cobranca?.id || null,

    status:
      cobranca?.status ||
      pedido?.status ||
      "pending",

    qrCode:
      transacao?.qr_code ||
      transacao?.qr_code_text ||
      transacao?.qr_code_string ||
      null,

    qrCodeUrl:
      transacao?.qr_code_url ||
      transacao?.qr_code_image_url ||
      transacao?.qr_code_image ||
      null,

    pixExpiraEm:
      transacao?.expires_at ||
      transacao?.expiration_date ||
      null,

    boletoUrl:
      transacao?.url ||
      transacao?.pdf ||
      transacao?.boleto_url ||
      transacao?.bank_slip_url ||
      transacao?.boleto?.url ||
      cobranca?.boleto_url ||
      null,

    boletoLinha:
      transacao?.line ||
      transacao?.barcode ||
      transacao?.digitable_line ||
      transacao?.linha_digitavel ||
      null,
  };
}

// =====================================================
// IDENTIFICAR ADMINISTRADOR
// =====================================================

function extrairPapelUsuario(req) {
  return String(
    req.usuario?.role ||
    req.usuario?.perfil ||
    req.usuario?.tipoUsuario ||
    ""
  ).toLowerCase();
}

// =====================================================
// BUSCAR ENDEREÇO DO CLIENTE
// =====================================================

async function carregarEnderecoCliente(
  clienteId,
  enderecoRecebido
) {
  const enderecoDoCheckout =
    normalizarEndereco(enderecoRecebido);

  if (enderecoDoCheckout) {
    return enderecoDoCheckout;
  }

  if (!clienteId) {
    return null;
  }

  const snapshot = await db
    .collection(COLECAO_CLIENTES)
    .doc(String(clienteId))
    .get();

  if (!snapshot.exists) {
    return null;
  }

  const dados = snapshot.data() || {};

  return (
    normalizarEndereco(dados.endereco) ||
    normalizarEndereco(dados.enderecoCobranca) ||
    normalizarEndereco(dados.address) ||
    normalizarEndereco(dados)
  );
}

// =====================================================
// CRIAR CHECKOUT
// =====================================================

async function criarCheckout(req, res) {
  let contratoRef = null;
  let pedidoCriado = false;
  let contratoEraExistente = false;

  try {
    const uid = req.usuario?.uid;

    if (!uid) {
      return res.status(401).json({
        sucesso: false,
        mensagem: "Usuário não autenticado.",
      });
    }

    const body = req.body || {};

    const planoId = body.planoId;

    const modalidade = String(
      body.modalidade || ""
    ).trim().toLowerCase();

    const metodoPagamento = normalizarMetodoPagamento(
      body.metodoPagamento
    );

    const clienteRecebido = body.cliente;
    const cardToken = body.cardToken;

    const clienteId = body.clienteId
      ? String(body.clienteId)
      : "";

    const contratoId = body.contratoId
      ? String(body.contratoId)
      : "";

    const enderecoRecebido =
      body.billingAddress ||
      body.enderecoCobranca ||
      null;

    if (!planoId || !modalidade || !metodoPagamento) {
      return res.status(400).json({
        sucesso: false,
        mensagem:
          "Informe o plano, a modalidade e a forma de pagamento.",
      });
    }

    if (!METODOS_PAGAMENTO.includes(metodoPagamento)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: `Forma de pagamento não suportada: ${metodoPagamento}.`,
      });
    }

    if (
      metodoPagamento === "credit_card" &&
      (!cardToken || typeof cardToken !== "string")
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Token do cartão não informado.",
      });
    }

    // Validar dados do cliente.

    const cliente = validarCliente(clienteRecebido);

    // Buscar plano no Firestore.

    const planoRef = db
      .collection(COLECAO_PLANOS)
      .doc(String(planoId));

    const planoSnapshot = await planoRef.get();

    if (!planoSnapshot.exists) {
      return res.status(404).json({
        sucesso: false,
        mensagem: "Plano não encontrado.",
      });
    }

    const plano = planoSnapshot.data() || {};

    const valores = calcularValorPlano(
      plano,
      modalidade
    );

    const valorCentavos = paraCentavos(valores.total);

    const parcelasCartao =
      modalidade === "anual" &&
      metodoPagamento === "credit_card"
        ? valores.parcelas
        : 1;

    // Buscar endereço de cobrança.

    const enderecoPagarme =
      await carregarEnderecoCliente(
        clienteId,
        enderecoRecebido
      );

    if (
      (metodoPagamento === "boleto" ||
        metodoPagamento === "credit_card") &&
      !enderecoPagarme
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem:
          "Para cartão ou boleto, informe o endereço de cobrança completo do cliente: rua, número, bairro, cidade, UF e CEP.",
      });
    }

    // Montar pagamento.

    const pagamento = montarPagamento({
      metodoPagamento,
      parcelas: parcelasCartao,
      cardToken,
    });

    // =================================================
    // LOCALIZAR OU CRIAR CONTRATO
    // =================================================

    if (contratoId) {
      contratoRef = db
        .collection(COLECAO_CONTRATOS)
        .doc(contratoId);

      const contratoSnapshot = await contratoRef.get();

      if (!contratoSnapshot.exists) {
        return res.status(404).json({
          sucesso: false,
          mensagem:
            "O contrato informado não foi encontrado. Atualize a tela e tente novamente.",
        });
      }

      const contratoAtual = contratoSnapshot.data() || {};

      const responsavelAtual =
        contratoAtual.vendedorId ||
        contratoAtual.usuarioUid ||
        contratoAtual.criadoPor ||
        "";

      const papel = extrairPapelUsuario(req);

      const ehAdmin =
        req.usuario?.admin === true ||
        req.usuario?.administrador === true ||
        ["admin", "administrador", "administracao"].includes(
          papel
        );

      if (
        responsavelAtual &&
        responsavelAtual !== uid &&
        !ehAdmin
      ) {
        return res.status(403).json({
          sucesso: false,
          mensagem:
            "Você não tem permissão para gerar pagamento para este contrato.",
        });
      }

      contratoEraExistente = true;
    } else {
      contratoRef = db
        .collection(COLECAO_CONTRATOS)
        .doc();
    }

    // =================================================
    // SALVAR DADOS DO CONTRATO
    // =================================================

    const dadosContrato = {
      ...(clienteId ? { clienteId } : {}),

      usuarioUid: uid,

      cliente: {
        nome: cliente.nome,
        email: cliente.email,
        documento: cliente.documento,
        telefone: cliente.telefone,
      },

      planoId: String(planoId),

      planoNome:
        plano.nome ||
        plano.nomePlano ||
        "Plano Doutor de Todos",

      modalidade,
      metodoPagamento,

      valorParcela: valores.valorParcela,
      quantidadeParcelas: valores.parcelas,
      valorTotal: valores.total,

      status: "Em Cadastramento",
      statusLabel: "Em Cadastramento",
      statusPagamento: "Aguardando pagamento",

      pagamentoConfirmado: false,
      tipoCobranca: "avulsa",

      atualizadoEm: FieldValue.serverTimestamp(),
    };

    if (contratoEraExistente) {
      await contratoRef.set(
        {
          ...dadosContrato,
          checkoutIniciadoEm: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      await contratoRef.set({
        ...dadosContrato,
        criadoEm: FieldValue.serverTimestamp(),
      });
    }

    // =================================================
    // MONTAR PEDIDO PAGAR.ME
    // =================================================

    const pedido = {
      code: contratoRef.id,

      customer: montarClientePagarme(
        cliente,
        enderecoPagarme
      ),

      items: [
        {
          amount: valorCentavos,

          description:
            `Plano ${plano.nome || plano.nomePlano || "Doutor de Todos"} - ${modalidade}`,

          quantity: 1,
          code: String(planoId),
        },
      ],

      payments: [pagamento],

      metadata: {
        contratoId: contratoRef.id,
        clienteId: clienteId || "",
        usuarioUid: uid,
        planoId: String(planoId),
        modalidade,
        metodoPagamento,
      },
    };

    // =================================================
    // ENVIAR PEDIDO
    // =================================================

    const pedidoResposta =
      await pagarmeService.criarPedido(pedido);

    if (!pedidoResposta?.id) {
      throw new Error(
        "A Pagar.me não retornou o identificador do pedido."
      );
    }

    pedidoCriado = true;

    const dadosPagamento =
      extrairDadosPagamento(pedidoResposta);

    // =================================================
    // ATUALIZAR CONTRATO COM DADOS DO PAGAMENTO
    // =================================================

    await contratoRef.update({
      ...(clienteId ? { clienteId } : {}),

      pagarmeOrderId: dadosPagamento.orderId,
      pagarmeChargeId: dadosPagamento.chargeId,

      status: "Em Cadastramento",
      statusLabel: "Em Cadastramento",
      statusPagamento: "Aguardando pagamento",

      pagarmeStatus: dadosPagamento.status,

      qrCode: dadosPagamento.qrCode,
      qrCodeUrl: dadosPagamento.qrCodeUrl,
      pixExpiraEm: dadosPagamento.pixExpiraEm,

      boletoUrl: dadosPagamento.boletoUrl,
      boletoLinha: dadosPagamento.boletoLinha,

      atualizadoEm: FieldValue.serverTimestamp(),
    });

    // =================================================
    // RESPOSTA AO FRONTEND
    // =================================================

    return res.status(201).json({
      sucesso: true,

      mensagem: "Pedido de pagamento criado.",

      contratoId: contratoRef.id,
      clienteId: clienteId || null,

      pedidoId: dadosPagamento.orderId,
      cobrancaId: dadosPagamento.chargeId,

      status: dadosPagamento.status,
      statusPagamento: "Aguardando pagamento",

      metodoPagamento,
      modalidade,

      valorParcela: valores.valorParcela,
      parcelas: valores.parcelas,
      valorTotal: valores.total,

      qr_code: dadosPagamento.qrCode,
      qr_code_url: dadosPagamento.qrCodeUrl,
      pix_expira_em: dadosPagamento.pixExpiraEm,

      boleto_url: dadosPagamento.boletoUrl,
      boleto_linha: dadosPagamento.boletoLinha,
    });
  } catch (error) {
    console.error("Erro ao criar checkout:", {
      mensagem: error.message,
      status: error.status || null,
      detalhes: error.detalhes || null,
    });

    // Se o pedido não foi criado, registrar falha no contrato.

    if (contratoRef && !pedidoCriado) {
      try {
        await contratoRef.update({
          statusPagamento: "Falha ao criar pagamento",

          erroPagamento: String(
            error.message || "Erro desconhecido"
          ),

          atualizadoEm: FieldValue.serverTimestamp(),
        });
      } catch (erroFirestore) {
        console.error(
          "Não foi possível atualizar o contrato após a falha:",
          erroFirestore.message
        );
      }
    }

    return res.status(error.status || 500).json({
      sucesso: false,

      mensagem:
        error.message ||
        "Não foi possível iniciar o checkout.",

      detalhes: error.detalhes || undefined,
    });
  }
}

module.exports = {
  criarCheckout,
};
