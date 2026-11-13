require("dotenv").config();

const {
  initializeApp,
  applicationDefault,
  getApps,
} = require("firebase-admin/app");

const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

const projectId = process.env.FIREBASE_PROJECT_ID;

if (!projectId) {
  throw new Error("FIREBASE_PROJECT_ID não configurado no .env");
}

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: applicationDefault(),
      projectId,
    });

const db = getFirestore(app);
const auth = getAuth(app);

module.exports = { app, db, auth };