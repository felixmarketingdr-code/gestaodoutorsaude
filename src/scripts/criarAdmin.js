
const { auth, db } = require("../config/firebase");

async function criarAdministrador() {
  const nome = process.env.ADMIN_NAME;
  const email = process.env.ADMIN_EMAIL;
  const senha = process.env.ADMIN_PASSWORD;

  if (!nome || !email || !senha) {
    throw new Error(
      "Configure ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD no terminal."
    );
  }

  if (senha.length < 12) {
    throw new Error("A senha precisa ter pelo menos 12 caracteres.");
  }

  try {
    const usuario = await auth.createUser({
      displayName: nome,
      email,
      password: senha,
      emailVerified: false,
      disabled: false,
    });

    await auth.setCustomUserClaims(usuario.uid, {
      role: "admin",
    });

    await db.collection("usuarios").doc(usuario.uid).set({
      uid: usuario.uid,
      nome,
      email,
      perfil: "admin",
      ativo: true,
      criadoEm: new Date(),
      criadoPor: "bootstrap",
    });

    console.log("--------------------------------");
    console.log("ADMINISTRADOR CRIADO COM SUCESSO");
    console.log("Nome:", nome);
    console.log("E-mail:", email);
    console.log("Perfil: Administrador");
    console.log("--------------------------------");
  } catch (error) {
    console.error("Erro ao criar administrador:", error.message);
    process.exitCode = 1;
  }
}

criarAdministrador();
