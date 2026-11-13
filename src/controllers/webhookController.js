
const crypto = require("crypto");

const { db } = require("../config/firebase");
const { consultarPedido } = require("../services/pagarmeService");
const { FieldValue } = require("firebase-admin/firestore");

const COLECAO_CONTRATOS = "contratos";
const COLECAO_EVENTOS = "webhook_eventos";

// ========================================
// AUTENTICAÇÃO DO WEBHOOK
// ========================================

function compararSeguro(valorRecebido, valorEsperado) {
  if (
    typeof valorRecebido !== "string" ||
    typeof valorEsperado !== "string"
  ) {
    return false;
  }

  const recebido = Buffer.from(valorRecebido);
  const esperado = Buffer.from(valorEsperado);

  if (recebido.length !== esperado.length) {
    return false;
  }

  return crypto.timingSafeEqual(recebido, esperado);
}

function autenticarWebhook(req) {
  const usuarioEsperado = process.env.PAGARME_WEBHOOK_USERNAME;
  const senhaEsperada = process.env.PAGARME_WEBHOOK_PASSWORD;

  if (!usuarioEsperado || !senhaEsperada) {
    return false;
  }

  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Basic ")) {
    return false;
  }

  try {
    const credenciais = Buffer.from(
      authorization.slice(6),
      "base64"
    ).toString("utf8");

    const separador = credenciais.indexOf(":");

    if (separador < 0) {
      return false;
    }

    const usuarioRecebido = credenciais.slice(0, separador);
    const senhaRecebida = credenciais.slice(separador + 1);

    return (
      compararSeguro(usuarioRecebido, usuarioEsperado) &&
      compararSeguro(senhaRecebida, senhaEsperada)
    );
  } catch {
    return false;
  }
}

// ========================================
// IDENTIFICADOR DO EVENTO
// ========================================

function gerarIdentificadorEvento(evento) {
  const conteudo = evento.id
    ? String(evento.id)
    : JSON.stringify(evento);

  return crypto
    .createHash("sha256")
    .update(conteudo)
    .digest("hex");
}

// ========================================
// RECEBER WEBHOOK
// ========================================

async function receberWebhook(req, res) {
  try {
    // 1. Validar autenticação
    if (!autenticarWebhook(req)) {
      return res.status(401).json({
        sucesso: false,
        mensagem: "Não autorizado.",
      });
    }

    // 2. Validar corpo
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

    if (!tipoEvento || !dados || typeof dados !== "object") {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Evento ou dados não informados.",
      });
    }

    // 3. Processar somente eventos de pedido
    const eventosPermitidos = [
      "order.paid",
      "order.payment_failed",
      "order.canceled",
    ];

    if (!eventosPermitidos.includes(tipoEvento)) {
      return res.status(200).json({
        sucesso: true,
        mensagem: "Evento recebido, sem atualização necessária.",
      });
    }

    // 4. Identificar o pedido
    const pedidoId = dados.id;

    if (!pedidoId) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "ID do pedido não informado.",
      });
    }

    // 5. Consultar pedido diretamente na Pagar.me
    const pedido = await consultarPedido(pedidoId);

    if (!pedido || pedido.id !== pedidoId) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Pedido não localizado na Pagar.me.",
      });
    }

    // 6. Recuperar contrato pelos metadados
    const contratoId = pedido.metadata?.contratoId;

    if (!contratoId) {
      console.error(
        "Pedido sem contratoId nos metadados:",
        pedidoId
      );

      return res.status(200).json({
        sucesso: true,
        mensagem: "Pedido sem contrato vinculado.",
      });
    }

    const statusPedido = String(
      pedido.status || ""
    ).toLowerCase();

    // 7. Conferir o status real do pedido
    if (
      tipoEvento === "order.paid" &&
      statusPedido !== "paid"
    ) {
      return res.status(503).json({
        sucesso: false,
        mensagem: "Aguardando confirmação do pagamento na Pagar.me.",
      });
    }

    if (
      tipoEvento === "order.payment_failed" &&
      statusPedido !== "failed"
    ) {
      return res.status(200).json({
        sucesso: true,
        mensagem: "Falha ainda não confirmada no pedido.",
      });
    }

    if (
      tipoEvento === "order.canceled" &&
      statusPedido !== "canceled"
    ) {
      return res.status(200).json({
        sucesso: true,
        mensagem: "Cancelamento ainda não confirmado no pedido.",
      });
    }

    // 8. Preparar referências
    const contratoRef = db
      .collection(COLECAO_CONTRATOS)
      .doc(contratoId);

    const eventoId = gerarIdentificadorEvento(evento);

    const eventoRef = db
      .collection(COLECAO_EVENTOS)
      .doc(eventoId);

    // 9. Atualização transacional
    await db.runTransaction(async (transaction) => {
      const eventoDoc = await transaction.get(eventoRef);

      // Impedir processamento duplicado
      if (eventoDoc.exists) {
        return;
      }

      const contratoDoc = await transaction.get(contratoRef);

      if (!contratoDoc.exists) {
        throw new Error("Contrato não encontrado: " + contratoId);
      }

      const contrato = contratoDoc.data();

      // Conferir correspondência do pedido
      if (contrato.pagarmeOrderId !== pedidoId) {
        throw new Error(
          "O pedido não corresponde ao pagarmeOrderId do contrato."
        );
      }

      // Não desfazer pagamento já confirmado
      if (
        contrato.pagamentoConfirmado === true &&
        tipoEvento !== "order.paid"
      ) {
        transaction.create(eventoRef, {
          tipo: tipoEvento,
          pedidoId,
          contratoId,
          processado: true,
          ignorado: true,
          motivo: "Pagamento já confirmado.",
          criadoEm: FieldValue.serverTimestamp(),
        });

        return;
      }

      const atualizacao = {
        pagarmeOrderId: pedidoId,
        pagarmeUltimoEvento: tipoEvento,
        pagarmeAtualizadoEm: FieldValue.serverTimestamp(),
        atualizadoEm: FieldValue.serverTimestamp(),
      };

      // PAGAMENTO APROVADO
      if (tipoEvento === "order.paid") {
        atualizacao.statusPagamento = "Pago";
        atualizacao.pagamentoConfirmado = true;
        atualizacao.status = "Análise de Crédito";
        atualizacao.pagamentoConfirmadoEm =
          FieldValue.serverTimestamp();
      }

      // PAGAMENTO RECUSADO
      if (tipoEvento === "order.payment_failed") {
        atualizacao.statusPagamento = "Pagamento recusado";
        atualizacao.pagamentoConfirmado = false;
      }

      // PEDIDO CANCELADO
      if (tipoEvento === "order.canceled") {
        atualizacao.statusPagamento = "Cancelado";
        atualizacao.pagamentoConfirmado = false;
        atualizacao.status = "Cancelado";
      }

      transaction.update(contratoRef, atualizacao);

      transaction.create(eventoRef, {
        tipo: tipoEvento,
        pedidoId,
        contratoId,
        processado: true,
        criadoEm: FieldValue.serverTimestamp(),
      });
    });

    return res.status(200).json({
      sucesso: true,
      mensagem: "Notificação recebida e processada.",
    });

  } catch (error) {
    console.error("Erro ao processar webhook:", {
      mensagem: error.message,
      tipo: error.name,
    });

    return res.status(500).json({
      sucesso: false,
      mensagem: "Não foi possível processar a notificação.",
    });
  }
}

module.exports = {
  receberWebhook,
};
