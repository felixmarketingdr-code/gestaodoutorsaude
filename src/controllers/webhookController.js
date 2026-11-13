
const { db } = require("../config/firebase");
const { consultarPedido } = require("../services/pagarmeService");

/**
 * Webhook da Pagar.me
 *
 * Recebe notificações, consulta o pedido diretamente
 * na Pagar.me e atualiza o contrato correspondente.
 *
 * O contrato NÃO é ativado automaticamente.
 */

async function receberWebhook(req, res) {
  try {
    const evento = req.body;

    if (!evento || typeof evento !== "object") {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Notificação inválida.",
      });
    }

    const tipoEvento = evento.type || evento.event;
    const dados = evento.data || evento;

    const pedidoId =
      dados.id ||
      dados.order_id ||
      dados.order?.id;

    if (!tipoEvento || !pedidoId) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Evento ou identificador do pedido não informado.",
      });
    }

    // Eventos que não representam uma atualização de pedido
    // não precisam alterar o contrato.
    const eventosPermitidos = [
      "order.paid",
      "order.payment_failed",
      "order.canceled",
      "charge.paid",
      "charge.payment_failed",
      "charge.refunded",
    ];

    if (!eventosPermitidos.includes(tipoEvento)) {
      return res.status(200).json({
        sucesso: true,
        mensagem: "Evento recebido, sem ação necessária.",
      });
    }

    // Consulta o pedido diretamente na Pagar.me.
    // A notificação recebida não é considerada prova suficiente.
    const pedido = await consultarPedido(pedidoId);

    const metadata = pedido.metadata || {};
    const contratoId = metadata.contratoId;

    if (!contratoId) {
      console.error(
        "Webhook sem contratoId nos metadados do pedido:",
        pedidoId
      );

      return res.status(200).json({
        sucesso: true,
        mensagem: "Pedido recebido, mas sem contrato vinculado.",
      });
    }

    const contratoRef = db.collection("contratos").doc(contratoId);

    await db.runTransaction(async (transaction) => {
      const contratoDoc = await transaction.get(contratoRef);

      if (!contratoDoc.exists) {
        throw new Error("Contrato não encontrado: " + contratoId);
      }

      const contrato = contratoDoc.data();

      // Confirma que o pedido pertence ao contrato.
      const pedidoSalvo =
        contrato.pagarmePedidoId ||
        contrato.pedidoId ||
        contrato.orderId;

      if (pedidoSalvo && pedidoSalvo !== pedidoId) {
        throw new Error("Pedido não corresponde ao contrato.");
      }

      const statusPedido = String(pedido.status || "").toLowerCase();

      let pagamentoStatus = contrato.pagamentoStatus || "Aguardando pagamento";
      let contratoStatus = contrato.status || "Pendente";

      if (
        tipoEvento === "order.paid" ||
        tipoEvento === "charge.paid"
      ) {
        if (statusPedido !== "paid") {
          throw new Error(
            "A Pagar.me não confirmou o pedido como pago."
          );
        }

        pagamentoStatus = "Pago";
        contratoStatus = "Análise de Crédito";
      }

      if (
        tipoEvento === "order.payment_failed" ||
        tipoEvento === "charge.payment_failed"
      ) {
        pagamentoStatus = "Pagamento recusado";
      }

      if (
        tipoEvento === "order.canceled" ||
        tipoEvento === "charge.refunded"
      ) {
        pagamentoStatus =
          tipoEvento === "charge.refunded"
            ? "Estornado"
            : "Cancelado";
      }

      transaction.update(contratoRef, {
        pagamentoStatus,
        status: contratoStatus,
        pagarmePedidoId: pedidoId,
        pagarmeUltimoEvento: tipoEvento,
        pagarmeAtualizadoEm:
          new Date().toISOString(),
      });
    });

    return res.status(200).json({
      sucesso: true,
      mensagem: "Notificação processada.",
    });
  } catch (error) {
    console.error("Erro ao processar webhook:", error);

    return res.status(500).json({
      sucesso: false,
      mensagem: "Não foi possível processar a notificação.",
    });
  }
}

module.exports = {
  receberWebhook,
};
