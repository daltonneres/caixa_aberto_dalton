/* =======================================================
   CONFIGURAÇÃO DO FIREBASE
   Cole aqui as chaves do SEU projeto (veja o passo a passo
   no README.md, seção "Como configurar o Firebase").
   Essas chaves não são secretas — são só o "endereço" do
   seu projeto. A segurança de verdade vem das regras do
   Firestore, também explicadas no README.
   ======================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyBjuAY9zP4rYrf46Ow3hwGNifCBaNeedpU",
  authDomain: "caixaabertodn.firebaseapp.com",
  projectId: "caixaabertodn",
  storageBucket: "caixaabertodn.firebasestorage.app",
  messagingSenderId: "194058633374",
  appId: "1:194058633374:web:9fef56e15675aadb0fbb8f"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
