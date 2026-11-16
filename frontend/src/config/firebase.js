import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyARKsyp-fosNEOaNpFdACNboxCs4YdWEQk",
  authDomain: "gestaodoutordetodos.firebaseapp.com",
  projectId: "gestaodoutordetodos",
  storageBucket: "gestaodoutordetodos.firebasestorage.app",
  messagingSenderId: "965495796695",
  appId: "1:965495796695:web:287d897da8158874239192",
};

const app = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;

