// ======================================
// Livro Caixa Rural — importar nota fiscal em PDF (DANFE)
// Lê o texto do PDF no próprio celular (pdf.js), separa os campos,
// confere as contas da nota e mostra tudo para a pessoa confirmar.
// Nota do leite → receita. Nota de compra → despesa (parcelas pelas duplicatas).
// ======================================

// -------------------------------
// LEITURA DO TEXTO (funções puras — testáveis fora do navegador)
// -------------------------------

const NotaPdf = (function(){

    function num(texto){
        if(texto == null) return null;
        let s = String(texto).trim().replace(/[^\d,.\-]/g, "");
        if(s === "") return null;
        if(s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
        else if(/^\-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
        const n = parseFloat(s);
        return isNaN(n) ? null : n;
    }
    function iso(br){
        const m = String(br || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
        return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
    }
    function centavos(v){ return Math.round((Number(v) || 0) * 100) / 100; }

    // Dígito verificador da chave de acesso (módulo 11)
    function validarChave(ch){
        if(!/^\d{44}$/.test(String(ch || ""))) return false;
        let soma = 0, peso = 2;
        for(let i = 42; i >= 0; i--){
            soma += Number(ch[i]) * peso;
            peso = peso === 9 ? 2 : peso + 1;
        }
        const resto = soma % 11;
        const dv = (resto === 0 || resto === 1) ? 0 : 11 - resto;
        return dv === Number(ch[43]);
    }

    function acharChave(t){
        const candidatos = [];
        (t.match(/(?:\d{4}\s){10}\d{4}/g) || []).forEach(c=> candidatos.push(c.replace(/\s/g, "")));
        (t.match(/\b\d{44}\b/g) || []).forEach(c=> candidatos.push(c));
        const valida = candidatos.find(validarChave);
        return { chave: valida || candidatos[0] || null, valida: !!valida };
    }

    // Campos que toda DANFE tem
    function interpretarDanfe(textoBruto){
        const t = String(textoBruto || "").replace(/\s+/g, " ").trim();
        const r = { texto: t };

        const { chave, valida } = acharChave(t);
        r.chave = chave;
        r.chaveValida = valida;
        if(chave && chave.length === 44){
            r.uf = chave.substring(0, 2);
            r.anoMes = "20" + chave.substring(2, 4) + "-" + chave.substring(4, 6);
            r.cnpjEmitente = chave.substring(6, 20);
            r.modelo = chave.substring(20, 22);
            r.serie = String(Number(chave.substring(22, 25)));
            r.numero = String(Number(chave.substring(25, 34)));
        }
        if(!r.numero){
            const m = t.match(/\bN[º°o.]?\s*:?\s*(\d{3}\.?\d{3}\.?\d{3})\b/i);
            if(m) r.numero = String(Number(m[1].replace(/\./g, "")));
        }

        const mEmit = t.match(/RECEBEMOS DE\s+(.+?)\s+OS PRODUTOS/i);
        r.emitente = mEmit ? mEmit[1].trim() : null;

        const mNat = t.match(/NATUREZA DA OPERA[ÇC][ÃA]O\s+(.+?)\s+(?:PROTOCOLO|INSCRI[ÇC][ÃA]O|CHAVE)/i);
        r.natureza = mNat ? mNat[1].trim().replace(/[\/.\s]+$/, "") : null;

        const mTipo = t.match(/0\s*-\s*ENTRADA\s+1\s*-\s*SA[ÍI]DA\s+([01])\b/i)
                   || t.match(/ENTRADA\s+([01])\s+1\s*-\s*SA[ÍI]DA/i);
        r.tipoOperacao = mTipo ? mTipo[1] : null;        // "0" entrada · "1" saída

        const mEm = t.match(/DATA D[AE] EMISS[ÃA]O\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i)
                 || t.match(/\bEMISS[ÃA]O\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
        r.dataEmissao = mEm ? iso(mEm[1]) : null;

        const mTot = t.match(/VALOR TOTAL DA NOTA\s*:?\s*(?:R\$\s*)?([\d.]+,\d{2})/i)
                  || t.match(/VALOR TOTAL\s*:?\s*R\$\s*([\d.]+,\d{2})/i);
        r.valorTotal = mTot ? num(mTot[1]) : null;

        const mProd = t.match(/VALOR TOTAL DOS PRODUTOS\s*:?\s*(?:R\$\s*)?([\d.]+,\d{2})/i);
        r.valorProdutos = mProd ? num(mProd[1]) : null;

        // Fatura / duplicatas: pares "vencimento valor" no quadro da fatura
        r.duplicatas = [];
        const iFat = t.search(/\bFATURA\b|DUPLICATA/i);
        if(iFat >= 0){
            const resto = t.substring(iFat);
            const fim = resto.search(/C[ÁA]LCULO DO IMPOSTO|BASE DE C[ÁA]LCULO|TRANSPORTADOR/i);
            const trecho = fim > 0 ? resto.substring(0, fim) : resto.substring(0, 600);
            const re = /(\d{2}\/\d{2}\/\d{4})\s+(?:[A-Za-zçÇ.:]+\s+){0,2}(?:R\$\s*)?([\d.]+,\d{2})/g;
            let m;
            while((m = re.exec(trecho))){
                r.duplicatas.push({ vencimento: iso(m[1]), valor: num(m[2]) });
            }
        }

        // Reforma tributária (IBS/CBS) — notas de 2026 em diante
        r.temIbsCbs = /\bIBS\b|\bCBS\b/.test(t);
        r.cClassTrib = Array.from(new Set(t.match(/\b(410014|200002|200054|515001)\b/g) || []));

        return r;
    }

    // Nota do leite (nota de entrada emitida pela cooperativa/laticínio)
    function interpretarNotaLeite(texto){
        const g = interpretarDanfe(texto);
        const t = g.texto;
        const r = Object.assign({}, g, { tipoNota: "leite" });

        const mItem = t.match(/\bLEITE\b[A-Z0-9 .\/\-]*?\s(\d{8})\s+(\d{3,4})\s+(\d{4})\s+(?:L|LT|LTS|LITROS?)\s+([\d.]+,\d+)\s+([\d.]+,\d+)\s+([\d.]+,\d{2})/i);
        if(mItem){
            r.ncm = mItem[1];
            r.litros = num(mItem[4]);
            r.precoLeite = num(mItem[5]);
            r.valorLeite = num(mItem[6]);
        }

        const mAliq = t.match(/FUNRURAL[^%]{0,40}?al[ií]quota\s+de\s+([\d,]+)\s*%/i)
                   || t.match(/FUNRURAL\s*\(\s*([\d,]+)\s*%\s*\)/i);
        r.aliquotaFunrural = mAliq ? num(mAliq[1]) : null;

        const mFun = t.match(/Valor\s+(?:do\s+)?FUNRURAL\s*:?\s*(?:R\$)?\s*([\d.]+,\d{2})/i);
        r.funrural = mFun ? num(mFun[1]) : null;

        if(r.funrural == null){
            // Algumas notas separam: INSS 1,32% R$ x · RAT 0,11% R$ y · SENAR 0,20% R$ z
            let somaV = 0, somaA = 0, achou = 0, m;
            const re = /\b(INSS|GILRAT|RAT|SENAR)\b[^\d%]{0,15}([\d,]+)\s*%[^R\d]{0,15}(?:R\$\s*)?([\d.]+,\d{2})/gi;
            while((m = re.exec(t))){ somaA += num(m[2]) || 0; somaV += num(m[3]) || 0; achou++; }
            if(achou){ r.funrural = centavos(somaV); r.aliquotaFunrural = centavos(somaA); }
        }

        const mInc = t.match(/Valor\s+(?:do\s+)?Incentivo\s*:?\s*(?:R\$)?\s*([\d.]+,\d{2})/i);
        if(mInc){
            r.incentivo = num(mInc[1]);
        }else{
            const mIncItem = t.match(/INCENTIVO\b[A-Z0-9 .,%\/\-]*?\s(\d{8})\s+(\d{3,4})\s+(\d{4})\s+\w{1,4}\s+([\d.]+,\d+)\s+([\d.]+,\d+)\s+([\d.]+,\d{2})/i);
            r.incentivo = mIncItem ? num(mIncItem[6]) : null;
        }

        const mPer = t.match(/per[ií]odo\s+(?:de\s+)?(\d{2}\/\d{2}\/\d{4})\s+(?:a|at[ée])\s+(\d{2}\/\d{2}\/\d{4})/i);
        if(mPer){ r.periodoInicio = iso(mPer[1]); r.periodoFim = iso(mPer[2]); }

        const mPreco = t.match(/Pre[çc]o\s+(?:m[ée]dio\s+)?pago\s+por\s+litro\s*:?\s*(?:R\$)?\s*(\d+,\d+)/i);
        r.precoPago = mPreco ? num(mPreco[1]) : null;

        // Valores derivados
        if(g.valorTotal != null) r.valorBruto = g.valorTotal;
        else if(r.valorLeite != null) r.valorBruto = centavos((r.valorLeite || 0) + (r.incentivo || 0));
        else r.valorBruto = null;

        if(r.aliquotaFunrural == null && r.funrural != null && r.valorBruto){
            r.aliquotaFunrural = Math.round(r.funrural / r.valorBruto * 10000) / 100;
        }
        if(g.duplicatas.length){
            r.valorLiquido = centavos(g.duplicatas.reduce((s, d)=> s + (d.valor || 0), 0));
            r.vencimento = g.duplicatas[0].vencimento;
        }else{
            r.valorLiquido = r.valorBruto != null ? centavos(r.valorBruto - (r.funrural || 0)) : null;
            r.vencimento = null;
        }
        r.dataPagamento = r.vencimento || g.dataEmissao || null;
        if(r.precoPago == null && r.litros && r.valorBruto){
            r.precoPago = Math.round(r.valorBruto / r.litros * 10000) / 10000;
        }

        r.conferencias = conferirLeite(r);
        return r;
    }

    function conferirLeite(r){
        const c = [];
        const perto = (a, b, tol)=> Math.abs(a - b) <= (tol || 0.015);
        c.push({ ok: !!r.chaveValida, texto: r.chaveValida ? "Chave de acesso válida" : "Chave de acesso não encontrada ou com dígito errado" });
        if(r.valorLeite != null && r.incentivo != null && r.valorTotal != null){
            c.push({ ok: perto(r.valorLeite + r.incentivo, r.valorTotal), texto: "Leite + incentivo = total da nota" });
        }
        if(r.funrural != null && r.aliquotaFunrural != null && r.valorBruto){
            const calc = centavos(r.valorBruto * r.aliquotaFunrural / 100);
            c.push({ ok: perto(calc, r.funrural), texto: `Total × ${String(r.aliquotaFunrural).replace(".", ",")}% = Funrural` });
        }
        if(r.duplicatas && r.duplicatas.length && r.valorBruto != null){
            c.push({ ok: perto(r.valorBruto - (r.funrural || 0), r.valorLiquido), texto: "Total − Funrural = valor da fatura" });
        }
        if(r.litros && r.precoPago && r.valorBruto != null){
            const tol = Math.max(0.015, r.litros * 0.00005 + 0.01);
            c.push({ ok: perto(r.litros * r.precoPago, r.valorBruto, tol), texto: "Litros × preço pago = total da nota" });
        }
        if(!r.litros) c.push({ ok: false, texto: "Não achei a linha do leite (litros e preço): confira à mão" });
        return c;
    }

    // Nota de compra (ração, remédio, peças...) — o comprador é você
    function interpretarNotaCompra(texto){
        const g = interpretarDanfe(texto);
        const r = Object.assign({}, g, { tipoNota: "compra" });
        r.fornecedor = g.emitente;
        r.valor = g.valorTotal;
        r.data = g.dataEmissao;

        r.conferencias = [{ ok: !!g.chaveValida, texto: g.chaveValida ? "Chave de acesso válida" : "Chave de acesso não encontrada ou com dígito errado" }];
        if(g.duplicatas.length > 1 && g.valorTotal != null){
            const s = g.duplicatas.reduce((x, d)=> x + (d.valor || 0), 0);
            r.conferencias.push({ ok: Math.abs(s - g.valorTotal) < 0.02, texto: `Soma das ${g.duplicatas.length} parcelas = total da nota` });
        }
        if(!r.fornecedor) r.conferencias.push({ ok: false, texto: "Não achei o nome do fornecedor: preencha à mão" });
        if(r.valor == null) r.conferencias.push({ ok: false, texto: "Não achei o valor total: preencha à mão" });
        if(g.tipoOperacao === "0") r.conferencias.push({ ok: false, texto: "Essa é uma nota de ENTRADA. Se for a venda do seu leite, use “Importar nota do leite”." });
        return r;
    }

    function pareceNotaDeLeite(texto){
        return /COMPRA DE LEITE|Pre[çc]o\s+pago\s+por\s+litro|INCENTIVO A PRODU[ÇC][ÃA]O DE LEITE|leite recebido no per[ií]odo/i.test(String(texto || ""));
    }

    return { interpretarDanfe, interpretarNotaLeite, interpretarNotaCompra, pareceNotaDeLeite, validarChave, num };
})();

if(typeof module !== "undefined" && module.exports){
    module.exports = NotaPdf;
}

// -------------------------------
// PDF.JS (carregado só quando precisa; fica guardado para uso sem sinal)
// -------------------------------

let pdfjsPromessa = null;

function carregarPdfJs(){
    if(!pdfjsPromessa){
        const base = document.baseURI;
        pdfjsPromessa = import(new URL("vendor/pdfjs/pdf.min.mjs", base).href)
            .then(mod=>{
                mod.GlobalWorkerOptions.workerSrc = new URL("vendor/pdfjs/pdf.worker.min.mjs", base).href;
                return mod;
            })
            .catch(e=>{ pdfjsPromessa = null; throw e; });
    }
    return pdfjsPromessa;
}

async function extrairTextoDoPdf(arquivo){
    const pdfjs = await carregarPdfJs();
    const dadosPdf = new Uint8Array(await arquivo.arrayBuffer());
    const doc = await pdfjs.getDocument({ data: dadosPdf, isEvalSupported: false }).promise;
    let texto = "";
    for(let p = 1; p <= Math.min(doc.numPages, 5); p++){
        const pagina = await doc.getPage(p);
        const conteudo = await pagina.getTextContent();
        texto += " " + conteudo.items.map(i=> i.str).join(" ");
    }
    try{ await doc.destroy(); }catch(e){}
    return texto.replace(/\s+/g, " ").trim();
}

// -------------------------------
// FLUXO NA TELA
// -------------------------------

let importacaoAtual = null;
let contadorImportacao = 0;

function importarNotaLeite(){
    mostrarPicker = false;
    escolherArquivoPdf(arq=> processarArquivoNota(arq, "leite"));
}
function importarNotaCompra(colecao){
    mostrarPicker = false;
    escolherArquivoPdf(arq=> processarArquivoNota(arq, "compra", colecao));
}
function importarNotaQualquer(){
    mostrarPicker = false;
    renderizar();
    escolherArquivoPdf(arq=> processarArquivoNota(arq, "auto"));
}

function escolherArquivoPdf(aoEscolher){
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.onchange = e=>{
        const f = e.target.files && e.target.files[0];
        if(f) aoEscolher(f);
    };
    input.click();
}

async function processarArquivoNota(arquivo, tipo, colecao){
    if(arquivo.type && arquivo.type !== "application/pdf" && !/\.pdf$/i.test(arquivo.name || "")){
        mostrarToast("Escolha o arquivo PDF da nota");
        return;
    }
    mostrarToast("Lendo a nota...", { duracao: 20000 });
    let texto;
    try{
        texto = await extrairTextoDoPdf(arquivo);
    }catch(e){
        console.log("Erro ao ler PDF:", e);
        fecharToast();
        mostrarToast("Não consegui abrir esse PDF");
        return;
    }
    fecharToast();
    if(!texto || texto.length < 40){
        mostrarToast("Esse PDF não tem texto (parece uma foto). Lance à mão e anexe o arquivo.");
        return;
    }
    abrirConferenciaNota(tipo, texto, arquivo, colecao);
}

function abrirConferenciaNota(tipo, texto, arquivo, colecao){
    if(tipo === "auto") tipo = NotaPdf.pareceNotaDeLeite(texto) ? "leite" : "compra";
    const nota = tipo === "leite" ? NotaPdf.interpretarNotaLeite(texto) : NotaPdf.interpretarNotaCompra(texto);

    importacaoAtual = { tipo, arquivo, nota, n: ++contadorImportacao, colecao: colecao || "despesasCusteio" };

    if(tipo === "leite"){
        importacaoAtual.duplicata = procurarDuplicataLeite(nota);
        importacaoAtual.escolha = importacaoAtual.duplicata ? "substituir" : "nova";
    }else{
        importacaoAtual.duplicata = procurarDuplicataCompra(nota);
        importacaoAtual.escolha = importacaoAtual.duplicata ? "cancelar" : "nova";
        const mem = nota.fornecedor
            ? memoriaFornecedores(["despesasCusteio","despesasInvestimento"]).find(f=> f.chave === normalizarTexto(nota.fornecedor))
            : null;
        if(mem && mem.categoria){
            importacaoAtual.colecao = mem.colecao;
            importacaoAtual.categoria = mem.categoria;
            importacaoAtual.categoriaPeloHistorico = true;
        }else{
            importacaoAtual.categoria = importacaoAtual.colecao === "despesasInvestimento"
                ? CATEGORIAS_INVESTIMENTO[0] : CATEGORIAS_CUSTEIO_COMUNS[0];
        }
    }
    renderizar();
}

function cancelarImportacao(){
    importacaoAtual = null;
    renderizar();
}

// Já existe essa nota (ou uma receita do mesmo mês lançada à mão)?
function procurarDuplicataLeite(nota){
    if(nota.chave){
        const item = dados.receitas.find(r=> r.chave && r.chave === nota.chave);
        if(item) return { item, motivo: "Essa mesma nota já foi lançada" };
    }
    const nf = normalizarNF(nota.numero);
    if(nf){
        const item = dados.receitas.find(r=> normalizarNF(r.notaFiscal) === nf
            && (!r.compradorCnpj || !nota.cnpjEmitente || r.compradorCnpj === nota.cnpjEmitente));
        if(item) return { item, motivo: "Já existe uma receita com o mesmo número de nota" };
    }
    const mesRef = nota.periodoInicio ? mesDe(nota.periodoInicio) : (nota.dataEmissao ? mesDe(nota.dataEmissao) : null);
    if(mesRef){
        const item = dados.receitas.find(r=> r.tipo === "Venda de Leite" && !r.chave && cobreMes(r, mesRef));
        if(item) return { item, motivo: `Já existe uma venda de leite de ${nomeMes(mesRef)} lançada à mão`, fraca: true };
    }
    return null;
}

function procurarDuplicataCompra(nota){
    for(const col of ["despesasCusteio","despesasInvestimento"]){
        const item = dados[col].find(d=>
            (nota.chave && d.chave === nota.chave) ||
            (nota.numero && nota.fornecedor && normalizarNF(d.notaFiscal) === normalizarNF(nota.numero)
                && normalizarTexto(d.fornecedor) === normalizarTexto(nota.fornecedor))
        );
        if(item) return { item, colecao: col, motivo: "Essa nota já foi lançada" };
    }
    return null;
}

// -------------------------------
// MODAL "CONFERIR NOTA"
// -------------------------------

function renderModalImportacao(){
    if(!importacaoAtual) return "";
    const { tipo, nota, n } = importacaoAtual;

    return `
    <div class="modal-fundo" onclick="if(event.target===this) cancelarImportacao()">
        <div class="modal-caixa larga" data-chave="importacao:${n}" role="dialog" aria-modal="true" aria-label="Conferir nota">
            <h3>${tipo === "leite" ? "🥛 Conferir nota do leite" : "🧾 Conferir nota de compra"}</h3>
            <p class="subtitulo-secao" style="margin-top:0;">Esses números foram lidos da nota. Dá para corrigir antes de salvar.</p>
            ${renderConferencias(nota.conferencias)}
            ${renderEscolhaDuplicata()}
            ${tipo === "leite" ? camposImportacaoLeite(nota) : camposImportacaoCompra(nota)}
            ${renderAvisoReformaNaNota(nota)}
            <div class="botoes-modal">
                <button type="button" class="primario" onclick="salvarImportacao()">✅ Salvar</button>
                <button type="button" class="secundario" onclick="cancelarImportacao()">Cancelar</button>
            </div>
            <p class="nota-rodape">O PDF vai junto como comprovante (precisa de internet para enviar).</p>
        </div>
    </div>`;
}

function renderConferencias(lista){
    if(!lista || !lista.length) return "";
    return `<ul class="conferencias">${lista.map(c=>
        `<li class="${c.ok ? "ok" : "alerta"}"><span aria-hidden="true">${c.ok ? "✅" : "⚠️"}</span> ${escapeHtml(c.texto)}</li>`
    ).join("")}</ul>`;
}

function renderEscolhaDuplicata(){
    const imp = importacaoAtual;
    if(!imp.duplicata) return "";
    const it = imp.duplicata.item;
    const valor = imp.tipo === "leite" ? receitaBruta(it) : it.valor;
    const opcoes = imp.tipo === "leite"
        ? [ ["substituir", "Substituir o lançamento antigo por esta nota (recomendado)"], ["nova", "Lançar como uma receita nova"] ]
        : [ ["cancelar", "Não lançar de novo"], ["nova", "Lançar mesmo assim"] ];
    return `
    <div class="aviso-caixa">
        <strong>${escapeHtml(imp.duplicata.motivo)}</strong>
        <div class="nota-rodape" style="margin:4px 0 10px;">Lançamento existente: ${formatarData(it.data)} · ${dinheiro(valor)}${it.notaFiscal ? " · NF " + escapeHtml(it.notaFiscal) : ""}</div>
        ${opcoes.map(([v, rotulo])=>`
            <label class="opcao-radio"><input type="radio" name="imp-dup" id="imp-dup-${v}" value="${v}" ${imp.escolha === v ? "checked" : ""}> ${rotulo}</label>
        `).join("")}
    </div>`;
}

function renderAvisoReformaNaNota(nota){
    if(!nota.temIbsCbs && !(nota.cClassTrib || []).length) return "";
    const textos = [];
    if(nota.tipoNota === "leite"){
        textos.push("Essa nota já traz campos da reforma tributária (IBS/CBS). Como produtor rural não contribuinte (receita abaixo de R$ 3,6 milhões no ano), você não paga IBS/CBS na venda do leite; quem compra usa um crédito presumido (código 410014). Isso não muda o seu IR.");
    }else{
        textos.push("Essa nota já traz campos da reforma tributária (IBS/CBS). Eles não mudam o seu IR.");
        if((nota.cClassTrib || []).includes("200002")) textos.push("Código 200002: trator, máquina ou implemento vendido a produtor rural não contribuinte, com alíquota zero.");
    }
    return `<div class="ajuda-visual">${textos.map(escapeHtml).join(" ")}</div>`;
}

function camposImportacaoLeite(n){
    return `
    <div class="form-grid">
        <div>
            <label for="imp-data">Data do pagamento</label>
            <input type="date" id="imp-data" value="${escapeHtml(n.dataPagamento || dataHoje())}">
            <p class="nota-rodape">Vencimento da fatura: é quando o dinheiro entra no livro-caixa.</p>
        </div>
        <div>
            <label for="imp-bruto">Total da nota (receita bruta)</label>
            <input type="text" inputmode="numeric" id="imp-bruto" ${atributosDinheiro(n.valorBruto)} oninput="aplicarMascaraValor(this); recalcularImportacaoLeite();">
        </div>
    </div>
    <div class="form-grid">
        <div>
            <label for="imp-litros">Litros</label>
            <input type="text" inputmode="numeric" id="imp-litros" ${atributosInteiro(n.litros)} oninput="aplicarMascaraInteiro(this)">
        </div>
        <div>
            <label for="imp-preco">Preço pago por litro (R$)</label>
            <input type="text" inputmode="decimal" id="imp-preco" value="${escapeHtml(formatarDecimal(n.precoPago, 6))}">
        </div>
    </div>
    <div class="form-grid">
        <div>
            <label for="imp-valor-leite">Valor do leite</label>
            <input type="text" inputmode="numeric" id="imp-valor-leite" ${atributosDinheiro(n.valorLeite)} oninput="aplicarMascaraValor(this)">
        </div>
        <div>
            <label for="imp-incentivo">Incentivo (já incluído no total)</label>
            <input type="text" inputmode="numeric" id="imp-incentivo" ${atributosDinheiro(n.incentivo || 0)} oninput="aplicarMascaraValor(this)">
        </div>
    </div>
    <div class="form-grid">
        <div>
            <label for="imp-aliquota">Alíquota do Funrural (%)</label>
            <input type="text" inputmode="decimal" id="imp-aliquota" value="${escapeHtml(formatarDecimal(n.aliquotaFunrural != null ? n.aliquotaFunrural : aliquotaFunruralPadrao(n.dataPagamento), 4))}">
        </div>
        <div>
            <label for="imp-funrural">Funrural retido</label>
            <input type="text" inputmode="numeric" id="imp-funrural" ${atributosDinheiro(n.funrural || 0)} oninput="aplicarMascaraValor(this); recalcularImportacaoLeite();">
        </div>
    </div>
    <div>
        <label for="imp-liquido">Valor líquido (o que cai na conta)</label>
        <input type="text" inputmode="numeric" id="imp-liquido" ${atributosDinheiro(n.valorLiquido)} oninput="aplicarMascaraValor(this)">
    </div>
    <details class="mais-detalhes" data-id="imp-det">
        <summary>Dados da nota</summary>
        <div class="form-grid">
            <div>
                <label for="imp-nf">Nota fiscal (nº)</label>
                <input type="text" id="imp-nf" value="${escapeHtml(n.numero || "")}">
            </div>
            <div>
                <label for="imp-data-nota">Data da nota</label>
                <input type="date" id="imp-data-nota" value="${escapeHtml(n.dataEmissao || "")}">
            </div>
        </div>
        <div>
            <label for="imp-comprador">Comprador / cooperativa</label>
            <input type="text" id="imp-comprador" value="${escapeHtml(n.emitente || "")}">
        </div>
        <div class="form-grid">
            <div>
                <label for="imp-per-ini">Leite entregue de</label>
                <input type="date" id="imp-per-ini" value="${escapeHtml(n.periodoInicio || "")}">
            </div>
            <div>
                <label for="imp-per-fim">até</label>
                <input type="date" id="imp-per-fim" value="${escapeHtml(n.periodoFim || "")}">
            </div>
        </div>
    </details>`;
}

// Se a pessoa corrige o total ou o Funrural, o líquido acompanha
function recalcularImportacaoLeite(){
    const bruto = valorDoCampo("imp-bruto");
    const funrural = valorDoCampo("imp-funrural");
    if(bruto > 0) definirDinheiroCampo("imp-liquido", bruto - funrural);
}

function camposImportacaoCompra(n){
    const imp = importacaoAtual;
    const categorias = imp.colecao === "despesasInvestimento" ? CATEGORIAS_INVESTIMENTO : CATEGORIAS_CUSTEIO;
    const temParcelas = n.duplicatas.length > 1 || (n.duplicatas.length === 1 && n.duplicatas[0].vencimento !== n.dataEmissao);
    return `
    <div class="form-grid">
        <div>
            <label for="imp-colecao">Onde lançar</label>
            <select id="imp-colecao" onchange="mudarColecaoImportacao(this.value)">
                <option value="despesasCusteio" ${imp.colecao === "despesasCusteio" ? "selected" : ""}>Gasto do dia a dia (custeio)</option>
                <option value="despesasInvestimento" ${imp.colecao === "despesasInvestimento" ? "selected" : ""}>Compra grande (investimento)</option>
            </select>
        </div>
        <div>
            <label for="imp-categoria">Categoria</label>
            <select id="imp-categoria">
                ${categorias.map(c=> `<option value="${escapeHtml(c)}" ${c === imp.categoria ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
            </select>
            ${imp.categoriaPeloHistorico ? `<p class="nota-rodape">Escolhida pelo que você já lançou desse fornecedor.</p>` : ""}
        </div>
    </div>
    <div>
        <label for="imp-fornecedor">Fornecedor</label>
        <input type="text" id="imp-fornecedor" value="${escapeHtml(n.fornecedor || "")}">
    </div>
    <div class="form-grid">
        <div>
            <label for="imp-valor">Valor total</label>
            <input type="text" inputmode="numeric" id="imp-valor" ${atributosDinheiro(n.valor)} oninput="aplicarMascaraValor(this)">
        </div>
        <div>
            <label for="imp-data">Data da compra (pagamento)</label>
            <input type="date" id="imp-data" value="${escapeHtml(n.data || dataHoje())}">
        </div>
    </div>
    ${temParcelas ? `
    <div class="aviso-caixa">
        <label class="opcao-radio"><input type="checkbox" id="imp-usar-parcelas" checked> Lançar cada parcela na data do vencimento</label>
        <ul class="lista-simples">${n.duplicatas.map((d, i)=> `<li>${i+1}ª · ${formatarData(d.vencimento)} · ${dinheiro(d.valor)}</li>`).join("")}</ul>
        <p class="nota-rodape">No livro-caixa, a despesa entra no mês em que é paga.</p>
    </div>` : ""}
    <div class="form-grid">
        <div>
            <label for="imp-nf">Nota fiscal (nº)</label>
            <input type="text" id="imp-nf" value="${escapeHtml(n.numero || "")}">
        </div>
        <div>
            <label for="imp-descricao">Descrição</label>
            <input type="text" id="imp-descricao" placeholder="Ex: ração de novembro">
        </div>
    </div>`;
}

function mudarColecaoImportacao(colecao){
    if(!importacaoAtual) return;
    importacaoAtual.colecao = colecao;
    importacaoAtual.categoria = colecao === "despesasInvestimento" ? CATEGORIAS_INVESTIMENTO[0] : CATEGORIAS_CUSTEIO_COMUNS[0];
    importacaoAtual.categoriaPeloHistorico = false;
    renderizar();
}

function escolhaDuplicataAtual(){
    const marcado = document.querySelector('input[name="imp-dup"]:checked');
    return marcado ? marcado.value : importacaoAtual.escolha;
}

function salvarImportacao(){
    const imp = importacaoAtual;
    if(!imp) return;
    if(imp.tipo === "leite") salvarImportacaoLeite(imp);
    else salvarImportacaoCompra(imp);
}

function salvarImportacaoLeite(imp){
    const n = imp.nota;
    const data = document.getElementById("imp-data").value;
    const bruto = valorDoCampo("imp-bruto");
    if(!data || !(bruto > 0)){
        mostrarToast("Confira a data do pagamento e o total da nota");
        return;
    }
    const funrural = valorDoCampo("imp-funrural");
    const incentivo = valorDoCampo("imp-incentivo");
    if(incentivo > bruto){
        mostrarToast("O incentivo não pode ser maior que o total da nota");
        return;
    }
    const escolha = imp.duplicata ? escolhaDuplicataAtual() : "nova";

    const doc = {
        versao: 2, origem: "pdf",
        data, tipo: "Venda de Leite",
        valorBruto: arred(bruto),
        valorLeite: valorDoCampo("imp-valor-leite") || null,
        incentivo: arred(incentivo),
        litros: valorDoCampo("imp-litros"),
        preco: lerDecimalCampo("imp-preco"),
        precoLeite: n.precoLeite || null,
        aliquotaFunrural: lerDecimalCampo("imp-aliquota"),
        funrural: arred(funrural),
        valorLiquido: valorDoCampo("imp-liquido") || arred(bruto - funrural),
        notaFiscal: document.getElementById("imp-nf").value.trim(),
        serie: n.serie || null,
        chave: n.chave && n.chaveValida ? n.chave : null,
        comprador: document.getElementById("imp-comprador").value.trim(),
        compradorCnpj: n.cnpjEmitente || null,
        dataNota: document.getElementById("imp-data-nota").value || null,
        vencimento: n.vencimento || null,
        periodoInicio: document.getElementById("imp-per-ini").value || "",
        periodoFim: document.getElementById("imp-per-fim").value || "",
        descricao: ""
    };

    let id;
    if(escolha === "substituir" && imp.duplicata){
        const antigo = imp.duplicata.item;
        id = antigo.id;
        doc.anexos = (antigo.anexos || []).slice();
        gravarDoc("receitas", id, doc);
    }else{
        doc.anexos = [];
        id = gravarNovo("receitas", doc);
    }

    importacaoAtual = null;
    telaAtual = "financeiro";
    subAbaFinanceiro = "receitas";
    if(anoDe(data)) anoSelecionado = anoDe(data);
    renderizar();
    mostrarToast(textoSalvo(escolha === "substituir" ? "Lançamento antigo substituído pela nota" : "Venda de leite registrada"));
    anexarPdfDaNota("receitas", [id], imp.arquivo, doc.chave);
}

function salvarImportacaoCompra(imp){
    const n = imp.nota;
    const escolha = imp.duplicata ? escolhaDuplicataAtual() : "nova";
    if(escolha === "cancelar"){
        cancelarImportacao();
        return;
    }
    const colecao = document.getElementById("imp-colecao").value;
    const categoria = document.getElementById("imp-categoria").value;
    const fornecedor = document.getElementById("imp-fornecedor").value.trim();
    const notaFiscal = document.getElementById("imp-nf").value.trim();
    const descricao = document.getElementById("imp-descricao").value.trim();
    const data = document.getElementById("imp-data").value;
    const valor = valorDoCampo("imp-valor");
    const caixaParcelas = document.getElementById("imp-usar-parcelas");
    const usarParcelas = !!(caixaParcelas && caixaParcelas.checked && n.duplicatas.length);

    if(!data || !(valor > 0)){
        mostrarToast("Confira a data e o valor");
        return;
    }

    const base = { categoria, fornecedor, notaFiscal, chave: n.chave && n.chaveValida ? n.chave : null, origem: "pdf" };
    const ids = [];
    if(usarParcelas){
        const total = n.duplicatas.length;
        const grupo = total > 1 ? gerarId() : null;
        n.duplicatas.forEach((d, i)=>{
            const doc = Object.assign({}, base, {
                data: d.vencimento,
                valor: arred(d.valor),
                descricao: total > 1 ? `${descricao}${descricao ? " — " : ""}parcela ${i+1}/${total}` : descricao,
                anexos: []
            });
            if(grupo) doc.grupoParcelaId = grupo;
            ids.push(gravarNovo(colecao, doc));
        });
    }else{
        ids.push(gravarNovo(colecao, Object.assign({}, base, { data, valor: arred(valor), descricao, anexos: [] })));
    }

    importacaoAtual = null;
    telaAtual = "financeiro";
    subAbaFinanceiro = colecao === "despesasInvestimento" ? "investimento" : "custeio";
    renderizar();
    mostrarToast(textoSalvo(ids.length > 1 ? `Compra registrada em ${ids.length} parcelas` : "Compra registrada"));
    anexarPdfDaNota(colecao, ids, imp.arquivo, base.chave);
}

// Envia o PDF uma vez e liga o mesmo link em todos os lançamentos (parcelas)
async function anexarPdfDaNota(colecao, ids, arquivo, chave){
    if(!arquivo || !ids.length) return;
    const primeiro = itemPorId(colecao, ids[0]);
    if(primeiro && chave && (primeiro.anexos || []).some(a=> a.chave === chave)) return;
    if(estaOffline()){
        setTimeout(()=> mostrarToast("Sem internet agora: o PDF não foi anexado. Anexe depois pelo 📎."), 3000);
        return;
    }
    try{
        const url = await enviarParaCloudinary(arquivo, arquivo.name || "nota.pdf");
        ids.forEach(id=>{
            const item = itemPorId(colecao, id);
            const anexos = ((item && item.anexos) || []).slice();
            if(anexos.length >= 3) return;
            anexos.push({ nome: arquivo.name || "nota.pdf", tipo: "pdf", url, chave: chave || null });
            atualizarDoc(colecao, id, { anexos });
        });
    }catch(e){
        console.log("Erro ao anexar PDF da nota:", e);
        mostrarToast("Salvo, mas o PDF não foi anexado. Tente pelo 📎 quando tiver sinal.");
    }
}
