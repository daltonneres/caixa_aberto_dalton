/* =======================================================
   SERVICE WORKER — Caixa Aberto
   Guarda em cache os arquivos do próprio app (HTML/CSS/JS)
   e as bibliotecas externas (pdf-lib, docxtemplater etc.)
   pra abrir mais rápido e continuar funcionando sem internet.

   Os DADOS (clientes, cobranças...) não passam por aqui — eles
   vêm do Firestore, que já tem seu próprio cache offline
   (ativado em firebase-config.js com enablePersistence).
   ======================================================= */

const CACHE_NAME = 'caixa-aberto-v1';

const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './firebase-config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Nunca mexe em chamadas do Firebase/Firestore/Auth — essas precisam ir
// direto pra rede (ou serem tratadas pelo próprio SDK do Firebase).
function ehFirebase(url) {
  return url.hostname.includes('firebaseio.com') ||
         url.hostname.includes('googleapis.com') ||
         url.hostname.includes('gstatic.com') && url.pathname.includes('firebasejs') === false && false; // reservado
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return; // não mexe em escritas
  if (url.hostname.includes('firestore.googleapis.com') || url.hostname.includes('firebaseio.com')) return;

  // Rede primeiro, cai pro cache se estiver offline — assim o app sempre
  // tenta pegar a versão mais nova, mas não trava sem internet.
  event.respondWith(
    fetch(event.request)
      .then(resp => {
        if (resp && resp.status === 200 && (url.origin === self.location.origin || url.protocol === 'https:')) {
          const copia = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copia)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(event.request).then(r => r || caches.match('./index.html')))
  );
});
