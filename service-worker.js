// ======================================
// Livro Caixa Rural
// Service Worker — funcionamento sem sinal
// ======================================

const CACHE_NAME = "livro-caixa-rural-v4";

const ARQUIVOS = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./js/util.js",
    "./js/dados.js",
    "./js/nota-pdf.js",
    "./js/lancamentos.js",
    "./js/painel.js",
    "./js/declaracao.js",
    "./js/exportar.js",
    "./manifest.json",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./vendor/firebase/firebase-app-compat.js",
    "./vendor/firebase/firebase-auth-compat.js",
    "./vendor/firebase/firebase-firestore-compat.js",
    "./vendor/xlsx/xlsx.bundle.js",
    "./vendor/jszip/jszip.min.js",
    "./vendor/pdfjs/pdf.min.mjs",
    "./vendor/pdfjs/pdf.worker.min.mjs"
];

// Instalação: guarda tudo o que o app precisa para abrir sem internet
self.addEventListener("install", evento=>{
    self.skipWaiting();
    evento.waitUntil(
        caches.open(CACHE_NAME).then(cache=> cache.addAll(ARQUIVOS))
    );
});

// Atualização: apaga as versões antigas
self.addEventListener("activate", evento=>{
    evento.waitUntil(
        caches.keys()
            .then(chaves=> Promise.all(chaves.map(chave=> chave !== CACHE_NAME ? caches.delete(chave) : null)))
            .then(()=> self.clients.claim())
    );
});

// Internet com prazo: com sinal fraco, depois de alguns segundos usa a cópia guardada
function buscarComPrazo(requisicao, ms){
    return new Promise((resolve, reject)=>{
        const timer = setTimeout(()=> reject(new Error("demorou demais")), ms);
        fetch(requisicao).then(
            resp=>{ clearTimeout(timer); resolve(resp); },
            erro=>{ clearTimeout(timer); reject(erro); }
        );
    });
}

self.addEventListener("fetch", evento=>{
    const req = evento.request;
    if(req.method !== "GET") return;

    const url = new URL(req.url);
    // Firebase, Cloudinary, fontes do Google: vão direto para a internet
    if(url.origin !== self.location.origin) return;

    // Bibliotecas (versões fixas): usa a cópia guardada primeiro
    if(url.pathname.includes("/vendor/")){
        evento.respondWith(
            caches.match(req).then(guardada=> guardada || fetch(req).then(resp=>{
                if(resp.ok){
                    const copia = resp.clone();
                    caches.open(CACHE_NAME).then(cache=> cache.put(req, copia));
                }
                return resp;
            }))
        );
        return;
    }

    // Arquivos do app: tenta a internet (versão mais nova); sem sinal, usa a cópia
    evento.respondWith(
        buscarComPrazo(req, 4000)
            .then(resp=>{
                if(resp.ok){
                    const copia = resp.clone();
                    caches.open(CACHE_NAME).then(cache=> cache.put(req, copia));
                }
                return resp;
            })
            .catch(()=> caches.match(req, { ignoreSearch: true }).then(guardada=>{
                if(guardada) return guardada;
                if(req.mode === "navigate") return caches.match("./index.html");
                return Response.error();
            }))
    );
});
