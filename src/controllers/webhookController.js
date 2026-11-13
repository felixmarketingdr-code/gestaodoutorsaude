
const crypto = require("crypto");

const { db } = require("../config/firebase");
const { consultarPedido } = require("../services/pagarmeService");
const { FieldValue } = require("firebase-admin/firestore");

const COLECAO_CONTRATOS = "contratos";
const COLECAO_EVENTOS = "webhook_eventos";

function compararSeguro(recebido, esperado) {
  if (
    typeof recebido !== "string" ||
    typeof esperado !== "string"
  ) {
    return false;
  }

  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);

  return a.length === b.length && crypto.timingSafeEqual(a, b);
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

async function receberWebhook(req, res) {
  try {
    // 1. Validar token secreto da URL
    const tokenEsperado = process.env.PAGARME_WEBHOOK_TOKEN;
    const tokenRecebido = req.params.token;

    if (!compararSeguro(tokenRecebido, tokenEsperado)) {
      return res.status(401).json({
        sucesso: false,
        mensagem: "Não autorizado.",
      });
    }

    // 2. Validar evento recebido
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

    // 3. Consultar o pedido diretamente na Pagar.me
    const pedidoId = dados.id;

    if (!pedidoId) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "ID do pedido não informado.",
      });
    }

    const pedido = await consultarPedido(String(pedidoId));

    if (!pedido || String(pedido.id) !== String(pedidoId)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Pedido não localizado na Pagar.me.",
      });
    }

    // 4. Conferir os metadados do pedido
    const contratoId = pedido.metadata?.contratoId;

    if (!contratoId) {
      console.error("Pedido sem contratoId:", pedidoId);

      return res.status(200).json({
        sucesso: true,
        mensagem: "Pedido sem contrato vinculado.",
      });
    }

    const statusPedido = String(pedido.status || "").toLowerCase();

    if (
      tipoEvento === "order.paid" &&
      statusPedido !== "paid"
    ) {
      return res.status(503).json({
        sucesso: false,
        mensagem: "Pagamento ainda não confirmado na Pagar.me.",
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

    // 5. Preparar referências do Firestore
    const contratoRef = db
      .collection(COLECAO_CONTRATOS)
      .doc(String(contratoId));

    const eventoId = gerarIdentificadorEvento(evento);

    const eventoRef = db
      .collection(COLECAO_EVENTOS)
      .doc(eventoId);

    // 6. Atualizar contrato de forma transacional
    await db.runTransaction(async (transaction) => {
      const eventoDoc = await transaction.get(eventoRef);

      if (eventoDoc.exists) {
        return;
      }

      const contratoDoc = await transaction.get(contratoRef);

      if (!contratoDoc.exists) {
        throw new Error("Contrato não encontrado: " + contratoId);
      }

      const contrato = contratoDoc.data();

      if (
        String(contrato.pagarmeOrderId || "") !== String(pedidoId)
      ) {
        throw new Error(
          "O pedido não corresponde ao pagarmeOrderId do contrato."
        );
      }

      // Um pagamento confirmado nunca será revertido
      if (
        contrato.pagamentoConfirmado === true &&
        tipoEvento !== "order.paid"
      ) {
        transaction.create(eventoRef, {
          tipo: tipoEvento,
          pedidoId: String(pedidoId),
          contratoId: String(contratoId),
          processado: true,
          ignorado: true,
          motivo: "Pagamento já confirmado.",
          criadoEm: FieldValue.serverTimestamp(),
        });

        return;
      }

      const atualizacao = {
        pagarmeOrderId: String(pedidoId),
        pagarmeUltimoEvento: tipoEvento,
        pagarmeAtualizadoEm: FieldValue.serverTimestamp(),
        atualizadoEm: FieldValue.serverTimestamp(),
      };

      if (tipoEvento === "order.paid") {
        atualizacao.statusPagamento = "Pago";
        atualizacao.pagamentoConfirmado = true;
        atualizacao.status = "Análise de Crédito";
        atualizacao.pagamentoConfirmadoEm =
          FieldValue.serverTimestamp();
      }

      if (tipoEvento === "order.payment_failed") {
        atualizacao.statusPagamento = "Pagamento recusado";
        atualizacao.pagamentoConfirmado = false;
      }

      if (tipoEvento === "order.canceled") {
        atualizacao.statusPagamento = "Cancelado";
        atualizacao.pagamentoConfirmado = false;
        atualizacao.status = "Cancelado";
      }

      transaction.update(contratoRef, atualizacao);

      transaction.create(eventoRef, {
        tipo: tipoEvento,
        pedidoId: String(pedidoId),
        contratoId: String(contratoId),
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
