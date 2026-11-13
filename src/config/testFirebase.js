
const { db, auth } = require("./firebase");

async function testarFirebase() {
  try {
    await db.collection("_diagnostico").doc("conexao").set({
      sistema: "Gestão Doutor Saúde Familiar",
      status: "conectado",
      data: new Date(),
    });

    console.log("Firestore conectado com sucesso!");

    const resultado = await auth.listUsers(1);

    console.log("Firebase Authentication acessível!");
    console.log("Usuários encontrados:", resultado.users.length);

    process.exit(0);
  } catch (error) {
    console.error("Erro na conexão Firebase:", error.message);
    process.exit(1);
  }
}

testarFirebase();
