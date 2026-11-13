
require("dotenv").config();

const {
  initializeApp,
  applicationDefault,
  cert,
  getApps,
} = require("firebase-admin/app");

const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

const projectId = process.env.FIREBASE_PROJECT_ID;

if (!projectId) {
  throw new Error("FIREBASE_PROJECT_ID não configurado.");
}

let credential;

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    );

    if (serviceAccount.private_key) {
      serviceAccount.private_key =
        serviceAccount.private_key.replace(/\\n/g, "\n");
    }

    credential = cert(serviceAccount);
  } catch (error) {
    throw new Error(
      "Não foi possível interpretar FIREBASE_SERVICE_ACCOUNT_JSON."
    );
  }
} else {
  credential = applicationDefault();
}

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential,
      projectId,
    });

const db = getFirestore(app);
const auth = getAuth(app);

module.exports = { app, db, auth };
