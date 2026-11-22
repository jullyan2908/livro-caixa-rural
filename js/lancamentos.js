// ======================================
// Livro Caixa Rural — lançamentos
// Formulários, listas, janela de detalhe (editar / repetir / excluir
// com desfazer), comprovantes e o "lembrar o fornecedor".
// ======================================

// -------------------------------
// COMPROVANTES (Cloudinary)
// -------------------------------

const CLOUDINARY_CLOUD_NAME = "zavj8y8b";
const CLOUDINARY_UPLOAD_PRESET = "livro caixa";
const LIMITE_ARQUIVO_BYTES = 8 * 1024 * 1024;   // 8MB por arquivo
const MAX_ANEXOS = 3;

function comprimirImagemParaBlob(arquivo){
    return new Promise((resolve, reject)=>{
        const leitor = new FileReader();
        leitor.onload = e=>{
            const img = new Image();
            img.onload = ()=>{
                const MAX = 1600;
                let w = img.width, h = img.height;
                if(w > MAX || h > MAX){
                    if(w > h){ h = Math.round(h * MAX / w); w = MAX; }
                    else{ w = Math.round(w * MAX / h); h = MAX; }
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
    if(!resposta.ok) throw new Error("Falha no envio para o Cloudinary: " + resposta.status);
    const json = await resposta.json();
    if(!json.secure_url) throw new Error("Cloudinary não devolveu o link");
    return json.secure_url;
}

async function anexarArquivos(colecao, itemId, arquivos){
    if(!usuarioAtual || !arquivos || !arquivos.length) return;
    const item = itemPorId(colecao, itemId);
    if(!item) return;

    const anexosAtuais = (item.anexos || []).slice();
    const lista = Array.from(arquivos);
    if(anexosAtuais.length + lista.length > MAX_ANEXOS){
        mostrarToast(`Máximo de ${MAX_ANEXOS} arquivos por lançamento`);
        return;
    }
    if(estaOffline()){
        mostrarToast("Sem internet: os comprovantes só sobem com sinal");
        return;
    }

    mostrarToast("Enviando arquivo(s)...", { duracao: 60000 });
    let enviados = 0;
    const falhas = [];

    for(const arquivo of lista){
        const ehPdf = arquivo.type === "application/pdf" || /\.pdf$/i.test(arquivo.name || "");
        const ehImagem = /^image\//i.test(arquivo.type || "");
        if(!ehPdf && !ehImagem){ falhas.push(`${arquivo.name} (só foto ou PDF)`); continue; }
        if(arquivo.size > LIMITE_ARQUIVO_BYTES){ falhas.push(`${arquivo.name} (maior que 8MB)`); continue; }
        try{
            const paraEnviar = ehPdf ? arquivo : await comprimirImagemParaBlob(arquivo);
            const nomeEnvio = ehPdf ? arquivo.name : String(arquivo.name || "foto").replace(/\.\w+$/, "") + ".jpg";
            const url = await enviarParaCloudinary(paraEnviar, nomeEnvio);
            anexosAtuais.push({ nome: arquivo.name, tipo: ehPdf ? "pdf" : "imagem", url });
            enviados++;
        }catch(e){
            console.log("Erro ao enviar anexo:", e);
            falhas.push(arquivo.name);
        }
    }

    fecharToast();
    if(enviados > 0) atualizarDoc(colecao, itemId, { anexos: anexosAtuais });

    // Antes aparecia "anexado" mesmo quando nada tinha subido
    if(enviados && !falhas.length){
        mostrarToast(enviados > 1 ? `${enviados} comprovantes anexados` : "Comprovante anexado");
    }else if(enviados){
        mostrarToast(`${enviados} anexado(s). Não foi: ${falhas.join(", ")}`, { duracao: 6000 });
    }else{
        mostrarToast(`Não foi possível enviar: ${falhas.join(", ")}`, { duracao: 6000 });
    }
}

function removerAnexo(colecao, itemId, indice){
    const item = itemPorId(colecao, itemId);
    if(!item || !item.anexos) return;
    if(!confirm("Tirar este comprovante do lançamento?")) return;
    const novos = item.anexos.slice();
    novos.splice(indice, 1);
    atualizarDoc(colecao, itemId, { anexos: novos });
    mostrarToast(textoSalvo("Comprovante removido"));
}

function acionarInputAnexo(colecao, itemId){
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,application/pdf";
    input.multiple = true;
    input.onchange = e=> anexarArquivos(colecao, itemId, e.target.files);
    input.click();
}

// Anexos antigos (versão que guardava o arquivo dentro do documento)
function urlAnexo(anexo){
    const mime = anexo.tipo === "pdf" ? "application/pdf" : "image/jpeg";
    return `data:${mime};base64,${anexo.dados}`;
}
function abrirAnexo(colecao, itemId, indice){
    const item = itemPorId(colecao, itemId);
    const anexo = item && item.anexos && item.anexos[indice];
    if(!anexo || !anexo.dados) return;
    try{
        const link = document.createElement("a");
        link.href = urlAnexo(anexo);
        link.download = anexo.nome || (anexo.tipo === "pdf" ? "arquivo.pdf" : "arquivo.jpg");
        document.body.appendChild(link);
        link.click();
        link.remove();
    }catch(e){
        mostrarToast("Não foi possível abrir esse arquivo");
    }
}

function botaoAnexo(colecao, id, anexos){
    const qtd = (anexos || []).length;
    return `<button type="button" class="btn-anexo ${qtd > 0 ? "tem-anexo" : ""}" aria-label="${qtd ? qtd + " comprovante(s)" : "Anexar comprovante"}" onclick="event.stopPropagation(); abrirDetalhe('${colecao}','${idSeguro(id)}',true)">📎 ${qtd > 0 ? qtd : "Anexar"}</button>`;
}

function secaoAnexos(colecao, item){
    const anexos = item.anexos || [];
    const id = idSeguro(item.id);
    return `
    <div class="secao-anexos" id="det-anexos">
        <h4>📎 Comprovantes</h4>
        ${anexos.length === 0
            ? `<p class="nota-rodape">Nenhum arquivo anexado ainda.</p>`
            : anexos.map((a, i)=>`
            <div class="anexo-item">
                <span aria-hidden="true" style="font-size:1.4rem;">${a.tipo === "pdf" ? "📄" : "🖼️"}</span>
                ${a.url && /^https:\/\//i.test(a.url)
                    ? `<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener">${escapeHtml(a.nome || "arquivo")}</a>`
                    : a.dados
                        ? `<a href="javascript:void(0)" onclick="abrirAnexo('${colecao}','${id}',${i})">${escapeHtml(a.nome || "arquivo")}</a>`
                        : `<span style="flex:1;">${escapeHtml(a.nome || "arquivo")}</span>`}
                <button type="button" class="excluir compacto" onclick="removerAnexo('${colecao}','${id}',${i})" aria-label="Remover ${escapeHtml(a.nome || "arquivo")}">🗑️</button>
            </div>`).join("")}
        ${anexos.length < MAX_ANEXOS
            ? `<button type="button" class="secundario largura-toda" onclick="acionarInputAnexo('${colecao}','${id}')">📷 Anexar foto ou PDF</button>`
            : ""}
        <p class="nota-rodape">Fotos são comprimidas. Arquivos até 8MB, no máximo ${MAX_ANEXOS} por lançamento.</p>
    </div>`;
}

// -------------------------------
// TELA "LANÇAR"
// -------------------------------

function renderFinanceiro(){
    const abas = [
        ["receitas", "Receitas"], ["custeio", "Despesas de Custeio"],
        ["investimento", "Investimentos"], ["casa", "Casa"]
    ];
    return `
    <div class="pagina-header">
        <div>
            <h2>Lançar</h2>
            <p>Receitas e despesas da atividade rural</p>
        </div>
        ${seletorAno()}
    </div>

    <div class="segmentado" role="tablist">
        ${abas.map(([id, rotulo])=> `<button type="button" role="tab" aria-selected="${subAbaFinanceiro === id}" class="${subAbaFinanceiro === id ? "ativo" : ""}" onclick="abrirSubAbaFinanceiro('${id}')">${rotulo}</button>`).join("")}
    </div>

    ${subAbaFinanceiro === "casa" ? `<p class="subtitulo-secao">🏠 Saúde e Educação entram na declaração; Mercado, Material de Construção, Lazer e Roupas ficam só de controle, não entram no imposto.</p>` : ""}

    ${
        subAbaFinanceiro === "receitas" ? renderFormReceita() + renderListaReceitas() :
        subAbaFinanceiro === "custeio" ? renderFormDespesa("despesasCusteio", CATEGORIAS_CUSTEIO, "custeio", "Novo gasto do dia a dia (custeio)") + renderListaDespesa("despesasCusteio") :
        subAbaFinanceiro === "investimento" ? renderFormDespesa("despesasInvestimento", CATEGORIAS_INVESTIMENTO, "invest", "Nova compra grande (investimento)") + renderListaDespesa("despesasInvestimento") :
        renderFormCasa() + renderListaCasa()
    }
    `;
}

function val(id){
    const el = document.getElementById(id);
    return el ? String(el.value || "") : "";
}

// -------------------------------
// RECEITA
// -------------------------------

function renderFormReceita(){
    const hoje = dataHoje();
    return `
    <div class="painel-secao" data-chave="form-receita">
        <h3>Nova receita</h3>
        <button type="button" class="botao-importar" onclick="importarNotaLeite()"><span aria-hidden="true">📄</span> Importar nota do leite (PDF)</button>
        <p class="nota-rodape" style="margin:8px 0 18px;">Lê a nota da cooperativa e preenche tudo sozinho. Ou preencha abaixo.</p>

        <form id="form-receita" onsubmit="adicionarReceita(event)">
            <div>
                <label>Tipo</label>
                <div class="chip-grid" data-campo="rec-tipo">
                    ${TIPOS_RECEITA.map((t, i)=> `<button type="button" class="chip ${i === 0 ? "selecionado" : ""}" data-valor="${escapeHtml(t)}" onclick="selecionarTipoReceita(this)">${escapeHtml(t)}</button>`).join("")}
                </div>
                <input type="hidden" id="rec-tipo" value="${escapeHtml(TIPOS_RECEITA[0])}">
            </div>

            <div id="rec-campo-litros" class="form-grid">
                <div>
                    <label for="rec-litros">Litros vendidos</label>
                    <input type="text" inputmode="numeric" id="rec-litros" placeholder="Ex: 8.957" oninput="aplicarMascaraInteiro(this); recalcularReceita('litros');">
                </div>
                <div>
                    <label for="rec-preco">Preço pago por litro (R$)</label>
                    <input type="text" inputmode="decimal" id="rec-preco" placeholder="Ex: 2,84" oninput="recalcularReceita('preco');">
                </div>
            </div>

            <div class="campo-valor-grande">
                <label for="rec-valor" id="rec-valor-rotulo">Total da nota (valor bruto)</label>
                <div class="prefixo-rs">
                    <input type="text" inputmode="numeric" id="rec-valor" placeholder="0,00" oninput="aplicarMascaraValor(this); recalcularReceita('valor');" required>
                </div>
                <p class="nota-rodape" id="rec-valor-ajuda">O VALOR TOTAL DA NOTA: já com incentivo e antes do desconto do Funrural.</p>
            </div>

            <div>
                <label for="rec-data">Data do pagamento</label>
                <input type="date" id="rec-data" value="${hoje}" required onchange="recalcularReceita('data')">
                <p class="nota-rodape">Dia em que o dinheiro entrou. Nota de dezembro paga em janeiro entra no ano seguinte.</p>
            </div>

            <div class="resumo-ao-vivo" id="rec-resumo" aria-live="polite"></div>

            <details class="mais-detalhes" data-id="rec-det">
                <summary>Mais detalhes (Funrural, nota, período)</summary>
                <div class="form-grid">
                    <div>
                        <label for="rec-aliquota">Alíquota do Funrural (%)</label>
                        <input type="text" inputmode="decimal" id="rec-aliquota" value="${escapeHtml(formatarDecimal(aliquotaFunruralPadrao(hoje), 4))}" oninput="this.dataset.manual='1'; recalcularReceita('aliquota');">
                    </div>
                    <div>
                        <label for="rec-funrural">Funrural retido (R$)</label>
                        <div class="linha-campo-botao">
                            <input type="text" inputmode="numeric" id="rec-funrural" value="0,00" data-valor-real="0" oninput="aplicarMascaraValor(this); this.dataset.manual='1'; recalcularReceita('funrural');">
                            <button type="button" class="secundario compacto" onclick="calcularFunrural()">Calcular</button>
                        </div>
                    </div>
                </div>
                <div>
                    <label for="rec-incentivo">Desse total, quanto é incentivo/bonificação (R$)</label>
                    <input type="text" inputmode="numeric" id="rec-incentivo" placeholder="0,00" oninput="aplicarMascaraValor(this)">
                </div>
                <div class="form-grid">
                    <div>
                        <label for="rec-nota">Nota fiscal (nº)</label>
                        <input type="text" id="rec-nota" placeholder="Ex: 107978">
                    </div>
                    <div>
                        <label for="rec-comprador">Comprador / cooperativa</label>
                        <input type="text" id="rec-comprador" list="dl-compradores" autocomplete="off" placeholder="Ex: COOPERSUCESSO">
                    </div>
                </div>
                <div>
                    <label for="rec-data-nota">Data da nota</label>
                    <input type="date" id="rec-data-nota">
                </div>
                <div class="form-grid">
                    <div>
                        <label for="rec-periodo-ini">Leite entregue de</label>
                        <input type="date" id="rec-periodo-ini">
                    </div>
                    <div>
                        <label for="rec-periodo-fim">até</label>
                        <input type="date" id="rec-periodo-fim">
                    </div>
                </div>
                <div>
                    <label for="rec-descricao">Descrição</label>
                    <input type="text" id="rec-descricao" placeholder="Ex: venda de leite — outubro">
                </div>
            </details>
            ${datalistCompradores()}

            <button type="submit" class="primario">Registrar receita</button>
        </form>
    </div>`;
}

function datalistCompradores(){
    return `<datalist id="dl-compradores">${compradoresConhecidos().map(c=> `<option value="${escapeHtml(c.nome)}"></option>`).join("")}</datalist>`;
}

function selecionarTipoReceita(botao){
    selecionarChip(botao, "rec-tipo");
    atualizarFormReceita();
    recalcularReceita("tipo");
}

function atualizarFormReceita(){
    const campoTipo = document.getElementById("rec-tipo");
    if(!campoTipo) return;
    const ehLeite = campoTipo.value === "Venda de Leite";
    const litros = document.getElementById("rec-campo-litros");
    if(litros) litros.style.display = ehLeite ? "" : "none";
    const rotulo = document.getElementById("rec-valor-rotulo");
    if(rotulo) rotulo.textContent = ehLeite ? "Total da nota (valor bruto)" : "Valor recebido (bruto)";
    const ajuda = document.getElementById("rec-valor-ajuda");
    if(ajuda) ajuda.textContent = ehLeite
        ? "O VALOR TOTAL DA NOTA: já com incentivo e antes do desconto do Funrural."
        : "O valor da venda antes de qualquer desconto.";
    atualizarResumoReceita();
}

// Litros × preço preenche o total; o Funrural do leite é calculado sozinho
// (dá para mudar à mão em "Mais detalhes")
function recalcularReceita(origem){
    const campoValor = document.getElementById("rec-valor");
    if(!campoValor) return;
    const ehLeite = val("rec-tipo") === "Venda de Leite";

    if(ehLeite && (origem === "litros" || origem === "preco")){
        const litros = valorDoCampo("rec-litros");
        const preco = lerDecimalCampo("rec-preco");
        if(litros > 0 && preco > 0){
            definirDinheiroCampo("rec-valor", litros * preco);
            campoValor.dataset.auto = "1";
        }
    }
    if(origem === "valor") delete campoValor.dataset.auto;

    const campoAliq = document.getElementById("rec-aliquota");
    if(origem === "data" && campoAliq && campoAliq.dataset.manual !== "1"){
        campoAliq.value = formatarDecimal(aliquotaFunruralPadrao(val("rec-data")), 4);
    }

    const campoFun = document.getElementById("rec-funrural");
    if(campoFun && campoFun.dataset.manual !== "1"){
        definirDinheiroCampo("rec-funrural", ehLeite ? valorDoCampo("rec-valor") * lerDecimalCampo("rec-aliquota") / 100 : 0);
    }
    atualizarResumoReceita();
}

function atualizarResumoReceita(){
    const el = document.getElementById("rec-resumo");
    if(!el) return;
    const bruto = valorDoCampo("rec-valor");
    if(!(bruto > 0)){ el.innerHTML = ""; return; }
    const fun = valorDoCampo("rec-funrural");
    const aliq = lerDecimalCampo("rec-aliquota");
    const auto = (document.getElementById("rec-valor") || {}).dataset || {};
    el.innerHTML = `Funrural${fun > 0 && aliq ? ` (${formatarPercentual(aliq)})` : ""}: <strong>${dinheiro(fun)}</strong> · Cai na conta: <strong>${dinheiro(bruto - fun)}</strong>${auto.auto ? `<br><span>Total calculado: litros × preço. Pode ajustar.</span>` : ""}`;
}

function calcularFunrural(){
    const bruto = valorDoCampo("rec-valor");
    if(bruto <= 0){
        mostrarToast("Informe o total da nota primeiro");
        return;
    }
    const aliq = lerDecimalCampo("rec-aliquota") || aliquotaFunruralPadrao(val("rec-data"));
    const v = arred(bruto * aliq / 100);
    definirDinheiroCampo("rec-funrural", v);
    delete document.getElementById("rec-funrural").dataset.manual;
    atualizarResumoReceita();
    mostrarToast("Funrural calculado: " + dinheiro(v));
}

function adicionarReceita(evento){
    evento.preventDefault();
    const form = evento.target;
    const tipo = val("rec-tipo");
    const data = val("rec-data");
    const bruto = valorDoCampo("rec-valor");
    const funrural = valorDoCampo("rec-funrural");
    const incentivo = valorDoCampo("rec-incentivo");

    if(!data || !(bruto > 0)){
        mostrarToast("Preencha a data e o valor");
        return;
    }
    if(funrural > bruto){ mostrarToast("O Funrural não pode ser maior que o total"); return; }
    if(incentivo > bruto){ mostrarToast("O incentivo não pode ser maior que o total"); return; }

    const ehLeite = tipo === "Venda de Leite";
    const doc = {
        versao: 2, origem: "manual",
        data, tipo,
        valorBruto: arred(bruto),
        incentivo: arred(incentivo),
        litros: ehLeite ? valorDoCampo("rec-litros") : 0,
        preco: ehLeite ? lerDecimalCampo("rec-preco") : 0,
        aliquotaFunrural: lerDecimalCampo("rec-aliquota"),
        funrural: arred(funrural),
        valorLiquido: arred(bruto - funrural),
        notaFiscal: val("rec-nota").trim(),
        comprador: val("rec-comprador").trim(),
        dataNota: val("rec-data-nota"),
        periodoInicio: val("rec-periodo-ini"),
        periodoFim: val("rec-periodo-fim"),
        descricao: val("rec-descricao").trim(),
        anexos: []
    };

    const id = gravarNovo("receitas", doc);
    resetarFormulario(form);
    const outroAno = anoDe(data) !== anoSelecionado;
    if(outroAno) anoSelecionado = anoDe(data);
    renderizar();
    mostrarToast(textoSalvo(outroAno ? `Receita registrada em ${anoDe(data)}` : "Receita registrada"),
        { acao: { rotulo: "📎 Anexar nota", fn: ()=> abrirDetalhe("receitas", id, true) } });
}

// Volta o formulário ao estado inicial depois de salvar
function resetarFormulario(form){
    form.reset();
    form.querySelectorAll(".chip-grid[data-campo]").forEach(grade=>{
        const chips = grade.querySelectorAll(".chip");
        const campo = document.getElementById(grade.dataset.campo);
        if(campo && chips[0]) campo.value = chips[0].dataset.valor;
    });
    form.querySelectorAll("details").forEach(det=> det.open = false);
    form.querySelectorAll('input[oninput*="aplicarMascara"]').forEach(campo=>{
        delete campo.dataset.valorReal;
        delete campo.dataset.manual;
        delete campo.dataset.auto;
        campo.value = "";
    });
    const fun = form.querySelector("#rec-funrural");
    if(fun){ fun.value = "0,00"; fun.dataset.valorReal = "0"; }
    const aliq = form.querySelector("#rec-aliquota");
    if(aliq){ delete aliq.dataset.manual; aliq.value = formatarDecimal(aliquotaFunruralPadrao(val("rec-data")), 4); }
    form.querySelectorAll(".dica-fornecedor").forEach(d=> d.style.display = "none");
    sincronizarChips(form);
    atualizarFormReceita();
    atualizarFormCasa();
}

function renderListaReceitas(){
    const lista = dados.receitas
        .filter(r=> anoDe(r.data) === anoSelecionado)
        .sort((a, b)=> String(b.data).localeCompare(String(a.data)));
    return renderLivro(lista, "receitas", `Nenhuma receita em ${anoSelecionado}`);
}

// -------------------------------
// DESPESAS (custeio e investimento)
// -------------------------------

function renderFormDespesa(colecao, categorias, prefixo, titulo){
    const usaComuns = colecao === "despesasCusteio";
    const chips = usaComuns ? CATEGORIAS_CUSTEIO_COMUNS : categorias;
    return `
    <div class="painel-secao" data-chave="form-${prefixo}">
        <h3>${titulo}</h3>
        <button type="button" class="botao-importar" onclick="importarNotaCompra('${colecao}')"><span aria-hidden="true">📄</span> Importar nota de compra (PDF)</button>
        <p class="nota-rodape" style="margin:8px 0 18px;">Fornecedor, data, valor e parcelas saem da nota. Ou preencha abaixo.</p>

        <form onsubmit="adicionarDespesa('${colecao}',event,'${prefixo}')">
            <div>
                <label>Categoria</label>
                <div class="chip-grid" data-campo="${prefixo}-categoria">
                    ${chips.map((c, i)=> `<button type="button" class="chip ${i === 0 ? "selecionado" : ""}" data-valor="${escapeHtml(c)}" onclick="selecionarChip(this,'${prefixo}-categoria')">${escapeHtml(c)}</button>`).join("")}
                    ${usaComuns ? `<button type="button" class="chip chip-outras" data-valor="__outras__" onclick="selecionarChip(this,'${prefixo}-categoria')">Outras ▾</button>` : ""}
                </div>
                <input type="hidden" id="${prefixo}-categoria" value="${escapeHtml(chips[0])}">
                ${usaComuns ? `
                <select id="${prefixo}-categoria-outras" class="campo-categoria-outras" style="display:none;margin-top:8px;" aria-label="Outras categorias" onchange="selecionarCategoriaOutras(this,'${prefixo}-categoria')">
                    ${categorias.map(c=> `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
                </select>` : ""}
            </div>

            <div class="campo-valor-grande">
                <label for="${prefixo}-valor">Valor ${usaComuns ? "" : "total "}gasto</label>
                <div class="prefixo-rs">
                    <input type="text" inputmode="numeric" id="${prefixo}-valor" placeholder="0,00" oninput="aplicarMascaraValor(this)" required>
                </div>
            </div>

            <div>
                <label for="${prefixo}-fornecedor">Fornecedor / local <span class="opcional">(opcional)</span></label>
                <input type="text" id="${prefixo}-fornecedor" list="dl-forn-${prefixo}" autocomplete="off" placeholder="Ex: Celeiro Mineiro" oninput="aoDigitarFornecedor(this,'${prefixo}','${colecao}')">
                <p class="nota-rodape dica-fornecedor" id="${prefixo}-dica" style="display:none;"></p>
                ${datalistFornecedores("dl-forn-" + prefixo, [colecao])}
            </div>

            <div>
                <label for="${prefixo}-data">Data do pagamento</label>
                <input type="date" id="${prefixo}-data" value="${dataHoje()}" required>
            </div>

            <details class="mais-detalhes" data-id="${prefixo}-det">
                <summary>Mais detalhes (parcelas, nota, descrição)</summary>
                <div class="form-grid">
                    <div>
                        <label for="${prefixo}-parcelas">Nº de parcelas</label>
                        <input type="number" id="${prefixo}-parcelas" min="1" max="24" step="1" value="1">
                        <p class="nota-rodape">Cada parcela entra no mês em que for paga.</p>
                    </div>
                    <div>
                        <label for="${prefixo}-nota">Nota fiscal (nº)</label>
                        <input type="text" id="${prefixo}-nota">
                    </div>
                </div>
                <div>
                    <label for="${prefixo}-descricao">Descrição</label>
                    <input type="text" id="${prefixo}-descricao" placeholder="Detalhe do gasto">
                </div>
            </details>

            <button type="submit" class="primario">Registrar despesa</button>
        </form>
    </div>`;
}

function adicionarDespesa(colecao, evento, prefixo){
    evento.preventDefault();
    const form = evento.target;
    const listaCategorias = colecao === "despesasCusteio" ? CATEGORIAS_CUSTEIO : CATEGORIAS_INVESTIMENTO;

    // Antes, escolher "Outras ▾" sem mexer na lista gravava "__outras__"
    let categoria = val(prefixo + "-categoria");
    if(!listaCategorias.includes(categoria)){
        const outras = document.getElementById(prefixo + "-categoria-outras");
        categoria = outras ? outras.value : listaCategorias[0];
    }

    const data = val(prefixo + "-data");
    const valorTotal = valorDoCampo(prefixo + "-valor");
    const parcelas = Math.max(1, Math.min(24, Math.floor(Number(val(prefixo + "-parcelas") || 1))));
    if(!data || !(valorTotal > 0)){
        mostrarToast("Preencha a data e o valor");
        return;
    }
    const fornecedor = val(prefixo + "-fornecedor").trim();
    const descricao = val(prefixo + "-descricao").trim();
    const notaFiscal = val(prefixo + "-nota").trim();

    const valorBase = Math.floor((valorTotal / parcelas) * 100) / 100;
    const valorUltima = arred(valorTotal - valorBase * (parcelas - 1));
    const grupo = parcelas > 1 ? gerarId() : null;
    const anoInicial = anoDe(data);
    let caiEmOutroAno = false;
    const ids = [];

    for(let i = 0; i < parcelas; i++){
        const dataParcela = somarMeses(data, i);      // 31/01 → 28/02 → 31/03
        if(anoDe(dataParcela) !== anoInicial) caiEmOutroAno = true;
        const doc = {
            data: dataParcela, categoria, fornecedor, notaFiscal,
            descricao: parcelas > 1 ? `${descricao}${descricao ? " — " : ""}parcela ${i+1}/${parcelas}` : descricao,
            valor: i === parcelas - 1 ? valorUltima : valorBase,
            anexos: []
        };
        if(grupo) doc.grupoParcelaId = grupo;
        ids.push(gravarNovo(colecao, doc));
    }

    resetarFormulario(form);
    if(anoInicial !== anoSelecionado) anoSelecionado = anoInicial;
    renderizar();
    const aviso = caiEmOutroAno ? " (algumas parcelas caem no ano seguinte)" : "";
    mostrarToast(textoSalvo(parcelas > 1 ? `Despesa registrada em ${parcelas}x${aviso}` : "Despesa registrada"),
        { acao: { rotulo: "📎 Anexar nota", fn: ()=> abrirDetalhe(colecao, ids[0], true) } });
}

function renderListaDespesa(colecao){
    const lista = dados[colecao]
        .filter(d=> anoDe(d.data) === anoSelecionado)
        .sort((a, b)=> String(b.data).localeCompare(String(a.data)));
    return renderLivro(lista, colecao, `Nenhum lançamento em ${anoSelecionado}`);
}

// -------------------------------
// CASA
// -------------------------------

function renderFormCasa(){
    return `
    <div class="painel-secao" data-chave="form-casa">
        <h3>Novo gasto de Casa</h3>
        <form onsubmit="adicionarCasa(event)">
            <div>
                <label>Tipo</label>
                <div class="chip-grid" data-campo="casa-tipo">
                    ${TIPOS_CASA.map((t, i)=> `<button type="button" class="chip ${i === 0 ? "selecionado" : ""}" data-valor="${escapeHtml(t.valor)}" onclick="selecionarChip(this,'casa-tipo')">${escapeHtml(t.valor)}</button>`).join("")}
                </div>
                <input type="hidden" id="casa-tipo" value="${escapeHtml(TIPOS_CASA[0].valor)}">
            </div>

            <div class="campo-valor-grande">
                <label for="casa-valor">Valor gasto</label>
                <div class="prefixo-rs">
                    <input type="text" inputmode="numeric" id="casa-valor" placeholder="0,00" oninput="aplicarMascaraValor(this)" required>
                </div>
            </div>

            <div>
                <label for="casa-fornecedor">Local / fornecedor <span class="opcional">(opcional)</span></label>
                <input type="text" id="casa-fornecedor" list="dl-forn-casa" autocomplete="off" placeholder="Ex: Farmácia, Mercado, Escola..." oninput="aoDigitarFornecedor(this,'casa','casa')">
                <p class="nota-rodape dica-fornecedor" id="casa-dica" style="display:none;"></p>
                ${datalistFornecedores("dl-forn-casa", ["despesasDedutiveis","gastosPessoais"])}
            </div>

            <div>
                <label for="casa-data">Data</label>
                <input type="date" id="casa-data" value="${dataHoje()}" required>
            </div>

            <details class="mais-detalhes" data-id="casa-det">
                <summary>Mais detalhes (opcional)</summary>
                <div id="casa-campo-dependente">
                    <label for="casa-dependente">Para quem (saúde/educação)</label>
                    <input type="text" id="casa-dependente" placeholder="Nome (ou 'Titular')">
                </div>
                <div>
                    <label for="casa-descricao">Descrição</label>
                    <input type="text" id="casa-descricao" placeholder="Detalhe do gasto">
                </div>
            </details>
            <button type="submit" class="primario">Registrar gasto</button>
        </form>
    </div>`;
}

function atualizarFormCasa(){
    const campo = document.getElementById("casa-tipo");
    const dep = document.getElementById("casa-campo-dependente");
    if(campo && dep) dep.style.display = infoTipoCasa(campo.value).dedutivel ? "" : "none";
}

function adicionarCasa(evento){
    evento.preventDefault();
    const form = evento.target;
    const data = val("casa-data");
    const tipo = val("casa-tipo");
    const valor = valorDoCampo("casa-valor");
    if(!data || !(valor > 0)){
        mostrarToast("Preencha a data e o valor");
        return;
    }
    const info = infoTipoCasa(tipo);
    const doc = {
        data, tipo,
        fornecedor: val("casa-fornecedor").trim(),
        descricao: val("casa-descricao").trim(),
        valor: arred(valor),
        anexos: []
    };
    if(info.dedutivel) doc.dependente = val("casa-dependente").trim();

    const id = gravarNovo(info.colecao, doc);
    resetarFormulario(form);
    if(anoDe(data) !== anoSelecionado) anoSelecionado = anoDe(data);
    renderizar();
    mostrarToast(textoSalvo("Gasto registrado"),
        info.dedutivel ? { acao: { rotulo: "📎 Anexar recibo", fn: ()=> abrirDetalhe(info.colecao, id, true) } } : undefined);
}

function renderListaCasa(){
    const lista = [
        ...dados.despesasDedutiveis.map(d=> ({ colecao: "despesasDedutiveis", item: d })),
        ...dados.gastosPessoais.map(d=> ({ colecao: "gastosPessoais", item: d }))
    ]
        .filter(x=> anoDe(x.item.data) === anoSelecionado)
        .sort((a, b)=> String(b.item.data).localeCompare(String(a.item.data)));

    if(!lista.length){
        return `<div class="livro"><div class="empty"><strong>Nenhum gasto de casa em ${anoSelecionado}</strong>Use o formulário acima para começar.</div></div>`;
    }
    return `<div class="livro">${lista.map(x=> linhaLancamento(x.colecao, x.item)).join("")}</div>`;
}

// -------------------------------
// LISTA (livro-caixa)
// -------------------------------

function renderLivro(lista, colecao, textoVazio){
    if(!lista.length){
        return `<div class="livro"><div class="empty"><strong>${textoVazio}</strong>Use o formulário acima para começar.</div></div>`;
    }
    return `<div class="livro">${lista.map(i=> linhaLancamento(colecao, i)).join("")}</div>`;
}

function descricaoLancamento(colecao, d){
    if(colecao === "receitas"){
        const titulo = `${escapeHtml(d.tipo)}${d.litros > 0 ? ` · ${numero(d.litros)} L` : ""}${d.preco > 0 ? ` · ${formatarPreco(d.preco)}/L` : ""}`;
        const partes = [];
        if(d.funrural > 0) partes.push(`Funrural ${dinheiro(d.funrural)} · na conta ${dinheiro(liquidoDe(d))}`);
        if(d.incentivo > 0) partes.push(`incentivo ${dinheiro(d.incentivo)}${d.versao ? "" : " (à parte?)"}`);
        if(d.notaFiscal) partes.push(`NF ${escapeHtml(d.notaFiscal)}`);
        if(d.comprador) partes.push(escapeHtml(d.comprador));
        if(d.periodoInicio) partes.push(`Ref: ${formatarData(d.periodoInicio)}${d.periodoFim ? " a " + formatarData(d.periodoFim) : ""}`);
        if(d.descricao) partes.push(escapeHtml(d.descricao));
        return { titulo, sub: partes.join(" · ") || "—" };
    }
    if(colecao === "despesasDedutiveis" || colecao === "gastosPessoais"){
        const dedutivel = colecao === "despesasDedutiveis";
        return {
            titulo: `${escapeHtml(d.tipo)}${dedutivel ? ` — ${escapeHtml(d.dependente || "Titular")}` : ""}`,
            sub: [d.descricao, d.fornecedor].filter(Boolean).map(escapeHtml).join(" · ") || "—"
        };
    }
    return {
        titulo: `${escapeHtml(d.categoria)}${d.fornecedor ? ` · ${escapeHtml(d.fornecedor)}` : ""}`,
        sub: [d.descricao, d.notaFiscal ? "NF " + d.notaFiscal : ""].filter(Boolean).map(escapeHtml).join(" · ") || "—"
    };
}

function linhaLancamento(colecao, d){
    const id = idSeguro(d.id);
    if(!id) return "";
    const { titulo, sub } = descricaoLancamento(colecao, d);
    const ehReceita = colecao === "receitas";
    const valor = ehReceita ? receitaBruta(d) : d.valor;
    const selos = [];
    if(d._pendente) selos.push(`<span class="badge pendente">⏳ aguardando sinal</span>`);
    if(ehReceita && !d.versao && Number(d.incentivo) > 0) selos.push(`<span class="badge gold">confira</span>`);
    if(colecao === "despesasDedutiveis") selos.push(`<span class="badge brand">Dedutível</span>`);
    if(colecao === "gastosPessoais") selos.push(`<span class="badge gold">Pessoal</span>`);

    return `
    <div class="livro-linha" role="button" tabindex="0" onclick="abrirDetalhe('${colecao}','${id}')" onkeydown="if(event.key==='Enter') abrirDetalhe('${colecao}','${id}')" style="cursor:pointer;">
        <div class="livro-data">${formatarData(d.data)}</div>
        <div class="livro-desc">
            <strong>${titulo}</strong>
            <span>${sub}</span>
            ${selos.length ? `<div class="selos">${selos.join("")}</div>` : ""}
        </div>
        <div class="livro-valor ${ehReceita ? "entrada" : "saida"}">${dinheiro(valor)}</div>
        <div class="livro-acoes">
            ${botaoAnexo(colecao, id, d.anexos)}
            <button type="button" class="btn-anexo" aria-label="Repetir este lançamento" onclick="event.stopPropagation(); repetirLancamento('${colecao}','${id}')">⟳</button>
            <button type="button" class="excluir" onclick="excluirItem('${colecao}','${id}',event)">Excluir</button>
        </div>
    </div>`;
}

// -------------------------------
// FORNECEDORES — autocompletar e categoria pelo histórico
// -------------------------------

function datalistFornecedores(idLista, colecoes){
    return `<datalist id="${idLista}">${memoriaFornecedores(colecoes).map(f=> `<option value="${escapeHtml(f.nome)}"></option>`).join("")}</datalist>`;
}

function aoDigitarFornecedor(input, prefixo, colecao){
    const colecoes = colecao === "casa" ? ["despesasDedutiveis","gastosPessoais"] : [colecao];
    const chave = normalizarTexto(input.value);
    const dica = document.getElementById(prefixo + "-dica");
    const f = chave ? memoriaFornecedores(colecoes).find(x=> x.chave === chave) : null;
    const idCampo = prefixo === "casa" ? "casa-tipo" : prefixo + "-categoria";
    const campo = document.getElementById(idCampo);

    if(f && f.categoria && campo){
        campo.value = f.categoria;
        sincronizarChips(document);
        if(prefixo === "casa") atualizarFormCasa();
        if(dica){
            dica.textContent = `✓ ${prefixo === "casa" ? "Tipo" : "Categoria"} escolhida pelo que você já lançou: ${f.categoria}`;
            dica.style.display = "block";
        }
    }else if(dica){
        dica.style.display = "none";
    }
}

// -------------------------------
// CHIPS (botões de categoria)
// -------------------------------

function selecionarChip(botao, idCampo){
    const grade = botao.closest(".chip-grid");
    grade.querySelectorAll(".chip").forEach(b=> b.classList.remove("selecionado"));
    botao.classList.add("selecionado");
    const campo = document.getElementById(idCampo);
    const outras = document.getElementById(idCampo + "-outras");

    if(botao.dataset.valor === "__outras__"){
        if(outras){
            outras.style.display = "block";
            campo.value = outras.value;       // nunca grava "__outras__"
            try{ outras.focus(); }catch(e){}
        }
    }else{
        campo.value = botao.dataset.valor;
        if(outras) outras.style.display = "none";
    }
    if(idCampo === "casa-tipo") atualizarFormCasa();
}

function selecionarCategoriaOutras(select, idCampo){
    document.getElementById(idCampo).value = select.value;
}

// Deixa os chips de acordo com o valor guardado no campo escondido
function sincronizarChips(raiz){
    (raiz || document).querySelectorAll(".chip-grid[data-campo]").forEach(grade=>{
        const campo = document.getElementById(grade.dataset.campo);
        if(!campo) return;
        const valor = campo.value;
        const chips = Array.from(grade.querySelectorAll(".chip"));
        const outras = document.getElementById(grade.dataset.campo + "-outras");
        let alvo = chips.find(c=> c.dataset.valor === valor);
        if(!alvo && outras){
            alvo = chips.find(c=> c.dataset.valor === "__outras__");
            if(Array.from(outras.options).some(o=> o.value === valor)) outras.value = valor;
        }
        chips.forEach(c=> c.classList.toggle("selecionado", c === alvo));
        if(outras) outras.style.display = (alvo && alvo.dataset.valor === "__outras__") ? "block" : "none";
    });
}

// -------------------------------
// JANELA DE DETALHE — ver, editar, repetir, excluir, comprovantes
// -------------------------------

let detalheAtual = null;
let contadorDetalhe = 0;

function abrirDetalhe(colecao, id, focoAnexos){
    detalheAtual = { modo: "editar", colecao, id, n: ++contadorDetalhe };
    mostrarPicker = false;
    listaModalAtual = null;
    renderizar();
    if(focoAnexos){
        setTimeout(()=>{
            const el = document.getElementById("det-anexos");
            if(el && el.scrollIntoView) el.scrollIntoView({ block: "start", behavior: "smooth" });
        }, 60);
    }
}

function fecharDetalhe(){
    detalheAtual = null;
    renderizar();
}

function repetirLancamento(colecao, id){
    const item = itemPorId(colecao, id);
    if(!item) return;
    const base = limparParaSalvar(item);
    ["anexos","grupoParcelaId","chave","notaFiscal","serie","origem","dataNota","vencimento",
     "periodoInicio","periodoFim","compradorCnpj","valorLeite","precoLeite"].forEach(k=> delete base[k]);
    base.data = dataHoje();
    if(base.descricao) base.descricao = String(base.descricao).replace(/\s*—?\s*parcela \d+\/\d+$/i, "").trim();
    detalheAtual = { modo: "novo", colecao, base, n: ++contadorDetalhe };
    renderizar();
}

function tipoFormulario(colecao){
    if(colecao === "receitas") return "receita";
    if(colecao === "despesasDedutiveis" || colecao === "gastosPessoais") return "casa";
    return colecao === "despesasInvestimento" ? "investimento" : "custeio";
}

function tituloDetalhe(colecao){
    return { receita: "💰 Receita", custeio: "🧾 Gasto do dia a dia", investimento: "🔧 Investimento", casa: "🏠 Gasto de casa" }[tipoFormulario(colecao)];
}

function opcoesSelect(lista, atual){
    const todas = lista.includes(atual) || !atual ? lista : [atual, ...lista];
    return todas.map(o=> `<option value="${escapeHtml(o)}" ${o === atual ? "selected" : ""}>${escapeHtml(o)}</option>`).join("");
}

function camposDetalhe(colecao, d){
    const tipo = tipoFormulario(colecao);
    const campoData = (rotulo)=> `
        <div>
            <label for="det-data">${rotulo}</label>
            <input type="date" id="det-data" value="${escapeHtml(d.data || "")}" required>
        </div>`;

    if(tipo === "receita"){
        const ehLeite = d.tipo === "Venda de Leite";
        return `
        <div class="form-grid">
            <div>
                <label for="det-tipo">Tipo</label>
                <select id="det-tipo" onchange="atualizarDetalheDinamico()">${opcoesSelect(TIPOS_RECEITA, d.tipo)}</select>
            </div>
            ${campoData("Data do pagamento")}
        </div>
        <div>
            <label for="det-valor">Total da nota (valor bruto)</label>
            <input type="text" inputmode="numeric" id="det-valor" ${atributosDinheiro(receitaBruta(d))} oninput="aplicarMascaraValor(this)">
            ${!d.versao && Number(d.incentivo) > 0 ? `<p class="nota-rodape alerta-texto">⚠️ Lançada na versão antiga com incentivo à parte (${dinheiro(d.incentivo)}). Confira se este total já inclui o incentivo. Ao salvar, ela sai da lista de conferência.</p>` : ""}
        </div>
        <div class="form-grid" id="det-campo-litros" style="${ehLeite ? "" : "display:none;"}">
            <div>
                <label for="det-litros">Litros</label>
                <input type="text" inputmode="numeric" id="det-litros" ${atributosInteiro(d.litros)} oninput="aplicarMascaraInteiro(this)">
            </div>
            <div>
                <label for="det-preco">Preço pago por litro (R$)</label>
                <input type="text" inputmode="decimal" id="det-preco" value="${escapeHtml(formatarDecimal(d.preco || "", 6))}">
            </div>
        </div>
        <div class="form-grid">
            <div>
                <label for="det-aliquota">Alíquota do Funrural (%)</label>
                <input type="text" inputmode="decimal" id="det-aliquota" value="${escapeHtml(formatarDecimal(d.aliquotaFunrural != null ? d.aliquotaFunrural : aliquotaFunruralPadrao(d.data), 4))}">
            </div>
            <div>
                <label for="det-funrural">Funrural retido</label>
                <input type="text" inputmode="numeric" id="det-funrural" ${atributosDinheiro(d.funrural || 0)} oninput="aplicarMascaraValor(this)">
            </div>
        </div>
        <div>
            <label for="det-incentivo">Desse total, quanto é incentivo/bonificação</label>
            <input type="text" inputmode="numeric" id="det-incentivo" ${atributosDinheiro(d.incentivo || 0)} oninput="aplicarMascaraValor(this)">
        </div>
        <details class="mais-detalhes" data-id="det-mais">
            <summary>Dados da nota</summary>
            <div class="form-grid">
                <div>
                    <label for="det-nf">Nota fiscal (nº)</label>
                    <input type="text" id="det-nf" value="${escapeHtml(d.notaFiscal || "")}">
                </div>
                <div>
                    <label for="det-data-nota">Data da nota</label>
                    <input type="date" id="det-data-nota" value="${escapeHtml(d.dataNota || "")}">
                </div>
            </div>
            <div>
                <label for="det-comprador">Comprador / cooperativa</label>
                <input type="text" id="det-comprador" list="dl-compradores-det" value="${escapeHtml(d.comprador || "")}">
                <datalist id="dl-compradores-det">${compradoresConhecidos().map(c=> `<option value="${escapeHtml(c.nome)}"></option>`).join("")}</datalist>
            </div>
            <div class="form-grid">
                <div>
                    <label for="det-per-ini">Leite entregue de</label>
                    <input type="date" id="det-per-ini" value="${escapeHtml(d.periodoInicio || "")}">
                </div>
                <div>
                    <label for="det-per-fim">até</label>
                    <input type="date" id="det-per-fim" value="${escapeHtml(d.periodoFim || "")}">
                </div>
            </div>
            <div>
                <label for="det-descricao">Descrição</label>
                <input type="text" id="det-descricao" value="${escapeHtml(d.descricao || "")}">
            </div>
            ${d.chave ? `<p class="nota-rodape">Chave de acesso: <span class="mono">${escapeHtml(d.chave)}</span></p>` : ""}
        </details>`;
    }

    if(tipo === "casa"){
        const info = infoTipoCasa(d.tipo);
        return `
        <div class="form-grid">
            <div>
                <label for="det-tipo">Tipo</label>
                <select id="det-tipo" onchange="atualizarDetalheDinamico()">${opcoesSelect(TIPOS_CASA.map(t=> t.valor), d.tipo)}</select>
            </div>
            ${campoData("Data")}
        </div>
        <div>
            <label for="det-valor">Valor</label>
            <input type="text" inputmode="numeric" id="det-valor" ${atributosDinheiro(d.valor)} oninput="aplicarMascaraValor(this)">
        </div>
        <div id="det-campo-dependente" style="${info.dedutivel ? "" : "display:none;"}">
            <label for="det-dependente">Para quem (saúde/educação)</label>
            <input type="text" id="det-dependente" value="${escapeHtml(d.dependente || "")}">
        </div>
        <div class="form-grid">
            <div>
                <label for="det-fornecedor">Local / fornecedor</label>
                <input type="text" id="det-fornecedor" value="${escapeHtml(d.fornecedor || "")}">
            </div>
            <div>
                <label for="det-descricao">Descrição</label>
                <input type="text" id="det-descricao" value="${escapeHtml(d.descricao || "")}">
            </div>
        </div>`;
    }

    const categorias = tipo === "investimento" ? CATEGORIAS_INVESTIMENTO : CATEGORIAS_CUSTEIO;
    return `
    <div class="form-grid">
        <div>
            <label for="det-categoria">Categoria</label>
            <select id="det-categoria">${opcoesSelect(categorias, d.categoria)}</select>
        </div>
        ${campoData("Data do pagamento")}
    </div>
    <div>
        <label for="det-valor">Valor</label>
        <input type="text" inputmode="numeric" id="det-valor" ${atributosDinheiro(d.valor)} oninput="aplicarMascaraValor(this)">
    </div>
    <div class="form-grid">
        <div>
            <label for="det-fornecedor">Fornecedor / local</label>
            <input type="text" id="det-fornecedor" value="${escapeHtml(d.fornecedor || "")}">
        </div>
        <div>
            <label for="det-nf">Nota fiscal (nº)</label>
            <input type="text" id="det-nf" value="${escapeHtml(d.notaFiscal || "")}">
        </div>
    </div>
    <div>
        <label for="det-descricao">Descrição</label>
        <input type="text" id="det-descricao" value="${escapeHtml(d.descricao || "")}">
    </div>`;
}

function atualizarDetalheDinamico(){
    const tipo = document.getElementById("det-tipo");
    if(!tipo) return;
    const litros = document.getElementById("det-campo-litros");
    if(litros) litros.style.display = tipo.value === "Venda de Leite" ? "" : "none";
    const dep = document.getElementById("det-campo-dependente");
    if(dep) dep.style.display = infoTipoCasa(tipo.value).dedutivel ? "" : "none";
}

function renderModalDetalhe(){
    if(!detalheAtual) return "";
    const { modo, colecao, id, n } = detalheAtual;
    const item = modo === "editar" ? itemPorId(colecao, id) : detalheAtual.base;
    if(!item) return "";
    const titulo = modo === "novo" ? "⟳ Novo lançamento igual" : tituloDetalhe(colecao);
    const idOk = idSeguro(id);

    return `
    <div class="modal-fundo" onclick="if(event.target===this) fecharDetalhe()">
        <div class="modal-caixa larga" data-chave="detalhe:${n}" role="dialog" aria-modal="true" aria-label="${escapeHtml(titulo)}">
            <h3>${titulo}</h3>
            ${modo === "novo" ? `<p class="subtitulo-secao" style="margin-top:0;">Confira a data e o valor e salve.</p>` : ""}
            ${item._pendente ? `<p><span class="badge pendente">⏳ aguardando sinal para subir</span></p>` : ""}
            <form id="form-detalhe" onsubmit="salvarDetalhe(event)">
                ${camposDetalhe(colecao, item)}
                <button type="submit" class="primario">${modo === "novo" ? "✅ Salvar lançamento" : "✅ Salvar alterações"}</button>
            </form>
            ${modo === "editar" ? secaoAnexos(colecao, item) : ""}
            ${modo === "editar" ? `
            <div class="botoes-modal">
                <button type="button" class="secundario" onclick="repetirLancamento('${colecao}','${idOk}')">⟳ Repetir</button>
                <button type="button" class="excluir" onclick="excluirItem('${colecao}','${idOk}')">🗑️ Excluir</button>
            </div>` : ""}
            <button type="button" class="picker-fechar" onclick="fecharDetalhe()">Fechar</button>
        </div>
    </div>`;
}

function salvarDetalhe(evento){
    if(evento) evento.preventDefault();
    if(!detalheAtual) return;
    const { modo, colecao, id } = detalheAtual;
    const original = modo === "editar" ? itemPorId(colecao, id) : detalheAtual.base;
    if(!original){ fecharDetalhe(); return; }

    const tipoForm = tipoFormulario(colecao);
    const data = val("det-data");
    if(!data){ mostrarToast("Preencha a data"); return; }

    let novo = { data };
    let destino = colecao;

    if(tipoForm === "receita"){
        const bruto = valorDoCampo("det-valor");
        const fun = valorDoCampo("det-funrural");
        const inc = valorDoCampo("det-incentivo");
        if(!(bruto > 0)){ mostrarToast("Preencha o valor"); return; }
        if(fun > bruto){ mostrarToast("O Funrural não pode ser maior que o total"); return; }
        if(inc > bruto){ mostrarToast("O incentivo não pode ser maior que o total"); return; }
        const tipo = val("det-tipo");
        const ehLeite = tipo === "Venda de Leite";
        Object.assign(novo, {
            tipo,
            valorBruto: arred(bruto), incentivo: arred(inc), funrural: arred(fun),
            aliquotaFunrural: lerDecimalCampo("det-aliquota"),
            valorLiquido: arred(bruto - fun),
            litros: ehLeite ? valorDoCampo("det-litros") : 0,
            preco: ehLeite ? lerDecimalCampo("det-preco") : 0,
            notaFiscal: val("det-nf").trim(),
            comprador: val("det-comprador").trim(),
            dataNota: val("det-data-nota"),
            periodoInicio: val("det-per-ini"),
            periodoFim: val("det-per-fim"),
            descricao: val("det-descricao").trim(),
            versao: 2
        });
    }else if(tipoForm === "casa"){
        const valor = valorDoCampo("det-valor");
        if(!(valor > 0)){ mostrarToast("Preencha o valor"); return; }
        const tipo = val("det-tipo");
        const info = infoTipoCasa(tipo);
        destino = info.colecao;
        Object.assign(novo, {
            tipo, valor: arred(valor),
            fornecedor: val("det-fornecedor").trim(),
            descricao: val("det-descricao").trim(),
            dependente: info.dedutivel ? val("det-dependente").trim() : ""
        });
    }else{
        const valor = valorDoCampo("det-valor");
        if(!(valor > 0)){ mostrarToast("Preencha o valor"); return; }
        Object.assign(novo, {
            categoria: val("det-categoria"),
            valor: arred(valor),
            fornecedor: val("det-fornecedor").trim(),
            notaFiscal: val("det-nf").trim(),
            descricao: val("det-descricao").trim()
        });
    }

    if(modo === "novo"){
        const novoId = gravarNovo(destino, Object.assign({}, novo, { anexos: [] }));
        detalheAtual = null;
        if(anoDe(data)) anoSelecionado = anoDe(data);
        renderizar();
        mostrarToast(textoSalvo("Lançamento registrado"),
            { acao: { rotulo: "📎 Anexar nota", fn: ()=> abrirDetalhe(destino, novoId, true) } });
        return;
    }

    const final = Object.assign(limparParaSalvar(original), novo);
    if(destino !== colecao){
        // Ex.: "Supermercado" virou "Saúde": muda de coleção (mesmo id)
        const lote = db.batch();
        lote.set(refDoc(destino, id), limparParaSalvar(final));
        lote.delete(refDoc(colecao, id));
        lote.commit().catch(erroGravacao);
    }else{
        gravarDoc(colecao, id, final);
    }
    detalheAtual = null;
    renderizar();
    mostrarToast(textoSalvo("Alterações salvas"));
}

// -------------------------------
// EXCLUIR (com "Desfazer")
// -------------------------------

let modalExclusaoAtual = null;

function excluirItem(colecao, id, evento){
    if(evento) evento.stopPropagation();
    const item = itemPorId(colecao, id);
    if(!item) return;
    if(item.grupoParcelaId && dados[colecao].filter(i=> i.grupoParcelaId === item.grupoParcelaId).length > 1){
        modalExclusaoAtual = { colecao, id, grupoParcelaId: item.grupoParcelaId };
        renderizar();
        return;
    }
    if(!confirm("Excluir este lançamento?")) return;
    excluirComDesfazer(colecao, [item]);
}

function excluirSoEsta(colecao, id){
    const item = itemPorId(colecao, id);
    fecharModalExclusao();
    if(item) excluirComDesfazer(colecao, [item]);
}

function excluirGrupoParcelas(colecao, grupo){
    const itens = dados[colecao].filter(i=> i.grupoParcelaId === grupo);
    fecharModalExclusao();
    excluirComDesfazer(colecao, itens);
}

function excluirComDesfazer(colecao, itens){
    if(!itens.length) return;
    const copias = itens.map(i=> ({ id: i.id, doc: limparParaSalvar(i) }));
    const lote = db.batch();
    copias.forEach(c=> lote.delete(refDoc(colecao, c.id)));
    lote.commit().catch(erroGravacao);

    if(detalheAtual && detalheAtual.colecao === colecao && copias.some(c=> c.id === detalheAtual.id)) detalheAtual = null;
    renderizar();

    mostrarToast(copias.length > 1 ? `${copias.length} parcelas excluídas` : "Lançamento excluído", {
        acao: {
            rotulo: "Desfazer",
            fn: ()=>{
                const volta = db.batch();
                copias.forEach(c=> volta.set(refDoc(colecao, c.id), c.doc));
                volta.commit().catch(erroGravacao);
                mostrarToast(copias.length > 1 ? "Parcelas recuperadas" : "Lançamento recuperado");
            }
        }
    });
}

function fecharModalExclusao(){
    modalExclusaoAtual = null;
    renderizar();
}

function renderModalExclusao(){
    if(!modalExclusaoAtual) return "";
    const { colecao, id, grupoParcelaId } = modalExclusaoAtual;
    const total = dados[colecao].filter(i=> i.grupoParcelaId === grupoParcelaId).length;
    const idOk = idSeguro(id), grupoOk = idSeguro(grupoParcelaId);
    return `
    <div class="modal-fundo" onclick="if(event.target===this) fecharModalExclusao()">
        <div class="modal-caixa" role="dialog" aria-modal="true" aria-label="Excluir parcela">
            <h3>Excluir parcela</h3>
            <p class="subtitulo-secao" style="margin-top:0;">
                Esse lançamento faz parte de uma compra dividida em ${total}x — algumas parcelas podem estar em outro ano.
                O que você quer excluir?
            </p>
            <button type="button" class="primario" style="margin-bottom:10px;" onclick="excluirSoEsta('${colecao}','${idOk}')">Só esta parcela</button>
            <button type="button" class="secundario largura-toda perigo" style="margin-bottom:10px;" onclick="excluirGrupoParcelas('${colecao}','${grupoOk}')">Excluir as ${total} parcelas</button>
            <button type="button" class="secundario largura-toda" onclick="fecharModalExclusao()">Cancelar</button>
        </div>
    </div>`;
}

// -------------------------------
// LISTAS RÁPIDAS (sem comprovante / receitas para conferir)
// -------------------------------

let listaModalAtual = null;

function abrirListaSemComprovante(){
    listaModalAtual = { tipo: "semComprovante", ano: anoSelecionado };
    renderizar();
}
function abrirListaRevisar(){
    listaModalAtual = { tipo: "revisar" };
    renderizar();
}
function fecharModalLista(){
    listaModalAtual = null;
    renderizar();
}

function renderModalLista(){
    if(!listaModalAtual) return "";
    const ehSemComprovante = listaModalAtual.tipo === "semComprovante";
    const titulo = ehSemComprovante ? `📎 Sem comprovante em ${listaModalAtual.ano}` : "Receitas antigas para conferir";
    const itens = ehSemComprovante
        ? lancamentosSemComprovante(listaModalAtual.ano)
        : receitasParaRevisar().map(item=> ({ colecao: "receitas", item }));
    const explicacao = ehSemComprovante
        ? "Toque num lançamento para anexar a foto ou o PDF da nota."
        : "Foram lançadas antes desta versão, com o incentivo à parte. Abra cada uma e confira se o total é o VALOR TOTAL DA NOTA (com incentivo). Se tiver o PDF da nota, é só importar: ele substitui o lançamento.";

    return `
    <div class="modal-fundo" onclick="if(event.target===this) fecharModalLista()">
        <div class="modal-caixa larga" role="dialog" aria-modal="true" aria-label="${escapeHtml(titulo)}">
            <h3>${titulo}</h3>
            <p class="subtitulo-secao" style="margin-top:0;">${explicacao}</p>
            ${itens.length === 0 ? `<p class="nota-rodape">Nada pendente. 👍</p>` : `
            <div class="lista-toque">
                ${itens.map(({ colecao, item })=>{
                    const { titulo: t } = descricaoLancamento(colecao, item);
                    const valor = colecao === "receitas" ? receitaBruta(item) : item.valor;
                    return `<button type="button" class="item-toque" onclick="abrirDetalhe('${colecao}','${idSeguro(item.id)}',${ehSemComprovante})">
                        <span class="mono">${formatarData(item.data)}</span>
                        <span class="item-toque-desc">${t}</span>
                        <strong>${dinheiro(valor)}</strong>
                    </button>`;
                }).join("")}
            </div>`}
            <button type="button" class="picker-fechar" onclick="fecharModalLista()">Fechar</button>
        </div>
    </div>`;
}
