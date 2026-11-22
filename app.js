// ======================================
// Livro Caixa Rural — Fazenda de Leite
// app.js — navegação, telas de login e "Mais", e o desenho da tela.
// Os outros pedaços ficam em js/ (dados, lançamentos, notas em PDF,
// painel, declaração e exportações).
// ======================================

let telaAtual = "painel";
let subAbaFinanceiro = "receitas";
let anoSelecionado = new Date().getFullYear();
let modoLogin = "entrar";
let mostrarPicker = false;
let rolarParaTopo = true;
let authPronto = false;

// -------------------------------
// LOGIN
// -------------------------------

function alternarModoLogin(modo){
    modoLogin = modo;
    renderizar();
}

function mostrarErroLogin(texto){
    const el = document.getElementById("login-erro");
    if(!el) return;
    el.textContent = texto;
    el.style.display = "block";
}

async function enviarLogin(evento){
    evento.preventDefault();
    const email = val("login-email").trim();
    const senha = val("login-senha");
    const erroEl = document.getElementById("login-erro");
    if(erroEl) erroEl.style.display = "none";
    try{
        if(modoLogin === "criar") await auth.createUserWithEmailAndPassword(email, senha);
        else await auth.signInWithEmailAndPassword(email, senha);
    }catch(e){
        mostrarErroLogin(traduzErroAuth(e.code));
    }
}

async function esqueciSenha(){
    const email = val("login-email").trim();
    if(!email){
        mostrarErroLogin("Digite seu e-mail acima e toque de novo em “Esqueci minha senha”.");
        return;
    }
    try{
        await auth.sendPasswordResetEmail(email);
        mostrarToast("Se existir conta com esse e-mail, chegou um link para criar uma senha nova.", { duracao: 7000 });
    }catch(e){
        mostrarErroLogin(traduzErroAuth(e.code));
    }
}

function traduzErroAuth(codigo){
    const mapa = {
        "auth/invalid-email": "E-mail inválido.",
        "auth/missing-email": "Digite o e-mail.",
        "auth/user-not-found": "Não existe conta com esse e-mail.",
        "auth/wrong-password": "Senha incorreta.",
        "auth/invalid-credential": "E-mail ou senha incorretos.",
        "auth/email-already-in-use": "Já existe uma conta com esse e-mail.",
        "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
        "auth/too-many-requests": "Muitas tentativas. Espere alguns minutos e tente de novo.",
        "auth/network-request-failed": "Sem internet. Para entrar pela primeira vez precisa de sinal."
    };
    return mapa[codigo] || "Não foi possível entrar. Tente novamente.";
}

function recarregarPagina(){ location.reload(); }

function fazerLogout(){
    const pend = totalPendentes();
    if(pend > 0){
        alert(`Há ${pend} lançamento(s) que ainda não subiram para a nuvem (sem sinal).\nSe sair agora, eles se perdem. Espere voltar a internet e tente de novo.`);
        return;
    }
    if(!confirm("Sair da sua conta neste aparelho?\nOs dados guardados no celular serão apagados (continuam na nuvem).")) return;
    limparDadosLocais();
    const limparCache = ()=> db.terminate()
        .then(()=> db.clearPersistence())
        .catch(e=> console.log("Não foi possível limpar o cache:", e))
        .finally(recarregarPagina);
    auth.signOut().then(limparCache, limparCache);
}

function renderCarregando(){
    return `<div class="tela-login"><div class="cartao-login" style="text-align:center;"><p style="font-weight:700;color:var(--brand-dark);">Carregando...</p></div></div>`;
}

function renderLogin(){
    return `
    <div class="tela-login">
        <div class="cartao-login fade" data-chave="login">
            <div class="login-marca">
                <div class="selo">R$</div>
                <div>
                    <h1>Livro Caixa Rural</h1>
                    <p>Controle da atividade leiteira</p>
                </div>
            </div>

            <div class="login-abas" role="tablist">
                <button type="button" role="tab" aria-selected="${modoLogin === "entrar"}" class="${modoLogin === "entrar" ? "ativo" : ""}" onclick="alternarModoLogin('entrar')">Entrar</button>
                <button type="button" role="tab" aria-selected="${modoLogin === "criar"}" class="${modoLogin === "criar" ? "ativo" : ""}" onclick="alternarModoLogin('criar')">Criar conta</button>
            </div>

            <div class="login-erro" id="login-erro" role="alert" style="display:none;"></div>

            <form onsubmit="enviarLogin(event)">
                <div>
                    <label for="login-email">E-mail</label>
                    <input type="email" id="login-email" required autocomplete="username">
                </div>
                <div>
                    <label for="login-senha">Senha</label>
                    <input type="password" id="login-senha" required minlength="6" autocomplete="${modoLogin === "criar" ? "new-password" : "current-password"}">
                </div>
                <button type="submit" class="primario">${modoLogin === "criar" ? "Criar conta" : "Entrar"}</button>
            </form>
            ${modoLogin === "entrar" ? `<button type="button" class="link-botao" onclick="esqueciSenha()">Esqueci minha senha</button>` : ""}
        </div>
    </div>`;
}

// -------------------------------
// NAVEGAÇÃO
// -------------------------------

function fecharModais(){
    detalheAtual = null;
    importacaoAtual = null;
    modalExclusaoAtual = null;
    listaModalAtual = null;
    mostrarPicker = false;
}

function abrirTela(tela){
    telaAtual = tela;
    fecharModais();
    rolarParaTopo = true;
    renderizar();
}

function abrirSubAbaFinanceiro(sub){
    subAbaFinanceiro = sub;
    rolarParaTopo = true;
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

function irParaPicker(tela, sub, tipoReceita){
    mostrarPicker = false;
    telaAtual = tela;
    if(sub) subAbaFinanceiro = sub;
    rolarParaTopo = true;
    renderizar();
    if(tipoReceita){
        const chip = document.querySelector(`.chip-grid[data-campo="rec-tipo"] .chip[data-valor="${tipoReceita}"]`);
        if(chip) selecionarTipoReceita(chip);
    }
    setTimeout(()=>{
        const alvo = document.querySelector(".campo-valor-grande input, #reb-qtd");
        if(alvo) try{ alvo.focus(); }catch(e){}
    }, 80);
}

function fecharModalDoTopo(){
    if(importacaoAtual) cancelarImportacao();
    else if(detalheAtual) fecharDetalhe();
    else if(modalExclusaoAtual) fecharModalExclusao();
    else if(listaModalAtual) fecharModalLista();
    else if(mostrarPicker) fecharPicker();
}

function seletorAno(){
    const anos = anosDisponiveis();
    if(!anos.includes(anoSelecionado)) anos.push(anoSelecionado);
    anos.sort((a, b)=> b - a);
    return `
    <div class="filtro-ano">
        <label for="seletor-ano" style="font-size:.8rem;color:var(--ink-faint);margin:0;">Ano</label>
        <select id="seletor-ano" onchange="mudarAno(this.value)">
            ${anos.map(a=> `<option value="${a}" ${a === anoSelecionado ? "selected" : ""}>${a}</option>`).join("")}
        </select>
    </div>`;
}

const ITENS_NAV = [
    { id: "painel", label: "Início", icone: "🏠" },
    { id: "financeiro", label: "Lançar", icone: "💰" },
    { id: "declaracao", label: "Declaração", icone: "🧾" },
    { id: "mais", label: "Mais", icone: "⚙️" }
];
const ITENS_NAV_EXTRA = [
    { id: "rebanho", label: "Rebanho", icone: "🐄" },
    { id: "dividas", label: "Financiamentos", icone: "🏦" }
];

function itemNavAtivo(id){
    if(id === "mais") return telaAtual === "mais" || telaAtual === "rebanho" || telaAtual === "dividas";
    return telaAtual === id;
}

function renderNavLateral(){
    return `
    <nav class="barra-lateral" aria-label="Menu">
        <div class="marca-lateral">
            <div class="selo">🐄</div>
            <div>
                <strong>Livro Caixa</strong>
                <span>Fazenda de Leite</span>
            </div>
        </div>
        ${ITENS_NAV.map(item=> `
            <button type="button" class="nav-item ${telaAtual === item.id ? "ativo" : ""}" onclick="abrirTela('${item.id}')">
                <span class="icone" aria-hidden="true">${item.icone}</span> ${item.label}
            </button>`).join("")}
        <div class="nav-rodape">
            ${ITENS_NAV_EXTRA.map(item=> `
            <button type="button" class="nav-item ${telaAtual === item.id ? "ativo" : ""}" onclick="abrirTela('${item.id}')">
                <span class="icone" aria-hidden="true">${item.icone}</span> ${item.label}
            </button>`).join("")}
        </div>
    </nav>`;
}

function renderTabbar(){
    return `
    <nav class="tabbar" aria-label="Menu">
        ${ITENS_NAV.map(item=> `
            <button type="button" class="${itemNavAtivo(item.id) ? "ativo" : ""}" aria-current="${itemNavAtivo(item.id) ? "page" : "false"}" onclick="abrirTela('${item.id}')">
                <span class="icone" aria-hidden="true">${item.icone}</span>
                ${item.label}
            </button>`).join("")}
    </nav>`;
}

function renderBarraStatus(){
    const offline = estaOffline();
    const pend = totalPendentes();
    if(!offline && !pend) return "";
    return `
    <div class="barra-status ${offline ? "offline" : ""}" role="status">
        ${offline ? "📡 Sem internet. Pode lançar normalmente: tudo sobe quando voltar o sinal." : ""}
        ${pend ? `<span>⏳ ${pend} lançamento${pend > 1 ? "s" : ""} esperando para subir.</span>` : ""}
    </div>`;
}

function conteudoTela(){
    switch(telaAtual){
        case "painel": return renderPainel();
        case "financeiro": return renderFinanceiro();
        case "declaracao": return renderDeclaracao();
        case "rebanho": return renderRebanho();
        case "dividas": return renderDividas();
        case "mais": return renderMais();
        default: return renderPainel();
    }
}

// -------------------------------
// SELETOR "O QUE VOCÊ QUER LANÇAR?"
// -------------------------------

const OPCOES_PICKER = [
    { emoji: "📄", titulo: "Importar nota (PDF)", desc: "Do leite ou de compra: o app lê e preenche", acao: "importarNotaQualquer()", cor: "#0B6E4F" },
    { emoji: "🥛", titulo: "Venda de Leite", desc: "Lançar à mão: litros e total da nota", tela: "financeiro", sub: "receitas", cor: "#0B6E4F" },
    { emoji: "💰", titulo: "Outra Venda", desc: "Venda de animal, bonificação...", tela: "financeiro", sub: "receitas", tipo: "Venda de Animais", cor: "#C89B3C" },
    { emoji: "🧾", titulo: "Gasto do Dia a Dia", desc: "Ração, veterinário, combustível...", tela: "financeiro", sub: "custeio", cor: "#A6483C" },
    { emoji: "🔧", titulo: "Compra Grande", desc: "Máquina, animal, benfeitoria", tela: "financeiro", sub: "investimento", cor: "#56635C" },
    { emoji: "🏠", titulo: "Casa", desc: "Saúde, educação, mercado, construção", tela: "financeiro", sub: "casa", cor: "#8B6F47" },
    { emoji: "🐄", titulo: "Rebanho", desc: "Nascimento, compra, venda, morte", tela: "rebanho", cor: "#56635C" }
];

function renderPickerGuiado(){
    return `
    <div class="picker-fundo" onclick="if(event.target===this) fecharPicker()">
        <div class="picker-folha fade" role="dialog" aria-modal="true" aria-label="O que você quer lançar?">
            <h3>➕ O que você quer lançar?</h3>
            <div class="sub">Toque em uma opção abaixo</div>
            ${OPCOES_PICKER.map(op=>{
                const acao = op.acao || `irParaPicker('${op.tela}','${op.sub || ""}','${op.tipo || ""}')`;
                return `
                <button type="button" class="picker-opcao" onclick="${acao}" style="border-left:6px solid ${op.cor};">
                    <span class="emoji" aria-hidden="true">${op.emoji}</span>
                    <span>
                        <strong>${op.titulo}</strong>
                        <span>${op.desc}</span>
                    </span>
                </button>`;
            }).join("")}
            <button type="button" class="picker-fechar" onclick="fecharPicker()">❌ Cancelar</button>
        </div>
    </div>`;
}

// -------------------------------
// TELA "MAIS"
// -------------------------------

function renderMais(){
    const p = dados.propriedade || {};
    return `
    <div class="pagina-header">
        <div><h2>⚙️ Mais</h2></div>
    </div>

    <div class="grade-botoes">
        <button type="button" class="cartao-botao" onclick="abrirTela('rebanho')"><span aria-hidden="true">🐄</span><strong>Rebanho</strong><span>Nascimentos, compras, vendas e mortes</span></button>
        <button type="button" class="cartao-botao" onclick="abrirTela('dividas')"><span aria-hidden="true">🏦</span><strong>Financiamentos</strong><span>Saldos para a declaração</span></button>
    </div>

    <div class="painel-secao" data-chave="form-propriedade">
        <h3>🏡 Dados da Propriedade</h3>
        <form onsubmit="salvarPropriedade(event)">
            <div class="form-grid">
                <div><label for="prop-nome">Nome da propriedade</label><input type="text" id="prop-nome" value="${escapeHtml(p.nome || "")}"></div>
                <div><label for="prop-area">Área (hectares)</label><input type="text" id="prop-area" value="${escapeHtml(p.area || "")}"></div>
                <div><label for="prop-municipio">Município</label><input type="text" id="prop-municipio" value="${escapeHtml(p.municipio || "")}"></div>
                <div><label for="prop-uf">UF</label><input type="text" id="prop-uf" maxlength="2" value="${escapeHtml(p.uf || "")}"></div>
                <div><label for="prop-nirf">NIRF</label><input type="text" id="prop-nirf" value="${escapeHtml(p.nirf || "")}"></div>
                <div><label for="prop-itr">Nº do ITR</label><input type="text" id="prop-itr" value="${escapeHtml(p.itr || "")}"></div>
            </div>
            <button type="submit" class="primario">✅ Salvar dados</button>
        </form>
    </div>

    <div class="painel-secao">
        <h3>🧮 Configurações</h3>
        <label class="opcao-radio">
            <input type="checkbox" id="cfg-funrural" ${descontaFunrural() ? "checked" : ""} onchange="alternarDescontoFunrural(this.checked)">
            Descontar do resultado o Funrural retido nas notas
        </label>
        <p class="nota-rodape">Vem marcado porque era assim que o app já calculava. Confirme com o contador como ele declara.</p>
    </div>

    <div class="painel-secao">
        <h3>📊 Exportar para o contador</h3>
        <p class="subtitulo-secao" style="margin-top:0;">A planilha tem tudo, com abas separadas. O pacote junta a planilha e os comprovantes do ano num arquivo .zip.</p>
        <div class="atalhos">
            <button type="button" class="secundario" onclick="exportarExcel()">📥 Planilha Excel</button>
            <button type="button" class="secundario" onclick="gerarPacoteContador(anoSelecionado)">🗂️ Pacote de ${anoSelecionado}</button>
        </div>
    </div>

    <div class="painel-secao">
        <h3>💾 Cópia de Segurança</h3>
        <p class="subtitulo-secao" style="margin-top:0;">Salva todos os lançamentos, o rebanho, os financiamentos e os links dos comprovantes.</p>
        <div class="atalhos">
            <button type="button" class="secundario" onclick="exportarBackup()">💾 Salvar backup</button>
            <button type="button" class="secundario" onclick="acionarInputBackup()">📂 Restaurar backup</button>
        </div>
    </div>

    <div class="painel-secao">
        <h3>👤 Sua Conta</h3>
        <p class="subtitulo-secao" style="margin-top:0;">Conectado como: <strong>${usuarioAtual ? escapeHtml(usuarioAtual.email) : ""}</strong></p>
        <button type="button" class="secundario perigo" onclick="fazerLogout()">🚪 Sair da Conta</button>
    </div>

    <p class="nota-rodape" style="text-align:center;">Livro Caixa Rural · versão 2 · usa Firebase, pdf.js, SheetJS e JSZip (licenças no arquivo AVISOS-DE-TERCEIROS.md)</p>
    `;
}

function salvarPropriedade(evento){
    evento.preventDefault();
    salvarNaPropriedade({
        nome: val("prop-nome").trim(),
        area: val("prop-area").trim(),
        municipio: val("prop-municipio").trim(),
        uf: val("prop-uf").trim().toUpperCase(),
        nirf: val("prop-nirf").trim(),
        itr: val("prop-itr").trim()
    });
    mostrarToast(textoSalvo("Dados da propriedade salvos"));
}

function alternarDescontoFunrural(marcado){
    salvarNaPropriedade({ descontarFunrural: !!marcado });
    mostrarToast(textoSalvo(marcado ? "O Funrural será descontado do resultado" : "O Funrural não será descontado do resultado"));
}

// -------------------------------
// DESENHAR A TELA
// A tela é redesenhada a cada mudança nos dados. Para não apagar o que
// a pessoa está digitando, guarda os campos antes e devolve depois.
// -------------------------------

function capturarEstado(raiz){
    const est = { blocos: {}, foco: null, rolagem: window.scrollY || 0 };
    raiz.querySelectorAll("[data-chave]").forEach(bloco=>{
        const campos = {};
        bloco.querySelectorAll("input[id], select[id], textarea[id]").forEach(el=>{
            if(el.type === "file") return;
            campos[el.id] = { v: el.value, c: el.checked, r: el.dataset.valorReal, m: el.dataset.manual, a: el.dataset.auto };
        });
        const abertos = {};
        bloco.querySelectorAll("details[data-id]").forEach(d=> abertos[d.dataset.id] = d.open);
        est.blocos[bloco.dataset.chave] = { campos, abertos, rolagem: bloco.scrollTop };
    });
    const ativo = document.activeElement;
    if(ativo && ativo.id && raiz.contains(ativo)){
        let ini = null, fim = null;
        try{ ini = ativo.selectionStart; fim = ativo.selectionEnd; }catch(e){}
        est.foco = { id: ativo.id, ini, fim };
    }
    return est;
}

function restaurarEstado(raiz, est){
    if(est){
        raiz.querySelectorAll("[data-chave]").forEach(bloco=>{
            const salvo = est.blocos[bloco.dataset.chave];
            if(!salvo) return;
            for(const [id, s] of Object.entries(salvo.campos)){
                const el = document.getElementById(id);
                if(!el || !bloco.contains(el)) continue;
                if(el.type === "checkbox" || el.type === "radio") el.checked = s.c;
                else el.value = s.v;
                ["valorReal:r", "manual:m", "auto:a"].forEach(par=>{
                    const [chave, curta] = par.split(":");
                    if(s[curta] !== undefined) el.dataset[chave] = s[curta];
                    else delete el.dataset[chave];
                });
            }
            bloco.querySelectorAll("details[data-id]").forEach(d=>{
                if(d.dataset.id in salvo.abertos) d.open = salvo.abertos[d.dataset.id];
            });
            if(salvo.rolagem) bloco.scrollTop = salvo.rolagem;
        });
    }
    sincronizarChips(raiz);
    atualizarFormulariosDinamicos();
    if(est && est.foco){
        const el = document.getElementById(est.foco.id);
        if(el){
            try{
                el.focus({ preventScroll: true });
                if(est.foco.ini != null) el.setSelectionRange(est.foco.ini, est.foco.fim);
            }catch(e){}
        }
    }
    if(est && est.rolagem) window.scrollTo(0, est.rolagem);
}

function atualizarFormulariosDinamicos(){
    atualizarFormReceita();
    atualizarFormCasa();
    atualizarDetalheDinamico();
}

function renderizar(){
    const raiz = document.getElementById("app-root");
    if(!raiz) return;

    if(!authPronto){
        raiz.innerHTML = renderCarregando();
        return;
    }

    const trocouDeTela = rolarParaTopo;
    const estado = trocouDeTela ? null : capturarEstado(raiz);

    if(!usuarioAtual){
        raiz.innerHTML = renderLogin();
        rolarParaTopo = false;
        restaurarEstado(raiz, estado);
        return;
    }

    raiz.innerHTML = `
        <div class="app-shell">
            ${renderNavLateral()}
            <main class="conteudo ${trocouDeTela ? "fade" : ""}">
                ${renderBarraStatus()}
                ${conteudoTela()}
            </main>
        </div>
        <button type="button" class="fab" onclick="abrirPicker()" aria-label="Novo lançamento">➕</button>
        ${renderTabbar()}
        ${mostrarPicker ? renderPickerGuiado() : ""}
        ${renderModalDetalhe()}
        ${renderModalImportacao()}
        ${renderModalExclusao()}
        ${renderModalLista()}
    `;

    if(trocouDeTela){
        rolarParaTopo = false;
        window.scrollTo(0, 0);
    }
    restaurarEstado(raiz, estado);
}

// Junta várias atualizações seguidas (cada coleção do Firestore chega
// separada) num desenho só
let renderAgendado = false;
function agendarRender(){
    if(renderAgendado) return;
    renderAgendado = true;
    setTimeout(()=>{
        renderAgendado = false;
        renderizar();
    }, 0);
}
const atualizarTela = agendarRender;

// -------------------------------
// INICIALIZAÇÃO
// -------------------------------

window.addEventListener("online", agendarRender);
window.addEventListener("offline", agendarRender);
document.addEventListener("keydown", e=>{ if(e.key === "Escape") fecharModalDoTopo(); });

limparDadosLocaisAntigos();
function limparDadosLocaisAntigos(){
    // A versão anterior guardava os dados sem separar por conta
    try{ localStorage.removeItem("livro_caixa_rural_dados"); }catch(e){}
}

iniciarAutenticacao(()=>{
    authPronto = true;
    fecharModais();
    telaAtual = "painel";
    mesPainel = null;
    rolarParaTopo = true;
    agendarRender();
});

document.addEventListener("DOMContentLoaded", ()=> renderizar());
