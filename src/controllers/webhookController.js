
const crypto = require("crypto");

const { db } = require("../config/firebase");
const { consultarPedido } = require("../services/pagarmeService");
const { FieldValue } = require("firebase-admin/firestore");

const COLECAO_CONTRATOS = "contratos";
const COLECAO_CLIENTES = "clientes";
const COLECAO_EVENTOS = "webhook_eventos";
const COLECAO_HISTORICO = "historicoContratos";

// =====================================================
// SEGURANÇA
// =====================================================

function compararSeguro(recebido, esperado) {
  if (
    typeof recebido !== "string" ||
    typeof esperado !== "string" ||
    !recebido ||
    !esperado
  ) {
    return false;
  }

  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);

  return (
    a.length === b.length &&
    crypto.timingSafeEqual(a, b)
  );
}

function gerarIdentificadorEvento(evento) {
  const conteudo = evento.id
    ? String(evento.id)
    : JSON.stringify(evento);

  return crypto
    .createHash("sha256")
    .update(conteudo)
    .digest("hex");
}

// =====================================================
// EXTRAIR DADOS DA PAGAR.ME
// =====================================================

function obterCobranca(pedido) {
  return pedido?.charges?.[0] || pedido?.charge || {};
}

function obterTransacao(pedido) {
  const cobranca = obterCobranca(pedido);

  return (
    cobranca.last_transaction ||
    cobranca.transaction ||
    pedido?.last_transaction ||
    {}
  );
}

function valorEmReais(valorCentavos, fallback) {
  const numero = Number(valorCentavos);

  if (Number.isFinite(numero) && numero > 0) {
    return Number((numero / 100).toFixed(2));
  }

  return Number(fallback || 0);
}

function obterMetodoPagamento(pedido, contrato) {
  const cobranca = obterCobranca(pedido);
  const transacao = obterTransacao(pedido);

  const metodo =
    transacao.payment_method ||
    cobranca.payment_method ||
    pedido?.payment_method ||
    contrato?.metodoPagamento ||
    "";

  const aliases = {
    credit_card: "Cartão de crédito",
    pix: "PIX",
    boleto: "Boleto",
  };

  return {
    metodoPagamento: metodo,
    formaPagamento:
      aliases[metodo] ||
      contrato?.formaPagamento ||
      metodo ||
      "Não informado",
  };
}

function extrairDadosConfirmacao(pedido, contrato) {
  const cobranca = obterCobranca(pedido);
  const transacao = obterTransacao(pedido);
  const pagamento = obterMetodoPagamento(pedido, contrato);

  const valor = valorEmReais(
    cobranca.amount || pedido?.amount,
    contrato?.valorTotal || contrato?.valor
  );

  return {
    pagarmeOrderId: String(pedido.id),

    pagarmeChargeId:
      cobranca.id ||
      contrato?.pagarmeChargeId ||
      null,

    pagarmeTransactionId:
      transacao.id ||
      transacao.transaction_id ||
      cobranca.last_transaction?.id ||
      null,

    pagarmeStatus: String(
      pedido.status || cobranca.status || "paid"
    ).toLowerCase(),

    metodoPagamento:
      pagamento.metodoPagamento ||
      contrato?.metodoPagamento ||
      "",

    formaPagamento: pagamento.formaPagamento,

    valorPago: valor,
    valorTotal: valor,
    valorParcela: contrato?.valorParcela ?? valor,

    quantidadeParcelas:
      contrato?.quantidadeParcelas || 1,

    pagamentoConfirmado: true,
    statusPagamento: "Pago",
    statusPagamentoLabel: "Pago",

    pagamentoConfirmadoEm:
      contrato?.pagamentoConfirmadoEm ||
      FieldValue.serverTimestamp(),
  };
}


// =====================================================
// PROCESSAR PAGAMENTO DE VENDA DE EXAMES
// =====================================================

async function processarWebhookVendaExame({
  pedido,
  pedidoId,
  tipoEvento,
  evento,
  statusPedido,
}) {
  const vendaId = String(pedido?.metadata?.vendaId || "").trim();

  if (!vendaId || String(pedido?.metadata?.tipoVenda || "").toLowerCase() !== "exames") {
    throw new Error("Metadados da venda de exames ausentes ou inválidos.");
  }

  const vendaRef = db.collection("vendasExames").doc(vendaId);
  const vendaSnapshot = await vendaRef.get();

  if (!vendaSnapshot.exists) {
    const erro = new Error("Venda de exames não encontrada.");
    erro.status = 404;
    throw erro;
  }

  const vendaAtual = vendaSnapshot.data() || {};

  if (
    !vendaAtual.pagarmeOrderId ||
    String(vendaAtual.pagarmeOrderId) !== String(pedidoId)
  ) {
    const erro = new Error("O pedido da Pagar.me não corresponde à cobrança registrada na venda de exames.");
    erro.status = 409;
    throw erro;
  }

  // Confere o valor real consultado na Pagar.me com o valor que foi salvo
  // na venda antes de criar a cobrança. A Pagar.me informa valores em centavos.
  const cobranca = obterCobranca(pedido);
  const valorRecebidoCentavos = Number(cobranca.amount || pedido?.amount || 0);
  const valorEsperado = Number(vendaAtual.valorCobrado ?? vendaAtual.valorTotal ?? 0);
  const valorRecebido = valorRecebidoCentavos > 0
    ? Number((valorRecebidoCentavos / 100).toFixed(2))
    : null;

  if (
    !Number.isFinite(valorEsperado) ||
    valorEsperado <= 0 ||
    valorRecebido === null ||
    Math.abs(valorRecebido - valorEsperado) > 0.01
  ) {
    const erro = new Error("O valor confirmado pela Pagar.me não corresponde ao valor da venda de exames. Guia bloqueada.");
    erro.status = 409;
    throw erro;
  }

  const identificadorRecebido = gerarIdentificadorEvento(evento);
  const chaveEvento = tipoEvento === "order.paid"
    ? crypto.createHash("sha256").update(`exames:order.paid:${pedidoId}`).digest("hex")
    : identificadorRecebido;

  const eventoRef = db.collection(COLECAO_EVENTOS).doc(`exames_${chaveEvento}`);
  const historicoVendaRef = vendaRef.collection("historico").doc(chaveEvento);
  const historicoCentralRef = db
    .collection("historicoVendasExames")
    .doc(vendaId)
    .collection("eventos")
    .doc(chaveEvento);

  let resultado = "processado";

  await db.runTransaction(async (transaction) => {
    const [eventoDoc, vendaDoc] = await Promise.all([
      transaction.get(eventoRef),
      transaction.get(vendaRef),
    ]);

    if (eventoDoc.exists) {
      resultado = "duplicado";
      return;
    }

    if (!vendaDoc.exists) {
      throw new Error("Venda de exames não encontrada durante a atualização.");
    }

    const venda = vendaDoc.data() || {};

    if (String(venda.pagarmeOrderId || "") !== String(pedidoId)) {
      throw new Error("A cobrança vinculada à venda foi alterada. Atualização bloqueada.");
    }

    const agora = FieldValue.serverTimestamp();

    // Um evento posterior de falha/cancelamento nunca desfaz pagamento confirmado.
    if (venda.pagamentoConfirmado === true && tipoEvento !== "order.paid") {
      transaction.create(eventoRef, {
        tipo: tipoEvento,
        pedidoId: String(pedidoId),
        vendaId,
        processado: true,
        ignorado: true,
        motivo: "Pagamento já confirmado. Evento posterior ignorado.",
        criadoEm: agora,
      });
      resultado = "ignorado_pagamento_confirmado";
      return;
    }

    const dadosBase = {
      vendaId,
      clienteId: venda.clienteId || String(pedido.metadata?.clienteId || ""),
      clienteNome: venda.clienteNome || "",
      clienteCPF: venda.clienteCPF || "",
      pagarmeOrderId: String(pedidoId),
      pagarmeChargeId: cobranca.id || venda.pagarmeChargeId || null,
      pagarmeStatus: statusPedido,
      valorTotal: valorEsperado,
      valorCobrado: valorEsperado,
      metodoPagamento: venda.metodoPagamento || "",
      formaPagamento: venda.formaPagamento || "",
      origem: "webhook_pagarme_exames",
      criadoEm: agora,
    };

    let atualizacao = {
      pagarmeUltimoEvento: tipoEvento,
      pagarmeStatus: statusPedido,
      pagarmeAtualizadoEm: agora,
      atualizadoEm: agora,
    };
    let descricao = "";
    let statusPagamento = venda.statusPagamento || "Aguardando pagamento";

    if (tipoEvento === "order.paid") {
      atualizacao = {
        ...atualizacao,
        statusVenda: "Em Análise",
        statusVendaLabel: "Em Análise",
        statusPagamento: "Pago",
        statusPagamentoLabel: "Pago",
        pagamentoConfirmado: true,
        pagamentoConfirmadoEm: agora,
        guiaLiberada: true,
        guiaEmitida: false,
        valorPago: valorEsperado,
      };
      statusPagamento = "Pago";
      descricao = "Pagamento dos exames confirmado pela Pagar.me após consulta do pedido. Guia de autorização liberada.";
    } else if (tipoEvento === "order.payment_failed") {
      atualizacao = {
        ...atualizacao,
        statusPagamento: "Pagamento recusado",
        statusPagamentoLabel: "Pagamento recusado",
        pagamentoConfirmado: false,
        guiaLiberada: false,
      };
      statusPagamento = "Pagamento recusado";
      descricao = "A Pagar.me informou que o pagamento dos exames não foi aprovado. A guia permanece bloqueada.";
    } else if (tipoEvento === "order.canceled") {
      atualizacao = {
        ...atualizacao,
        statusPagamento: "Cancelado",
        statusPagamentoLabel: "Cancelado",
        pagamentoConfirmado: false,
        guiaLiberada: false,
      };
      statusPagamento = "Cancelado";
      descricao = "Pedido de pagamento dos exames cancelado na Pagar.me. A guia permanece bloqueada.";
    }

    const eventoHistorico = {
      ...dadosBase,
      eventoId: chaveEvento,
      tipo: "atualizacao_pagamento_exames",
      evento: tipoEvento,
      descricao,
      statusVenda: atualizacao.statusVenda || venda.statusVenda || "Pendente",
      statusVendaLabel: atualizacao.statusVendaLabel || venda.statusVendaLabel || "Pendente",
      statusPagamento,
      statusPagamentoLabel: statusPagamento,
      pagamentoConfirmado: tipoEvento === "order.paid",
      guiaLiberada: tipoEvento === "order.paid",
      usuarioId: "sistema_pagarme",
      usuarioNome: "Pagar.me",
    };

    transaction.set(vendaRef, atualizacao, { merge: true });
    transaction.create(historicoVendaRef, eventoHistorico);
    transaction.create(historicoCentralRef, eventoHistorico);
    transaction.create(eventoRef, {
      tipo: tipoEvento,
      pedidoId: String(pedidoId),
      vendaId,
      processado: true,
      ignorado: false,
      criadoEm: agora,
    });
  });

  return {
    resultado,
    vendaId,
    statusPagamento: tipoEvento === "order.paid"
      ? "Pago"
      : tipoEvento === "order.payment_failed"
        ? "Pagamento recusado"
        : "Cancelado",
    pagamentoConfirmado: tipoEvento === "order.paid" && resultado === "processado",
  };
}

// =====================================================
// RECEBER WEBHOOK
// =====================================================

async function receberWebhook(req, res) {
  try {
    // 1. Validar token secreto do endpoint.
    const tokenEsperado = process.env.PAGARME_WEBHOOK_TOKEN;
    const tokenRecebido = req.params?.token;

    if (!tokenEsperado || !compararSeguro(tokenRecebido, tokenEsperado)) {
      return res.status(401).json({
        sucesso: false,
        mensagem: "Não autorizado.",
      });
    }

    // 2. Validar corpo do evento.
    const evento = req.body;

    if (
      !evento ||
      typeof evento !== "object" ||
      Array.isArray(evento)
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Notificação inválida.",
      });
    }

    const tipoEvento = evento.type || evento.event;
    const dados = evento.data || {};

    if (
      typeof tipoEvento !== "string" ||
      !tipoEvento.trim() ||
      !dados ||
      typeof dados !== "object" ||
      Array.isArray(dados)
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Evento ou dados não informados.",
      });
    }

    const eventosPermitidos = [
      "order.paid",
      "order.payment_failed",
      "order.canceled",
    ];

    if (!eventosPermitidos.includes(tipoEvento)) {
      return res.status(200).json({
        sucesso: true,
        mensagem:
          "Evento recebido sem atualização necessária.",
      });
    }

    // 3. Identificar pedido.
    const pedidoId = dados.id;

    if (!pedidoId) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "ID do pedido não informado.",
      });
    }

    // 4. Consultar diretamente na Pagar.me.
    // O webhook recebido, sozinho, não confirma pagamento.
    const pedido = await consultarPedido(String(pedidoId));

    if (
      !pedido ||
      String(pedido.id) !== String(pedidoId)
    ) {
      return res.status(503).json({
        sucesso: false,
        mensagem: "Pedido não localizado na Pagar.me.",
      });
    }

    const statusPedido = String(
      pedido.status || ""
    ).toLowerCase();

    const statusEsperados = {
      "order.paid": ["paid"],
      "order.payment_failed": ["failed"],
      "order.canceled": ["canceled"],
    };

    if (
      !statusEsperados[tipoEvento].includes(statusPedido)
    ) {
      return res.status(503).json({
        sucesso: false,
        mensagem:
          "O status real do pedido ainda não corresponde ao evento recebido.",
      });
    }

    // 5. Vendas de exames usam coleção e fluxo próprios.
    // O pedido é consultado diretamente na Pagar.me antes desta atualização.
    if (String(pedido.metadata?.tipoVenda || "").toLowerCase() === "exames") {
      const resultadoExames = await processarWebhookVendaExame({
        pedido,
        pedidoId,
        tipoEvento,
        evento,
        statusPedido,
      });

      return res.status(200).json({
        sucesso: true,
        mensagem: resultadoExames.resultado === "duplicado"
          ? "Evento de exames já processado anteriormente."
          : resultadoExames.resultado === "ignorado_pagamento_confirmado"
            ? "Evento ignorado porque o pagamento dos exames já estava confirmado."
            : "Pagamento de exames sincronizado.",
        ...resultadoExames,
        pedidoId: String(pedidoId),
      });
    }

    // 6. Identificar contrato e cliente do fluxo de carteirinhas.
    const contratoId = String(
      pedido.metadata?.contratoId || ""
    );

    if (!contratoId) {
      console.error("Pedido sem contratoId:", pedidoId);

      return res.status(400).json({
        sucesso: false,
        mensagem: "Pedido sem contrato vinculado.",
      });
    }

    const contratoRef = db
      .collection(COLECAO_CONTRATOS)
      .doc(contratoId);

    const contratoSnapshot = await contratoRef.get();

    if (!contratoSnapshot.exists) {
      return res.status(404).json({
        sucesso: false,
        mensagem: "Contrato não encontrado.",
      });
    }

    const contratoAtual = contratoSnapshot.data() || {};

    const clienteId = String(
      pedido.metadata?.clienteId ||
        contratoAtual.clienteId ||
        ""
    );

    if (!clienteId) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Cliente não identificado no contrato.",
      });
    }

    if (
      String(contratoAtual.clienteId || "") !== clienteId
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "O cliente não corresponde ao contrato.",
      });
    }

    if (
      String(contratoAtual.pagarmeOrderId || "") !==
      String(pedidoId)
    ) {
      return res.status(409).json({
        sucesso: false,
        mensagem:
          "O pedido não corresponde à cobrança registrada no contrato.",
      });
    }

    const clienteRef = db
      .collection(COLECAO_CLIENTES)
      .doc(clienteId);

    const clienteSnapshot = await clienteRef.get();

    if (!clienteSnapshot.exists) {
      return res.status(404).json({
        sucesso: false,
        mensagem: "Cliente não encontrado.",
      });
    }

    // 6. Criar identificadores para evitar duplicidade.
    const identificadorRecebido =
      gerarIdentificadorEvento(evento);

    // O evento de pagamento aprovado tem uma chave fixa
    // por pedido para impedir confirmação duplicada.
    const chaveEvento =
      tipoEvento === "order.paid"
        ? crypto
            .createHash("sha256")
            .update(`order.paid:${pedidoId}`)
            .digest("hex")
        : identificadorRecebido;

    const eventoRef = db
      .collection(COLECAO_EVENTOS)
      .doc(chaveEvento);

    const historicoContratoRef = contratoRef
      .collection("historico")
      .doc(chaveEvento);

    const historicoClienteRef = clienteRef
      .collection("historico")
      .doc(chaveEvento);

    // Histórico central do contrato.
    const historicoCentralRef = db
      .collection(COLECAO_HISTORICO)
      .doc(contratoId)
      .collection("eventos")
      .doc(chaveEvento);

    // =================================================
    // 7. ATUALIZAÇÃO TRANSACIONAL
    // =================================================

    let resultadoTransacao = "processado";

    await db.runTransaction(async (transaction) => {
      const [
        eventoDoc,
        contratoDoc,
        clienteDoc,
      ] = await Promise.all([
        transaction.get(eventoRef),
        transaction.get(contratoRef),
        transaction.get(clienteRef),
      ]);

      // Notificação já processada.
      if (eventoDoc.exists) {
        resultadoTransacao = "duplicado";
        return;
      }

      if (!contratoDoc.exists || !clienteDoc.exists) {
        throw new Error(
          "Cliente ou contrato não encontrado durante a atualização."
        );
      }

      const contrato = contratoDoc.data() || {};
      const cliente = clienteDoc.data() || {};

      if (
        String(contrato.clienteId || "") !== clienteId ||
        String(contrato.pagarmeOrderId || "") !==
          String(pedidoId)
      ) {
        throw new Error(
          "O vínculo do pedido foi alterado. Atualização bloqueada."
        );
      }

      const agora = FieldValue.serverTimestamp();

      // =================================================
      // DADOS COMPLETOS PARA O HISTÓRICO
      // =================================================

      const baseEvento = {
        eventoId: chaveEvento,

        clienteId,
        contratoId,

        pedidoId: String(pedidoId),
        pagarmeOrderId: String(pedidoId),

        pagarmeChargeId:
          obterCobranca(pedido).id ||
          contrato.pagarmeChargeId ||
          null,

        pagarmeStatus: statusPedido,

        cliente: contrato.cliente || {
          nome:
            cliente.nomeCompleto ||
            cliente.nome ||
            contrato.clienteNome ||
            "",

          documento:
            cliente.cpf ||
            cliente.cpfNormalizado ||
            contrato.clienteCPF ||
            "",

          email: cliente.email || "",

          telefone:
            cliente.celular ||
            cliente.telefone ||
            "",
        },

        clienteNome:
          contrato.clienteNome ||
          cliente.nomeCompleto ||
          cliente.nome ||
          "",

        clienteCPF:
          contrato.clienteCPF ||
          cliente.cpf ||
          cliente.cpfNormalizado ||
          "",

        planoId: contrato.planoId || "",
        planoNome: contrato.planoNome || "",
        modalidade: contrato.modalidade || "",

        metodoPagamento: contrato.metodoPagamento || "",
        formaPagamento: contrato.formaPagamento || "",

        valor: contrato.valor ?? contrato.valorTotal ?? 0,
        valorParcela: contrato.valorParcela ?? 0,

        quantidadeParcelas:
          contrato.quantidadeParcelas || 1,

        valorTotal:
          contrato.valorTotal ?? contrato.valor ?? 0,

        qrCode: contrato.qrCode || null,
        qrCodeUrl: contrato.qrCodeUrl || null,
        pixExpiraEm: contrato.pixExpiraEm || null,

        boletoUrl: contrato.boletoUrl || null,
        boletoLinha: contrato.boletoLinha || null,

        origem: "webhook_pagarme",
        criadoEm: agora,
      };

      let atualizacaoContrato = {
        pagarmeOrderId: String(pedidoId),
        pagarmeUltimoEvento: tipoEvento,
        pagarmeStatus: statusPedido,
        pagarmeAtualizadoEm: agora,
        atualizadoEm: agora,
      };

      let atualizacaoCliente = {
        ultimoEventoPagamento: tipoEvento,
        pagarmeOrderId: String(pedidoId),
        pagarmeStatus: statusPedido,
        atualizadoEm: agora,
      };

      let descricaoHistorico = "";

      let statusVendaHistorico =
        contrato.statusVenda ||
        contrato.status ||
        "Em Cadastramento";

      let pendenciaHistorico =
        contrato.pendenciaCadastro ||
        "AGUARDANDO PAGAMENTO DO LINK";

      let statusPagamentoHistorico =
        contrato.statusPagamento ||
        "Aguardando pagamento";

      // ==============================================
      // PAGAMENTO CONFIRMADO
      // ==============================================

      if (tipoEvento === "order.paid") {
        if (contrato.pagamentoConfirmado === true) {
          transaction.create(eventoRef, {
            tipo: tipoEvento,
            pedidoId: String(pedidoId),
            contratoId,
            clienteId,
            processado: true,
            ignorado: true,
            motivo:
              "Pagamento deste pedido já estava confirmado.",
            criadoEm: agora,
          });

          resultadoTransacao = "ja_confirmado";
          return;
        }

        const confirmacao = extrairDadosConfirmacao(
          pedido,
          contrato
        );

        atualizacaoContrato = {
          ...atualizacaoContrato,
          ...confirmacao,

          status: "Em Análise",
          statusLabel: "Em Análise",

          statusVenda: "Em Análise",
          statusVendaLabel: "Em Análise",

          pendenciaCadastro: "PAGO",
          pendenciaCadastroLabel: "PAGO",

          statusPagamento: "Pago",
          statusPagamentoLabel: "Pago",

          pagamentoConfirmado: true,
          pagamentoConfirmadoEm: agora,
          atualizadoEm: agora,
        };

        atualizacaoCliente = {
          ...atualizacaoCliente,

          status: "Em Análise",
          statusLabel: "Em Análise",

          statusVenda: "Em Análise",
          statusVendaLabel: "Em Análise",

          pendenciaCadastro: "PAGO",
          pendenciaCadastroLabel: "PAGO",

          statusPagamento: "Pago",
          statusPagamentoLabel: "Pago",

          pagamentoConfirmado: true,
          pagamentoConfirmadoEm: agora,

          ultimoContratoId: contratoId,
          atualizadoEm: agora,
        };

        descricaoHistorico =
          "Pagamento confirmado pela Pagar.me. Venda encaminhada para Em Análise e pendência de pagamento marcada como PAGO.";

        statusVendaHistorico = "Em Análise";
        pendenciaHistorico = "PAGO";
        statusPagamentoHistorico = "Pago";

        Object.assign(baseEvento, {
          ...confirmacao,

          status: "Em Análise",
          statusLabel: "Em Análise",

          statusVenda: "Em Análise",
          statusVendaLabel: "Em Análise",

          pendenciaCadastro: "PAGO",
          pendenciaCadastroLabel: "PAGO",

          statusPagamento: "Pago",
          statusPagamentoLabel: "Pago",

          pagamentoConfirmado: true,
          pagamentoConfirmadoEm: agora,
        });
      }

      // ==============================================
      // PAGAMENTO RECUSADO
      // ==============================================

      if (tipoEvento === "order.payment_failed") {
        atualizacaoContrato = {
          ...atualizacaoContrato,

          // A venda continua no fluxo de cadastramento.
          status: "Em Cadastramento",
          statusLabel: "Em Cadastramento",

          statusVenda: "Em Cadastramento",
          statusVendaLabel: "Em Cadastramento",

          pendenciaCadastro:
            "AGUARDANDO PAGAMENTO DO LINK",

          pendenciaCadastroLabel:
            "AGUARDANDO PAGAMENTO DO LINK",

          statusPagamento: "Pagamento recusado",
          statusPagamentoLabel: "Pagamento recusado",

          pagamentoConfirmado: false,
          atualizadoEm: agora,
        };

        atualizacaoCliente = {
          ...atualizacaoCliente,

          status: "Em Cadastramento",
          statusLabel: "Em Cadastramento",

          statusVenda: "Em Cadastramento",
          statusVendaLabel: "Em Cadastramento",

          pendenciaCadastro:
            "AGUARDANDO PAGAMENTO DO LINK",

          pendenciaCadastroLabel:
            "AGUARDANDO PAGAMENTO DO LINK",

          statusPagamento: "Pagamento recusado",
          statusPagamentoLabel: "Pagamento recusado",

          pagamentoConfirmado: false,
          atualizadoEm: agora,
        };

        descricaoHistorico =
          "A Pagar.me informou que o pagamento não foi aprovado. A venda permanece em cadastramento e aguarda a regularização do pagamento.";

        statusVendaHistorico = "Em Cadastramento";

        pendenciaHistorico =
          "AGUARDANDO PAGAMENTO DO LINK";

        statusPagamentoHistorico = "Pagamento recusado";

        Object.assign(baseEvento, {
          status: "Em Cadastramento",
          statusLabel: "Em Cadastramento",

          statusVenda: "Em Cadastramento",
          statusVendaLabel: "Em Cadastramento",

          pendenciaCadastro:
            "AGUARDANDO PAGAMENTO DO LINK",

          pendenciaCadastroLabel:
            "AGUARDANDO PAGAMENTO DO LINK",

          statusPagamento: "Pagamento recusado",
          statusPagamentoLabel: "Pagamento recusado",

          pagamentoConfirmado: false,
        });
      }

      // ==============================================
      // PEDIDO CANCELADO
      // ==============================================

      if (tipoEvento === "order.canceled") {
        atualizacaoContrato = {
          ...atualizacaoContrato,

          status: "Em Cadastramento",
          statusLabel: "Em Cadastramento",

          statusVenda: "Em Cadastramento",
          statusVendaLabel: "Em Cadastramento",

          pendenciaCadastro:
            "AGUARDANDO PAGAMENTO DO LINK",

          pendenciaCadastroLabel:
            "AGUARDANDO PAGAMENTO DO LINK",

          statusPagamento: "Cancelado",
          statusPagamentoLabel: "Cancelado",

          pagamentoConfirmado: false,
          canceladoEm: agora,
          atualizadoEm: agora,
        };

        atualizacaoCliente = {
          ...atualizacaoCliente,

          status: "Em Cadastramento",
          statusLabel: "Em Cadastramento",

          statusVenda: "Em Cadastramento",
          statusVendaLabel: "Em Cadastramento",

          pendenciaCadastro:
            "AGUARDANDO PAGAMENTO DO LINK",

          pendenciaCadastroLabel:
            "AGUARDANDO PAGAMENTO DO LINK",

          statusPagamento: "Cancelado",
          statusPagamentoLabel: "Cancelado",

          pagamentoConfirmado: false,
          atualizadoEm: agora,
        };

        descricaoHistorico =
          "Pedido de pagamento cancelado na Pagar.me. A venda permanece em cadastramento, aguardando regularização.";

        statusVendaHistorico = "Em Cadastramento";

        pendenciaHistorico =
          "AGUARDANDO PAGAMENTO DO LINK";

        statusPagamentoHistorico = "Cancelado";

        Object.assign(baseEvento, {
          status: "Em Cadastramento",
          statusLabel: "Em Cadastramento",

          statusVenda: "Em Cadastramento",
          statusVendaLabel: "Em Cadastramento",

          pendenciaCadastro:
            "AGUARDANDO PAGAMENTO DO LINK",

          pendenciaCadastroLabel:
            "AGUARDANDO PAGAMENTO DO LINK",

          statusPagamento: "Cancelado",
          statusPagamentoLabel: "Cancelado",

          pagamentoConfirmado: false,
        });
      }

      // ==============================================
      // PROTEÇÃO CONTRA REVERSÃO DE PAGAMENTO
      // ==============================================

      if (
        contrato.pagamentoConfirmado === true &&
        tipoEvento !== "order.paid"
      ) {
        transaction.create(eventoRef, {
          tipo: tipoEvento,
          pedidoId: String(pedidoId),
          contratoId,
          clienteId,
          processado: true,
          ignorado: true,
          motivo:
            "Pagamento já confirmado. Evento posterior ignorado.",
          criadoEm: agora,
        });

        resultadoTransacao =
          "ignorado_pagamento_confirmado";

        return;
      }

      // =================================================
      // GRAVAR ATUALIZAÇÕES
      // =================================================

      transaction.set(
        contratoRef,
        atualizacaoContrato,
        { merge: true }
      );

      transaction.set(
        clienteRef,
        atualizacaoCliente,
        { merge: true }
      );

      const eventoHistorico = {
        ...baseEvento,

        tipo: "atualizacao_pagamento",
        evento: tipoEvento,
        descricao: descricaoHistorico,

        statusVenda: statusVendaHistorico,
        status: statusVendaHistorico,
        statusLabel: statusVendaHistorico,

        pendenciaCadastro: pendenciaHistorico,
        pendenciaCadastroLabel: pendenciaHistorico,

        statusPagamento: statusPagamentoHistorico,
        statusPagamentoLabel: statusPagamentoHistorico,

        usuarioId: "sistema_pagarme",
        usuarioNome: "Pagar.me",
      };

      // Histórico principal do cliente.
      transaction.create(
        historicoClienteRef,
        eventoHistorico
      );

      // Espelho do mesmo evento no histórico do contrato.
      transaction.create(
        historicoContratoRef,
        eventoHistorico
      );

      // Histórico central do contrato.
      // Usa o mesmo ID dos históricos antigos.
      transaction.create(
        historicoCentralRef,
        eventoHistorico
      );

      // Registro de idempotência do webhook.
      transaction.create(eventoRef, {
        tipo: tipoEvento,
        pedidoId: String(pedidoId),
        contratoId,
        clienteId,
        processado: true,
        ignorado: false,
        criadoEm: agora,
      });
    });

    return res.status(200).json({
      sucesso: true,

      mensagem:
        resultadoTransacao === "duplicado"
          ? "Evento já processado anteriormente."
          : resultadoTransacao === "ja_confirmado"
            ? "Pagamento já estava confirmado."
            : resultadoTransacao ===
                "ignorado_pagamento_confirmado"
              ? "Evento ignorado porque o pagamento já estava confirmado."
              : "Notificação recebida e processada.",

      resultado: resultadoTransacao,
      pedidoId: String(pedidoId),
      contratoId,
      clienteId,
    });
  } catch (error) {
    console.error("Erro ao processar webhook:", {
      mensagem: error.message,
      tipo: error.name,
      stack: error.stack,
    });

    return res.status(500).json({
      sucesso: false,
      mensagem: "Não foi possível processar a notificação.",
    });
  }
}

// =====================================================
// EXPORTAÇÃO
// =====================================================

module.exports = {
  receberWebhook,
};
