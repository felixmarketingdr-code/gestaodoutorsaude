
const express = require("express");

const {
  autenticar,
  somenteAdministrador,
} = require("../middlewares/administrador");

const perfisController = require("../controllers/perfisController");

const router = express.Router();

router.use(autenticar);
router.use(somenteAdministrador);

router.get("/", perfisController.listarPerfis);

router.post("/", perfisController.criarPerfil);

router.put("/:id", perfisController.editarPerfil);

router.delete("/:id", perfisController.excluirPerfil);

module.exports = router;
