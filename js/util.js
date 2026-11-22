// ======================================
// Livro Caixa Rural — utilidades
// Datas no horário do aparelho, dinheiro, campos com máscara,
// avisos na tela (toast) e carregamento de bibliotecas sob demanda.
// ======================================

const MESES_NOMES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const MESES_CURTOS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function pad2(n){ return String(n).padStart(2,"0"); }

// -------------------------------
// DATAS (sempre no horário local)
// -------------------------------

// Antes usava toISOString(), que é UTC: depois das 21h (Brasília)
// a data já virava o dia seguinte. Agora é o dia do aparelho.
function dataLocalStr(d){
    return d.getFullYear() + "-" + pad2(d.getMonth()+1) + "-" + pad2(d.getDate());
}
function dataHoje(){ return dataLocalStr(new Date()); }
function mesAtual(){ return dataHoje().substring(0,7); }
function anoDe(dataStr){ return parseInt(String(dataStr||"").substring(0,4), 10); }
function mesDe(dataStr){ return String(dataStr||"").substring(0,7); }

// Soma meses sem pular mês: 31/01 + 1 mês = 28/02 (ou 29/02), não 03/03.
function somarMeses(dataStr, n){
    const [a, m, d] = String(dataStr).split("-").map(Number);
    const total = a*12 + (m-1) + n;
    const ano = Math.floor(total/12);
    const mes = total - ano*12;                       // 0..11
    const ultimoDia = new Date(ano, mes+1, 0).getDate();
    return ano + "-" + pad2(mes+1) + "-" + pad2(Math.min(d || 1, ultimoDia));
}
function mesAnterior(mesStr){ return somarMeses(mesStr + "-01", -1).substring(0,7); }
function mesSeguinte(mesStr){ return somarMeses(mesStr + "-01", 1).substring(0,7); }

function nomeMes(mesStr){
    const [a, m] = String(mesStr).split("-").map(Number);
    return (MESES_NOMES[m-1] || "?") + " de " + a;
}
function nomeMesTitulo(mesStr){
    const t = nomeMes(mesStr);
    return t.charAt(0).toUpperCase() + t.slice(1);
}
function nomeMesCurto(mesStr){
    const m = Number(String(mesStr).split("-")[1]);
    return MESES_CURTOS[m-1] || "?";
}

// "30/09/2025" → "2025-09-30"
function dataBrParaIso(s){
    const m = String(s||"").match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}
function formatarData(dataStr){
    if(!dataStr) return "—";
    const [a, m, d] = String(dataStr).split("-");
    if(!d) return dataStr;
    return `${d}/${m}/${a}`;
}

// -------------------------------
// NÚMEROS E DINHEIRO
// -------------------------------

function arred(v){
    const n = Number(v) || 0;
    return Math.round((n + (n >= 0 ? Number.EPSILON : -Number.EPSILON)) * 100) / 100;
}
function soma(lista, fn){
    return arred((lista||[]).reduce((s, x)=> s + (Number(fn(x)) || 0), 0));
}
function dinheiro(valor){
    return Number(valor||0).toLocaleString("pt-BR", {style:"currency", currency:"BRL"});
}
// Para eixo de gráfico: "R$ 25 mil", "R$ 1,5 mil", "R$ 800"
function dinheiroCurto(valor){
    const v = Number(valor||0);
    if(Math.abs(v) >= 1000000) return "R$ " + (v/1000000).toLocaleString("pt-BR", {maximumFractionDigits:1}) + " mi";
    if(Math.abs(v) >= 1000) return "R$ " + (v/1000).toLocaleString("pt-BR", {maximumFractionDigits:1}) + " mil";
    return "R$ " + v.toLocaleString("pt-BR", {maximumFractionDigits:0});
}
function numero(valor, casas){
    return Number(valor||0).toLocaleString("pt-BR", {
        minimumFractionDigits: casas || 0,
        maximumFractionDigits: casas == null ? 2 : casas
    });
}
// Preço por litro: a nota da cooperativa usa várias casas (2,785156)
function formatarPreco(valor){
    return "R$ " + Number(valor||0).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:4});
}
function formatarDecimal(valor, maxCasas){
    if(valor == null || valor === "" || isNaN(Number(valor))) return "";
    return Number(valor).toLocaleString("pt-BR", {minimumFractionDigits:0, maximumFractionDigits: maxCasas == null ? 6 : maxCasas, useGrouping:false});
}
function formatarPercentual(valor){
    return Number(valor||0).toLocaleString("pt-BR", {maximumFractionDigits:2}) + "%";
}

// Lê número escrito do jeito brasileiro: "25.437,88" → 25437.88 · "2,7852" → 2.7852
function lerNumeroBr(texto){
    if(texto == null) return 0;
    let s = String(texto).trim().replace(/[^\d,.\-]/g, "");
    if(s === "") return 0;
    if(s.includes(",")){
        s = s.replace(/\./g, "").replace(",", ".");
    }else if(/^\-?\d{1,3}(\.\d{3})+$/.test(s)){
        s = s.replace(/\./g, "");                     // "8.957" = oito mil e novecentos
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}

// -------------------------------
// TEXTOS
// -------------------------------

function escapeHtml(str){
    return String(str ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#39;");
}
function normalizarTexto(s){
    return String(s||"").normalize("NFD").replace(/[̀-ͯ]/g, "")
        .toLowerCase().replace(/\s+/g, " ").trim();
}
// "000107978" e "107978" são a mesma nota
function normalizarNF(nf){
    const d = String(nf||"").replace(/\D/g, "").replace(/^0+/, "");
    return d || "";
}
// Só deixa passar ids "limpos" (os do Firestore são letras e números)
function idSeguro(id){
    return /^[A-Za-z0-9_-]+$/.test(String(id||"")) ? String(id) : "";
}
function gerarId(){
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}
function nomeArquivoSeguro(s, max){
    const limpo = normalizarTexto(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return (limpo || "arquivo").substring(0, max || 40);
}

// -------------------------------
// AVISO NA TELA (toast), com botão opcional
// ex.: mostrarToast("Lançamento excluído", {acao:{rotulo:"Desfazer", fn: ()=>...}})
// -------------------------------

let toastTimer = null;

function mostrarToast(texto, opcoes){
    opcoes = opcoes || {};
    fecharToast();

    const div = document.createElement("div");
    div.className = "toast";
    div.setAttribute("role", "status");
    div.setAttribute("aria-live", "polite");

    const span = document.createElement("span");
    span.textContent = texto;
    div.appendChild(span);

    if(opcoes.acao){
        const b = document.createElement("button");
        b.type = "button";
        b.className = "toast-acao";
        b.textContent = opcoes.acao.rotulo;
        b.onclick = ()=>{
            fecharToast();
            try{ opcoes.acao.fn(); }catch(e){ console.log("Erro na ação do aviso:", e); }
        };
        div.appendChild(b);
    }

    document.body.appendChild(div);
    setTimeout(()=> div.classList.add("show"), 30);
    toastTimer = setTimeout(fecharToast, opcoes.duracao || (opcoes.acao ? 7000 : 2800));
}

function fecharToast(){
    clearTimeout(toastTimer);
    document.querySelectorAll(".toast").forEach(t=> t.remove());
}

// -------------------------------
// BIBLIOTECAS SOB DEMANDA (ficam guardadas para uso sem sinal)
// -------------------------------

const scriptsCarregando = {};

function carregarScript(src){
    if(!scriptsCarregando[src]){
        scriptsCarregando[src] = new Promise((ok, falha)=>{
            const s = document.createElement("script");
            s.src = src;
            s.onload = ()=> ok();
            s.onerror = ()=>{ delete scriptsCarregando[src]; falha(new Error("Não carregou " + src)); };
            document.head.appendChild(s);
        });
    }
    return scriptsCarregando[src];
}
async function garantirXlsx(){
    if(typeof XLSX === "undefined") await carregarScript("vendor/xlsx/xlsx.bundle.js");
}
async function garantirJsZip(){
    if(typeof JSZip === "undefined") await carregarScript("vendor/jszip/jszip.min.js");
}

function baixarArquivo(blob, nome){
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revogar na hora pode cancelar o download em alguns celulares
    setTimeout(()=> URL.revokeObjectURL(url), 10000);
}

// -------------------------------
// CAMPOS COM MÁSCARA
// O valor de verdade fica em data-valor-real (dataset.valorReal)
// -------------------------------

// Digitar 2-7-0-0 mostra "27,00"
function aplicarMascaraValor(input){
    let digitos = input.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    if(digitos === "") digitos = "0";
    const valor = parseInt(digitos, 10) / 100;
    input.dataset.valorReal = valor;
    input.value = valor.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
}

// Litros: só separador de milhar ("1.100")
function aplicarMascaraInteiro(input){
    const digitos = input.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    const valor = digitos === "" ? 0 : parseInt(digitos, 10);
    input.dataset.valorReal = valor;
    input.value = digitos === "" ? "" : valor.toLocaleString("pt-BR");
}

function valorDoCampo(id){
    const el = document.getElementById(id);
    if(!el) return 0;
    if(el.dataset.valorReal !== undefined && el.dataset.valorReal !== "") return Number(el.dataset.valorReal) || 0;
    return lerNumeroBr(el.value);
}

// Campos de digitação livre com vírgula (preço por litro, alíquota)
function lerDecimalCampo(id){
    const el = document.getElementById(id);
    if(!el || !String(el.value).trim()) return 0;
    return lerNumeroBr(el.value);
}

function definirDinheiroCampo(id, valor){
    const el = document.getElementById(id);
    if(!el) return;
    const v = arred(valor);
    el.dataset.valorReal = v;
    el.value = v.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
}

// HTML de um campo de dinheiro já preenchido
function atributosDinheiro(valor){
    if(valor == null || valor === "" || isNaN(Number(valor))) return `value="" data-valor-real=""`;
    const v = arred(valor);
    return `value="${v.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2})}" data-valor-real="${v}"`;
}
function atributosInteiro(valor){
    if(!valor) return `value="" data-valor-real=""`;
    return `value="${Number(valor).toLocaleString("pt-BR")}" data-valor-real="${Number(valor)}"`;
}
