// ======================================
// Livro Caixa Rural — exportações
// Planilha Excel para o contador, cópia de segurança (backup)
// e o "pacote do contador" (Excel + comprovantes num .zip).
// ======================================

// -------------------------------
// CÉLULAS DO EXCEL
// -------------------------------

function estiloCabecalhoXlsx(){
    return {
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
        fill: { patternType: "solid", fgColor: { rgb: "0B6E4F" } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true }
    };
}
function celTextoXlsx(valor){ return { v: String(valor), t: "s", s: estiloCabecalhoXlsx() }; }
function celMoedaXlsx(valor){ return { v: Number(valor || 0), t: "n", z: '"R$" #,##0.00' }; }
function celPrecoXlsx(valor){ return { v: Number(valor || 0), t: "n", z: '"R$" #,##0.0000' }; }
function celNumeroXlsx(valor){ return { v: Number(valor || 0), t: "n", z: "#,##0.##" }; }
function celOpcionalMoeda(valor){ return valor == null ? "" : celMoedaXlsx(valor); }
// Data de verdade no Excel (ordena e filtra certo), mostrada como dd/mm/aaaa
function celDataXlsx(iso){
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m) return "";
    const serial = (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000;
    return { v: serial, t: "n", z: "dd/mm/yyyy" };
}
function linksComprovantes(item){
    return (item.anexos || []).map(a=> a.url ? a.url : (a.dados ? "(arquivo guardado no app)" : (a.nome || ""))).join(" | ");
}

function adicionarAba(wb, nome, cabecalho, linhas, larguras){
    const ws = XLSX.utils.aoa_to_sheet([cabecalho.map(celTextoXlsx), ...linhas]);
    ws["!cols"] = larguras.map(w=> ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, nome);
}

function montarPlanilha(){
    const wb = XLSX.utils.book_new();
    const ordenar = lista=> lista.slice().sort((a, b)=> String(a.data).localeCompare(String(b.data)));
    const p = dados.propriedade || {};

    adicionarAba(wb, "Propriedade", ["Campo", "Valor"], [
        ["Nome da propriedade", p.nome || ""], ["Área (ha)", p.area || ""],
        ["Município", p.municipio || ""], ["UF", p.uf || ""],
        ["NIRF", p.nirf || ""], ["Nº do ITR", p.itr || ""],
        ["Funrural descontado do resultado", descontaFunrural() ? "Sim" : "Não"],
        ["Planilha gerada em", formatarData(dataHoje())]
    ], [36, 40]);

    adicionarAba(wb, "Receitas",
        ["Data do pagamento","Tipo","Litros","Preço pago/L","Receita bruta (total da nota)","Incentivo (incluído)","Alíquota Funrural (%)","Funrural","Líquido","Nota fiscal","Chave de acesso","Comprador","Data da nota","Período início","Período fim","Descrição","Comprovantes"],
        ordenar(dados.receitas).map(r=> [
            celDataXlsx(r.data), r.tipo || "", r.litros || "", r.preco ? celPrecoXlsx(r.preco) : "",
            celMoedaXlsx(receitaBruta(r)), celMoedaXlsx(r.incentivo), r.aliquotaFunrural ? celNumeroXlsx(r.aliquotaFunrural) : "",
            celMoedaXlsx(r.funrural), celMoedaXlsx(liquidoDe(r)), r.notaFiscal || "", r.chave || "", r.comprador || "",
            celDataXlsx(r.dataNota), celDataXlsx(r.periodoInicio), celDataXlsx(r.periodoFim), r.descricao || "", linksComprovantes(r)
        ]),
        [12,20,10,12,16,12,10,12,14,12,46,28,12,12,12,26,40]);

    const linhasDespesa = lista=> ordenar(lista).map(d=> [
        celDataXlsx(d.data), d.categoria || "", d.fornecedor || "", d.notaFiscal || "", d.descricao || "", celMoedaXlsx(d.valor), linksComprovantes(d)
    ]);
    adicionarAba(wb, "Despesas Custeio", ["Data do pagamento","Categoria","Fornecedor","Nota fiscal","Descrição","Valor","Comprovantes"],
        linhasDespesa(dados.despesasCusteio), [12,26,24,12,28,14,40]);
    adicionarAba(wb, "Investimentos", ["Data do pagamento","Categoria","Fornecedor","Nota fiscal","Descrição","Valor","Comprovantes"],
        linhasDespesa(dados.despesasInvestimento), [12,18,24,12,28,14,40]);

    adicionarAba(wb, "Dedutíveis", ["Data","Tipo","Para quem","Local/Fornecedor","Descrição","Valor","Comprovantes"],
        ordenar(dados.despesasDedutiveis).map(d=> [
            celDataXlsx(d.data), d.tipo || "", d.dependente || "Titular", d.fornecedor || "", d.descricao || "", celMoedaXlsx(d.valor), linksComprovantes(d)
        ]), [12,12,18,22,26,14,40]);

    // Antes essa aba lia "categoria", que não existe nos gastos de casa (o campo é "tipo")
    adicionarAba(wb, "Pessoal (não dedutível)", ["Data","Tipo","Local/Fornecedor","Descrição","Valor"],
        ordenar(dados.gastosPessoais).map(d=> [
            celDataXlsx(d.data), d.tipo || d.categoria || "", d.fornecedor || "", d.descricao || "", celMoedaXlsx(d.valor)
        ]), [12,22,22,26,14]);

    const anos = anosDisponiveis().slice().sort((a, b)=> a - b);
    const linhasMes = [];
    anos.forEach(ano=>{
        for(let m = 1; m <= 12; m++){
            const mes = `${ano}-${pad2(m)}`;
            const t = totaisDoMes(mes);
            linhasMes.push([ano, MESES_NOMES[m - 1], celMoedaXlsx(receitaBrutaDoMes(mes)), celMoedaXlsx(t.custeio),
                celMoedaXlsx(t.investimento), celMoedaXlsx(t.funrural), celMoedaXlsx(despesaDeclaracaoDoMes(mes))]);
        }
    });
    adicionarAba(wb, "Mês a mês", ["Ano","Mês","Receita bruta","Custeio","Investimento","Funrural retido","Despesas na declaração"],
        linhasMes, [8,12,16,14,14,14,18]);

    adicionarAba(wb, "Histórico Anual",
        ["Ano","Receita bruta","Custeio","Investimento","Funrural","Resultado","Opção dos 20%","Prejuízo usado","Base tributável","Prejuízo acumulado","Base pelo livro-caixa","Base pela opção dos 20%"],
        calcularHistorico().map(l=> [
            l.ano, celMoedaXlsx(l.receitaBruta), celMoedaXlsx(l.custeio), celMoedaXlsx(l.investimento), celMoedaXlsx(l.deducaoFunrural),
            celMoedaXlsx(l.resultado), l.usaVinte ? "Sim" : "Não", celMoedaXlsx(l.prejuizoUsado), celMoedaXlsx(l.tributavel),
            celMoedaXlsx(l.prejuizoAcumuladoFinal), celMoedaXlsx(l.baseLivroCaixa), celOpcionalMoeda(l.baseVinte)
        ]), [8,16,14,14,12,14,10,14,16,16,18,18]);

    const linhasRebanho = [];
    anos.forEach(ano=> movimentacaoRebanho(ano).forEach(l=>
        linhasRebanho.push([ano, l.especie, l.inicial, l.compras, l.nascimentos, l.perdas, l.vendas, l.final])));
    adicionarAba(wb, "Rebanho", ["Ano","Espécie","Início do ano","Compras","Nascimentos","Mortes e consumo","Vendas","Fim do ano"],
        linhasRebanho, [8,16,12,10,12,14,10,12]);
    adicionarAba(wb, "Rebanho (registros)", ["Data","O que aconteceu","Espécie","Cabeças","Observação"],
        ordenar(dados.rebanho).map(e=> [celDataXlsx(e.data), infoMovRebanho(e.tipo).rotulo, e.especie || "Bovinos", Number(e.quantidade) || 0, e.descricao || ""]),
        [12,18,16,10,30]);

    const linhasDividas = [];
    dados.dividas.forEach(d=>{
        const anosD = new Set([...Object.keys(d.saldos || {}), ...Object.keys(d.pagos || {})].map(Number).filter(Boolean));
        Array.from(anosD).sort().forEach(ano=>{
            const s = d.saldos || {}, pg = d.pagos || {};
            linhasDividas.push([d.descricao || "", d.credor || "", celDataXlsx(d.dataContratacao), celMoedaXlsx(d.valorContratado), ano,
                celOpcionalMoeda(s[String(ano - 1)]), celOpcionalMoeda(s[String(ano)]), celOpcionalMoeda(pg[String(ano)])]);
        });
    });
    adicionarAba(wb, "Dívidas", ["Financiamento","Credor","Contratação","Valor contratado","Ano","Saldo 31/12 do ano anterior","Saldo 31/12 do ano","Pago no ano"],
        linhasDividas, [28,18,12,16,8,18,16,14]);

    return wb;
}

async function exportarExcel(){
    try{
        await garantirXlsx();
    }catch(e){
        mostrarToast("📡 Não consegui carregar o Excel. Abra o app uma vez com internet.");
        return;
    }
    XLSX.writeFile(montarPlanilha(), "livro-caixa-rural.xlsx");
    mostrarToast("✅ Excel gerado");
}

// -------------------------------
// BACKUP (cópia de segurança)
// Agora guarda tudo, inclusive os links dos comprovantes, o rebanho
// e os financiamentos. Restaurar mantém os mesmos lançamentos.
// -------------------------------

function montarBackup(){
    const b = {
        app: "livro-caixa-rural",
        versaoBackup: 2,
        geradoEm: new Date().toISOString(),
        propriedade: dados.propriedade || {}
    };
    COLECOES.forEach(nome=>{
        b[nome] = (dados[nome] || []).map(item=> Object.assign(limparParaSalvar(item), { id: item.id }));
    });
    return b;
}

function exportarBackup(sufixo){
    const conteudo = JSON.stringify(montarBackup(), null, 2);
    const blob = new Blob([conteudo], { type: "application/json" });
    baixarArquivo(blob, `backup-livro-caixa-rural-${dataHoje()}${sufixo ? "-" + sufixo : ""}.json`);
    if(!sufixo) mostrarToast("✅ Backup salvo (com os links dos comprovantes)");
}

function acionarInputBackup(){
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = e=> importarBackup(e.target.files[0]);
    input.click();
}

async function gravarEmLotes(operacoes){
    for(let i = 0; i < operacoes.length; i += 400){
        const lote = db.batch();
        operacoes.slice(i, i + 400).forEach(op=> op(lote));
        await lote.commit();
    }
}

function lerArquivoTexto(arquivo){
    return new Promise((ok, falha)=>{
        const leitor = new FileReader();
        leitor.onload = e=> ok(e.target.result);
        leitor.onerror = ()=> falha(new Error("Não foi possível ler o arquivo"));
        leitor.readAsText(arquivo);
    });
}

async function importarBackup(arquivo){
    if(!arquivo || !usuarioAtual) return;
    let novos;
    try{
        novos = JSON.parse(await lerArquivoTexto(arquivo));
    }catch(e){
        mostrarToast("❌ Esse arquivo não é um backup do app");
        return;
    }
    if(!novos || typeof novos !== "object" || !Array.isArray(novos.receitas)){
        mostrarToast("❌ Esse arquivo não é um backup do app");
        return;
    }
    if(estaOffline()){
        mostrarToast("Precisa de internet para restaurar o backup");
        return;
    }
    const total = COLECOES.reduce((s, c)=> s + (Array.isArray(novos[c]) ? novos[c].length : 0), 0);
    if(!confirm(`⚠️ Isso troca os dados atuais da nuvem pelos do backup (${total} registros).\nAntes, o app vai baixar uma cópia dos dados atuais, por segurança.\nContinuar?`)) return;

    exportarBackup("antes-de-restaurar");
    mostrarToast("⏳ Restaurando...", { duracao: 120000 });

    try{
        await docPropriedade(usuarioAtual.uid).set(limparParaSalvar(novos.propriedade || {}));
        for(const nome of COLECOES){
            const lista = Array.isArray(novos[nome]) ? novos[nome] : [];
            const ref = colecaoUsuario(usuarioAtual.uid, nome);
            const existentes = await ref.get();
            const idsBackup = new Set(lista.map(i=> idSeguro(i && i.id)).filter(Boolean));
            const ops = [];
            existentes.docs.forEach(d=>{ if(!idsBackup.has(d.id)) ops.push(lote=> lote.delete(d.ref)); });
            lista.forEach(item=>{
                if(!item || typeof item !== "object") return;
                const id = idSeguro(item.id);
                const destino = id ? ref.doc(id) : ref.doc();
                ops.push(lote=> lote.set(destino, limparParaSalvar(item)));
            });
            await gravarEmLotes(ops);
        }
        fecharToast();
        mostrarToast("✅ Backup restaurado");
    }catch(err){
        console.log("Erro ao restaurar backup:", err);
        fecharToast();
        mostrarToast("❌ Erro ao restaurar. A cópia dos dados de antes foi baixada.");
    }
}

// -------------------------------
// PACOTE DO CONTADOR (.zip)
// -------------------------------

function progressoToast(texto){
    const span = document.querySelector(".toast span");
    if(span) span.textContent = texto;
    else mostrarToast(texto, { duracao: 180000 });
}

async function gerarPacoteContador(ano){
    try{
        await garantirXlsx();
        await garantirJsZip();
    }catch(e){
        mostrarToast("📡 Não consegui carregar as ferramentas. Abra o app uma vez com internet.");
        return;
    }

    const zip = new JSZip();
    zip.file(`livro-caixa-${ano}.xlsx`, XLSX.write(montarPlanilha(), { bookType: "xlsx", type: "array" }));

    const pastas = {
        receitas: "1-receitas", despesasCusteio: "2-custeio",
        despesasInvestimento: "3-investimentos", despesasDedutiveis: "4-saude-educacao"
    };
    const tarefas = [];
    const semComprovante = [];
    Object.keys(pastas).forEach(col=>{
        dados[col].filter(i=> anoDe(i.data) === ano).forEach(item=>{
            const anexos = item.anexos || [];
            if(!anexos.length){ semComprovante.push({ col, item }); return; }
            anexos.forEach((a, k)=> tarefas.push({ col, item, a, k }));
        });
    });

    const usados = new Set();
    const falhas = [];
    let feitos = 0;
    mostrarToast(`Juntando comprovantes: 0 de ${tarefas.length}...`, { duracao: 180000 });

    for(const { col, item, a, k } of tarefas){
        const desc = item.fornecedor || item.comprador || item.categoria || item.tipo || "lancamento";
        const ext = a.tipo === "pdf" ? "pdf" : "jpg";
        let caminho = `${pastas[col]}/${item.data}_${nomeArquivoSeguro(desc, 30)}${k ? "_" + (k + 1) : ""}.${ext}`;
        let n = 2;
        while(usados.has(caminho)) caminho = caminho.replace(/(\.\w+)$/, `_${n++}$1`);
        usados.add(caminho);

        if(a.dados){
            zip.file(caminho, a.dados, { base64: true });
        }else if(a.url && /^https:\/\//i.test(a.url)){
            try{
                const resp = await fetch(a.url);
                if(!resp.ok) throw new Error("HTTP " + resp.status);
                zip.file(caminho, await resp.arrayBuffer());
            }catch(e){
                falhas.push({ caminho, url: a.url });
            }
        }
        feitos++;
        progressoToast(`Juntando comprovantes: ${feitos} de ${tarefas.length}...`);
    }

    const linhas = [
        `PACOTE DO CONTADOR — LIVRO CAIXA RURAL — ${ano}`,
        `Gerado em ${formatarData(dataHoje())}`,
        "",
        `livro-caixa-${ano}.xlsx: planilha com todos os lançamentos (todas as abas).`,
        "Pastas: 1-receitas, 2-custeio, 3-investimentos, 4-saude-educacao (comprovantes do ano).",
        ""
    ];
    if(falhas.length){
        linhas.push("Comprovantes que não deu para baixar (abra pelo link):");
        falhas.forEach(f=> linhas.push(`- ${f.caminho}: ${f.url}`));
        linhas.push("");
    }
    if(semComprovante.length){
        linhas.push(`Lançamentos de ${ano} SEM comprovante (${semComprovante.length}):`);
        semComprovante.forEach(({ col, item })=>{
            const valor = col === "receitas" ? receitaBruta(item) : item.valor;
            linhas.push(`- ${formatarData(item.data)} · ${item.tipo || item.categoria || ""} · ${item.fornecedor || item.comprador || ""} · ${dinheiro(valor)}`);
        });
    }
    zip.file("LEIA-ME.txt", linhas.join("\r\n"));

    const blob = await zip.generateAsync({ type: "blob" });
    baixarArquivo(blob, `pacote-contador-${ano}.zip`);
    fecharToast();
    mostrarToast(falhas.length
        ? `Pacote pronto. ${falhas.length} comprovante(s) foram como link no LEIA-ME.`
        : "✅ Pacote do contador pronto");
}
