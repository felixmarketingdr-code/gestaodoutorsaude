const { db } = require("../config/firebase");

const pagarmeService = require("../services/pagarmeService");

const { FieldValue } = require("firebase-admin/firestore");

const COLECAO_PLANOS = "planos";

const COLECAO_CONTRATOS = "contratos";

const COLECAO_CLIENTES = "clientes";

const COLECAO_HISTORICO = "historicoContratos";

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

  const metodo = String(valor || "").trim().toLowerCase();

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

        statement_descriptor: "DOUTOR SAUDE FAMILIAR",

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

          "Pagamento referente à contratação Doutor de Todos.",

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

    null

  );

}

async function localizarContratoExistente({

  clienteId,

  contratoId,

  uid,

  req,

}) {

  if (!clienteId || !contratoId) {

    throw new Error(

      "Cliente e contrato são obrigatórios. Selecione o cadastro novamente na tela Venda de Carteirinha."

    );

  }

  const clienteRef = db

    .collection(COLECAO_CLIENTES)

    .doc(String(clienteId));

  const contratoRef = db

    .collection(COLECAO_CONTRATOS)

    .doc(String(contratoId));

  const [clienteDoc, contratoDoc] = await Promise.all([

    clienteRef.get(),

    contratoRef.get(),

  ]);

  if (!clienteDoc.exists) {

    throw new Error("Cliente não encontrado.");

  }

  if (!contratoDoc.exists) {

    throw new Error("Contrato não encontrado.");

  }

  const clienteBanco = clienteDoc.data() || {};

  const contratoAtual = contratoDoc.data() || {};

  const clienteDoContrato = String(

    contratoAtual.clienteId ||

      contratoAtual.idCliente ||

      ""

  );

  if (clienteDoContrato !== String(clienteId)) {

    throw new Error(

      "O contrato informado não pertence ao cliente selecionado."

    );

  }

  const papel = extrairPapelUsuario(req);

  const ehAdmin =

    papel === "admin" ||

    papel === "administrador";

  const vendedorId = String(

    contratoAtual.vendedorId ||

      contratoAtual.usuarioUid ||

      contratoAtual.usuarioId ||

      clienteBanco.vendedorId ||

      clienteBanco.usuarioUid ||

      clienteBanco.usuarioId ||

      ""

  );

  if (

    !ehAdmin &&

    vendedorId &&

    vendedorId !== String(uid)

  ) {

    throw new Error(

      "Você não tem permissão para gerar pagamento deste contrato."

    );

  }

  return {

    clienteRef,

    contratoRef,

    clienteBanco,

    contratoAtual,

  };

}

// =====================================================

// CRIAR CHECKOUT

// =====================================================

async function criarCheckout(req, res) {

  let contratoRef = null;

  let clienteRef = null;

  let pedidoCriado = false;

  let tentativaPagamentoEnviada = false;

  let dadosPagamento = null;

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

    )

      .trim()

      .toLowerCase();

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

    // Não permite criar contrato novo neste fluxo.

    if (!clienteId || !contratoId) {

      return res.status(400).json({

        sucesso: false,

        mensagem:

          "Cliente e contrato são obrigatórios. Selecione o cliente existente na tela Venda de Carteirinha.",

      });

    }

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

    // Validar os dados recebidos do checkout.

    const cliente = validarCliente(clienteRecebido);

    // Buscar e validar o contrato e o cliente existentes.

    const vinculo = await localizarContratoExistente({

      clienteId,

      contratoId,

      uid,

      req,

    });

    contratoRef = vinculo.contratoRef;

    clienteRef = vinculo.clienteRef;

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

          "Para cartão ou boleto, informe o endereço de cobrança completo: rua, número, bairro, cidade, UF e CEP.",

      });

    }

    // Montar pagamento.

    const pagamento = montarPagamento({

      metodoPagamento,

      parcelas: parcelasCartao,

      cardToken,

    });

        // =================================================

    // DADOS DO CONTRATO

    // Não atualizar status antes da criação do pedido.

    // =================================================

    const nomePlano =

      plano.nome ||

      plano.nomePlano ||

      "Plano Doutor Saúde Familiar";

    const formaPagamento =

      metodoPagamento === "credit_card"

        ? "Cartão de crédito"

        : metodoPagamento === "boleto"

          ? "Boleto"

          : "PIX";

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

          description: `Plano ${nomePlano} - ${modalidade}`,

          quantity: 1,

          code: String(planoId),

        },

      ],

      payments: [pagamento],

      metadata: {

        contratoId: contratoRef.id,

        clienteId,

        usuarioUid: uid,

        planoId: String(planoId),

        modalidade,

        metodoPagamento,

      },

    };

    // =================================================

    // ENVIAR PEDIDO PARA PAGAR.ME

    // =================================================

    tentativaPagamentoEnviada = true;

    const pedidoResposta =

      await pagarmeService.criarPedido(pedido);

    if (!pedidoResposta?.id) {

      throw new Error(

        "A Pagar.me não retornou o identificador do pedido."

      );

    }

    pedidoCriado = true;

    dadosPagamento =

      extrairDadosPagamento(pedidoResposta);

    // =================================================

    // ATUALIZAR CONTRATO E CLIENTE

    // Somente depois de a Pagar.me criar o pedido.

    // =================================================

    const agora = FieldValue.serverTimestamp();

    const dadosCheckout = {

      clienteId,

      clienteCPF: cliente.documento,

      clienteNome: cliente.nome,

      cliente: {

        nome: cliente.nome,

        nomeCompleto: cliente.nome,

        documento: cliente.documento,

        cpf: cliente.documento,

        email: cliente.email,

        telefone: cliente.telefone,

        celular: cliente.telefone,

      },

      planoId: String(planoId),

      planoNome: nomePlano,

      modalidade,

      metodoPagamento,

      formaPagamento,

      valor: valores.total,

      valorParcela: valores.valorParcela,

      quantidadeParcelas: valores.parcelas,

      valorTotal: valores.total,

      pagarmeOrderId: dadosPagamento.orderId,

      pagarmeChargeId: dadosPagamento.chargeId,

      status: "Em Cadastramento",

      statusLabel: "Em Cadastramento",

      statusVenda: "Em Cadastramento",

      statusVendaLabel: "Em Cadastramento",

      pendenciaCadastro: "AGUARDANDO PAGAMENTO DO LINK",

      pendenciaCadastroLabel: "AGUARDANDO PAGAMENTO DO LINK",

      statusPagamento: "Aguardando pagamento",

      statusPagamentoLabel: "Aguardando pagamento",

      pagamentoConfirmado: false,

      pagarmeStatus: dadosPagamento.status || "pending",

      qrCode: dadosPagamento.qrCode,

      qrCodeUrl: dadosPagamento.qrCodeUrl,

      pixExpiraEm: dadosPagamento.pixExpiraEm,

      boletoUrl: dadosPagamento.boletoUrl,

      boletoLinha: dadosPagamento.boletoLinha,

      checkoutIniciadoEm: agora,

      atualizadoEm: agora,

      usuarioUid: uid,

      vendedorId:

        vinculo.contratoAtual.vendedorId || uid,

      vendedorNome:

        vinculo.contratoAtual.vendedorNome ||

        req.usuario?.nome ||

        "",

    };

    // =================================================

    // TRANSAÇÃO FIRESTORE

    // Atualiza os documentos existentes e registra

    // o mesmo evento nos três caminhos de histórico.

    // =================================================

    await db.runTransaction(async (transaction) => {

      const [contratoDoc, clienteDoc] =

        await Promise.all([

          transaction.get(contratoRef),

          transaction.get(clienteRef),

        ]);

      if (!contratoDoc.exists || !clienteDoc.exists) {

        throw new Error(

          "Cliente ou contrato deixou de existir durante o checkout."

        );

      }

      const contratoBanco = contratoDoc.data() || {};

      if (

        String(contratoBanco.clienteId || "") !==

        clienteId

      ) {

        throw new Error(

          "O vínculo do contrato foi alterado durante o checkout."

        );

      }

      // Atualiza o contrato existente.

      transaction.set(

        contratoRef,

        dadosCheckout,

        { merge: true }

      );

      // Atualiza somente os campos operacionais do cliente.

      transaction.set(

        clienteRef,

        {

          ultimoCheckoutEm: agora,

          ultimoContratoId: contratoRef.id,

          status: "Em Cadastramento",

          statusLabel: "Em Cadastramento",

          statusVenda: "Em Cadastramento",

          statusVendaLabel: "Em Cadastramento",

          pendenciaCadastro:

            "AGUARDANDO PAGAMENTO DO LINK",

          pendenciaCadastroLabel:

            "AGUARDANDO PAGAMENTO DO LINK",

          statusPagamento: "Aguardando pagamento",

          statusPagamentoLabel: "Aguardando pagamento",

          pagarmeOrderId: dadosPagamento.orderId,

          pagarmeStatus:

            dadosPagamento.status || "pending",

          pagamentoConfirmado: false,

          atualizadoEm: agora,

        },

        { merge: true }

      );

      // Criar um único ID para o mesmo evento.

      const eventoId = db

        .collection(COLECAO_HISTORICO)

        .doc(contratoRef.id)

        .collection("eventos")

        .doc().id;

      const eventoRef = db

        .collection(COLECAO_HISTORICO)

        .doc(contratoRef.id)

        .collection("eventos")

        .doc(eventoId);

      const eventoClienteRef = clienteRef

        .collection("historico")

        .doc(eventoId);

      const eventoContratoRef = contratoRef

        .collection("historico")

        .doc(eventoId);

      const eventoHistorico = {

        eventoId,

        tipo: "checkout_iniciado",

        evento: "checkout.created",

        descricao:

          `Checkout iniciado. Pedido criado na Pagar.me. Pagamento aguardando confirmação (${formaPagamento}).`,

        clienteId,

        contratoId: contratoRef.id,

        cliente: dadosCheckout.cliente,

        clienteCPF: cliente.documento,

        clienteNome: cliente.nome,

        planoId: String(planoId),

        planoNome: nomePlano,

        modalidade,

        metodoPagamento,

        formaPagamento,

        valor: valores.total,

        valorParcela: valores.valorParcela,

        quantidadeParcelas: valores.parcelas,

        valorTotal: valores.total,

        tipoCobranca: "avulsa",

        pagarmeOrderId: dadosPagamento.orderId,

        pagarmeChargeId: dadosPagamento.chargeId,

        pagarmeStatus:

          dadosPagamento.status || "pending",

        pagamentoConfirmado: false,

        qrCode: dadosPagamento.qrCode,

        qrCodeUrl: dadosPagamento.qrCodeUrl,

        pixExpiraEm: dadosPagamento.pixExpiraEm,

        boletoUrl: dadosPagamento.boletoUrl,

        boletoLinha: dadosPagamento.boletoLinha,

        status: "Em Cadastramento",

        statusLabel: "Em Cadastramento",

        statusVenda: "Em Cadastramento",

        statusVendaLabel: "Em Cadastramento",

        pendenciaCadastro:

          "AGUARDANDO PAGAMENTO DO LINK",

        pendenciaCadastroLabel:

          "AGUARDANDO PAGAMENTO DO LINK",

        statusPagamento: "Aguardando pagamento",

        statusPagamentoLabel: "Aguardando pagamento",

        checkoutIniciadoEm: agora,

        usuarioId: uid,

        usuarioNome:

          vinculo.contratoAtual.vendedorNome ||

          req.usuario?.nome ||

          "",

        origem: "checkout_pagarme",

        criadoEm: agora,

      };

      // Histórico central.

      transaction.create(

        eventoRef,

        eventoHistorico

      );

      // Mantém o histórico antigo do cliente.

      transaction.create(

        eventoClienteRef,

        eventoHistorico

      );

      // Mantém o histórico antigo do contrato.

      transaction.create(

        eventoContratoRef,

        eventoHistorico

      );

    });

        // =================================================

    // RESPOSTA AO FRONTEND

    // =================================================

    return res.status(201).json({

      sucesso: true,

      mensagem: "Pedido de pagamento criado.",

      contratoId: contratoRef.id,

      clienteId,

      pedidoId: dadosPagamento.orderId,

      cobrancaId: dadosPagamento.chargeId,

      status: dadosPagamento.status,

      statusVenda: "Em Cadastramento",

      pendenciaCadastro:

        "AGUARDANDO PAGAMENTO DO LINK",

      statusPagamento: "Aguardando pagamento",

      metodoPagamento,

      formaPagamento,

      modalidade,

      valor: valores.total,

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

      pedidoCriado,

      pedidoId: dadosPagamento?.orderId || null,

    });

    // Registra falha somente quando a chamada à Pagar.me foi realmente iniciada.

    // Erros de validação anteriores não alteram o estado do contrato.

    if (

      contratoRef &&

      clienteRef &&

      tentativaPagamentoEnviada &&

      !pedidoCriado

    ) {

      try {

        const agoraFalha = FieldValue.serverTimestamp();

        const eventoId = db

          .collection(COLECAO_HISTORICO)

          .doc(contratoRef.id)

          .collection("eventos")

          .doc().id;

        const eventoRef = db

          .collection(COLECAO_HISTORICO)

          .doc(contratoRef.id)

          .collection("eventos")

          .doc(eventoId);

        const evento = {

          eventoId,

          tipo: "falha_criacao_checkout",

          evento: "checkout.creation_failed",

          descricao:

            "Não foi possível criar o pedido de pagamento na Pagar.me.",

          clienteId: clienteRef.id,

          contratoId: contratoRef.id,

          statusPagamento: "Falha ao criar pagamento",

          statusPagamentoLabel: "Falha ao criar pagamento",

          pagamentoConfirmado: false,

          erro: String(

            error.message || "Erro desconhecido"

          ).slice(0, 500),

          origem: "checkout_pagarme",

          criadoEm: agoraFalha,

        };

        const batch = db.batch();

        batch.set(

          contratoRef,

          {

            statusPagamento: "Falha ao criar pagamento",

            statusPagamentoLabel: "Falha ao criar pagamento",

            ultimoErroPagamento: String(

              error.message || "Erro desconhecido"

            ).slice(0, 500),

            atualizadoEm: agoraFalha,

          },

          { merge: true }

        );

        batch.set(

          clienteRef,

          {

            statusPagamento: "Falha ao criar pagamento",

            statusPagamentoLabel: "Falha ao criar pagamento",

            ultimoErroPagamento: String(

              error.message || "Erro desconhecido"

            ).slice(0, 500),

            atualizadoEm: agoraFalha,

          },

          { merge: true }

        );

        batch.set(eventoRef, evento);

        batch.set(

          clienteRef.collection("historico").doc(eventoId),

          evento

        );

        batch.set(

          contratoRef.collection("historico").doc(eventoId),

          evento

        );

        await batch.commit();

      } catch (erroFirestore) {

        console.error(

          "Não foi possível registrar a falha do checkout:",

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

// =====================================================

// EXPORTAÇÃO

// =====================================================

// =====================================================

// CHECKOUT DE EXAMES

// Cria a cobrança usando o total final já calculado pela tela.

// O repasse interno nunca é enviado à Pagar.me.

// A confirmação do pagamento e a liberação da guia pertencem ao webhook.

// =====================================================

async function criarCheckoutExame(req, res) {

  try {

    const uid = req.usuario?.uid;

    if (!uid) {

      return res.status(401).json({

        sucesso: false,

        mensagem: "Usuário não autenticado.",

      });

    }

    const body = req.body || {};

    const vendaId = String(body.vendaId || "").trim();

    const metodoPagamento = normalizarMetodoPagamento(body.metodoPagamento);

    const cardToken = body.cardToken;

    if (!vendaId || !METODOS_PAGAMENTO.includes(metodoPagamento)) {

      return res.status(400).json({

        sucesso: false,

        mensagem: "Informe a venda e uma forma de pagamento válida.",

      });

    }

    if (metodoPagamento === "credit_card" && (!cardToken || typeof cardToken !== "string")) {

      return res.status(400).json({

        sucesso: false,

        mensagem: "Token do cartão não informado.",

      });

    }

    const vendaRef = db.collection("vendasExames").doc(vendaId);

    const vendaSnap = await vendaRef.get();

    if (!vendaSnap.exists) {

      return res.status(404).json({

        sucesso: false,

        mensagem: "Venda de exames não encontrada.",

      });

    }

    const venda = vendaSnap.data() || {};

    const papel = extrairPapelUsuario(req);

    const ehAdmin = papel === "admin" || papel === "administrador";

    const vendedorId = String(venda.vendedorId || "");

    if (!ehAdmin && vendedorId && vendedorId !== String(uid)) {

      return res.status(403).json({

        sucesso: false,

        mensagem: "Você não tem permissão para gerar pagamento desta venda.",

      });

    }

    if (venda.pagamentoConfirmado === true || normalizarMetodoPagamento(venda.statusPagamento) === "pago") {

      return res.status(409).json({

        sucesso: false,

        mensagem: "Esta venda já consta como paga.",

      });

    }

    const clienteRecebido = body.cliente || {};

    const cliente = validarCliente(clienteRecebido);

    const itens = Array.isArray(venda.itens) ? venda.itens : [];

    if (!itens.length) {

      return res.status(400).json({

        sucesso: false,

        mensagem: "A venda não possui exames para cobrança.",

      });

    }

    // O backend usa o total persistido na venda, nunca o repasse ou

    // um valor arbitrário enviado pelo navegador.

    const valorFinal = Number(venda.valorTotal);

    if (!Number.isFinite(valorFinal) || valorFinal <= 0) {

      return res.status(400).json({

        sucesso: false,

        mensagem: "O valor final da venda é inválido. Salve novamente o orçamento.",

      });

    }

    const enderecoPagarme = await carregarEnderecoCliente(

      venda.clienteId,

      body.billingAddress || body.enderecoCobranca || null

    );

    if ((metodoPagamento === "boleto" || metodoPagamento === "credit_card") && !enderecoPagarme) {

      return res.status(400).json({

        sucesso: false,

        mensagem: "Para cartão ou boleto, informe o endereço de cobrança completo: rua, número, bairro, cidade, UF e CEP.",

      });

    }

    const pagamento = montarPagamento({

      metodoPagamento,

      parcelas: Number(body.parcelas || 1),

      cardToken,

    });

    const descricaoItens = itens

      .map((item) => String(item.exameNome || item.procedimento || "Exame"))

      .filter(Boolean)

      .slice(0, 4)

      .join(", ");

    const descricao = `Exames - Doutor Saúde Familiar${descricaoItens ? `: ${descricaoItens}` : ""}`.slice(0, 120);

    const pedido = {

      customer: montarClientePagarme(cliente, enderecoPagarme),

      items: [{

        amount: paraCentavos(valorFinal),

        description: descricao,

        quantity: 1,

        code: `venda-exames-${vendaId}`,

      }],

      payments: [pagamento],

      metadata: {

        tipoVenda: "exames",

        vendaId,

        clienteId: String(venda.clienteId || ""),

        usuarioUid: uid,

        descontoAplicado: Number(venda.valorDesconto || 0),

        percentualDesconto: Number(venda.percentualDesconto || 0),

      },

    };

    const pedidoResposta = await pagarmeService.criarPedido(pedido);

    if (!pedidoResposta?.id) {

      throw new Error("A Pagar.me não retornou o identificador do pedido.");

    }

    const dadosPagamento = extrairDadosPagamento(pedidoResposta);

    const agora = FieldValue.serverTimestamp();

    await vendaRef.set({

      metodoPagamento,

      formaPagamento: metodoPagamento === "credit_card"

        ? "Cartão de crédito"

        : metodoPagamento === "boleto" ? "Boleto" : "PIX",

      valorCobrado: valorFinal,

      pagarmeOrderId: dadosPagamento.orderId,

      pagarmeChargeId: dadosPagamento.chargeId,

      pagarmeStatus: dadosPagamento.status || "pending",

      statusPagamento: "Aguardando pagamento",

      statusPagamentoLabel: "Aguardando pagamento",

      pagamentoConfirmado: false,

      qrCode: dadosPagamento.qrCode || null,

      qrCodeUrl: dadosPagamento.qrCodeUrl || null,

      pixExpiraEm: dadosPagamento.pixExpiraEm || null,

      boletoUrl: dadosPagamento.boletoUrl || null,

      boletoLinha: dadosPagamento.boletoLinha || null,

      checkoutIniciadoEm: agora,

      atualizadoEm: agora,

    }, { merge: true });

    return res.status(201).json({

      sucesso: true,

      ok: true,

      mensagem: "Cobrança de exames criada. Aguardando confirmação do pagamento.",

      vendaId,

      pedidoId: dadosPagamento.orderId,

      cobrancaId: dadosPagamento.chargeId,

      valorTotal: valorFinal,

      statusPagamento: "Aguardando pagamento",

      qr_code: dadosPagamento.qrCode,

      qr_code_url: dadosPagamento.qrCodeUrl,

      pix_expira_em: dadosPagamento.pixExpiraEm,

      boleto_url: dadosPagamento.boletoUrl,

      boleto_linha: dadosPagamento.boletoLinha,

    });

  } catch (error) {

    console.error("Erro ao criar checkout de exames:", error);

    return res.status(error.status || 500).json({

      sucesso: false,

      ok: false,

      mensagem: error.message || "Não foi possível iniciar o checkout dos exames.",

    });

  }

}



// =====================================================
// CHECKOUT DE VENDAS DE CONSULTAS
// Usa o valor persistido em vendasConsultas/{vendaId}.
// O valor enviado pelo navegador nunca é usado como fonte de cobrança.
// =====================================================

async function criarCheckoutConsulta(req, res) {
  try {
    const uid = req.usuario?.uid;
    if (!uid) {
      return res.status(401).json({
        sucesso: false,
        ok: false,
        mensagem: "Usuário não autenticado.",
      });
    }

    const body = req.body || {};
    const vendaId = String(body.vendaId || "").trim();
    const metodoPagamento = normalizarMetodoPagamento(body.metodoPagamento);
    const cardToken = body.cardToken;

    if (!vendaId || !METODOS_PAGAMENTO.includes(metodoPagamento)) {
      return res.status(400).json({
        sucesso: false,
        ok: false,
        mensagem: "Informe a venda de consulta e uma forma de pagamento válida.",
      });
    }

    if (metodoPagamento === "credit_card" && (!cardToken || typeof cardToken !== "string")) {
      return res.status(400).json({
        sucesso: false,
        ok: false,
        mensagem: "Token do cartão não informado.",
      });
    }

    const vendaRef = db.collection("vendasConsultas").doc(vendaId);
    const vendaSnap = await vendaRef.get();

    if (!vendaSnap.exists) {
      return res.status(404).json({
        sucesso: false,
        ok: false,
        mensagem: "Venda de consulta não encontrada.",
      });
    }

    const venda = vendaSnap.data() || {};
    const papel = extrairPapelUsuario(req);
    const ehAdmin = ["admin", "administrador"].includes(papel);
    const vendedorId = String(venda.vendedorId || "");

    if (!ehAdmin && vendedorId && vendedorId !== String(uid)) {
      return res.status(403).json({
        sucesso: false,
        ok: false,
        mensagem: "Você não tem permissão para gerar pagamento desta consulta.",
      });
    }

    if (venda.pagamentoConfirmado === true ||
        String(venda.statusPagamento || "").trim().toLowerCase() === "pago") {
      return res.status(409).json({
        sucesso: false,
        ok: false,
        mensagem: "Esta consulta já consta como paga.",
      });
    }

    const cliente = validarCliente(body.cliente || {});
    const valorFinal = Number(venda.valorTotal ?? venda.valor);

    if (!Number.isFinite(valorFinal) || valorFinal <= 0) {
      return res.status(400).json({
        sucesso: false,
        ok: false,
        mensagem: "O valor registrado para esta consulta é inválido.",
      });
    }

    const enderecoPagarme = await carregarEnderecoCliente(
      venda.clienteId,
      body.billingAddress || body.enderecoCobranca || null
    );

    if ((metodoPagamento === "boleto" || metodoPagamento === "credit_card") && !enderecoPagarme) {
      return res.status(400).json({
        sucesso: false,
        ok: false,
        mensagem: "Para cartão ou boleto, informe o endereço de cobrança completo: rua, número, bairro, cidade, UF e CEP.",
      });
    }

    const pagamento = montarPagamento({
      metodoPagamento,
      parcelas: Number(body.parcelas || 1),
      cardToken,
    });

    const clinica = String(venda.clinicaNome || venda.clinica || "Clínica não informada");
    const especialidade = String(venda.especialidade || "Consulta");
    const descricao = `Consulta ${especialidade} - ${clinica}`.slice(0, 120);

    const pedido = {
      customer: montarClientePagarme(cliente, enderecoPagarme),
      items: [{
        amount: paraCentavos(valorFinal),
        description: descricao,
        quantity: 1,
        code: `venda-consultas-${vendaId}`,
      }],
      payments: [pagamento],
      metadata: {
        tipoVenda: "consultas",
        vendaId,
        usuarioUid: uid,
        clienteId: String(venda.clienteId || ""),
        metodoPagamento,
      },
    };

    const pedidoResposta = await pagarmeService.criarPedido(pedido);
    if (!pedidoResposta?.id) {
      throw new Error("A Pagar.me não retornou o identificador do pedido.");
    }

    const dadosPagamento = extrairDadosPagamento(pedidoResposta);
    const agora = FieldValue.serverTimestamp();

    await vendaRef.set({
      metodoPagamento,
      formaPagamento: metodoPagamento === "credit_card"
        ? "Cartão de crédito"
        : metodoPagamento === "boleto" ? "Boleto" : "PIX",
      valorCobrado: valorFinal,
      pagarmeOrderId: dadosPagamento.orderId,
      pagarmeChargeId: dadosPagamento.chargeId,
      pagarmeStatus: dadosPagamento.status || "pending",
      statusPagamento: "Aguardando pagamento",
      statusPagamentoLabel: "Aguardando pagamento",
      pagamentoConfirmado: false,
      qrCode: dadosPagamento.qrCode || null,
      qrCodeUrl: dadosPagamento.qrCodeUrl || null,
      pixExpiraEm: dadosPagamento.pixExpiraEm || null,
      boletoUrl: dadosPagamento.boletoUrl || null,
      boletoLinha: dadosPagamento.boletoLinha || null,
      checkoutStatus: "aguardando_pagamento",
      checkoutIniciadoEm: agora,
      atualizadoEm: agora,
    }, { merge: true });

    return res.status(201).json({
      sucesso: true,
      ok: true,
      mensagem: "Cobrança da consulta criada. Aguardando confirmação do pagamento.",
      vendaId,
      pedidoId: dadosPagamento.orderId,
      cobrancaId: dadosPagamento.chargeId,
      valorTotal: valorFinal,
      statusPagamento: "Aguardando pagamento",
      qr_code: dadosPagamento.qrCode,
      qr_code_url: dadosPagamento.qrCodeUrl,
      pix_expira_em: dadosPagamento.pixExpiraEm,
      boleto_url: dadosPagamento.boletoUrl,
      boleto_linha: dadosPagamento.boletoLinha,
    });
  } catch (error) {
    console.error("Erro ao criar checkout de consultas:", {
      mensagem: error.message,
      status: error.status || null,
      detalhes: error.detalhes || null,
    });
    return res.status(error.status || 500).json({
      sucesso: false,
      ok: false,
      mensagem: error.message || "Não foi possível iniciar o checkout da consulta.",
      detalhes: error.detalhes || undefined,
    });
  }
}


module.exports = {

  criarCheckout,

  criarCheckoutExame,
  criarCheckoutConsulta,

};
