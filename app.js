// ======================================
// Livro Caixa Rural — Fazenda de Leite
// app.js
// Arquitetura 100% Firestore (sem Storage/Blaze) —
// cada lançamento é um documento próprio; anexos ficam
// guardados como base64 dentro do próprio documento.
// ======================================

// -------------------------------
// FIREBASE — CONFIGURAÇÃO
// -------------------------------

const firebaseConfig = {
    apiKey: "AIzaSyB_QWs8ck34CeJuE5S8LgjCW6CyTGLb-hg",
    authDomain: "livro-de-caixa-rural.firebaseapp.com",
    projectId: "livro-de-caixa-rural",
    storageBucket: "livro-de-caixa-rural.firebasestorage.app",
    messagingSenderId: "592089581297",
    appId: "1:592089581297:web:7435c4aedd0561b7954b50"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

try{
    db.enablePersistence({synchronizeTabs:true})
    .catch(err=>{
        console.log("Persistência offline indisponível:", err.code);
    });
}catch(e){
    console.log("Erro ao ativar persistência offline:", e);
}


// -------------------------------
// ESTADO GLOBAL
// -------------------------------

const STORAGE_KEY = "livro_caixa_rural_dados";

const COLECOES = ["receitas","despesasCusteio","despesasInvestimento","despesasDedutiveis","gastosPessoais"];

// Tamanho máximo (em KB, estimado) de anexos somados por lançamento —
// margem segura abaixo do limite de 1MB por documento do Firestore.
const LIMITE_ANEXOS_KB = 700;
const LIMITE_PDF_BYTES = 350 * 1024;

// Cloudinary — armazenamento de anexos (fotos/PDF) fora do Firestore
const CLOUDINARY_CLOUD_NAME = "zavj8y8b";
const CLOUDINARY_UPLOAD_PRESET = "livro caixa";
const LIMITE_ARQUIVO_BYTES = 8 * 1024 * 1024; // 8MB por arquivo

let usuarioAtual = null;
let pararListenerDados = null;

let dados = {
    propriedade: {},
    receitas: [],
    despesasCusteio: [],
    despesasInvestimento: [],
    despesasDedutiveis: [],
    gastosPessoais: []
};

let telaAtual = "painel";
let subAbaFinanceiro = "receitas";
let anoSelecionado = new Date().getFullYear();
let modoLogin = "entrar";
let mostrarPicker = false;

const CATEGORIAS_CUSTEIO = [
    "Ração/Concentrado","Sal Mineral","Silagem/Feno","Veterinário",
    "Vacinas/Medicamentos","Inseminação Artificial","Material de Ordenha",
    "Produtos de Limpeza","Energia Elétrica","Combustível","Manutenção",
    "Frete do Leite","Análise de Qualidade","Insumos de Pastagem/Lavoura","ITR",
    "Cooperativa/Associação","Seguro Rural","Arrendamento",
    "Serviços de Terceiros (diarista, trator, etc.)","Outras"
];

// As mais usadas no dia a dia — aparecem como botões grandes.
// As demais ficam dentro de "Outras categorias".
const CATEGORIAS_CUSTEIO_COMUNS = [
    "Ração/Concentrado","Veterinário","Vacinas/Medicamentos","Inseminação Artificial",
    "Combustível","Energia Elétrica","Sal Mineral","Manutenção",
    "Serviços de Terceiros (diarista, trator, etc.)"
];

const CATEGORIAS_INVESTIMENTO = [
    "Animais","Maquinário","Benfeitorias","Outras"
];

const TIPOS_RECEITA = [
    "Venda de Leite","Bonificação por Qualidade","Venda de Animais","Outras Receitas"
];

// "Casa" junta duas coisas na TELA, mas guarda separado por baixo:
// Saúde/Educação entram na declaração (despesasDedutiveis);
// os demais NÃO entram, ficam só de controle (gastosPessoais).
const TIPOS_CASA = [
    { valor:"Saúde", colecao:"despesasDedutiveis", dedutivel:true },
    { valor:"Educação", colecao:"despesasDedutiveis", dedutivel:true },
    { valor:"Supermercado", colecao:"gastosPessoais", dedutivel:false },
    { valor:"Padaria", colecao:"gastosPessoais", dedutivel:false },
    { valor:"Material de Construção", colecao:"gastosPessoais", dedutivel:false },
    { valor:"Lazer", colecao:"gastosPessoais", dedutivel:false },
    { valor:"Roupas", colecao:"gastosPessoais", dedutivel:false },
    { valor:"Outras", colecao:"gastosPessoais", dedutivel:false }
];

function infoTipoCasa(valor){
    return TIPOS_CASA.find(t=> t.valor===valor) || TIPOS_CASA[0];
}


// -------------------------------
// UTILIDADES
// -------------------------------

function gerarId(){
    return Date.now().toString(36) + Math.random().toString(36).substring(2,8);
}

function dinheiro(valor){
    return Number(valor||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
}

function numero(valor, casas){
    return Number(valor||0).toLocaleString("pt-BR",{
        minimumFractionDigits: casas||0,
        maximumFractionDigits: casas||2
    });
}

function dataHoje(){
    return new Date().toISOString().substring(0,10);
}

function mesAtual(){
    return new Date().toISOString().substring(0,7);
}

function anoDe(dataStr){
    return parseInt(String(dataStr).substring(0,4), 10);
}

function mostrarToast(texto){
    let antigo = document.querySelector(".toast");
    if(antigo) antigo.remove();

    let div = document.createElement("div");
    div.className = "toast";
    div.innerText = texto;
    document.body.appendChild(div);

    setTimeout(()=>{ div.classList.add("show"); }, 50);
    setTimeout(()=>{ div.remove(); }, 2600);
}

function escapeHtml(str){
    return String(str||"")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;");
}

function anosDisponiveis(){
    let anos = new Set([new Date().getFullYear()]);
    dados.receitas.forEach(r=> anos.add(anoDe(r.data)));
    dados.despesasCusteio.forEach(d=> anos.add(anoDe(d.data)));
    dados.despesasInvestimento.forEach(d=> anos.add(anoDe(d.data)));
    dados.despesasDedutiveis.forEach(d=> anos.add(anoDe(d.data)));
    return Array.from(anos).sort((a,b)=> b-a);
}


// -------------------------------
// COMPRESSÃO / LEITURA EM BASE64
// (guardamos os anexos dentro do próprio documento do
// Firestore — por isso o tamanho precisa ficar bem pequeno)
// -------------------------------

function comprimirImagemParaBase64(arquivo){
    return new Promise((resolve, reject)=>{
        const leitor = new FileReader();
        leitor.onload = (e)=>{
            const img = new Image();
            img.onload = ()=>{
                const MAX = 1000;
                let w = img.width, h = img.height;
                if(w > MAX || h > MAX){
                    if(w > h){ h = Math.round(h * MAX/w); w = MAX; }
                    else{ w = Math.round(w * MAX/h); h = MAX; }
                }
                const canvas = document.createElement("canvas");
                canvas.width = w;
                canvas.height = h;
                canvas.getContext("2d").drawImage(img, 0, 0, w, h);
                const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
                resolve(dataUrl.split(",")[1]);
            };
            img.onerror = ()=> reject(new Error("Não foi possível ler a imagem"));
            img.src = e.target.result;
        };
        leitor.onerror = ()=> reject(new Error("Não foi possível ler o arquivo"));
        leitor.readAsDataURL(arquivo);
    });
}

function comprimirImagemParaBlob(arquivo){
    return new Promise((resolve, reject)=>{
        const leitor = new FileReader();
        leitor.onload = (e)=>{
            const img = new Image();
            img.onload = ()=>{
                const MAX = 1600; // sem o limite do Firestore, pode manter mais nítido
                let w = img.width, h = img.height;
                if(w > MAX || h > MAX){
                    if(w > h){ h = Math.round(h * MAX/w); w = MAX; }
                    else{ w = Math.round(w * MAX/h); h = MAX; }
                }
                const canvas = document.createElement("canvas");
                canvas.width = w;
                canvas.height = h;
                canvas.getContext("2d").drawImage(img, 0, 0, w, h);
                canvas.toBlob(blob=>{
                    if(blob) resolve(blob);
                    else reject(new Error("Não foi possível comprimir a imagem"));
                }, "image/jpeg", 0.75);
            };
            img.onerror = ()=> reject(new Error("Não foi possível ler a imagem"));
            img.src = e.target.result;
        };
        leitor.onerror = ()=> reject(new Error("Não foi possível ler o arquivo"));
        leitor.readAsDataURL(arquivo);
    });
}

async function enviarParaCloudinary(arquivoOuBlob, nomeArquivo){
    const formData = new FormData();
    formData.append("file", arquivoOuBlob, nomeArquivo);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    const resposta = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, {
        method: "POST",
        body: formData
    });

    if(!resposta.ok){
        throw new Error("Falha no envio para o Cloudinary");
    }
    const json = await resposta.json();
    return json.secure_url;
}

function lerArquivoParaBase64(arquivo){
    return new Promise((resolve, reject)=>{
        const leitor = new FileReader();
        leitor.onload = (e)=> resolve(e.target.result.split(",")[1]);
        leitor.onerror = ()=> reject(new Error("Não foi possível ler o arquivo"));
        leitor.readAsDataURL(arquivo);
    });
}

function tamanhoAnexosKB(anexos){
    return (anexos||[]).reduce((soma,a)=> soma + ((a.dados||"").length * 0.75 / 1024), 0);
}


// -------------------------------
// AUTENTICAÇÃO
// -------------------------------

function alternarModoLogin(modo){
    modoLogin = modo;
    renderizar();
}

async function enviarLogin(evento){
    evento.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const senha = document.getElementById("login-senha").value;
    const erroEl = document.getElementById("login-erro");
    erroEl.style.display = "none";

    try{
        if(modoLogin === "criar"){
            await auth.createUserWithEmailAndPassword(email, senha);
        }else{
            await auth.signInWithEmailAndPassword(email, senha);
        }
    }catch(e){
        erroEl.innerText = traduzErroAuth(e.code);
        erroEl.style.display = "block";
    }
}

function traduzErroAuth(codigo){
    const mapa = {
        "auth/invalid-email": "E-mail inválido.",
        "auth/user-not-found": "Não existe conta com esse e-mail.",
        "auth/wrong-password": "Senha incorreta.",
        "auth/invalid-credential": "E-mail ou senha incorretos.",
        "auth/email-already-in-use": "Já existe uma conta com esse e-mail.",
        "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres."
    };
    return mapa[codigo] || "Não foi possível entrar. Tente novamente.";
}

function fazerLogout(){
    if(!confirm("Sair da sua conta neste aparelho?")) return;
    auth.signOut();
}

auth.onAuthStateChanged(usuario=>{
    usuarioAtual = usuario;

    if(pararListenerDados){
        pararListenerDados();
        pararListenerDados = null;
    }

    if(usuario){
        iniciarListenerDados(usuario.uid);
    }else{
        dados = {
            propriedade: {}, receitas: [],
            despesasCusteio: [], despesasInvestimento: [], despesasDedutiveis: [],
            gastosPessoais: []
        };
        atualizarTela();
    }
});


// -------------------------------
// DADOS (FIRESTORE) — uma coleção por
// tipo de lançamento, um documento por lançamento
// -------------------------------

function colecaoUsuario(uid, nome){
    return db.collection("usuarios").doc(uid).collection(nome);
}

function docPropriedade(uid){
    return db.collection("usuarios").doc(uid).collection("propriedade").doc("info");
}

function iniciarListenerDados(uid){
    const paradas = [];

    COLECOES.forEach(nome=>{
        const parar = colecaoUsuario(uid, nome).onSnapshot(
            snap=>{
                dados[nome] = snap.docs.map(d=> ({id:d.id, ...d.data()}));
                salvarCopiaLocal();
                atualizarTela();
            },
            erro=>{
                console.log(`Erro ao sincronizar ${nome}:`, erro);
                carregarDadosLocal();
                atualizarTela();
            }
        );
        paradas.push(parar);
    });

    const pararProp = docPropriedade(uid).onSnapshot(
        doc=>{
            dados.propriedade = doc.exists ? doc.data() : {};
            atualizarTela();
        },
        erro=> console.log("Erro ao sincronizar propriedade:", erro)
    );
    paradas.push(pararProp);

    pararListenerDados = ()=> paradas.forEach(p=>p());
}

function salvarCopiaLocal(){
    try{
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
    }catch(e){
        console.log("Erro ao salvar cópia local:", e);
    }
}

function carregarDadosLocal(){
    const salvo = localStorage.getItem(STORAGE_KEY);
    if(salvo){
        try{
            const carregado = JSON.parse(salvo);
            if(carregado && Array.isArray(carregado.receitas)){
                dados = carregado;
            }
        }catch(e){
            console.log("Erro ao carregar cópia local");
        }
    }
}

function atualizarTela(){
    if(document.getElementById("app-root")){
        renderizar();
    }
}


// -------------------------------
// ANEXOS — guardados como base64 dentro do
// próprio documento do lançamento (sem Storage)
// -------------------------------

async function anexarArquivos(colecao, itemId, arquivos){
    if(!usuarioAtual || !arquivos || arquivos.length===0) return;

    const item = dados[colecao].find(i=>i.id===itemId);
    if(!item) return;

    const anexosAtuais = (item.anexos || []).slice();

    if(anexosAtuais.length + arquivos.length > 3){
        mostrarToast("Máximo de 3 arquivos por lançamento");
        return;
    }

    mostrarToast("Enviando arquivo(s)...");

    for(const arquivo of Array.from(arquivos)){
        const ehPdf = arquivo.type === "application/pdf";

        if(arquivo.size > LIMITE_ARQUIVO_BYTES){
            mostrarToast(`Arquivo muito grande (máx. ${Math.round(LIMITE_ARQUIVO_BYTES/1024/1024)}MB): ${arquivo.name}`);
            continue;
        }

        try{
            const paraEnviar = ehPdf ? arquivo : await comprimirImagemParaBlob(arquivo);
            const url = await enviarParaCloudinary(paraEnviar, arquivo.name);
            anexosAtuais.push({ nome: arquivo.name, tipo: ehPdf?"pdf":"imagem", url: url });
        }catch(e){
            console.log("Erro ao enviar anexo:", e);
            mostrarToast(`Erro ao enviar ${arquivo.name}`);
        }
    }

    try{
        await colecaoUsuario(usuarioAtual.uid, colecao).doc(itemId).update({anexos: anexosAtuais});
        mostrarToast("Comprovante(s) anexado(s)");
    }catch(e){
        console.log("Erro ao salvar anexos:", e);
        mostrarToast("Erro ao salvar — tente novamente");
    }

    renderizar();
}

async function removerAnexo(colecao, itemId, indiceAnexo){
    const item = dados[colecao].find(i=>i.id===itemId);
    if(!item || !item.anexos) return;

    const novosAnexos = item.anexos.slice();
    novosAnexos.splice(indiceAnexo, 1);

    try{
        await colecaoUsuario(usuarioAtual.uid, colecao).doc(itemId).update({anexos: novosAnexos});
    }catch(e){
        mostrarToast("Erro ao remover anexo");
        return;
    }

    renderizar();
    abrirModalAnexos(colecao, itemId);
}

let modalAnexosAtual = null;

function abrirModalAnexos(colecao, itemId){
    modalAnexosAtual = {colecao, itemId};
    renderizar();
}

function fecharModalAnexos(){
    modalAnexosAtual = null;
    renderizar();
}

function acionarInputAnexo(colecao, itemId){
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,application/pdf";
    input.multiple = true;
    input.onchange = (e)=> anexarArquivos(colecao, itemId, e.target.files);
    input.click();
}

function urlAnexo(anexo){
    const mime = anexo.tipo === "pdf" ? "application/pdf" : "image/jpeg";
    return `data:${mime};base64,${anexo.dados}`;
}

function abrirAnexo(colecao, itemId, indice){
    const item = dados[colecao].find(i=>i.id===itemId);
    const anexo = item && item.anexos && item.anexos[indice];
    if(!anexo) return;

    try{
        const link = document.createElement("a");
        link.href = urlAnexo(anexo);
        link.download = anexo.nome || (anexo.tipo==="pdf" ? "arquivo.pdf" : "arquivo.jpg");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }catch(e){
        console.log("Erro ao abrir anexo:", e);
        mostrarToast("Não foi possível abrir esse arquivo");
    }
}

function botaoAnexo(colecao, id, anexos){
    const qtd = (anexos||[]).length;
    const texto = qtd>0 ? `📎 ${qtd}` : "📎 Anexar";
    return `<button type="button" class="btn-anexo ${qtd>0?'tem-anexo':''}" onclick="event.stopPropagation(); abrirModalAnexos('${colecao}','${id}')">${texto}</button>`;
}


// -------------------------------
// CRUD — LANÇAMENTOS
// -------------------------------

let modalExclusaoAtual = null;

function excluirItem(colecao, id, evento){
    if(evento) evento.stopPropagation();

    const item = dados[colecao].find(i=>i.id===id);

    if(item && item.grupoParcelaId){
        modalExclusaoAtual = {colecao, id, grupoParcelaId:item.grupoParcelaId};
        renderizar();
        return;
    }

    if(!confirm("Excluir este lançamento?")) return;
    excluirDocumento(colecao, id);
}

function excluirDocumento(colecao, id){
    colecaoUsuario(usuarioAtual.uid, colecao).doc(id).delete()
    .then(()=> mostrarToast("Lançamento excluído"))
    .catch(()=> mostrarToast("Erro ao excluir — tente novamente"));
}

function excluirSoEsta(colecao, id){
    fecharModalExclusao();
    excluirDocumento(colecao, id);
}

async function excluirGrupoParcelas(colecao, grupoParcelaId){
    const itens = dados[colecao].filter(i=> i.grupoParcelaId===grupoParcelaId);
    fecharModalExclusao();

    try{
        await Promise.all(itens.map(i=>
            colecaoUsuario(usuarioAtual.uid, colecao).doc(i.id).delete()
        ));
        mostrarToast(`${itens.length} parcelas excluídas`);
    }catch(e){
        mostrarToast("Erro ao excluir as parcelas — tente novamente");
    }
}

function fecharModalExclusao(){
    modalExclusaoAtual = null;
    renderizar();
}

function renderModalExclusao(){
    if(!modalExclusaoAtual) return "";
    const {colecao, id, grupoParcelaId} = modalExclusaoAtual;
    const totalGrupo = dados[colecao].filter(i=> i.grupoParcelaId===grupoParcelaId).length;

    return `
    <div class="modal-fundo" onclick="if(event.target===this) fecharModalExclusao()">
        <div class="modal-caixa">
            <h3>Excluir parcela</h3>
            <p style="font-size:13.5px;color:var(--ink-soft);margin-bottom:18px;">
                Esse lançamento faz parte de uma compra dividida em ${totalGrupo}x — algumas parcelas podem estar em outro ano.
                O que você quer excluir?
            </p>
            <button type="button" class="primario" style="margin-bottom:10px;" onclick="excluirSoEsta('${colecao}','${id}')">Só esta parcela</button>
            <button type="button" class="secundario" style="width:100%;margin-bottom:10px;border-color:var(--brick);color:var(--brick);" onclick="excluirGrupoParcelas('${colecao}','${grupoParcelaId}')">Excluir as ${totalGrupo} parcelas</button>
            <button type="button" class="secundario" style="width:100%;" onclick="fecharModalExclusao()">Cancelar</button>
        </div>
    </div>
    `;
}

function adicionarReceita(evento){
    evento.preventDefault();
    const data = document.getElementById("rec-data").value;
    const tipo = document.getElementById("rec-tipo").value;
    const descricao = document.getElementById("rec-descricao").value.trim();
    const valorBruto = valorDoCampo("rec-valor");
    const funrural = valorDoCampo("rec-funrural");
    const litros = tipo==="Venda de Leite" ? valorDoCampo("rec-litros") : 0;
    const preco = tipo==="Venda de Leite" ? lerPrecoDecimal("rec-preco") : 0;
    const notaFiscal = document.getElementById("rec-nota").value.trim();
    const comprador = document.getElementById("rec-comprador").value.trim();
    const periodoInicio = document.getElementById("rec-periodo-ini").value;
    const periodoFim = document.getElementById("rec-periodo-fim").value;
    const incentivo = valorDoCampo("rec-incentivo");

    if(!data || valorBruto<=0){
        mostrarToast("Preencha a data e o valor");
        return;
    }

    colecaoUsuario(usuarioAtual.uid, "receitas").add({
        data, tipo, descricao, valorBruto, funrural, litros, preco,
        notaFiscal, comprador, periodoInicio, periodoFim, incentivo, anexos: []
    })
    .then(()=>{
        mostrarToast("Receita registrada");
        resetarFormulario(evento.target);
        selecionarTipoReceitaPadrao();
    })
    .catch(()=> mostrarToast("Erro ao salvar — tente novamente"));
}


function calcularFunrural(){
    const valorBruto = valorDoCampo("rec-valor");
    if(valorBruto <= 0){
        mostrarToast("Informe o valor bruto primeiro");
        return;
    }
    const funrural = Math.round(valorBruto * 0.015 * 100) / 100;
    const campo = document.getElementById("rec-funrural");
    campo.dataset.valorReal = funrural;
    campo.value = funrural.toLocaleString("pt-BR",{minimumFractionDigits:2, maximumFractionDigits:2});
    mostrarToast("FUNRURAL calculado: " + dinheiro(funrural));
}

function selecionarTipoReceitaPadrao(){
    const campoLitros = document.getElementById("rec-campo-litros");
    if(campoLitros) campoLitros.style.display = "block";
}

// Restaura formulário (campos + chips visuais + "mais detalhes" fechado)
// ao estado inicial depois de salvar.
function resetarFormulario(form){
    form.reset();
    form.querySelectorAll(".chip-grid").forEach(grade=>{
        const chips = grade.querySelectorAll(".chip");
        chips.forEach((chip,i)=>{
            chip.classList.toggle("selecionado", i===0);
        });
        const campoOculto = grade.parentElement.querySelector('input[type="hidden"]');
        if(campoOculto && chips[0]) campoOculto.value = chips[0].dataset.valor;
        const outrasSelect = grade.parentElement.querySelector(".campo-categoria-outras");
        if(outrasSelect) outrasSelect.style.display = "none";
    });
    form.querySelectorAll("details.mais-detalhes").forEach(det=>{ det.open = false; });
    form.querySelectorAll('input[oninput*="aplicarMascaraValor"], input[oninput*="aplicarMascaraInteiro"]').forEach(campo=>{
        delete campo.dataset.valorReal;
        campo.value = campo.id === "rec-funrural" ? "0,00" : "";
    });
    form.querySelectorAll("#rec-nota, #rec-comprador, #rec-periodo-ini, #rec-periodo-fim").forEach(campo=> campo.value = "");
    const aviso = form.querySelector("#rec-valor-auto-aviso");
    if(aviso) aviso.style.display = "none";
}

function adicionarDespesa(colecao, evento, prefixo){
    evento.preventDefault();
    const data = document.getElementById(prefixo+"-data").value;
    const categoria = document.getElementById(prefixo+"-categoria").value;
    const fornecedor = document.getElementById(prefixo+"-fornecedor").value.trim();
    const descricao = document.getElementById(prefixo+"-descricao").value.trim();
    const valorTotal = valorDoCampo(prefixo+"-valor");
    const parcelas = Math.max(1, Math.min(24, Number(document.getElementById(prefixo+"-parcelas").value || 1)));

    if(!data || valorTotal<=0){
        mostrarToast("Preencha a data e o valor");
        return;
    }

    const valorParcelaBase = Math.floor((valorTotal/parcelas) * 100) / 100;
    const somaParcelasIniciais = valorParcelaBase * (parcelas-1);
    const valorUltimaParcela = Math.round((valorTotal - somaParcelasIniciais) * 100) / 100;
    const dataBase = new Date(data+"T12:00:00");
    const grupoParcelaId = parcelas>1 ? gerarId() : null;
    let caiEmOutroAno = false;
    const anoInicial = dataBase.getFullYear();

    const gravacoes = [];
    for(let i=0; i<parcelas; i++){
        const dataParcela = new Date(dataBase);
        dataParcela.setMonth(dataParcela.getMonth()+i);
        const dataStr = dataParcela.toISOString().substring(0,10);
        if(dataParcela.getFullYear() !== anoInicial) caiEmOutroAno = true;
        const valorEssaParcela = (i===parcelas-1) ? valorUltimaParcela : valorParcelaBase;
        const descFinal = parcelas>1
            ? `${descricao}${descricao?' — ':''}parcela ${i+1}/${parcelas}`
            : descricao;

        const doc = { data: dataStr, categoria, fornecedor, descricao: descFinal, valor: valorEssaParcela, anexos: [] };
        if(grupoParcelaId) doc.grupoParcelaId = grupoParcelaId;

        gravacoes.push(colecaoUsuario(usuarioAtual.uid, colecao).add(doc));
    }

    Promise.all(gravacoes)
    .then(()=>{
        const aviso = caiEmOutroAno ? " (algumas parcelas caem no ano seguinte)" : "";
        mostrarToast(parcelas>1 ? `Despesa registrada em ${parcelas}x${aviso}` : "Despesa registrada");
        resetarFormulario(evento.target);
    })
    .catch(()=> mostrarToast("Erro ao salvar — tente novamente"));
}

function adicionarCasa(evento){
    evento.preventDefault();
    const data = document.getElementById("casa-data").value;
    const tipo = document.getElementById("casa-tipo").value;
    const dependente = document.getElementById("casa-dependente").value.trim();
    const fornecedor = document.getElementById("casa-fornecedor").value.trim();
    const descricao = document.getElementById("casa-descricao").value.trim();
    const valor = valorDoCampo("casa-valor");

    if(!data || valor<=0){
        mostrarToast("Preencha a data e o valor");
        return;
    }

    const info = infoTipoCasa(tipo);
    const doc = { data, tipo, fornecedor, descricao, valor, anexos: [] };
    if(info.dedutivel) doc.dependente = dependente;

    colecaoUsuario(usuarioAtual.uid, info.colecao).add(doc)
    .then(()=>{ mostrarToast("Gasto registrado"); resetarFormulario(evento.target); })
    .catch(()=> mostrarToast("Erro ao salvar — tente novamente"));
}

function salvarPropriedade(evento){
    evento.preventDefault();
    const prop = {
        nome: document.getElementById("prop-nome").value.trim(),
        area: document.getElementById("prop-area").value.trim(),
        municipio: document.getElementById("prop-municipio").value.trim(),
        uf: document.getElementById("prop-uf").value.trim(),
        nirf: document.getElementById("prop-nirf").value.trim(),
        itr: document.getElementById("prop-itr").value.trim()
    };

    docPropriedade(usuarioAtual.uid).set(prop)
    .then(()=> mostrarToast("Dados da propriedade salvos"))
    .catch(()=> mostrarToast("Erro ao salvar — tente novamente"));
}


// -------------------------------
// CÁLCULOS
// -------------------------------

function totaisDoAno(ano){
    const receitasAno = dados.receitas.filter(r=> anoDe(r.data)===ano);
    const custeioAno = dados.despesasCusteio.filter(d=> anoDe(d.data)===ano);
    const investimentoAno = dados.despesasInvestimento.filter(d=> anoDe(d.data)===ano);
    const dedutiveisAno = dados.despesasDedutiveis.filter(d=> anoDe(d.data)===ano);

    const totalReceitas = receitasAno.reduce((s,r)=> s + (r.valorBruto - (r.funrural||0)), 0);
    const totalCusteio = custeioAno.reduce((s,d)=> s + d.valor, 0);
    const totalInvestimento = investimentoAno.reduce((s,d)=> s + d.valor, 0);
    const totalDespesas = totalCusteio + totalInvestimento;
    const totalDedutiveis = dedutiveisAno.reduce((s,d)=> s + d.valor, 0);
    const litrosVendidos = receitasAno
        .filter(r=> r.tipo==="Venda de Leite")
        .reduce((s,r)=> s + (r.litros||0), 0);

    return {
        totalReceitas, totalCusteio, totalInvestimento, totalDespesas,
        totalDedutiveis, litrosVendidos,
        resultado: totalReceitas - totalDespesas
    };
}

function calcularHistorico(){
    const anos = anosDisponiveis().slice().sort((a,b)=> a-b);
    let prejuizoAcumulado = 0;
    const linhas = [];

    anos.forEach(ano=>{
        const t = totaisDoAno(ano);
        let resultadoTributavel = 0;
        let prejuizoUsado = 0;

        if(t.resultado >= 0){
            prejuizoUsado = Math.min(t.resultado, prejuizoAcumulado);
            resultadoTributavel = t.resultado - prejuizoUsado;
            prejuizoAcumulado -= prejuizoUsado;
        }else{
            prejuizoAcumulado += Math.abs(t.resultado);
        }

        linhas.push({
            ano, receitas: t.totalReceitas, despesas: t.totalDespesas,
            resultado: t.resultado, prejuizoUsado,
            resultadoTributavel, prejuizoAcumuladoFinal: prejuizoAcumulado
        });
    });

    return linhas.reverse();
}


// -------------------------------
// CHECKLIST ANTES DE DECLARAR
// Escaneia os lançamentos em busca de palavras que costumam
// indicar despesa não dedutível ou categoria errada.
// -------------------------------

const ALERTA_PALAVRAS_SAUDE = [
    "farmác","farmac","remédio","remedio","medicamento","droga","balcão","balcao","veterinár"
];

const ALERTA_PALAVRAS_EDUCACAO = [
    "idioma","inglês","ingles","espanhol","dança","danca","natação","natacao",
    "futebol","informática","informatica","material escolar","uniforme","livro",
    "notebook","computador","tablet","cursinho","vestibular","academia","aula de"
];

const ALERTA_PALAVRAS_BENFEITORIA = [
    "curral","estábulo","estabulo","reforma","construção","construcao",
    "benfeitoria","cerca nova","galpão","galpao"
];

function calcularAlertasDeclaracao(){
    const alertas = [];

    dados.despesasDedutiveis.forEach(d=>{
        const texto = ((d.descricao||"") + " " + (d.fornecedor||"")).toLowerCase();

        if(d.tipo==="Saúde" && ALERTA_PALAVRAS_SAUDE.some(p=> texto.includes(p))){
            alertas.push({
                data: d.data,
                texto: `Saúde — ${d.descricao || d.fornecedor || "sem descrição"}`,
                motivo: "Remédio de farmácia (avulso) e despesa veterinária geralmente não entram como dedutível — só remédio incluído em conta de hospital."
            });
        }

        if(d.tipo==="Educação" && ALERTA_PALAVRAS_EDUCACAO.some(p=> texto.includes(p))){
            alertas.push({
                data: d.data,
                texto: `Educação — ${d.descricao || d.fornecedor || "sem descrição"}`,
                motivo: "Curso livre, material escolar, uniforme e equipamento eletrônico não entram como despesa de instrução."
            });
        }
    });

    dados.despesasCusteio.forEach(d=>{
        const texto = ((d.descricao||"") + " " + (d.fornecedor||"")).toLowerCase();

        if(ALERTA_PALAVRAS_BENFEITORIA.some(p=> texto.includes(p))){
            alertas.push({
                data: d.data,
                texto: `Custeio — ${d.descricao || d.categoria}`,
                motivo: "Reforma/construção de imóvel próprio costuma entrar como Investimento (Benfeitoria), não Custeio."
            });
        }
    });

    return alertas.sort((a,b)=> b.data.localeCompare(a.data));
}


// -------------------------------
// NAVEGAÇÃO
// -------------------------------

function abrirTela(tela){
    telaAtual = tela;
    modalAnexosAtual = null;
    renderizar();
}

function abrirSubAbaFinanceiro(sub){
    subAbaFinanceiro = sub;
    renderizar();
}

function mudarAno(valor){
    anoSelecionado = Number(valor);
    renderizar();
}

function abrirPicker(){
    mostrarPicker = true;
    renderizar();
}

function fecharPicker(){
    mostrarPicker = false;
    renderizar();
}

function irParaPicker(tela, sub){
    mostrarPicker = false;
    telaAtual = tela;
    if(sub) subAbaFinanceiro = sub;
    renderizar();

    setTimeout(()=>{
        const alvo = document.querySelector(".campo-valor-grande input, #prod-produzidos");
        if(alvo) alvo.focus();
    }, 60);
}

function selecionarChip(botao, idCampo){
    const grade = botao.closest(".chip-grid");
    grade.querySelectorAll(".chip").forEach(b=> b.classList.remove("selecionado"));
    botao.classList.add("selecionado");
    document.getElementById(idCampo).value = botao.dataset.valor;

    const caixaOutras = grade.parentElement.querySelector(".campo-categoria-outras");
    if(caixaOutras){
        caixaOutras.style.display = botao.dataset.valor === "__outras__" ? "block" : "none";
    }
}

function selecionarCategoriaOutras(select, idCampo){
    document.getElementById(idCampo).value = select.value;
}

// Formata o campo de valor conforme a pessoa digita, tipo "27,00" ao
// digitar 2-7-0-0 — evita perder a noção do valor em números grandes.
function aplicarMascaraValor(input){
    let digitos = input.value.replace(/\D/g,"");
    digitos = digitos.replace(/^0+(?=\d)/,"");
    if(digitos === "") digitos = "0";
    const numero = parseInt(digitos,10) / 100;
    input.dataset.valorReal = numero;
    input.value = numero.toLocaleString("pt-BR",{minimumFractionDigits:2, maximumFractionDigits:2});
}

function valorDoCampo(id){
    const el = document.getElementById(id);
    if(!el) return 0;
    return Number(el.dataset.valorReal || 0);
}

// Máscara pra números inteiros (litros) — só separador de milhar,
// sem centavos: digitar 1100 mostra "1.100".
function aplicarMascaraInteiro(input){
    let digitos = input.value.replace(/\D/g,"");
    digitos = digitos.replace(/^0+(?=\d)/,"");
    const numero = digitos === "" ? 0 : parseInt(digitos,10);
    input.dataset.valorReal = numero;
    input.value = digitos === "" ? "" : numero.toLocaleString("pt-BR");
}

// Litros × preço por litro preenche o Valor recebido sozinho —
// mas o campo continua editável, pode ajustar se precisar.
// Preço por litro vem de digitação livre (não é a máscara de centavos),
// porque a nota da cooperativa mostra o preço com várias casas decimais
// (ex: 2,7852) — diferente do "Valor recebido", que é sempre em centavos.
function lerPrecoDecimal(id){
    const el = document.getElementById(id);
    if(!el || !el.value) return 0;
    const texto = el.value.replace(/\./g,"").replace(",",".").replace(/[^\d.]/g,"");
    return parseFloat(texto) || 0;
}

function formatarPreco(valor){
    return "R$ " + Number(valor||0).toLocaleString("pt-BR",{minimumFractionDigits:2, maximumFractionDigits:6});
}

function recalcularValorLeite(){
    const litros = valorDoCampo("rec-litros");
    const preco = lerPrecoDecimal("rec-preco");
    const aviso = document.getElementById("rec-valor-auto-aviso");

    if(litros>0 && preco>0){
        const valor = Math.round(litros * preco * 100) / 100;
        const campoValor = document.getElementById("rec-valor");
        campoValor.dataset.valorReal = valor;
        campoValor.value = valor.toLocaleString("pt-BR",{minimumFractionDigits:2, maximumFractionDigits:2});
        if(aviso) aviso.style.display = "block";
    }else if(aviso){
        aviso.style.display = "none";
    }
}

function selecionarTipoReceita(botao){
    selecionarChip(botao, "rec-tipo");
    const campoLitros = document.getElementById("rec-campo-litros");
    if(campoLitros){
        campoLitros.style.display = botao.dataset.valor === "Venda de Leite" ? "block" : "none";
    }
}


// -------------------------------
// RENDERIZAÇÃO — LOGIN
// -------------------------------

function renderLogin(){
    return `
    <div class="tela-login">
        <div class="cartao-login fade">
            <div class="login-marca">
                <div class="selo">R$</div>
                <div>
                    <h1>Livro Caixa Rural</h1>
                    <p>Controle da atividade leiteira</p>
                </div>
            </div>

            <div class="login-abas">
                <button class="${modoLogin==='entrar'?'ativo':''}" onclick="alternarModoLogin('entrar')">Entrar</button>
                <button class="${modoLogin==='criar'?'ativo':''}" onclick="alternarModoLogin('criar')">Criar conta</button>
            </div>

            <div class="login-erro" id="login-erro" style="display:none;"></div>

            <form onsubmit="enviarLogin(event)">
                <div>
                    <label>E-mail</label>
                    <input type="email" id="login-email" required autocomplete="username">
                </div>
                <div>
                    <label>Senha</label>
                    <input type="password" id="login-senha" required minlength="6" autocomplete="${modoLogin==='criar'?'new-password':'current-password'}">
                </div>
                <button type="submit" class="primario">
                    ${modoLogin==='criar' ? 'Criar conta' : 'Entrar'}
                </button>
            </form>
        </div>
    </div>
    `;
}


// -------------------------------
// RENDERIZAÇÃO — PAINEL
// -------------------------------

function renderPainel(){
    const t = totaisDoAno(anoSelecionado);

    return `
    <div class="pagina-header">
        <div>
            <h2>Painel</h2>
            <p>Resumo da atividade rural em ${anoSelecionado}</p>
        </div>
        ${seletorAno()}
    </div>

    <div class="grid-cartoes">
        <div class="cartao">
            <div class="rotulo">Total recebido</div>
            <div class="valor brand">${dinheiro(t.totalReceitas)}</div>
        </div>
        <div class="cartao">
            <div class="rotulo">Total gasto</div>
            <div class="valor brick">${dinheiro(t.totalDespesas)}</div>
        </div>
        <div class="cartao">
            <div class="rotulo">Litros vendidos</div>
            <div class="valor">${numero(t.litrosVendidos)} L</div>
        </div>
        <div class="cartao">
            <div class="rotulo">Despesas dedutíveis</div>
            <div class="valor gold">${dinheiro(t.totalDedutiveis)}</div>
        </div>
        <div class="cartao">
            <div class="rotulo">Lançamentos no ano</div>
            <div class="valor">${
                dados.receitas.filter(r=>anoDe(r.data)===anoSelecionado).length +
                dados.despesasCusteio.filter(d=>anoDe(d.data)===anoSelecionado).length +
                dados.despesasInvestimento.filter(d=>anoDe(d.data)===anoSelecionado).length
            }</div>
        </div>
    </div>

    <div class="painel-secao">
        <h3>Atalhos</h3>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="secundario" onclick="abrirTela('financeiro')">+ Lançamento financeiro</button>
            <button class="secundario" onclick="abrirTela('historico')">Ver histórico anual</button>
        </div>
    </div>
    `;
}

function seletorAno(){
    const anos = anosDisponiveis();
    return `
    <div class="filtro-ano">
        <span style="font-size:12px;color:var(--ink-faint);">Ano</span>
        <select onchange="mudarAno(this.value)">
            ${anos.map(a=>`<option value="${a}" ${a===anoSelecionado?'selected':''}>${a}</option>`).join("")}
        </select>
    </div>
    `;
}


// -------------------------------
// RENDERIZAÇÃO — PRODUÇÃO
// -------------------------------

function formatarData(dataStr){
    if(!dataStr) return "—";
    const [ano,mes,dia] = dataStr.split("-");
    return `${dia}/${mes}/${ano}`;
}


// -------------------------------
// RENDERIZAÇÃO — FINANCEIRO
// -------------------------------

function renderFinanceiro(){
    return `
    <div class="pagina-header">
        <div>
            <h2>Financeiro</h2>
            <p>Receitas e despesas da atividade rural</p>
        </div>
        ${seletorAno()}
    </div>

    <div class="segmentado">
        <button class="${subAbaFinanceiro==='receitas'?'ativo':''}" onclick="abrirSubAbaFinanceiro('receitas')">Receitas</button>
        <button class="${subAbaFinanceiro==='custeio'?'ativo':''}" onclick="abrirSubAbaFinanceiro('custeio')">Despesas de Custeio</button>
        <button class="${subAbaFinanceiro==='investimento'?'ativo':''}" onclick="abrirSubAbaFinanceiro('investimento')">Investimentos</button>
        <button class="${subAbaFinanceiro==='casa'?'ativo':''}" onclick="abrirSubAbaFinanceiro('casa')">Casa</button>
    </div>

    ${subAbaFinanceiro==='casa' ? `<p class="subtitulo-secao">🏠 Saúde e Educação entram na declaração; Mercado, Material de Construção, Lazer e Roupas ficam só de controle, não entram no imposto.</p>` : ""}

    ${
        subAbaFinanceiro==='receitas' ? renderListaReceitas() :
        subAbaFinanceiro==='custeio' ? renderListaDespesa('despesasCusteio', CATEGORIAS_CUSTEIO, 'custeio', 'Nova despesa de custeio') :
        subAbaFinanceiro==='investimento' ? renderListaDespesa('despesasInvestimento', CATEGORIAS_INVESTIMENTO, 'invest', 'Novo investimento') :
        renderListaCasa()
    }

    ${modalAnexosAtual ? renderModalAnexos() : ""}
    `;
}

function renderListaReceitas(){
    const lista = dados.receitas
        .filter(r=> anoDe(r.data)===anoSelecionado)
        .sort((a,b)=> b.data.localeCompare(a.data));

    return `
    <div class="painel-secao">
        <h3>Nova receita</h3>
        <form onsubmit="adicionarReceita(event)">
            <div>
                <label>Tipo</label>
                <div class="chip-grid">
                    ${TIPOS_RECEITA.map((t,i)=>`<button type="button" class="chip ${i===0?'selecionado':''}" data-valor="${t}" onclick="selecionarTipoReceita(this)">${t}</button>`).join("")}
                </div>
                <input type="hidden" id="rec-tipo" value="${TIPOS_RECEITA[0]}">
            </div>

            <div id="rec-campo-litros" class="form-grid">
                <div>
                    <label>Litros vendidos</label>
                    <input type="text" inputmode="numeric" id="rec-litros" placeholder="Ex: 270" oninput="aplicarMascaraInteiro(this); recalcularValorLeite();">
                </div>
                <div>
                    <label>Preço por litro (R$)</label>
                    <input type="text" inputmode="decimal" id="rec-preco" placeholder="Ex: 2,84 ou 2,7852" oninput="recalcularValorLeite();">
                </div>
            </div>

            <div class="campo-valor-grande">
                <label>Valor recebido</label>
                <div class="prefixo-rs">
                    <input type="text" inputmode="numeric" id="rec-valor" placeholder="0,00" oninput="aplicarMascaraValor(this)" required>
                </div>
                <p class="subtitulo-secao" id="rec-valor-auto-aviso" style="display:none;margin:6px 0 0;">Calculado automaticamente (litros × preço) — pode ajustar se precisar.</p>
            </div>

            <div>
                <label>Data</label>
                <input type="date" id="rec-data" value="${dataHoje()}" required>
            </div>

            <details class="mais-detalhes">
                <summary>Mais detalhes (opcional)</summary>
                <div class="form-grid">
                    <div>
                        <label>Funrural retido (R$)</label>
                        <div style="display:flex;gap:8px;">
                            <input type="text" inputmode="numeric" id="rec-funrural" placeholder="0,00" value="0,00" oninput="aplicarMascaraValor(this)" style="flex:1;">
                            <button type="button" class="secundario" onclick="calcularFunrural()" style="width:auto;padding:13px 14px;font-size:13px;white-space:nowrap;">Calcular 1,5%</button>
                        </div>
                    </div>
                    <div>
                        <label>Incentivo / Bonificação (R$)</label>
                        <input type="text" inputmode="numeric" id="rec-incentivo" placeholder="0,00" oninput="aplicarMascaraValor(this)">
                    </div>
                </div>
                <div class="form-grid">
                    <div>
                        <label>Nota Fiscal (nº)</label>
                        <input type="text" id="rec-nota" placeholder="Ex: 000107978">
                    </div>
                    <div>
                        <label>Comprador / Cooperativa</label>
                        <input type="text" id="rec-comprador" placeholder="Ex: COOPERSUCESSO">
                    </div>
                </div>
                <div class="form-grid">
                    <div>
                        <label>Período de referência (início)</label>
                        <input type="date" id="rec-periodo-ini">
                    </div>
                    <div>
                        <label>Período de referência (fim)</label>
                        <input type="date" id="rec-periodo-fim">
                    </div>
                </div>
                <div>
                    <label>Descrição</label>
                    <input type="text" id="rec-descricao" placeholder="Ex: venda de leite — outubro">
                </div>
            </details>

            <button type="submit" class="primario">Registrar receita</button>
        </form>
    </div>

    <div class="livro">
        ${lista.length===0 ? `
            <div class="empty">
                <strong>Nenhuma receita em ${anoSelecionado}</strong>
                Use o formulário acima para começar.
            </div>
        ` : lista.map(r=>`
            <div class="livro-linha" onclick="abrirModalAnexos('receitas','${r.id}')" style="cursor:pointer;">
                <div class="livro-data">${formatarData(r.data)}</div>
                <div class="livro-desc">
                    <strong>${escapeHtml(r.tipo)}${r.litros>0 ? ` · ${numero(r.litros)} L` : ""}${r.preco>0 ? ` · ${formatarPreco(r.preco)}/L` : ""}</strong>
                    <span>${escapeHtml(r.descricao || "—")}${r.notaFiscal ? ` · NF ${escapeHtml(r.notaFiscal)}`:""}${r.comprador ? ` · ${escapeHtml(r.comprador)}`:""}${r.periodoInicio ? ` · Ref: ${formatarData(r.periodoInicio)}${r.periodoFim?' a '+formatarData(r.periodoFim):''}`:""}${r.funrural>0 ? ` · Funrural ${dinheiro(r.funrural)}`:""}${r.incentivo>0 ? ` · Incentivo ${dinheiro(r.incentivo)}`:""}</span>
                </div>
                <div class="livro-valor entrada">${dinheiro(r.valorBruto - (r.funrural||0))}</div>
                <div class="livro-acoes">
                    ${botaoAnexo('receitas', r.id, r.anexos)}
                    <button class="excluir" onclick="excluirItem('receitas','${r.id}',event)">Excluir</button>
                </div>
            </div>
        `).join("")}
    </div>
    `;
}

function renderListaDespesa(colecao, categorias, prefixo, titulo){
    const lista = dados[colecao]
        .filter(d=> anoDe(d.data)===anoSelecionado)
        .sort((a,b)=> b.data.localeCompare(a.data));

    const usaComuns = colecao==='despesasCusteio';
    const chipsPrincipais = usaComuns ? CATEGORIAS_CUSTEIO_COMUNS : categorias;
    const primeiraCategoria = chipsPrincipais[0];

    return `
    <div class="painel-secao">
        <h3>${titulo}</h3>
        <form onsubmit="adicionarDespesa('${colecao}',event,'${prefixo}')">

            <div>
                <label>Categoria</label>
                <div class="chip-grid">
                    ${chipsPrincipais.map((c,i)=>`<button type="button" class="chip ${i===0?'selecionado':''}" data-valor="${c}" onclick="selecionarChip(this,'${prefixo}-categoria')">${c}</button>`).join("")}
                    ${usaComuns ? `<button type="button" class="chip chip-outras" data-valor="__outras__" onclick="selecionarChip(this,'${prefixo}-categoria')">Outras ▾</button>` : ""}
                </div>
                <input type="hidden" id="${prefixo}-categoria" value="${primeiraCategoria}">
                ${usaComuns ? `
                <select class="campo-categoria-outras" style="display:none;margin-top:8px;" onchange="selecionarCategoriaOutras(this,'${prefixo}-categoria')">
                    ${categorias.map(c=>`<option value="${c}">${c}</option>`).join("")}
                </select>` : ""}
            </div>

            <div class="campo-valor-grande">
                <label>Valor ${colecao==='despesasCusteio'?'':'total '}gasto</label>
                <div class="prefixo-rs">
                    <input type="text" inputmode="numeric" id="${prefixo}-valor" placeholder="0,00" oninput="aplicarMascaraValor(this)" required>
                </div>
            </div>

            <div>
                <label>Data</label>
                <input type="date" id="${prefixo}-data" value="${dataHoje()}" required>
            </div>

            <details class="mais-detalhes">
                <summary>Mais detalhes (opcional)</summary>
                <div class="form-grid">
                    <div>
                        <label>Fornecedor/Local</label>
                        <input type="text" id="${prefixo}-fornecedor" placeholder="Ex: Celeiro Mineiro, Cooperativa...">
                    </div>
                    <div>
                        <label>Nº de parcelas</label>
                        <input type="number" id="${prefixo}-parcelas" min="1" max="24" step="1" value="1">
                    </div>
                </div>
                <div>
                    <label>Descrição</label>
                    <input type="text" id="${prefixo}-descricao" placeholder="Detalhe do gasto">
                </div>
            </details>

            <button type="submit" class="primario">Registrar despesa</button>
        </form>
    </div>

    <div class="livro">
        ${lista.length===0 ? `
            <div class="empty">
                <strong>Nenhum lançamento em ${anoSelecionado}</strong>
                Use o formulário acima para começar.
            </div>
        ` : lista.map(d=>`
            <div class="livro-linha" onclick="abrirModalAnexos('${colecao}','${d.id}')" style="cursor:pointer;">
                <div class="livro-data">${formatarData(d.data)}</div>
                <div class="livro-desc">
                    <strong>${escapeHtml(d.categoria)}${d.fornecedor ? ` · ${escapeHtml(d.fornecedor)}` : ""}</strong>
                    <span>${escapeHtml(d.descricao || "—")}</span>
                </div>
                <div class="livro-valor saida">${dinheiro(d.valor)}</div>
                <div class="livro-acoes">
                    ${botaoAnexo(colecao, d.id, d.anexos)}
                    <button class="excluir" onclick="excluirItem('${colecao}','${d.id}',event)">Excluir</button>
                </div>
            </div>
        `).join("")}
    </div>
    `;
}

function renderListaCasa(){
    const dedutiveis = dados.despesasDedutiveis.map(d=> ({...d, _colecao:"despesasDedutiveis"}));
    const pessoais = dados.gastosPessoais.map(d=> ({...d, _colecao:"gastosPessoais"}));

    const lista = [...dedutiveis, ...pessoais]
        .filter(d=> anoDe(d.data)===anoSelecionado)
        .sort((a,b)=> b.data.localeCompare(a.data));

    return `
    <div class="painel-secao">
        <h3>Novo gasto de Casa</h3>
        <form onsubmit="adicionarCasa(event)">
            <div>
                <label>Tipo</label>
                <div class="chip-grid">
                    ${TIPOS_CASA.map((t,i)=>`<button type="button" class="chip ${i===0?'selecionado':''}" data-valor="${t.valor}" onclick="selecionarChip(this,'casa-tipo')">${t.valor}</button>`).join("")}
                </div>
                <input type="hidden" id="casa-tipo" value="${TIPOS_CASA[0].valor}">
            </div>

            <div class="campo-valor-grande">
                <label>Valor gasto</label>
                <div class="prefixo-rs">
                    <input type="text" inputmode="numeric" id="casa-valor" placeholder="0,00" oninput="aplicarMascaraValor(this)" required>
                </div>
            </div>

            <div>
                <label>Data</label>
                <input type="date" id="casa-data" value="${dataHoje()}" required>
            </div>

            <details class="mais-detalhes">
                <summary>Mais detalhes (opcional)</summary>
                <div class="form-grid">
                    <div>
                        <label>Dependente <span style="font-weight:400;color:var(--ink-faint);">(se for Saúde/Educação)</span></label>
                        <input type="text" id="casa-dependente" placeholder="Nome (ou 'Titular')">
                    </div>
                    <div>
                        <label>Local/Fornecedor</label>
                        <input type="text" id="casa-fornecedor" placeholder="Ex: Farmácia, Mercado, Escola...">
                    </div>
                </div>
                <div>
                    <label>Descrição</label>
                    <input type="text" id="casa-descricao" placeholder="Detalhe do gasto">
                </div>
            </details>
            <button type="submit" class="primario">Registrar gasto</button>
        </form>
    </div>

    <div class="livro">
        ${lista.length===0 ? `
            <div class="empty">
                <strong>Nenhum gasto de casa em ${anoSelecionado}</strong>
                Use o formulário acima para começar.
            </div>
        ` : lista.map(d=>{
            const dedutivel = d._colecao==="despesasDedutiveis";
            return `
            <div class="livro-linha" onclick="abrirModalAnexos('${d._colecao}','${d.id}')" style="cursor:pointer;">
                <div class="livro-data">${formatarData(d.data)}</div>
                <div class="livro-desc">
                    <strong>${escapeHtml(d.tipo)}${dedutivel ? ` — ${escapeHtml(d.dependente || "Titular")}` : ""}</strong>
                    <span>${escapeHtml(d.descricao || "—")}${d.fornecedor ? ` · ${escapeHtml(d.fornecedor)}` : ""}</span>
                </div>
                <div class="livro-valor saida">${dinheiro(d.valor)}</div>
                <div class="livro-acoes">
                    <span class="badge ${dedutivel?'brand':'gold'}" style="margin-right:2px;">${dedutivel?'Dedutível':'Pessoal'}</span>
                    ${botaoAnexo(d._colecao, d.id, d.anexos)}
                    <button class="excluir" onclick="excluirItem('${d._colecao}','${d.id}',event)">Excluir</button>
                </div>
            </div>
            `;
        }).join("")}
    </div>
    `;
}

// -------------------------------
// MODAL DE ANEXOS
// -------------------------------

function renderModalAnexos(){
    const {colecao, itemId} = modalAnexosAtual;
    const item = dados[colecao].find(i=>i.id===itemId);
    if(!item) return "";

    const anexos = item.anexos || [];

    return `
    <div class="modal-fundo" onclick="if(event.target===this) fecharModalAnexos()">
        <div class="modal-caixa">
            <h3>📎 Comprovantes</h3>

            ${anexos.length===0 ? `<p style="color:var(--ink-faint);font-size:1.05rem;margin-bottom:18px;font-weight:500;">Nenhum arquivo anexado ainda.</p>` : anexos.map((a,i)=>`
                <div class="anexo-item">
                    <span style="font-size:1.4rem;">${a.tipo==='pdf'?'📄':'🖼️'}</span>
                    ${a.url
                        ? `<a href="${a.url}" target="_blank" rel="noopener">${escapeHtml(a.nome)}</a>`
                        : `<a href="javascript:void(0)" onclick="abrirAnexo('${colecao}','${itemId}',${i})">${escapeHtml(a.nome)}</a>`
                    }
                    <button class="excluir" onclick="removerAnexo('${colecao}','${itemId}',${i})">🗑️ Remover</button>
                </div>
            `).join("")}

            <div style="display:flex; gap:12px; margin-top:20px; flex-wrap:wrap;">
                ${anexos.length < 3 ? `<button class="primario" onclick="acionarInputAnexo('${colecao}','${itemId}')">📷 Anexar foto ou PDF</button>` : ""}
                <button class="secundario" onclick="fecharModalAnexos()">❌ Fechar</button>
            </div>

            <p style="font-size:.95rem;color:var(--ink-faint);margin-top:16px;font-weight:500;">
                💡 Fotos são comprimidas automaticamente. Arquivos até ${Math.round(LIMITE_ARQUIVO_BYTES/1024/1024)}MB.
            </p>
        </div>
    </div>
    `;
}

// -------------------------------
// RENDERIZAÇÃO — HISTÓRICO
// -------------------------------

function renderHistorico(){
    const linhas = calcularHistorico();
    const alertas = calcularAlertasDeclaracao();

    return `
    <div class="pagina-header">
        <div>
            <h2>📊 Histórico Anual</h2>
            <p>Total de receitas e despesas, ano a ano</p>
        </div>
    </div>

    ${renderChecklistDeclaracao(alertas)}

    <div class="livro">
        <div class="historico-linha cabecalho">
            <div>Ano</div>
            <div>Receitas</div>
            <div>Despesas</div>
        </div>
        ${linhas.length===0 ? `
            <div class="empty"><strong>📭 Sem dados ainda</strong></div>
        ` : linhas.map(l=>`
            <div class="historico-linha">
                <div data-label="Ano"><strong>${l.ano}</strong></div>
                <div class="mono" data-label="Receitas">${dinheiro(l.receitas)}</div>
                <div class="mono" data-label="Despesas">${dinheiro(l.despesas)}</div>
            </div>
        `).join("")}
    </div>

    <div class="ajuda-visual" style="margin-top:20px;">
        O cálculo completo de resultado e prejuízo compensável sai pronto na planilha Excel (tela Mais → Exportar), na hora de declarar o imposto.
    </div>
    `;
}

function renderChecklistDeclaracao(alertas){
    if(alertas.length===0){
        return `
        <div class="painel-secao" style="border-left:5px solid var(--brand);">
            <h3>✅ Tudo certo para declarar</h3>
            <p style="font-size:1.05rem;color:var(--ink-soft);font-weight:500;line-height:1.6;">
                Não encontramos nenhum lançamento com cara de estar fora do lugar. Mesmo assim, revise tudo com seu contador antes de declarar.
            </p>
        </div>`;
    }

    return `
    <div class="painel-secao" style="border-left:5px solid var(--gold);">
        <h3>⚠️ Atenção antes de declarar</h3>
        <p style="font-size:1.05rem;color:var(--ink-soft);margin-bottom:18px;font-weight:500;line-height:1.6;">
            Encontramos ${alertas.length} lançamento${alertas.length>1?'s':''} que vale a pena conferir — pode não ser dedutível, ou estar na categoria errada.
        </p>
        ${alertas.map(a=>`
            <div style="padding:14px 0;border-top:2px solid var(--rule);">
                <strong style="font-size:1.1rem;">${formatarData(a.data)} — ${escapeHtml(a.texto)}</strong>
                <div style="font-size:1rem;color:var(--ink-faint);margin-top:4px;font-weight:500;line-height:1.5;">${escapeHtml(a.motivo)}</div>
            </div>
        `).join("")}
    </div>`;
}

// -------------------------------
// RENDERIZAÇÃO — MAIS
// -------------------------------

function renderMais(){
    return `
    <div class="pagina-header">
        <div><h2>⚙️ Mais Opções</h2></div>
    </div>

    <div class="painel-secao">
        <h3>🏡 Dados da Propriedade</h3>
        <form onsubmit="salvarPropriedade(event)">
            <div class="form-grid">
                <div>
                    <label>Nome da propriedade</label>
                    <input type="text" id="prop-nome" value="${escapeHtml(dados.propriedade.nome||'')}">
                </div>
                <div>
                    <label>Área (hectares)</label>
                    <input type="text" id="prop-area" value="${escapeHtml(dados.propriedade.area||'')}">
                </div>
                <div>
                    <label>Município</label>
                    <input type="text" id="prop-municipio" value="${escapeHtml(dados.propriedade.municipio||'')}">
                </div>
                <div>
                    <label>UF</label>
                    <input type="text" id="prop-uf" maxlength="2" value="${escapeHtml(dados.propriedade.uf||'')}">
                </div>
                <div>
                    <label>NIRF</label>
                    <input type="text" id="prop-nirf" value="${escapeHtml(dados.propriedade.nirf||'')}">
                </div>
                <div>
                    <label>Nº do ITR</label>
                    <input type="text" id="prop-itr" value="${escapeHtml(dados.propriedade.itr||'')}">
                </div>
            </div>
            <button type="submit" class="primario">✅ Salvar Dados</button>
        </form>
    </div>

    <div class="painel-secao">
        <h3>📊 Exportar para o Contador</h3>
        <p style="font-size:1rem;color:var(--ink-soft);margin-bottom:16px;font-weight:500;line-height:1.6;">
            Gera uma planilha Excel com abas separadas — pronta para levar ao contador.
        </p>
        <button class="secundario" onclick="exportarExcel()" style="font-size:1.1rem;padding:18px 24px;">📥 Exportar Excel (.xlsx)</button>
    </div>

    <div class="painel-secao">
        <h3>💾 Cópia de Segurança</h3>
        <p style="font-size:1rem;color:var(--ink-soft);margin-bottom:16px;font-weight:500;line-height:1.6;">
            Salve uma cópia dos seus lançamentos no celular (sem os arquivos anexados).
        </p>
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
            <button class="secundario" onclick="exportarBackup()" style="font-size:1.1rem;padding:18px 24px;">💾 Salvar backup</button>
            <button class="secundario" onclick="acionarInputBackup()" style="font-size:1.1rem;padding:18px 24px;">📂 Restaurar backup</button>
        </div>
    </div>

    <div class="painel-secao">
        <h3>👤 Sua Conta</h3>
        <p style="font-size:1rem;color:var(--ink-soft);margin-bottom:16px;font-weight:500;">
            Conectado como: <strong>${usuarioAtual ? escapeHtml(usuarioAtual.email) : ""}</strong>
        </p>
        <button class="secundario" onclick="fazerLogout()" style="font-size:1.1rem;padding:18px 24px;border-color:var(--brick);color:var(--brick);">🚪 Sair da Conta</button>
    </div>
    `;
}

// -------------------------------
// EXPORTAÇÃO — EXCEL
// -------------------------------

function estiloCabecalhoXlsx(){
    return {
        font:{ bold:true, color:{ rgb:"FFFFFF" }, sz:13 },
        fill:{ patternType:"solid", fgColor:{ rgb:"0B6E4F" } },
        alignment:{ horizontal:"center", vertical:"center" }
    };
}

function celTextoXlsx(valor){
    return { v:String(valor), t:"s", s:estiloCabecalhoXlsx() };
}

function celMoedaXlsx(valor){
    return { v:Number(valor||0), t:"n", z:'"R$" #,##0.00' };
}

function celPrecoXlsx(valor){
    return { v:Number(valor||0), t:"n", z:'"R$" #,##0.0000' };
}

function exportarExcel(){
    if(typeof XLSX === "undefined"){
        mostrarToast("📡 Sem internet para gerar o Excel");
        return;
    }

    const wb = XLSX.utils.book_new();

    const cabRec = ["Data","Tipo","Litros","Preço/Litro","Descrição","Valor Bruto","Incentivo","Funrural","Valor Líquido","Nota Fiscal","Comprador","Período Início","Período Fim"].map(celTextoXlsx);
    const linRec = dados.receitas.sort((a,b)=>a.data.localeCompare(b.data)).map(r=>[
        r.data, r.tipo, r.litros||"", r.preco?celPrecoXlsx(r.preco):"", r.descricao||"", celMoedaXlsx(r.valorBruto), celMoedaXlsx(r.incentivo), celMoedaXlsx(r.funrural), celMoedaXlsx(r.valorBruto-(r.funrural||0)), r.notaFiscal||"", r.comprador||"", r.periodoInicio||"", r.periodoFim||""
    ]);
    const wsRec = XLSX.utils.aoa_to_sheet([cabRec, ...linRec]);
    wsRec["!cols"] = [{wch:12},{wch:20},{wch:10},{wch:12},{wch:28},{wch:14},{wch:12},{wch:12},{wch:14},{wch:14},{wch:22},{wch:12},{wch:12}];
    XLSX.utils.book_append_sheet(wb, wsRec, "Receitas");

    const cabCus = ["Data","Categoria","Fornecedor","Descrição","Valor"].map(celTextoXlsx);
    const linCus = dados.despesasCusteio.sort((a,b)=>a.data.localeCompare(b.data)).map(d=>[
        d.data, d.categoria, d.fornecedor||"", d.descricao||"", celMoedaXlsx(d.valor)
    ]);
    const wsCus = XLSX.utils.aoa_to_sheet([cabCus, ...linCus]);
    wsCus["!cols"] = [{wch:12},{wch:22},{wch:20},{wch:26},{wch:14}];
    XLSX.utils.book_append_sheet(wb, wsCus, "Despesas Custeio");

    const cabInv = ["Data","Categoria","Fornecedor","Descrição","Valor"].map(celTextoXlsx);
    const linInv = dados.despesasInvestimento.sort((a,b)=>a.data.localeCompare(b.data)).map(d=>[
        d.data, d.categoria, d.fornecedor||"", d.descricao||"", celMoedaXlsx(d.valor)
    ]);
    const wsInv = XLSX.utils.aoa_to_sheet([cabInv, ...linInv]);
    wsInv["!cols"] = [{wch:12},{wch:22},{wch:20},{wch:26},{wch:14}];
    XLSX.utils.book_append_sheet(wb, wsInv, "Investimentos");

    const cabDed = ["Data","Tipo","Dependente","Local/Fornecedor","Descrição","Valor"].map(celTextoXlsx);
    const linDed = dados.despesasDedutiveis.sort((a,b)=>a.data.localeCompare(b.data)).map(d=>[
        d.data, d.tipo, d.dependente||"", d.fornecedor||"", d.descricao||"", celMoedaXlsx(d.valor)
    ]);
    const wsDed = XLSX.utils.aoa_to_sheet([cabDed, ...linDed]);
    wsDed["!cols"] = [{wch:12},{wch:12},{wch:18},{wch:20},{wch:26},{wch:14}];
    XLSX.utils.book_append_sheet(wb, wsDed, "Dedutíveis");

    const cabPes = ["Data","Categoria","Fornecedor","Descrição","Valor"].map(celTextoXlsx);
    const linPes = dados.gastosPessoais.sort((a,b)=>a.data.localeCompare(b.data)).map(d=>[
        d.data, d.categoria, d.fornecedor||"", d.descricao||"", celMoedaXlsx(d.valor)
    ]);
    const wsPes = XLSX.utils.aoa_to_sheet([cabPes, ...linPes]);
    wsPes["!cols"] = [{wch:12},{wch:22},{wch:20},{wch:26},{wch:14}];
    XLSX.utils.book_append_sheet(wb, wsPes, "Pessoal (não dedutível)");

    const cabHist = ["Ano","Receitas","Despesas","Resultado","Prejuízo Usado","Resultado Tributável","Prejuízo Acumulado"].map(celTextoXlsx);
    const linHist = calcularHistorico().slice().reverse().map(l=>[
        l.ano, celMoedaXlsx(l.receitas), celMoedaXlsx(l.despesas), celMoedaXlsx(l.resultado),
        celMoedaXlsx(l.prejuizoUsado), celMoedaXlsx(l.resultadoTributavel), celMoedaXlsx(l.prejuizoAcumuladoFinal)
    ]);
    const wsHist = XLSX.utils.aoa_to_sheet([cabHist, ...linHist]);
    wsHist["!cols"] = [{wch:8},{wch:14},{wch:14},{wch:14},{wch:14},{wch:16},{wch:16}];
    XLSX.utils.book_append_sheet(wb, wsHist, "Histórico Anual");

    XLSX.writeFile(wb, "livro-caixa-rural.xlsx");
    mostrarToast("✅ Excel exportado com sucesso!");
}

// -------------------------------
// BACKUP JSON
// -------------------------------

function exportarBackup(){
    const paraExportar = {
        propriedade: dados.propriedade,
        receitas: dados.receitas.map(r=>({...r, anexos: (r.anexos||[]).map(a=>({nome:a.nome,tipo:a.tipo}))})),
        despesasCusteio: dados.despesasCusteio.map(r=>({...r, anexos: (r.anexos||[]).map(a=>({nome:a.nome,tipo:a.tipo}))})),
        despesasInvestimento: dados.despesasInvestimento.map(r=>({...r, anexos: (r.anexos||[]).map(a=>({nome:a.nome,tipo:a.tipo}))})),
        despesasDedutiveis: dados.despesasDedutiveis.map(r=>({...r, anexos: (r.anexos||[]).map(a=>({nome:a.nome,tipo:a.tipo}))})),
        gastosPessoais: dados.gastosPessoais.map(r=>({...r, anexos: (r.anexos||[]).map(a=>({nome:a.nome,tipo:a.tipo}))}))
    };

    const conteudo = JSON.stringify(paraExportar, null, 2);
    const blob = new Blob([conteudo], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "backup-livro-caixa-rural.json";
    a.click();
    URL.revokeObjectURL(url);
    mostrarToast("✅ Backup salvo (sem os arquivos anexados)");
}

function acionarInputBackup(){
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = (e)=> importarBackup(e.target.files[0]);
    input.click();
}

async function importarBackup(arquivo){
    if(!arquivo) return;

    const leitor = new FileReader();
    leitor.onload = async (e)=>{
        try{
            const novosDados = JSON.parse(e.target.result);

            if(!novosDados || typeof novosDados!=="object" || !Array.isArray(novosDados.receitas)){
                mostrarToast("❌ Arquivo inválido: formato incorreto");
                return;
            }

            if(!confirm("⚠️ Isso vai substituir os dados atuais na nuvem pelos do backup. Continuar?")) return;

            mostrarToast("⏳ Restaurando...");

            await docPropriedade(usuarioAtual.uid).set(novosDados.propriedade || {});

            for(const nome of COLECOES){
                const ref = colecaoUsuario(usuarioAtual.uid, nome);
                const existentes = await ref.get();
                const batch = db.batch();
                existentes.docs.forEach(d=> batch.delete(d.ref));
                (novosDados[nome]||[]).forEach(item=>{
                    const {id, ...resto} = item;
                    batch.set(ref.doc(), resto);
                });
                await batch.commit();
            }

            mostrarToast("✅ Backup restaurado com sucesso!");

        }catch(err){
            console.log("Erro ao restaurar backup:", err);
            mostrarToast("❌ Arquivo inválido ou erro ao restaurar");
        }
    };
    leitor.readAsText(arquivo);
}

// -------------------------------
// RENDERIZAÇÃO GERAL / NAVEGAÇÃO
// -------------------------------

const ITENS_NAV = [
    {id:"painel", label:"Início", icone:"🏠"},
    {id:"financeiro", label:"Lançar", icone:"💰"},
    {id:"historico", label:"Histórico", icone:"📊"},
    {id:"mais", label:"Mais", icone:"⚙️"}
];

function renderNavLateral(){
    return `
    <div class="barra-lateral">
        <div class="marca-lateral">
            <div class="selo">🐄</div>
            <div>
                <strong>Livro Caixa</strong>
                <span>Fazenda de Leite</span>
            </div>
        </div>
        ${ITENS_NAV.map(item=>`
            <button class="nav-item ${telaAtual===item.id?'ativo':''}" onclick="abrirTela('${item.id}')">
                <span class="icone">${item.icone}</span> ${item.label}
            </button>
        `).join("")}
    </div>
    `;
}

function renderTabbar(){
    return `
    <div class="tabbar">
        ${ITENS_NAV.map(item=>`
            <button class="${telaAtual===item.id?'ativo':''}" onclick="abrirTela('${item.id}')">
                <span class="icone">${item.icone}</span>
                ${item.label}
            </button>
        `).join("")}
    </div>
    `;
}

function conteudoTela(){
    switch(telaAtual){
        case "painel": return renderPainel();
        case "financeiro": return renderFinanceiro();
        case "historico": return renderHistorico();
        case "mais": return renderMais();
        default: return renderPainel();
    }
}

const OPCOES_PICKER = [
    { emoji:"🥛", titulo:"Venda de Leite", desc:"Valor recebido e litros vendidos do mês", tela:"financeiro", sub:"receitas", cor:"#0B6E4F" },
    { emoji:"💰", titulo:"Outra Venda", desc:"Venda de animal, bonificação...", tela:"financeiro", sub:"receitas", cor:"#C89B3C" },
    { emoji:"🧾", titulo:"Gasto do Dia a Dia", desc:"Ração, veterinário, combustível...", tela:"financeiro", sub:"custeio", cor:"#A6483C" },
    { emoji:"🔧", titulo:"Compra Grande", desc:"Máquina, animal, benfeitoria", tela:"financeiro", sub:"investimento", cor:"#56635C" },
    { emoji:"🏠", titulo:"Casa", desc:"Saúde, educação, mercado, construção", tela:"financeiro", sub:"casa", cor:"#8B6F47" }
];

function renderPickerGuiado(){
    return `
    <div class="picker-fundo" onclick="if(event.target===this) fecharPicker()">
        <div class="picker-folha fade">
            <h3>➕ O que você quer lançar?</h3>
            <div class="sub">Toque em uma opção abaixo</div>

            ${OPCOES_PICKER.map(op=>`
                <button type="button" class="picker-opcao" onclick="irParaPicker('${op.tela}'${op.sub?`,'${op.sub}'`:''})" style="border-left:6px solid ${op.cor};">
                    <span class="emoji">${op.emoji}</span>
                    <span>
                        <strong>${op.titulo}</strong>
                        <span>${op.desc}</span>
                    </span>
                </button>
            `).join("")}

            <button type="button" class="picker-fechar" onclick="fecharPicker()">❌ Cancelar</button>
        </div>
    </div>
    `;
}

function renderizar(){
    const raiz = document.getElementById("app-root");
    if(!raiz) return;

    if(!usuarioAtual){
        raiz.innerHTML = renderLogin();
        return;
    }

    raiz.innerHTML = `
        <div class="app-shell">
            ${renderNavLateral()}
            <div class="conteudo fade">
                ${conteudoTela()}
            </div>
        </div>
        <button type="button" class="fab" onclick="abrirPicker()" aria-label="Novo lançamento">➕</button>
        ${renderTabbar()}
        ${mostrarPicker ? renderPickerGuiado() : ""}
        ${modalExclusaoAtual ? renderModalExclusao() : ""}
    `;
}

// -------------------------------
// INICIALIZAÇÃO
// -------------------------------

document.addEventListener("DOMContentLoaded", ()=>{
    atualizarTela();
});
