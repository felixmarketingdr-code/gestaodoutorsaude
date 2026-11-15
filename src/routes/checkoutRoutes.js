const express = require("express");
const autenticarUsuario = require("../middlewares/autenticarUsuario");
const checkoutController = require("../controllers/checkoutController");

const router = express.Router();

// Checkout de planos/carteirinhas.
router.post("/", autenticarUsuario, checkoutController.criarCheckout);

// Checkout de vendas de exames já registradas em vendasExames/{vendaId}.
router.post("/exames", autenticarUsuario, checkoutController.criarCheckoutExame);

// Checkout de vendas de consultas já registradas em vendasConsultas/{vendaId}.
router.post("/consultas", autenticarUsuario, checkoutController.criarCheckoutConsulta);

module.exports = router;
