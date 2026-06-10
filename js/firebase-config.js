import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBIFnBGwKzvktTmb8FcUr0SWV-mOiWosIk",
  authDomain: "harmoni-stok.firebaseapp.com",
  projectId: "harmoni-stok",
  storageBucket: "harmoni-stok.firebasestorage.app",
  messagingSenderId: "481063789182",
  appId: "1:481063789182:web:a0d0e36ea3e3e4b2596e2f"
};

const app = initializeApp(firebaseConfig);
export const db  = getFirestore(app);
