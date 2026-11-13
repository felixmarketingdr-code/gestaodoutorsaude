
const express = require("express");
const autenticarUsuario = require("../middlewares/autenticarUsuario");
const checkoutController = require("../controllers/checkoutController");

const router = express.Router();

router.post(
  "/",
  autenticarUsuario,
  checkoutController.criarCheckout
);

module.exports = router;
