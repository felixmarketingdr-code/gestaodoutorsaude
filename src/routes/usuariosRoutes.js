
const express = require("express");

const {
  autenticar,
  somenteAdministrador,
} = require("../middlewares/administrador");

const usuariosController = require("../controllers/usuariosController");

const router = express.Router();

router.use(autenticar);
router.use(somenteAdministrador);

router.get("/", usuariosController.listarUsuarios);

router.post("/", usuariosController.criarUsuario);

router.put("/:uid", usuariosController.editarUsuario);

router.patch(
  "/:uid/status",
  usuariosController.alterarStatusUsuario
);

module.exports = router;
