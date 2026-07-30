// ======================================
// Livro Caixa Rural
// Service Worker
// Funcionamento offline
// ======================================

const CACHE_NAME = "livro-caixa-rural-v2";

const ARQUIVOS = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./manifest.json",
    "./icons/icon-192.png",
    "./icons/icon-512.png"
];

// Instalação
self.addEventListener("install", evento => {
    evento.waitUntil(
        caches.open(CACHE_NAME)
        .then(cache => cache.addAll(ARQUIVOS))
    );
});

// Abrir arquivos offline
self.addEventListener("fetch", evento => {
    // Deixa passar direto pedidos para a nuvem (Firebase, Excel, fontes)
    // — só o "app shell" local é servido pelo cache.
    const url = evento.request.url;
    if (url.includes("googleapis.com") ||
        url.includes("firebaseio.com") ||
        url.includes("firebasestorage") ||
        url.includes("gstatic.com") ||
        url.includes("jsdelivr.net") ||
        url.includes("google.com")) {
        return;
    }

    evento.respondWith(
        caches.match(evento.request)
        .then(resposta => resposta || fetch(evento.request))
    );
});

// Atualização do aplicativo
self.addEventListener("activate", evento => {
    evento.waitUntil(
        caches.keys()
        .then(chaves => Promise.all(
            chaves.map(chave => {
                if (chave !== CACHE_NAME) {
                    return caches.delete(chave);
                }
            })
        ))
    );
});
