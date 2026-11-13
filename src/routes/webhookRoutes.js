
const express = require("express");
const webhookController = require("../controllers/webhookController");

const router = express.Router();

// Recebe notificações enviadas pela Pagar.me
router.post("/", webhookController.receberWebhook);

module.exports = router;
