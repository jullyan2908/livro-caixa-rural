// ======================================
// Livro Caixa Rural — tela inicial (painel do mês)
// Entrou − saiu = sobrou, custo por litro, gráficos de 12 meses e avisos.
// ======================================

let mesPainel = null;                 // "AAAA-MM"
let avisosDispensados = new Set();

// Cores dos gráficos: par validado para daltonismo (ΔE 9,2) — o verde e o
// vermelho do app ficavam parecidos para quem não distingue essas cores.
const COR_ENTRADA = "#1baf7a";
const COR_SAIDA = "#eb6834";

function mudarMesPainel(delta){
    mesPainel = delta < 0 ? mesAnterior(mesPainel) : mesSeguinte(mesPainel);
    renderizar();
}
function selecionarMesPainel(mes){
    mesPainel = mes;
    renderizar();
}
function dispensarAviso(id){
    avisosDispensados.add(id);
    renderizar();
}
function verSemComprovante(ano){
    anoSelecionado = ano;
    abrirListaSemComprovante();
}

// -------------------------------
// TELA
// -------------------------------

function renderPainel(){
    if(!mesPainel) mesPainel = mesAtual();
    const t = totaisDoMes(mesPainel);
    const ano = anoDe(mesPainel);
    const temAlgo = COLECOES_LANCAMENTO.some(c=> dados[c].length);

    return `
    <div class="pagina-header">
        <div>
            <h2>Início</h2>
            <p>${dados.propriedade.nome ? escapeHtml(dados.propriedade.nome) + " · " : ""}resumo do mês</p>
        </div>
        <div class="mes-nav" role="group" aria-label="Escolher mês">
            <button type="button" onclick="mudarMesPainel(-1)" aria-label="Mês anterior">‹</button>
            <strong>${nomeMesTitulo(mesPainel)}</strong>
            <button type="button" onclick="mudarMesPainel(1)" aria-label="Próximo mês">›</button>
        </div>
    </div>

    ${renderAvisos()}

    ${!temAlgo ? renderBoasVindas() : `
    <div class="equacao">
        <div class="equacao-linha">
            <div class="equacao-item">
                <span class="rotulo">Entrou</span>
                <span class="valor positivo">${dinheiro(t.liquido)}</span>
            </div>
            <span class="equacao-op" aria-hidden="true">−</span>
            <div class="equacao-item menos">
                <span class="rotulo">Saiu</span>
                <span class="valor negativo">${dinheiro(t.saiu)}</span>
            </div>
            <span class="equacao-op" aria-hidden="true">=</span>
            <div class="equacao-item igual">
                <span class="rotulo">Sobrou</span>
                <span class="valor ${t.sobrou >= 0 ? "positivo" : "negativo"}">${dinheiro(t.sobrou)}</span>
            </div>
        </div>
        <div class="equacao-obs">
            Entrou = o que caiu na conta${t.funrural > 0 ? ` (receita bruta ${dinheiro(t.bruto)} menos Funrural ${dinheiro(t.funrural)})` : ""}.
            Saiu = gastos do dia a dia${t.investimento > 0 ? ` (${dinheiro(t.custeio)})` : ""}${t.investimento > 0 ? ` + investimentos (${dinheiro(t.investimento)})` : " e investimentos"} pagos no mês.
        </div>
    </div>

    <div class="painel-secao">
        <h3>🥛 Leite de ${nomeMes(mesPainel)}</h3>
        <div class="grid-cartoes compacto">
            <div class="cartao">
                <div class="rotulo">Litros entregues</div>
                <div class="valor">${t.litros > 0 ? numero(t.litros) + " L" : "—"}</div>
            </div>
            <div class="cartao">
                <div class="rotulo">Preço recebido por litro</div>
                <div class="valor brand">${t.precoMedio != null ? formatarPreco(t.precoMedio) : "—"}</div>
            </div>
            <div class="cartao">
                <div class="rotulo">Custo por litro</div>
                <div class="valor brick">${t.custoPorLitro != null ? formatarPreco(t.custoPorLitro) : "—"}</div>
            </div>
            <div class="cartao">
                <div class="rotulo">Sobra por litro</div>
                <div class="valor ${t.sobraPorLitro != null && t.sobraPorLitro < 0 ? "brick" : "brand"}">${t.sobraPorLitro != null ? formatarPreco(t.sobraPorLitro) : "—"}</div>
            </div>
        </div>
        ${t.litros > 0 ? "" : `<p class="nota-rodape">Ainda não há nota de leite com período em ${nomeMes(mesPainel)}.${mesPainel === mesAtual() ? " A nota do mês costuma chegar no fim dele: toque em ‹ para ver o mês passado." : ""}</p>`}
        <p class="nota-rodape">Custo por litro = gastos do dia a dia (custeio) pagos no mês ÷ litros entregues no mês. Investimentos ficam de fora.</p>
    </div>

    ${renderGraficosPainel()}
    ${renderResumoAno(ano)}
    `}

    <div class="painel-secao">
        <h3>Atalhos</h3>
        <div class="atalhos">
            <button type="button" class="secundario" onclick="importarNotaQualquer()">📄 Importar nota (PDF)</button>
            <button type="button" class="secundario" onclick="abrirTela('financeiro')">+ Lançamento</button>
            <button type="button" class="secundario" onclick="abrirTela('declaracao')">🧾 Para a declaração</button>
        </div>
    </div>
    `;
}

function renderBoasVindas(){
    return `
    <div class="painel-secao destaque">
        <h3>👋 Vamos começar</h3>
        <p class="subtitulo-secao" style="margin-top:0;">O jeito mais rápido é importar o PDF da nota do leite: o app lê a nota e preenche tudo.</p>
        <button type="button" class="primario" onclick="importarNotaLeite()">📄 Importar nota do leite</button>
    </div>`;
}

function renderAvisos(){
    const avisos = [];

    if(erroSincronizacao === "permission-denied"){
        avisos.push({ id: "permissao", icone: "🔒", texto: "A nuvem recusou o acesso aos seus dados. Saia e entre de novo na conta.", fixo: true });
    }

    const falta = mesFaltandoNotaLeite();
    if(falta){
        avisos.push({ id: "leite-" + falta, icone: "🥛", texto: `Falta lançar a nota do leite de ${nomeMes(falta)}.`, botao: "Importar nota", acao: "importarNotaLeite()" });
    }

    const ano = anoDe(mesPainel);
    const sem = lancamentosSemComprovante(ano);
    if(sem.length){
        avisos.push({ id: `sem-${ano}-${sem.length}`, icone: "📎", texto: `${sem.length} lançamento${sem.length > 1 ? "s" : ""} de ${ano} sem comprovante.`, botao: "Ver quais", acao: `verSemComprovante(${ano})` });
    }

    const rev = receitasParaRevisar();
    if(rev.length){
        avisos.push({ id: `rev-${rev.length}`, icone: "⚠️", texto: `${rev.length} receita${rev.length > 1 ? "s" : ""} antiga${rev.length > 1 ? "s" : ""} com incentivo lançado à parte: confira o total.`, botao: "Conferir", acao: "abrirListaRevisar()" });
    }

    const visiveis = avisos.filter(a=> a.fixo || !avisosDispensados.has(a.id));
    if(!visiveis.length) return "";
    return `<div class="avisos">${visiveis.map(a=>`
        <div class="aviso">
            <span class="aviso-icone" aria-hidden="true">${a.icone}</span>
            <span class="aviso-texto">${escapeHtml(a.texto)}</span>
            ${a.botao ? `<button type="button" class="aviso-botao" onclick="${a.acao}">${escapeHtml(a.botao)}</button>` : ""}
            ${a.fixo ? "" : `<button type="button" class="aviso-fechar" aria-label="Dispensar aviso" onclick="dispensarAviso('${escapeHtml(a.id)}')">✕</button>`}
        </div>`).join("")}
    </div>`;
}

function renderResumoAno(ano){
    const t = totaisDoAno(ano);
    return `
    <div class="painel-secao">
        <h3>Resumo de ${ano}</h3>
        <div class="grid-cartoes compacto">
            <div class="cartao">
                <div class="rotulo">Receita bruta</div>
                <div class="valor brand">${dinheiro(t.receitaBruta)}</div>
            </div>
            <div class="cartao">
                <div class="rotulo">Despesas</div>
                <div class="valor brick">${dinheiro(t.despesas)}</div>
            </div>
            <div class="cartao">
                <div class="rotulo">Resultado</div>
                <div class="valor ${t.resultado >= 0 ? "brand" : "brick"}">${dinheiro(t.resultado)}</div>
            </div>
            <div class="cartao">
                <div class="rotulo">Litros entregues</div>
                <div class="valor">${numero(t.litros)} L</div>
            </div>
            <div class="cartao">
                <div class="rotulo">Saúde e educação</div>
                <div class="valor gold">${dinheiro(t.dedutiveis)}</div>
            </div>
        </div>
        <p class="nota-rodape">Despesas = gastos do dia a dia + investimentos pagos no ano.${t.deducaoFunrural > 0 ? " O resultado já desconta o Funrural retido." : ""} Saúde e educação entram como dedutíveis na declaração.</p>
    </div>`;
}

// -------------------------------
// GRÁFICOS (SVG feito à mão — leve e sem biblioteca)
// -------------------------------

function mesesAte(mesFinal, n){
    const meses = [];
    let m = mesFinal;
    for(let i = 0; i < n; i++){ meses.unshift(m); m = mesAnterior(m); }
    return meses;
}

// Escala "bonita": 0, 5 mil, 10 mil... ou 0, 1, 2, 3
function escalaBonita(max, partes){
    partes = partes || 4;
    if(!(max > 0)) return { ticks: [0, 1], topo: 1 };
    const bruto = max / partes;
    const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
    const mult = [1, 2, 2.5, 5, 10].find(m=> m * pot >= bruto) || 10;
    const passo = mult * pot;
    const topo = Math.ceil(max / passo - 1e-9) * passo;
    const ticks = [];
    for(let v = 0; v <= topo + passo / 1000; v += passo) ticks.push(Math.round(v * 1e6) / 1e6);
    return { ticks, topo };
}

// Barra com a ponta de cima arredondada (4px) e a base reta
function caminhoBarra(x, yTopo, largura, base){
    const h = base - yTopo;
    if(h <= 0.5) return "";
    const r = Math.min(4, h, largura / 2);
    return `M${x},${base} L${x},${yTopo + r} Q${x},${yTopo} ${x + r},${yTopo} L${x + largura - r},${yTopo} Q${x + largura},${yTopo} ${x + largura},${yTopo + r} L${x + largura},${base} Z`;
}

function rotuloMesEixo(m, i){
    const curto = nomeMesCurto(m);
    return (i === 0 || m.endsWith("-01")) ? `${curto} ${m.substring(2, 4)}` : curto;
}

function renderGraficosPainel(){
    const meses = mesesAte(mesPainel, 12);
    const totais = meses.map(totaisDoMes);
    const temDinheiro = totais.some(t=> t.liquido > 0 || t.saiu > 0);
    const temLitros = totais.some(t=> t.precoMedio != null || t.custoPorLitro != null);
    if(!temDinheiro) return "";
    dimensionarGraficos();

    return `
    <div class="painel-secao">
        <h3>Últimos 12 meses</h3>
        <p class="nota-rodape" style="margin-top:-8px;">Toque num mês para ver os números dele aqui em cima.</p>

        <div class="grafico-titulo">Entrou × saiu</div>
        <div class="legenda">
            <span><i class="chave-barra" style="background:${COR_ENTRADA}"></i>Entrou</span>
            <span><i class="chave-barra" style="background:${COR_SAIDA}"></i>Saiu</span>
        </div>
        ${graficoEntrouSaiu(meses, totais)}

        ${temLitros ? `
        <div class="grafico-titulo" style="margin-top:22px;">Preço recebido × custo por litro</div>
        <div class="legenda">
            <span><i class="chave-linha" style="background:${COR_ENTRADA}"></i>Preço recebido</span>
            <span><i class="chave-linha" style="background:${COR_SAIDA}"></i>Custo por litro</span>
        </div>
        ${graficoPrecoCusto(meses, totais)}` : ""}

        <details class="mais-detalhes tabela-grafico" data-id="painel-tabela">
            <summary>Ver os números em tabela</summary>
            ${tabelaMeses(meses, totais)}
        </details>
    </div>`;
}

// O desenho é feito na largura real da tela: no celular o texto não encolhe
let GRAF = { W: 640, H: 250, mL: 70, mR: 10, mT: 24, mB: 34 };
function dimensionarGraficos(){
    const tela = (typeof window !== "undefined" && window.innerWidth) || 1024;
    const util = tela <= 900 ? tela - 74 : Math.min(1100, tela - 280) - 134;
    const W = Math.max(300, Math.min(680, Math.round(util)));
    const estreito = W < 480;
    GRAF = { W, H: estreito ? 220 : 250, mL: estreito ? 50 : 70, mR: 8, mT: 24, mB: 34, estreito };
}

function moldeGrafico(meses, escala, formatarTick){
    const { W, H, mL, mR, mT, mB } = GRAF;
    const ph = H - mT - mB;
    const y = v=> mT + ph - (escala.topo > 0 ? v / escala.topo * ph : 0);
    const banda = (W - mL - mR) / meses.length;
    const idxSel = meses.indexOf(mesPainel);

    let fundo = "";
    if(idxSel >= 0){
        fundo = `<rect class="graf-selecao" x="${mL + banda * idxSel + 2}" y="${mT - 14}" width="${banda - 4}" height="${ph + 14}" rx="6"></rect>`;
    }
    const grade = escala.ticks.map(t=> `
        <line class="graf-grade" x1="${mL}" x2="${W - mR}" y1="${y(t)}" y2="${y(t)}"></line>
        <text class="graf-eixo" x="${mL - 8}" y="${y(t) + 4}" text-anchor="end">${formatarTick(t)}</text>`).join("");
    const ultimo = meses.length - 1;
    const rotulos = meses.map((m, i)=>{
        const mostrar = banda >= 34 || i === idxSel || ((ultimo - i) % 2 === 0 && Math.abs(i - idxSel) !== 1);
        if(!mostrar) return "";
        const texto = banda >= 34 ? rotuloMesEixo(m, i) : nomeMesCurto(m);
        return `<text class="graf-eixo ${i === idxSel ? "graf-eixo-sel" : ""}" x="${mL + banda * i + banda / 2}" y="${H - 12}" text-anchor="middle">${texto}</text>`;
    }).join("");
    return { y, banda, idxSel, fundo, grade, rotulos };
}

function areasDeToque(meses, banda, leitura){
    const { mL, mT, H, mB } = GRAF;
    return meses.map((m, i)=> `
        <rect class="graf-toque" x="${mL + banda * i}" y="${mT - 14}" width="${banda}" height="${H - mT - mB + 14 + 24}"
              tabindex="0" role="button" aria-label="${escapeHtml(nomeMes(m) + ": " + leitura(i))}"
              onclick="selecionarMesPainel('${m}')" onkeydown="if(event.key==='Enter'||event.key===' ') selecionarMesPainel('${m}')"><title>${escapeHtml(nomeMes(m) + ": " + leitura(i))}</title></rect>`).join("");
}

function graficoEntrouSaiu(meses, totais){
    const { W, H } = GRAF;
    const max = Math.max(...totais.map(t=> Math.max(t.liquido, t.saiu)), 0);
    const escala = escalaBonita(max);
    const fmtEixo = v=> GRAF.estreito ? dinheiroCurto(v).replace("R$ ", "") : dinheiroCurto(v);
    const { y, banda, idxSel, fundo, grade, rotulos } = moldeGrafico(meses, escala, fmtEixo);
    const base = y(0);
    const barra = Math.min(18, Math.max(6, (banda - 12) / 2));   // nunca mais de 24px

    let marcas = "", rotulosValor = "";
    totais.forEach((t, i)=>{
        const cx = GRAF.mL + banda * i + banda / 2;
        const xE = cx - 1 - barra, xS = cx + 1;                       // 2px de respiro entre as barras
        const pE = caminhoBarra(xE, y(Math.max(t.liquido, 0)), barra, base);
        const pS = caminhoBarra(xS, y(t.saiu), barra, base);
        if(pE) marcas += `<path d="${pE}" fill="${COR_ENTRADA}"></path>`;
        if(pS) marcas += `<path d="${pS}" fill="${COR_SAIDA}"></path>`;
        if(i === idxSel){
            if(t.liquido > 0) rotulosValor += `<text class="graf-valor" x="${xE + barra / 2}" y="${y(t.liquido) - 6}" text-anchor="middle">${dinheiroCurto(t.liquido).replace("R$ ", "")}</text>`;
            if(t.saiu > 0) rotulosValor += `<text class="graf-valor" x="${xS + barra / 2}" y="${y(t.saiu) - 6}" text-anchor="middle">${dinheiroCurto(t.saiu).replace("R$ ", "")}</text>`;
        }
    });

    const leitura = i=> `entrou ${dinheiro(totais[i].liquido)}, saiu ${dinheiro(totais[i].saiu)}`;
    return `
    <svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Entrou e saiu nos últimos 12 meses" preserveAspectRatio="xMidYMid meet">
        ${fundo}${grade}
        <line class="graf-base" x1="${GRAF.mL}" x2="${W - GRAF.mR}" y1="${base}" y2="${base}"></line>
        ${marcas}${rotulosValor}${rotulos}
        ${areasDeToque(meses, banda, leitura)}
    </svg>`;
}

function graficoPrecoCusto(meses, totais){
    const { W } = GRAF;
    const precos = totais.map(t=> t.precoMedio);
    const custos = totais.map(t=> t.custoPorLitro);
    const max = Math.max(...precos.concat(custos).filter(v=> v != null), 0);
    const escala = escalaBonita(max);
    const fmt = v=> "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtEixo = v=> GRAF.estreito ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : fmt(v);
    const { y, banda, idxSel, fundo, grade, rotulos } = moldeGrafico(meses, escala, fmtEixo);
    const cx = i=> GRAF.mL + banda * i + banda / 2;

    function linha(valores, cor){
        let caminho = "", aberto = false, pontos = "";
        valores.forEach((v, i)=>{
            if(v == null){ aberto = false; return; }
            caminho += `${aberto ? "L" : "M"}${cx(i).toFixed(1)},${y(v).toFixed(1)} `;
            aberto = true;
            pontos += `<circle class="graf-ponto" cx="${cx(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4.5" fill="${cor}"></circle>`;
        });
        return `<path d="${caminho}" fill="none" stroke="${cor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>${pontos}`;
    }

    let rotulosValor = "";
    if(idxSel >= 0){
        const p = precos[idxSel], c = custos[idxSel];
        // o maior fica em cima, o menor embaixo — não se encostam
        if(p != null) rotulosValor += `<text class="graf-valor" x="${cx(idxSel)}" y="${y(p) + (c != null && c > p ? 18 : -10)}" text-anchor="middle">${fmt(p)}</text>`;
        if(c != null) rotulosValor += `<text class="graf-valor" x="${cx(idxSel)}" y="${y(c) + (p != null && p >= c ? 18 : -10)}" text-anchor="middle">${fmt(c)}</text>`;
    }

    const leitura = i=> `preço ${precos[i] != null ? fmt(precos[i]) : "sem dados"}, custo ${custos[i] != null ? fmt(custos[i]) : "sem dados"} por litro`;
    return `
    <svg class="grafico" viewBox="0 0 ${W} ${GRAF.H}" role="img" aria-label="Preço recebido e custo por litro nos últimos 12 meses" preserveAspectRatio="xMidYMid meet">
        ${fundo}${grade}
        <line class="graf-base" x1="${GRAF.mL}" x2="${W - GRAF.mR}" y1="${y(0)}" y2="${y(0)}"></line>
        ${linha(custos, COR_SAIDA)}
        ${linha(precos, COR_ENTRADA)}
        ${rotulosValor}${rotulos}
        ${areasDeToque(meses, banda, leitura)}
    </svg>`;
}

function tabelaMeses(meses, totais){
    return `
    <div class="tabela-rolagem">
        <table class="tabela">
            <thead><tr><th>Mês</th><th>Entrou</th><th>Saiu</th><th>Sobrou</th><th>Litros</th><th>Preço/L</th><th>Custo/L</th></tr></thead>
            <tbody>
                ${meses.map((m, i)=>{
                    const t = totais[i];
                    return `<tr class="${m === mesPainel ? "linha-sel" : ""}">
                        <td>${nomeMesCurto(m)}/${m.substring(2, 4)}</td>
                        <td>${dinheiro(t.liquido)}</td>
                        <td>${dinheiro(t.saiu)}</td>
                        <td>${dinheiro(t.sobrou)}</td>
                        <td>${t.litros ? numero(t.litros) : "—"}</td>
                        <td>${t.precoMedio != null ? formatarPreco(t.precoMedio) : "—"}</td>
                        <td>${t.custoPorLitro != null ? formatarPreco(t.custoPorLitro) : "—"}</td>
                    </tr>`;
                }).join("")}
            </tbody>
        </table>
    </div>`;
}
