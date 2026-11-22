# Livro Caixa Rural — versão 2

App (PWA) de livro-caixa da atividade rural para fazenda de leite: receitas,
despesas, rebanho, financiamentos e os números para a declaração do IR.

---

## O que há de novo

**Nota do leite**
- **Importar a nota em PDF:** o app lê a nota da cooperativa no próprio celular e
  preenche tudo: litros, preço, incentivo, Funrural, fatura, período e chave de acesso.
  Antes de salvar, confere as contas da nota (leite + incentivo = total,
  total × alíquota = Funrural, total − Funrural = fatura) e anexa o PDF como comprovante.
- **Nota repetida:** a mesma nota (pela chave de acesso) não é lançada duas vezes.
  Importar o PDF de um mês lançado à mão substitui o lançamento antigo.
- **Receita certa:** a receita passa a ser o **total da nota** (com o incentivo).
  O Funrural fica numa linha própria e o líquido (o que cai na conta) é mostrado à parte.
- **Data do pagamento:** o lançamento entra no livro-caixa na data em que o dinheiro
  entrou (vencimento da fatura), não na data da nota. Nota de dezembro paga em janeiro
  vai para o ano seguinte.
- **Alíquota do Funrural pela data:** 1,5% até 31/03/2026 e 1,63% a partir de
  01/04/2026. Quando a nota informa a alíquota, vale a da nota.

**Lançar mais rápido**
- Nota de **compra** em PDF: fornecedor, data, valor e número saem da nota. Se a nota
  tem duplicatas, cada parcela é lançada na data do vencimento.
- O app **lembra o fornecedor**: ao digitar um nome já usado, a categoria vem marcada.
- **Editar** qualquer lançamento (toque na linha). Trocar Supermercado por Saúde move o
  gasto para os dedutíveis.
- **Repetir** (⟳): copia o lançamento com a data de hoje.
- **Desfazer** logo depois de excluir.
- **Sem internet:** salva na hora, mostra “aguardando sinal” e envia sozinho quando o sinal volta.

**Tela inicial**
- Entrou − saiu = sobrou no mês, **custo por litro**, preço recebido por litro e
  sobra por litro.
- Gráficos dos últimos 12 meses (toque num mês para ver os números dele) e tabela.
- Avisos: nota do leite do mês passado faltando, lançamentos sem comprovante e
  receitas antigas para conferir.

**Para a declaração**
- Resultado do ano e comparação **livro-caixa × opção dos 20% da receita bruta**
  (Lei 8.023/1990, art. 5º). Lembrete: quem escolhe os 20% perde os prejuízos de anos anteriores.
- Receitas e despesas **mês a mês**, como pede a ficha da atividade rural.
- **Movimentação do rebanho** (nascimentos, compras, vendas, mortes) em cabeças.
- **Financiamentos** (ficha de dívidas): saldo em 31/12 e valor pago no ano.
- Investimentos do ano (bens), checklist de lançamentos suspeitos e histórico ano a ano.
- Aviso da **reforma tributária (IBS/CBS)** com os códigos que interessam ao produtor
  rural não contribuinte (tirados das tabelas da Calculadora de Tributos da Receita Federal).

**Exportar**
- Excel com abas novas (mês a mês, rebanho, dívidas, propriedade, links dos comprovantes,
  datas de verdade).
- **Pacote do contador:** um .zip com a planilha e todos os comprovantes do ano, separados
  por pasta, e um LEIA-ME com o que está sem comprovante.
- **Backup completo** (com rebanho, financiamentos e links dos comprovantes). Restaurar
  baixa antes uma cópia dos dados atuais e mantém os mesmos lançamentos.

**Correções da versão anterior**
- Data padrão em UTC (depois das 21h já vinha o dia seguinte).
- Formulário apagado quando chegava dado novo da nuvem.
- Parcelas que pulavam fevereiro (31/01 → 03/03).
- Categoria “__outras__” gravada por engano.
- Aba “Pessoal” do Excel com a categoria vazia.
- Backup que perdia os links dos comprovantes (e a restauração que apagava tudo antes).
- Aviso “anexado” quando o envio falhava.
- Ao sair da conta, os dados ficavam guardados no celular.
- Página que “escorregava” para os lados no celular por causa das tabelas.
- Esqueci minha senha.

---

## Como publicar

1. Troque os arquivos do site/repositório pelos desta pasta, **mantendo as pastas**
   `js/`, `vendor/` e `icons/`.
2. Abra o app uma vez com internet: ele guarda tudo para funcionar sem sinal
   (inclusive o leitor de PDF e o Excel).
3. Quem já usa o app recebe a versão nova sozinho ao abrir (pode precisar fechar e
   abrir de novo).

Os dados na nuvem continuam os mesmos: nada precisa ser migrado.

---

## 3 passos para fazer nos painéis (só uma vez)

### 1. Regras de segurança do Firestore (importante)
Firebase → **Firestore Database** → **Regras** → apague o que estiver lá, cole o
conteúdo do arquivo `firestore.rules` e toque em **Publicar**.
Assim cada conta só enxerga os próprios dados.

### 2. Abrir os PDFs no Cloudinary
Em contas gratuitas, o Cloudinary bloqueia a entrega de PDF. Se os comprovantes em PDF
não abrirem pelo link: Cloudinary → **Settings → Security** → marque
**“Allow delivery of PDF and ZIP files”** → **Save**.

### 3. Limitar o que pode ser enviado
Cloudinary → **Settings → Upload → Upload presets** → editar o preset **“livro caixa”**
→ aba **Upload Control** → **Allowed formats**: `jpg, jpeg, png, webp, heic, pdf`.
(O limite de 8 MB por arquivo já é feito pelo app.)

**O que continua igual:** quem tiver o link de um comprovante consegue abri-lo (os links
são difíceis de adivinhar), e tirar um comprovante do lançamento não apaga o arquivo do
Cloudinary. Resolver isso exige um pequeno servidor guardando a senha do Cloudinary.

---

## Lançamentos antigos

- Nada foi alterado nos dados. As receitas antigas que tinham o incentivo digitado à
  parte aparecem com o selo **“confira”** e num aviso da tela inicial: abra cada uma e
  confira se o valor é o **total da nota**, ou importe o PDF daquele mês (ele substitui o
  lançamento).

## Para conversar com o contador

- **Funrural:** o app desconta o Funrural retido do resultado (era assim antes). Dá
  para desligar em **Mais → Configurações**.
- **Data:** receitas e despesas entram na data do pagamento (regime de caixa).
- **Opção dos 20%:** a tela “Para a declaração” mostra as duas bases; marque o ano em
  que a opção for usada para o app zerar o prejuízo acumulado.

---

## Arquivos

```
index.html            página do app
app.js                navegação, login, tela "Mais" e desenho da tela
js/util.js            datas, dinheiro, campos com máscara, avisos
js/dados.js           Firebase, sincronização e todos os cálculos
js/nota-pdf.js        leitura da nota em PDF (leite e compra)
js/lancamentos.js     formulários, listas, editar/repetir/desfazer, comprovantes
js/painel.js          tela inicial, gráficos e avisos
js/declaracao.js      "Para a declaração", rebanho e financiamentos
js/exportar.js        Excel, backup e pacote do contador
service-worker.js     funcionamento sem internet
firestore.rules       regras de segurança do banco
vendor/               bibliotecas (Firebase, pdf.js, Excel, ZIP)
AVISOS-DE-TERCEIROS.md licenças das bibliotecas e da tabela da Receita
```
