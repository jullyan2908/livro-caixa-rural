// ======================================
// Livro Caixa Rural
// Service Worker
// Funcionamento offline
// ======================================

const CACHE_NAME = "livro-caixa-rural-v3";

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
    self.skipWaiting(); // não espera todas as abas fecharem — assume o controle assim que possível
    evento.waitUntil(
        caches.open(CACHE_NAME)
        .then(cache => cache.addAll(ARQUIVOS))
    );
});

// Abrir arquivos: tenta a internet primeiro (pega sempre a versão mais nova).
// Só usa a cópia guardada se estiver sem sinal (uso no campo/fazenda).
self.addEventListener("fetch", evento => {
    // Deixa passar direto pedidos para a nuvem (Firebase, Excel, fontes)
    // — só o "app shell" local passa pela lógica de cache abaixo.
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
        fetch(evento.request)
            .then(resposta => {
                const copia = resposta.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(evento.request, copia));
                return resposta;
            })
            .catch(() => caches.match(evento.request))
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
        )).then(() => self.clients.claim()) // assume o controle das abas já abertas na hora
    );
});
