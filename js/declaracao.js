// ======================================
// Livro Caixa Rural — "Para a declaração"
// Resultado e opção dos 20%, receitas e despesas mês a mês, rebanho,
// financiamentos, bens, histórico e o aviso da reforma tributária.
// ======================================

// Códigos da tabela de classificação tributária (cClassTrib) da Calculadora
// de Tributos da Receita Federal (código aberto, licença MIT) que dizem
// respeito ao produtor rural pessoa física não contribuinte.
const CLASSIFICACOES_REFORMA = [
    { codigo: "410014", texto: "Venda da sua produção para empresa ou cooperativa (ex.: o leite): sem IBS/CBS para você; quem compra fica com crédito presumido." },
    { codigo: "200002", texto: "Trator, máquina e implemento agrícola vendidos a produtor rural não contribuinte: alíquota zero." },
    { codigo: "200054", texto: "Mercadoria que a cooperativa de produção agropecuária vende ao associado não contribuinte: alíquota zero." },
    { codigo: "515001", texto: "Insumos agropecuários do Anexo IX vendidos a produtor rural não contribuinte: operação com diferimento." }
];
const LIMITE_NAO_CONTRIBUINTE = 3600000;   // art. 164 da LC 214/2025

function renderDeclaracao(){
    const ano = anoSelecionado;
    const hist = calcularHistorico();
    const linha = hist.find(l=> l.ano === ano);

    return `
    <div class="pagina-header">
        <div>
            <h2>🧾 Para a declaração</h2>
            <p>IR da atividade rural — ano-calendário ${ano}</p>
        </div>
        ${seletorAno()}
    </div>

    <div class="ajuda-visual">Números de ${ano} para a declaração entregue em ${ano + 1}. Confira tudo com seu contador antes de enviar.</div>

    ${linha ? renderResultadoAno(linha) : ""}
    ${renderChecklistDeclaracao(calcularAlertasDeclaracao(ano))}
    ${renderTabelaMensal(ano)}
    ${renderRebanhoResumo(ano)}
    ${renderDividasResumo(ano)}
    ${renderBensAno(ano)}
    ${renderHistoricoAnual(hist)}
    ${renderReforma(ano)}

    <div class="painel-secao">
        <h3>📊 Levar para o contador</h3>
        <div class="atalhos">
            <button type="button" class="secundario" onclick="exportarExcel()">📥 Planilha Excel</button>
            <button type="button" class="secundario" onclick="gerarPacoteContador(${ano})">🗂️ Pacote ${ano} (Excel + comprovantes)</button>
        </div>
    </div>`;
}

function renderResultadoAno(l){
    const comFunrural = l.deducaoFunrural > 0;
    let comparacao = "";

    if(l.resultado > 0){
        const melhor = (l.baseVinte != null && l.baseVinte < l.baseLivroCaixa) ? "vinte" : "livro";
        comparacao = `
        <div class="comparacao">
            <div class="comparacao-opcao ${melhor === "livro" ? "melhor" : ""}">
                <div class="rotulo">Pelo livro-caixa</div>
                <div class="valor">${dinheiro(l.baseLivroCaixa)}</div>
                <div class="nota-rodape">${l.prejuizoInicial > 0 ? `já descontando ${dinheiro(Math.min(l.resultado, l.prejuizoInicial))} de prejuízo de anos anteriores` : "resultado do ano"}</div>
            </div>
            <div class="comparacao-opcao ${melhor === "vinte" ? "melhor" : ""}">
                <div class="rotulo">Pela opção dos 20%</div>
                <div class="valor">${dinheiro(l.baseVinte)}</div>
                <div class="nota-rodape">20% da receita bruta${l.prejuizoInicial > 0 ? `; o prejuízo de ${dinheiro(l.prejuizoInicial)} não é usado` : ""}</div>
            </div>
        </div>
        <p class="nota-rodape">${melhor === "vinte"
            ? `A opção dos 20% deixa a base ${dinheiro(l.baseLivroCaixa - l.baseVinte)} menor. Quem escolhe essa opção perde o direito de compensar os prejuízos de anos anteriores.`
            : `O livro-caixa dá a menor base${l.baseVinte != null && l.baseVinte > l.baseLivroCaixa ? ` (${dinheiro(l.baseVinte - l.baseLivroCaixa)} a menos)` : ""}.`}
            É a base sobre a qual o imposto é calculado, não o imposto em si.</p>`;
    }else if(l.resultado < 0){
        comparacao = `<p class="subtitulo-secao" style="margin-top:0;">Prejuízo de ${dinheiro(-l.resultado)} em ${l.ano}: pelo livro-caixa ele fica guardado para descontar dos lucros dos próximos anos.</p>`;
    }

    return `
    <div class="painel-secao">
        <h3>Resultado de ${l.ano}</h3>
        <div class="conta">
            <div class="conta-linha"><span>Receita bruta</span><strong>${dinheiro(l.receitaBruta)}</strong></div>
            <div class="conta-linha"><span>− Despesas de custeio e investimentos</span><strong>${dinheiro(l.despesas)}</strong></div>
            ${comFunrural ? `<div class="conta-linha"><span>− Funrural retido</span><strong>${dinheiro(l.deducaoFunrural)}</strong></div>` : ""}
            <div class="conta-linha total"><span>= Resultado</span><strong class="${l.resultado >= 0 ? "texto-positivo" : "texto-negativo"}">${dinheiro(l.resultado)}</strong></div>
        </div>
        ${comFunrural ? `<p class="nota-rodape">O Funrural está sendo descontado do resultado. Dá para mudar em Mais → Configurações; confirme com o contador.</p>` : ""}
        ${comparacao}
        <label class="opcao-radio" style="margin-top:14px;">
            <input type="checkbox" id="opcao-vinte-${l.ano}" ${l.usaVinte ? "checked" : ""} onchange="alternarOpcaoVinte(${l.ano}, this.checked)">
            Em ${l.ano}, declarei (ou vou declarar) pela opção dos 20%
        </label>
        <p class="nota-rodape">Marcando, o app passa a considerar perdido o prejuízo acumulado até ${l.ano}, como manda a lei.</p>
    </div>`;
}

function alternarOpcaoVinte(ano, marcado){
    salvarNaPropriedade({ opcaoVinte: { [String(ano)]: !!marcado } });
    mostrarToast(textoSalvo(marcado ? `Opção dos 20% marcada para ${ano}` : `Opção dos 20% desmarcada para ${ano}`));
}

function renderChecklistDeclaracao(alertas){
    if(alertas.length === 0){
        return `
        <div class="painel-secao borda-esquerda-brand">
            <h3>✅ Nada fora do lugar</h3>
            <p class="subtitulo-secao" style="margin:0;">Não encontramos lançamento com cara de estar na categoria errada. Mesmo assim, revise com seu contador.</p>
        </div>`;
    }
    return `
    <div class="painel-secao borda-esquerda-gold">
        <h3>⚠️ Confira antes de declarar</h3>
        <p class="subtitulo-secao" style="margin-top:0;">${alertas.length} lançamento${alertas.length > 1 ? "s" : ""} que vale${alertas.length > 1 ? "m" : ""} a pena conferir. Toque para abrir.</p>
        <div class="lista-toque">
        ${alertas.map(a=>`
            <button type="button" class="item-toque alerta" onclick="abrirDetalhe('${a.colecao}','${idSeguro(a.id)}')">
                <span class="item-toque-desc"><strong>${formatarData(a.data)} — ${escapeHtml(a.texto)}</strong><br><span class="nota-rodape">${escapeHtml(a.motivo)}</span></span>
            </button>`).join("")}
        </div>
    </div>`;
}

function renderTabelaMensal(ano){
    const meses = Array.from({ length: 12 }, (_, i)=> `${ano}-${pad2(i + 1)}`);
    const linhas = meses.map(m=> ({ m, rec: receitaBrutaDoMes(m), desp: despesaDeclaracaoDoMes(m) }));
    const totRec = soma(linhas, l=> l.rec), totDesp = soma(linhas, l=> l.desp);
    return `
    <div class="painel-secao">
        <h3>Receitas e despesas mês a mês</h3>
        <p class="subtitulo-secao" style="margin-top:0;">Do jeito que a ficha “Receitas e Despesas” da atividade rural pede: valores no mês em que o dinheiro entrou ou saiu.</p>
        <div class="tabela-rolagem">
            <table class="tabela">
                <thead><tr><th>Mês</th><th>Receita bruta</th><th>Despesas de custeio e investimentos</th></tr></thead>
                <tbody>
                    ${linhas.map(l=> `<tr><td>${MESES_NOMES[Number(l.m.substring(5)) - 1]}</td><td>${dinheiro(l.rec)}</td><td>${dinheiro(l.desp)}</td></tr>`).join("")}
                </tbody>
                <tfoot><tr><td>Total</td><td>${dinheiro(totRec)}</td><td>${dinheiro(totDesp)}</td></tr></tfoot>
            </table>
        </div>
        ${descontaFunrural() ? `<p class="nota-rodape">As despesas incluem o Funrural retido nas notas (${dinheiro(totaisDoAno(ano).funrural)} no ano).</p>` : ""}
    </div>`;
}

function tabelaRebanho(mov){
    if(!mov.length) return `<p class="nota-rodape">Nenhuma movimentação registrada.</p>`;
    return `
    <div class="tabela-rolagem">
        <table class="tabela">
            <thead><tr><th>Espécie</th><th>Início do ano</th><th>Compras</th><th>Nascimentos</th><th>Mortes e consumo</th><th>Vendas</th><th>Fim do ano</th></tr></thead>
            <tbody>
            ${mov.map(l=> `<tr><td>${escapeHtml(l.especie)}</td><td>${l.inicial}</td><td>${l.compras}</td><td>${l.nascimentos}</td><td>${l.perdas}</td><td>${l.vendas}</td><td><strong>${l.final}</strong></td></tr>`).join("")}
            </tbody>
        </table>
    </div>`;
}

function renderRebanhoResumo(ano){
    const mov = movimentacaoRebanho(ano);
    return `
    <div class="painel-secao">
        <h3>🐄 Movimentação do rebanho</h3>
        ${mov.length ? tabelaRebanho(mov) : `<p class="subtitulo-secao" style="margin-top:0;">A declaração pede quantos animais você tinha, comprou, nasceram, morreram e vendeu no ano.</p>`}
        <button type="button" class="secundario" onclick="abrirTela('rebanho')">Abrir rebanho</button>
    </div>`;
}

function tabelaDividas(linhas, ano){
    const fmt = v=> v == null ? "—" : dinheiro(v);
    return `
    <div class="tabela-rolagem">
        <table class="tabela">
            <thead><tr><th>Financiamento</th><th>Saldo 31/12/${ano - 1}</th><th>Saldo 31/12/${ano}</th><th>Pago em ${ano}</th></tr></thead>
            <tbody>
            ${linhas.map(l=> `<tr><td>${escapeHtml(l.item.descricao || "—")}${l.item.credor ? ` <span class="nota-rodape">(${escapeHtml(l.item.credor)})</span>` : ""}</td><td>${fmt(l.saldoAnterior)}</td><td>${fmt(l.saldoAtual)}</td><td>${fmt(l.pago)}</td></tr>`).join("")}
            </tbody>
        </table>
    </div>`;
}

function renderDividasResumo(ano){
    const linhas = dividasDoAno(ano);
    return `
    <div class="painel-secao">
        <h3>🏦 Dívidas da atividade rural</h3>
        ${linhas.length ? tabelaDividas(linhas, ano) : `<p class="subtitulo-secao" style="margin-top:0;">Financiamentos rurais (Pronaf, custeio, investimento) vão numa ficha própria, com o saldo no fim de cada ano.</p>`}
        <button type="button" class="secundario" onclick="abrirTela('dividas')">Abrir financiamentos</button>
    </div>`;
}

function renderBensAno(ano){
    const itens = dados.despesasInvestimento
        .filter(d=> anoDe(d.data) === ano && d.categoria !== "Animais")
        .sort((a, b)=> String(a.data).localeCompare(String(b.data)));
    if(!itens.length) return "";
    return `
    <div class="painel-secao">
        <h3>🚜 Investimentos de ${ano} (bens da atividade rural)</h3>
        <p class="subtitulo-secao" style="margin-top:0;">Máquinas e benfeitorias pagas no ano. Animais ficam na movimentação do rebanho.</p>
        <div class="tabela-rolagem">
            <table class="tabela">
                <thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Valor</th></tr></thead>
                <tbody>
                ${itens.map(d=> `<tr><td>${formatarData(d.data)}</td><td>${escapeHtml(d.categoria)}</td><td>${escapeHtml([d.fornecedor, d.descricao].filter(Boolean).join(" · ") || "—")}</td><td>${dinheiro(d.valor)}</td></tr>`).join("")}
                </tbody>
            </table>
        </div>
    </div>`;
}

function renderHistoricoAnual(hist){
    if(!hist.length) return "";
    return `
    <div class="painel-secao">
        <h3>📊 Ano a ano</h3>
        <div class="tabela-rolagem">
            <table class="tabela">
                <thead><tr><th>Ano</th><th>Receita bruta</th><th>Despesas${descontaFunrural() ? " + Funrural" : ""}</th><th>Resultado</th><th>Prejuízo usado</th><th>Base tributável</th><th>Prejuízo que sobra</th></tr></thead>
                <tbody>
                ${hist.slice().reverse().map(l=> `<tr>
                    <td><strong>${l.ano}</strong>${l.usaVinte ? " <span class=\"badge gold\">20%</span>" : ""}</td>
                    <td>${dinheiro(l.receitaBruta)}</td>
                    <td>${dinheiro(l.despesas + l.deducaoFunrural)}</td>
                    <td class="${l.resultado >= 0 ? "" : "texto-negativo"}">${dinheiro(l.resultado)}</td>
                    <td>${dinheiro(l.prejuizoUsado)}</td>
                    <td>${dinheiro(l.tributavel)}</td>
                    <td>${dinheiro(l.prejuizoAcumuladoFinal)}</td>
                </tr>`).join("")}
                </tbody>
            </table>
        </div>
    </div>`;
}

function renderReforma(ano){
    const receita = totaisDoAno(ano).receitaBruta;
    const abaixo = receita < LIMITE_NAO_CONTRIBUINTE;
    return `
    <div class="painel-secao">
        <h3>🧮 Reforma tributária (IBS e CBS)</h3>
        <p class="subtitulo-secao" style="margin-top:0;">
            Receita bruta de ${ano}: <strong>${dinheiro(receita)}</strong>.
            ${abaixo
                ? "Abaixo de R$ 3,6 milhões no ano, o produtor rural não é contribuinte do IBS e da CBS (art. 164 da LC 214/2025)."
                : "Acima de R$ 3,6 milhões no ano, o produtor rural passa a ser contribuinte do IBS e da CBS. Converse com o contador."}
            Desde 2026 as notas começam a trazer esses campos; eles não mudam o seu IR.
        </p>
        <details class="mais-detalhes" data-id="reforma-codigos">
            <summary>Códigos que podem aparecer nas suas notas</summary>
            <ul class="lista-codigos">
                ${CLASSIFICACOES_REFORMA.map(c=> `<li><span class="mono">${c.codigo}</span> ${escapeHtml(c.texto)}</li>`).join("")}
            </ul>
            <p class="nota-rodape">Fonte: tabela de classificação tributária (cClassTrib) da Calculadora de Tributos da Receita Federal — código aberto, licença MIT.</p>
        </details>
    </div>`;
}

// -------------------------------
// TELA DO REBANHO
// -------------------------------

function renderRebanho(){
    const ano = anoSelecionado;
    const mov = movimentacaoRebanho(ano);
    const eventos = dados.rebanho
        .filter(e=> anoDe(e.data) === ano)
        .sort((a, b)=> String(b.data).localeCompare(String(a.data)));
    const especies = especiesComDados();
    const especiePadrao = especies[0] || "Bovinos";

    return `
    <div class="pagina-header">
        <div>
            <h2>🐄 Rebanho</h2>
            <p>Movimentação em cabeças — vai na declaração</p>
        </div>
        ${seletorAno()}
    </div>

    <div class="painel-secao">
        <h3>Movimentação de ${ano}</h3>
        ${tabelaRebanho(mov)}
    </div>

    <div class="painel-secao" data-chave="form-rebanho">
        <h3>Registrar</h3>
        <form onsubmit="adicionarMovRebanho(event)">
            <div>
                <label>O que aconteceu</label>
                <div class="chip-grid" data-campo="reb-tipo">
                    ${TIPOS_MOV_REBANHO.map((t, i)=> `<button type="button" class="chip ${i === 0 ? "selecionado" : ""}" data-valor="${t.valor}" onclick="selecionarChip(this,'reb-tipo')">${t.rotulo}</button>`).join("")}
                </div>
                <input type="hidden" id="reb-tipo" value="${TIPOS_MOV_REBANHO[0].valor}">
            </div>
            <div class="form-grid">
                <div>
                    <label for="reb-qtd">Quantas cabeças</label>
                    <input type="number" id="reb-qtd" min="1" step="1" value="1" inputmode="numeric">
                </div>
                <div>
                    <label for="reb-especie">Espécie</label>
                    <select id="reb-especie">${ESPECIES.map(e=> `<option value="${e}" ${e === especiePadrao ? "selected" : ""}>${e}</option>`).join("")}</select>
                </div>
            </div>
            <div>
                <label for="reb-data">Data</label>
                <input type="date" id="reb-data" value="${dataHoje()}" required>
            </div>
            <div>
                <label for="reb-descricao">Observação <span class="opcional">(opcional)</span></label>
                <input type="text" id="reb-descricao" placeholder="Ex: bezerra da Mimosa">
            </div>
            <button type="submit" class="primario">Registrar</button>
        </form>
    </div>

    <div class="painel-secao" data-chave="form-reb-inicial">
        <h3>Animais em 1º de janeiro de ${ano}</h3>
        <p class="subtitulo-secao" style="margin-top:0;">Só precisa no primeiro ano em que usar o app (ou para corrigir). Depois o app continua a conta sozinho.</p>
        <div class="form-grid">
            <div>
                <label for="reb-ini-especie">Espécie</label>
                <select id="reb-ini-especie">${ESPECIES.map(e=> `<option value="${e}" ${e === especiePadrao ? "selected" : ""}>${e}</option>`).join("")}</select>
            </div>
            <div>
                <label for="reb-ini-qtd">Cabeças</label>
                <input type="number" id="reb-ini-qtd" min="0" step="1" inputmode="numeric" placeholder="Ex: 42">
            </div>
        </div>
        <button type="button" class="secundario largura-toda" onclick="salvarSaldoInicialRebanho()">Salvar quantidade inicial</button>
    </div>

    <div class="livro">
        ${eventos.length === 0 ? `<div class="empty"><strong>Nenhum registro em ${ano}</strong>Use o formulário acima.</div>` :
        eventos.map(e=>{
            const info = infoMovRebanho(e.tipo);
            return `
            <div class="livro-linha">
                <div class="livro-data">${formatarData(e.data)}</div>
                <div class="livro-desc">
                    <strong>${info.rotulo} · ${Number(e.quantidade) || 0} ${escapeHtml(e.especie || "Bovinos")}</strong>
                    <span>${escapeHtml(e.descricao || "—")}</span>
                    ${e._pendente ? `<div class="selos"><span class="badge pendente">⏳ aguardando sinal</span></div>` : ""}
                </div>
                <div class="livro-valor ${info.sinal > 0 ? "entrada" : "saida"}">${info.sinal > 0 ? "+" : "−"}${Number(e.quantidade) || 0}</div>
                <div class="livro-acoes">
                    <button type="button" class="excluir" onclick="excluirMovRebanho('${idSeguro(e.id)}')">Excluir</button>
                </div>
            </div>`;
        }).join("")}
    </div>`;
}

function adicionarMovRebanho(evento){
    evento.preventDefault();
    const form = evento.target;
    const quantidade = Math.floor(Number(val("reb-qtd")));
    const data = val("reb-data");
    if(!data || !(quantidade > 0)){
        mostrarToast("Preencha a data e a quantidade");
        return;
    }
    const tipo = val("reb-tipo");
    gravarNovo("rebanho", {
        data, tipo, quantidade,
        especie: val("reb-especie") || "Bovinos",
        descricao: val("reb-descricao").trim()
    });
    form.reset();
    document.getElementById("reb-tipo").value = TIPOS_MOV_REBANHO[0].valor;
    sincronizarChips(form);
    if(anoDe(data) !== anoSelecionado) anoSelecionado = anoDe(data);
    renderizar();
    mostrarToast(textoSalvo(`${infoMovRebanho(tipo).rotulo} registrado`));
}

function excluirMovRebanho(id){
    const item = itemPorId("rebanho", id);
    if(!item) return;
    if(!confirm("Excluir este registro do rebanho?")) return;
    excluirComDesfazer("rebanho", [item]);
}

function salvarSaldoInicialRebanho(){
    const especie = val("reb-ini-especie");
    const texto = val("reb-ini-qtd");
    if(texto === ""){
        mostrarToast("Informe quantas cabeças havia em 1º de janeiro");
        return;
    }
    const qtd = Math.max(0, Math.floor(Number(texto)));
    salvarNaPropriedade({ rebanhoInicial: { [String(anoSelecionado)]: { [especie]: qtd } } });
    const campo = document.getElementById("reb-ini-qtd");
    if(campo) campo.value = "";
    mostrarToast(textoSalvo(`${especie}: ${qtd} cabeça${qtd === 1 ? "" : "s"} em 1º/jan/${anoSelecionado}`));
}

// -------------------------------
// TELA DOS FINANCIAMENTOS
// -------------------------------

function renderDividas(){
    const ano = anoSelecionado;
    const linhas = dividasDoAno(ano);

    return `
    <div class="pagina-header">
        <div>
            <h2>🏦 Financiamentos</h2>
            <p>Dívidas da atividade rural — vão na declaração</p>
        </div>
        ${seletorAno()}
    </div>

    <div class="ajuda-visual">O dinheiro do empréstimo não é receita. Os juros pagos são despesa: lance em “Despesas de Custeio” → Outras → “Juros de financiamento rural”.</div>

    ${linhas.length ? linhas.map(l=> cartaoDivida(l, ano)).join("") : `<div class="painel-secao"><p class="subtitulo-secao" style="margin:0;">Nenhum financiamento cadastrado para ${ano}.</p></div>`}

    <div class="painel-secao" data-chave="form-divida">
        <h3>Novo financiamento</h3>
        <form onsubmit="adicionarDivida(event)">
            <div>
                <label for="div-descricao">Descrição</label>
                <input type="text" id="div-descricao" placeholder="Ex: Pronaf — ordenhadeira" required>
            </div>
            <div class="form-grid">
                <div>
                    <label for="div-credor">Banco / credor</label>
                    <input type="text" id="div-credor" placeholder="Ex: Sicoob">
                </div>
                <div>
                    <label for="div-data">Data da contratação</label>
                    <input type="date" id="div-data">
                </div>
            </div>
            <div>
                <label for="div-valor">Valor contratado</label>
                <input type="text" inputmode="numeric" id="div-valor" placeholder="0,00" oninput="aplicarMascaraValor(this)">
            </div>
            <button type="submit" class="primario">Cadastrar financiamento</button>
        </form>
    </div>`;
}

function cartaoDivida(l, ano){
    const d = l.item;
    const id = idSeguro(d.id);
    return `
    <div class="painel-secao" data-chave="divida:${id}:${ano}">
        <h3>${escapeHtml(d.descricao || "Financiamento")}</h3>
        <p class="subtitulo-secao" style="margin-top:0;">
            ${[d.credor, d.dataContratacao ? "contratado em " + formatarData(d.dataContratacao) : "", d.valorContratado ? dinheiro(d.valorContratado) : ""].filter(Boolean).map(escapeHtml).join(" · ") || "&nbsp;"}
            ${d._pendente ? ` <span class="badge pendente">⏳ aguardando sinal</span>` : ""}
        </p>
        <div class="form-grid">
            <div>
                <label for="div-ant-${id}">Saldo em 31/12/${ano - 1}</label>
                <input type="text" inputmode="numeric" id="div-ant-${id}" ${atributosDinheiro(l.saldoAnterior)} oninput="aplicarMascaraValor(this)">
            </div>
            <div>
                <label for="div-atual-${id}">Saldo em 31/12/${ano}</label>
                <input type="text" inputmode="numeric" id="div-atual-${id}" ${atributosDinheiro(l.saldoAtual)} oninput="aplicarMascaraValor(this)">
            </div>
            <div>
                <label for="div-pago-${id}">Pago em ${ano}</label>
                <input type="text" inputmode="numeric" id="div-pago-${id}" ${atributosDinheiro(l.pago)} oninput="aplicarMascaraValor(this)">
            </div>
        </div>
        <p class="nota-rodape">O saldo do fim do ano vem no extrato do banco ou no informe de rendimentos.</p>
        <div class="botoes-modal">
            <button type="button" class="primario" onclick="salvarDividaAno('${id}', ${ano})">Salvar ${ano}</button>
            <button type="button" class="excluir" onclick="excluirDivida('${id}')">Excluir</button>
        </div>
    </div>`;
}

function lerDinheiroOpcional(id){
    const el = document.getElementById(id);
    if(!el || String(el.value).trim() === "") return null;
    return arred(valorDoCampo(id));
}

function salvarDividaAno(id, ano){
    const campos = {};
    campos["saldos." + (ano - 1)] = lerDinheiroOpcional(`div-ant-${id}`);
    campos["saldos." + ano] = lerDinheiroOpcional(`div-atual-${id}`);
    campos["pagos." + ano] = lerDinheiroOpcional(`div-pago-${id}`);
    atualizarDoc("dividas", id, campos);
    mostrarToast(textoSalvo(`Financiamento atualizado para ${ano}`));
}

function adicionarDivida(evento){
    evento.preventDefault();
    const form = evento.target;
    const descricao = val("div-descricao").trim();
    if(!descricao){
        mostrarToast("Dê um nome ao financiamento");
        return;
    }
    gravarNovo("dividas", {
        descricao,
        credor: val("div-credor").trim(),
        dataContratacao: val("div-data") || "",
        valorContratado: valorDoCampo("div-valor") || 0,
        saldos: {}, pagos: {}
    });
    form.reset();
    form.querySelectorAll("input").forEach(i=> delete i.dataset.valorReal);
    renderizar();
    mostrarToast(textoSalvo("Financiamento cadastrado"));
}

function excluirDivida(id){
    const item = itemPorId("dividas", id);
    if(!item) return;
    if(!confirm("Excluir este financiamento e os saldos dele?")) return;
    excluirComDesfazer("dividas", [item]);
}
