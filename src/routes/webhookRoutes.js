
const express = require("express");
const webhookController = require("../controllers/webhookController");

const router = express.Router();

router.post("/:token", webhookController.receberWebhook);

module.exports = router;
