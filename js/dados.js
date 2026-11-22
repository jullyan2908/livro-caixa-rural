// ======================================
// Livro Caixa Rural — dados
// Firebase, sincronização com a nuvem, categorias e todos os cálculos.
// Cada lançamento é um documento próprio no Firestore.
// ======================================

// -------------------------------
// FIREBASE
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
    .catch(err=> console.log("Persistência offline indisponível:", err && err.code));
}catch(e){
    console.log("Erro ao ativar persistência offline:", e);
}

// -------------------------------
// CATEGORIAS
// -------------------------------

const COLECOES_LANCAMENTO = ["receitas","despesasCusteio","despesasInvestimento","despesasDedutiveis","gastosPessoais"];
const COLECOES = [...COLECOES_LANCAMENTO, "rebanho", "dividas"];

const CATEGORIAS_CUSTEIO = [
    "Ração/Concentrado","Sal Mineral","Silagem/Feno","Veterinário",
    "Vacinas/Medicamentos","Inseminação Artificial","Material de Ordenha",
    "Produtos de Limpeza","Energia Elétrica","Combustível","Manutenção",
    "Frete do Leite","Análise de Qualidade","Insumos de Pastagem/Lavoura","ITR",
    "Cooperativa/Associação","Seguro Rural","Arrendamento",
    "Serviços de Terceiros (diarista, trator, etc.)","Salários e encargos (empregados)",
    "Juros de financiamento rural","Outras"
];

// As mais usadas no dia a dia — aparecem como botões grandes
const CATEGORIAS_CUSTEIO_COMUNS = [
    "Ração/Concentrado","Veterinário","Vacinas/Medicamentos","Inseminação Artificial",
    "Combustível","Energia Elétrica","Sal Mineral","Manutenção",
    "Serviços de Terceiros (diarista, trator, etc.)"
];

const CATEGORIAS_INVESTIMENTO = ["Animais","Maquinário","Benfeitorias","Outras"];

const TIPOS_RECEITA = ["Venda de Leite","Bonificação por Qualidade","Venda de Animais","Outras Receitas"];

// "Casa" junta duas coisas na TELA, mas guarda separado:
// Saúde/Educação entram na declaração (despesasDedutiveis);
// os demais ficam só de controle (gastosPessoais).
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
    return TIPOS_CASA.find(t=> t.valor === valor) || TIPOS_CASA[TIPOS_CASA.length-1];
}

const ESPECIES = ["Bovinos","Bubalinos","Equinos","Asininos e muares","Suínos","Ovinos","Caprinos","Aves","Outros"];

const TIPOS_MOV_REBANHO = [
    { valor:"nascimento", rotulo:"Nascimento", sinal:1 },
    { valor:"compra", rotulo:"Compra", sinal:1 },
    { valor:"venda", rotulo:"Venda", sinal:-1 },
    { valor:"morte", rotulo:"Morte ou perda", sinal:-1 },
    { valor:"consumo", rotulo:"Consumo da casa", sinal:-1 }
];
function infoMovRebanho(valor){
    return TIPOS_MOV_REBANHO.find(t=> t.valor === valor) || TIPOS_MOV_REBANHO[0];
}

// Funrural do produtor pessoa física (retido pelo comprador):
// 1,5% até 31/03/2026; 1,63% a partir de 01/04/2026 (LC 224/2025).
// Quando a nota informa a alíquota, vale a da nota.
function aliquotaFunruralPadrao(dataStr){
    return String(dataStr||"") >= "2026-04-01" ? 1.63 : 1.5;
}

// -------------------------------
// ESTADO
// -------------------------------

const STORAGE_PREFIXO = "livro_caixa_rural_dados";

let usuarioAtual = null;
let pararListenerDados = null;
let dadosCarregados = false;
let pendentesPorColecao = {};
let erroSincronizacao = null;

function dadosVazios(){
    return {
        propriedade: {},
        receitas: [], despesasCusteio: [], despesasInvestimento: [],
        despesasDedutiveis: [], gastosPessoais: [],
        rebanho: [], dividas: []
    };
}
let dados = dadosVazios();

function colecaoUsuario(uid, nome){
    return db.collection("usuarios").doc(uid).collection(nome);
}
function docPropriedade(uid){
    return db.collection("usuarios").doc(uid).collection("propriedade").doc("info");
}
function refDoc(colecao, id){
    return colecaoUsuario(usuarioAtual.uid, colecao).doc(id);
}
function itemPorId(colecao, id){
    return (dados[colecao] || []).find(i=> i.id === id) || null;
}

// -------------------------------
// LOGIN E SINCRONIZAÇÃO
// -------------------------------

function iniciarAutenticacao(aoMudar){
    auth.onAuthStateChanged(usuario=>{
        usuarioAtual = usuario;

        if(pararListenerDados){
            pararListenerDados();
            pararListenerDados = null;
        }
        dados = dadosVazios();
        pendentesPorColecao = {};
        dadosCarregados = false;
        erroSincronizacao = null;

        if(usuario){
            carregarDadosLocal(usuario.uid);
            iniciarListenerDados(usuario.uid);
        }
        aoMudar();
    });
}

function iniciarListenerDados(uid){
    const paradas = [];
    const recebidas = new Set();

    COLECOES.forEach(nome=>{
        const parar = colecaoUsuario(uid, nome).onSnapshot(
            {includeMetadataChanges:true},
            snap=>{
                dados[nome] = snap.docs.map(d=>{
                    const item = Object.assign({}, d.data(), {id: d.id});
                    if(d.metadata && d.metadata.hasPendingWrites) item._pendente = true;
                    return item;
                });
                pendentesPorColecao[nome] = dados[nome].filter(i=> i._pendente).length;
                recebidas.add(nome);
                if(recebidas.size === COLECOES.length) dadosCarregados = true;
                erroSincronizacao = null;
                salvarCopiaLocalDepois(uid);
                agendarRender();
            },
            erro=>{
                console.log(`Erro ao sincronizar ${nome}:`, erro);
                erroSincronizacao = (erro && erro.code) || "erro";
                recebidas.add(nome);
                agendarRender();
            }
        );
        paradas.push(parar);
    });

    const pararProp = docPropriedade(uid).onSnapshot(
        doc=>{
            dados.propriedade = doc.exists ? (doc.data() || {}) : {};
            agendarRender();
        },
        erro=> console.log("Erro ao sincronizar propriedade:", erro)
    );
    paradas.push(pararProp);

    pararListenerDados = ()=> paradas.forEach(p=>{ try{ p(); }catch(e){} });
}

// Cópia local (só para abrir rápido; a fonte de verdade é a nuvem)
function chaveLocal(uid){ return STORAGE_PREFIXO + "_" + uid; }

let timerCopiaLocal = null;
function salvarCopiaLocalDepois(uid){
    clearTimeout(timerCopiaLocal);
    timerCopiaLocal = setTimeout(()=> salvarCopiaLocal(uid), 1500);
}
function salvarCopiaLocal(uid){
    if(!usuarioAtual || usuarioAtual.uid !== uid) return;
    try{
        const enxuto = {};
        for(const k of Object.keys(dados)){
            enxuto[k] = Array.isArray(dados[k]) ? dados[k].map(itemParaCopiaLocal) : dados[k];
        }
        localStorage.setItem(chaveLocal(uid), JSON.stringify(enxuto));
    }catch(e){
        console.log("Erro ao salvar cópia local:", e);
    }
}
function itemParaCopiaLocal(item){
    const copia = Object.assign({}, item);
    delete copia._pendente;
    if(copia.anexos && copia.anexos.some(a=> a.dados)){
        copia.anexos = copia.anexos.map(a=> a.dados ? {nome:a.nome, tipo:a.tipo, pesado:true} : a);
    }
    return copia;
}
function carregarDadosLocal(uid){
    try{
        const salvo = localStorage.getItem(chaveLocal(uid));
        if(!salvo) return;
        const c = JSON.parse(salvo);
        if(c && Array.isArray(c.receitas)) dados = Object.assign(dadosVazios(), c);
    }catch(e){
        console.log("Erro ao carregar cópia local");
    }
}
function limparDadosLocais(){
    try{
        Object.keys(localStorage)
            .filter(k=> k.startsWith(STORAGE_PREFIXO))
            .forEach(k=> localStorage.removeItem(k));
    }catch(e){}
}

// -------------------------------
// GRAVAÇÃO
// Não espera o servidor responder: sem sinal, o Firestore guarda
// no aparelho e envia sozinho depois. Assim o aviso aparece na hora
// e o formulário limpa (antes, sem sinal, nada acontecia na tela).
// -------------------------------

function limparParaSalvar(item){
    const o = {};
    for(const [k, v] of Object.entries(item || {})){
        if(k === "id" || k.startsWith("_") || v === undefined) continue;
        if(typeof v === "number" && !isFinite(v)) continue;
        o[k] = v;
    }
    return o;
}

function erroGravacao(e){
    console.log("Erro ao gravar:", e);
    mostrarToast(e && e.code === "permission-denied"
        ? "Sem permissão para salvar. Saia e entre de novo na conta."
        : "Erro ao salvar — tente novamente");
}

function gravarNovo(colecao, obj){
    const ref = colecaoUsuario(usuarioAtual.uid, colecao).doc();
    ref.set(limparParaSalvar(obj)).catch(erroGravacao);
    return ref.id;
}
function gravarDoc(colecao, id, obj){
    return refDoc(colecao, id).set(limparParaSalvar(obj)).catch(erroGravacao);
}
function atualizarDoc(colecao, id, campos){
    return refDoc(colecao, id).update(campos).catch(erroGravacao);
}
function apagarDoc(colecao, id){
    return refDoc(colecao, id).delete().catch(erroGravacao);
}
function salvarNaPropriedade(campos){
    return docPropriedade(usuarioAtual.uid).set(campos, {merge:true}).catch(erroGravacao);
}

function estaOffline(){ return typeof navigator !== "undefined" && navigator.onLine === false; }
function textoSalvo(base){
    return estaOffline() ? base + " — vai para a nuvem quando voltar o sinal" : base;
}
function totalPendentes(){
    return Object.values(pendentesPorColecao).reduce((s, n)=> s + (n || 0), 0);
}

// -------------------------------
// RECEITAS — valores
// valorBruto = total da nota (já com incentivo) — é a receita para o IR
// funrural = retido pelo comprador; valorLiquido = o que caiu na conta
// -------------------------------

function receitaBruta(r){ return Number(r.valorBruto || 0); }
function funruralDe(r){ return Number(r.funrural || 0); }
function liquidoDe(r){
    return r.valorLiquido != null ? Number(r.valorLiquido) : arred(receitaBruta(r) - funruralDe(r));
}
function descontaFunrural(){
    return dados.propriedade.descontarFunrural !== false;
}

// Mês do leite entregue (período da nota), para litros e custo por litro.
// O dinheiro entra no livro-caixa na data do pagamento (r.data).
function mesReferenciaLeite(r){
    if(r.periodoInicio) return mesDe(r.periodoInicio);
    if(r.dataNota) return mesDe(r.dataNota);
    return mesDe(r.data);
}
// Essa receita de leite cobre o leite entregue no mês informado?
function cobreMes(r, mes){
    if(r.periodoInicio){
        const ini = mesDe(r.periodoInicio), fim = mesDe(r.periodoFim || r.periodoInicio);
        return ini <= mes && mes <= fim;
    }
    if(r.dataNota) return mesDe(r.dataNota) === mes;
    const m = mesDe(r.data);
    return m === mes || m === mesSeguinte(mes);
}

// Receitas lançadas antes desta versão, com incentivo digitado à parte:
// não dá para saber se o "valor bruto" já incluía o incentivo.
function receitasParaRevisar(){
    return dados.receitas.filter(r=> !r.versao && Number(r.incentivo) > 0);
}

// -------------------------------
// TOTAIS
// -------------------------------

function anosDisponiveis(){
    const anos = new Set([new Date().getFullYear()]);
    COLECOES_LANCAMENTO.forEach(c=> dados[c].forEach(i=>{ const a = anoDe(i.data); if(a) anos.add(a); }));
    dados.rebanho.forEach(e=>{ const a = anoDe(e.data); if(a) anos.add(a); });
    return Array.from(anos).sort((a, b)=> b - a);
}

function totaisDoAno(ano){
    const doAno = lista=> lista.filter(i=> anoDe(i.data) === ano);
    const rec = doAno(dados.receitas);

    const receitaBrutaTotal = soma(rec, receitaBruta);
    const funrural = soma(rec, funruralDe);
    const custeio = soma(doAno(dados.despesasCusteio), d=> d.valor);
    const investimento = soma(doAno(dados.despesasInvestimento), d=> d.valor);
    const dedutiveis = soma(doAno(dados.despesasDedutiveis), d=> d.valor);
    const pessoais = soma(doAno(dados.gastosPessoais), d=> d.valor);
    const litros = soma(
        dados.receitas.filter(r=> r.tipo === "Venda de Leite" && anoDe(mesReferenciaLeite(r)) === ano),
        r=> r.litros
    );
    const despesas = arred(custeio + investimento);
    const deducaoFunrural = descontaFunrural() ? funrural : 0;

    return {
        receitaBruta: receitaBrutaTotal,
        funrural,
        liquido: arred(receitaBrutaTotal - funrural),
        custeio, investimento, despesas,
        dedutiveis, pessoais, litros,
        deducaoFunrural,
        resultado: arred(receitaBrutaTotal - despesas - deducaoFunrural),
        lancamentos: rec.length + doAno(dados.despesasCusteio).length + doAno(dados.despesasInvestimento).length
    };
}

// mes = "AAAA-MM"
function totaisDoMes(mes){
    const doMes = lista=> lista.filter(i=> mesDe(i.data) === mes);
    const rec = doMes(dados.receitas);

    const bruto = soma(rec, receitaBruta);
    const funrural = soma(rec, funruralDe);
    const liquido = soma(rec, liquidoDe);
    const custeio = soma(doMes(dados.despesasCusteio), d=> d.valor);
    const investimento = soma(doMes(dados.despesasInvestimento), d=> d.valor);
    const saiu = arred(custeio + investimento);

    const leiteDoMes = dados.receitas.filter(r=> r.tipo === "Venda de Leite" && mesReferenciaLeite(r) === mes);
    const litros = soma(leiteDoMes, r=> r.litros);
    const brutoLeite = soma(leiteDoMes.filter(r=> Number(r.litros) > 0), receitaBruta);
    const litrosComValor = soma(leiteDoMes.filter(r=> Number(r.litros) > 0), r=> r.litros);

    const precoMedio = litrosComValor > 0 ? brutoLeite / litrosComValor : null;
    const custoPorLitro = litros > 0 ? custeio / litros : null;

    return {
        mes, bruto, funrural, liquido, custeio, investimento, saiu,
        sobrou: arred(liquido - saiu),
        litros, precoMedio, custoPorLitro,
        sobraPorLitro: (precoMedio != null && custoPorLitro != null) ? precoMedio - custoPorLitro : null
    };
}

function receitaBrutaDoMes(mes){
    return soma(dados.receitas.filter(r=> mesDe(r.data) === mes), receitaBruta);
}
// Despesa do mês como vai na declaração (custeio + investimento [+ Funrural])
function despesaDeclaracaoDoMes(mes){
    const doMes = lista=> lista.filter(i=> mesDe(i.data) === mes);
    const custeio = soma(doMes(dados.despesasCusteio), d=> d.valor);
    const investimento = soma(doMes(dados.despesasInvestimento), d=> d.valor);
    const funrural = descontaFunrural() ? soma(doMes(dados.receitas), funruralDe) : 0;
    return arred(custeio + investimento + funrural);
}

// -------------------------------
// RESULTADO, PREJUÍZO E OPÇÃO DOS 20%
// Lei 8.023/1990, art. 5º: o resultado positivo pode ser limitado a 20% da
// receita bruta, mas quem faz essa opção perde o direito de compensar
// os prejuízos de anos anteriores.
// -------------------------------

function opcaoVinte(ano){
    const o = dados.propriedade.opcaoVinte;
    return !!(o && o[String(ano)]);
}

function calcularHistorico(){
    const anos = anosDisponiveis().slice().sort((a, b)=> a - b);
    let prejuizoAcumulado = 0;
    const linhas = [];

    anos.forEach(ano=>{
        const t = totaisDoAno(ano);
        const usaVinte = opcaoVinte(ano);
        const prejuizoInicial = prejuizoAcumulado;
        let prejuizoUsado = 0, tributavel = 0, prejuizoPerdido = 0;

        // Comparação das duas formas (para o ano)
        const baseLivroCaixa = t.resultado > 0 ? arred(t.resultado - Math.min(t.resultado, prejuizoInicial)) : 0;
        const baseVinte = t.resultado > 0 ? arred(Math.min(t.resultado, 0.2 * t.receitaBruta)) : null;

        if(t.resultado >= 0){
            if(usaVinte){
                tributavel = baseVinte || 0;
                prejuizoPerdido = prejuizoAcumulado;
                prejuizoAcumulado = 0;
            }else{
                prejuizoUsado = arred(Math.min(t.resultado, prejuizoAcumulado));
                tributavel = arred(t.resultado - prejuizoUsado);
                prejuizoAcumulado = arred(prejuizoAcumulado - prejuizoUsado);
            }
        }else{
            prejuizoAcumulado = arred(prejuizoAcumulado + Math.abs(t.resultado));
        }

        linhas.push(Object.assign({}, t, {
            ano, usaVinte, prejuizoInicial, prejuizoUsado, prejuizoPerdido,
            tributavel, prejuizoAcumuladoFinal: prejuizoAcumulado,
            baseLivroCaixa, baseVinte
        }));
    });

    return linhas;   // do mais antigo para o mais novo
}
function linhaHistorico(ano){
    return calcularHistorico().find(l=> l.ano === ano) || null;
}

// -------------------------------
// REBANHO — movimentação (ficha da declaração, em cabeças)
// -------------------------------

function saldoInicialInformado(ano, especie){
    const s = dados.propriedade.rebanhoInicial;
    const v = s && s[String(ano)] && s[String(ano)][especie];
    return (v === undefined || v === null || v === "") ? null : Number(v);
}

function especiesComDados(){
    const especies = new Set();
    dados.rebanho.forEach(e=> especies.add(e.especie || "Bovinos"));
    const ini = dados.propriedade.rebanhoInicial || {};
    Object.values(ini).forEach(porEsp=> Object.keys(porEsp || {}).forEach(e=> especies.add(e)));
    return Array.from(especies).sort((a, b)=> ESPECIES.indexOf(a) - ESPECIES.indexOf(b));
}

function movimentacaoRebanho(ano){
    const ini = dados.propriedade.rebanhoInicial || {};
    const anosEventos = dados.rebanho.map(e=> anoDe(e.data)).filter(Boolean);
    const anosIni = Object.keys(ini).map(Number).filter(Boolean);
    const primeiro = Math.min(ano, ...anosEventos, ...anosIni);

    return especiesComDados().map(esp=>{
        let saldo = 0, linhaAno = null;
        for(let a = primeiro; a <= ano; a++){
            const informado = saldoInicialInformado(a, esp);
            const inicial = informado != null ? informado : saldo;
            const evs = dados.rebanho.filter(e=> (e.especie || "Bovinos") === esp && anoDe(e.data) === a);
            const qtd = tipos=> evs.filter(e=> tipos.includes(e.tipo)).reduce((s, e)=> s + (Number(e.quantidade) || 0), 0);
            const l = {
                especie: esp, inicial,
                compras: qtd(["compra"]), nascimentos: qtd(["nascimento"]),
                perdas: qtd(["morte", "consumo"]), vendas: qtd(["venda"])
            };
            l.final = l.inicial + l.compras + l.nascimentos - l.perdas - l.vendas;
            saldo = l.final;
            if(a === ano) linhaAno = l;
        }
        return linhaAno;
    }).filter(Boolean);
}

// -------------------------------
// FINANCIAMENTOS (ficha "Dívidas vinculadas à atividade rural")
// -------------------------------

function dividasDoAno(ano){
    return dados.dividas
        .filter(d=> !anoDe(d.dataContratacao) || anoDe(d.dataContratacao) <= ano)
        .map(d=>{
            const saldos = d.saldos || {}, pagos = d.pagos || {};
            const anoContr = anoDe(d.dataContratacao);
            const ant = saldos[String(ano-1)];
            return {
                item: d,
                saldoAnterior: ant != null ? Number(ant) : (anoContr === ano ? 0 : null),
                saldoAtual: saldos[String(ano)] != null ? Number(saldos[String(ano)]) : null,
                pago: pagos[String(ano)] != null ? Number(pagos[String(ano)]) : null
            };
        })
        .sort((a, b)=> String(a.item.descricao || "").localeCompare(String(b.item.descricao || "")));
}

// -------------------------------
// FORNECEDORES — o app lembra a última categoria usada
// -------------------------------

function memoriaFornecedores(colecoes){
    const mapa = new Map();
    colecoes.forEach(col=> (dados[col] || []).forEach(d=>{
        const nome = String(d.fornecedor || "").trim();
        if(!nome) return;
        const chave = normalizarTexto(nome);
        const atual = mapa.get(chave) || {nome, chave, n:0, ultima:"", categoria:null, colecao:null};
        atual.n++;
        if(String(d.data || "") >= atual.ultima){
            atual.ultima = String(d.data || "");
            atual.categoria = d.categoria || d.tipo || null;
            atual.colecao = col;
            atual.nome = nome;
        }
        mapa.set(chave, atual);
    }));
    return Array.from(mapa.values()).sort((a, b)=> b.n - a.n || a.nome.localeCompare(b.nome));
}
function compradoresConhecidos(){
    const mapa = new Map();
    dados.receitas.forEach(r=>{
        const nome = String(r.comprador || "").trim();
        if(!nome) return;
        const chave = normalizarTexto(nome);
        mapa.set(chave, {nome, n: ((mapa.get(chave) || {}).n || 0) + 1});
    });
    return Array.from(mapa.values()).sort((a, b)=> b.n - a.n);
}

// -------------------------------
// AVISOS DA TELA INICIAL
// -------------------------------

function lancamentosSemComprovante(ano){
    const lista = [];
    ["receitas","despesasCusteio","despesasInvestimento","despesasDedutiveis"].forEach(col=>{
        dados[col].forEach(i=>{
            if(anoDe(i.data) === ano && !(i.anexos && i.anexos.length)) lista.push({colecao: col, item: i});
        });
    });
    return lista.sort((a, b)=> String(b.item.data).localeCompare(String(a.item.data)));
}

function mesFaltandoNotaLeite(){
    if(!dados.receitas.some(r=> r.tipo === "Venda de Leite")) return null;
    const hoje = dataHoje();
    if(Number(hoje.substring(8, 10)) < 3) return null;      // dá tempo da nota chegar
    const mes = mesAnterior(hoje.substring(0, 7));
    const coberto = dados.receitas.some(r=> r.tipo === "Venda de Leite" && cobreMes(r, mes));
    return coberto ? null : mes;
}

// -------------------------------
// CHECKLIST ANTES DE DECLARAR
// Procura palavras que costumam indicar despesa não dedutível
// ou lançada na categoria errada.
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

function calcularAlertasDeclaracao(ano){
    const alertas = [];
    const doAno = d=> ano == null || anoDe(d.data) === ano;

    dados.despesasDedutiveis.filter(doAno).forEach(d=>{
        const texto = ((d.descricao || "") + " " + (d.fornecedor || "")).toLowerCase();
        if(d.tipo === "Saúde" && ALERTA_PALAVRAS_SAUDE.some(p=> texto.includes(p))){
            alertas.push({ data: d.data, colecao:"despesasDedutiveis", id: d.id,
                texto: `Saúde — ${d.descricao || d.fornecedor || "sem descrição"}`,
                motivo: "Remédio de farmácia (avulso) e despesa veterinária geralmente não entram como dedutível — só remédio incluído em conta de hospital." });
        }
        if(d.tipo === "Educação" && ALERTA_PALAVRAS_EDUCACAO.some(p=> texto.includes(p))){
            alertas.push({ data: d.data, colecao:"despesasDedutiveis", id: d.id,
                texto: `Educação — ${d.descricao || d.fornecedor || "sem descrição"}`,
                motivo: "Curso livre, material escolar, uniforme e equipamento eletrônico não entram como despesa de instrução." });
        }
    });

    dados.despesasCusteio.filter(doAno).forEach(d=>{
        const texto = ((d.descricao || "") + " " + (d.fornecedor || "")).toLowerCase();
        if(ALERTA_PALAVRAS_BENFEITORIA.some(p=> texto.includes(p))){
            alertas.push({ data: d.data, colecao:"despesasCusteio", id: d.id,
                texto: `Custeio — ${d.descricao || d.categoria}`,
                motivo: "Reforma/construção de imóvel próprio costuma entrar como Investimento (Benfeitoria), não Custeio." });
        }
    });

    dados.receitas.filter(doAno).forEach(r=>{
        if(r.tipo === "Venda de Leite" && !(Number(r.funrural) > 0)){
            alertas.push({ data: r.data, colecao:"receitas", id: r.id,
                texto: `Venda de leite de ${formatarData(r.data)} sem Funrural`,
                motivo: "A cooperativa costuma reter o Funrural na nota do leite. Confira o valor na nota." });
        }
        if(!r.versao && Number(r.incentivo) > 0){
            alertas.push({ data: r.data, colecao:"receitas", id: r.id,
                texto: `Receita de ${formatarData(r.data)} com incentivo à parte`,
                motivo: "Lançada antes desta versão: confira se o valor bruto já inclui o incentivo (o total da nota)." });
        }
    });

    return alertas.sort((a, b)=> String(b.data).localeCompare(String(a.data)));
}
