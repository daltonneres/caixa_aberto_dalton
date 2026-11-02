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

// Cache local do Firestore: o app abre e mostra os últimos dados vistos
// mesmo sem internet, e sincroniza sozinho assim que a conexão voltar.
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code === 'failed-precondition') {
    // Normal quando o app está aberto em mais de uma aba ao mesmo tempo —
    // só a primeira aba consegue ativar o cache offline.
    console.warn('Cache offline ativo em outra aba deste navegador.');
  } else if (err.code === 'unimplemented') {
    console.warn('Este navegador não suporta cache offline do Firestore.');
  }
});
