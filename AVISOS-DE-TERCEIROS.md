# Avisos de terceiros

O Livro Caixa Rural usa as bibliotecas abaixo. Elas ficam na pasta `vendor/`,
para o app abrir sem internet. Cada uma mantém a sua licença.

| Biblioteca | Versão | Para quê | Licença | Arquivo |
|---|---|---|---|---|
| Firebase JavaScript SDK (compat) — Google LLC | 12.15.0 | Login e banco de dados na nuvem | Apache 2.0 | `vendor/firebase/LICENSE` |
| pdf.js (pdfjs-dist) — Mozilla Foundation | 4.10.38 | Ler o texto da nota fiscal em PDF | Apache 2.0 | `vendor/pdfjs/LICENSE` |
| xlsx-js-style (derivado do SheetJS Community Edition) | 1.2.0 | Gerar a planilha Excel | Apache 2.0 | `vendor/xlsx/LICENSE` |
| JSZip — Stuart Knightley e outros | 3.10.1 | Gerar o pacote .zip do contador | MIT (licença dupla MIT/GPLv3; usada sob MIT) | `vendor/jszip/LICENSE.markdown` |

## Calculadora de Tributos — Receita Federal do Brasil

A lista de códigos da reforma tributária mostrada na tela “Para a declaração”
(códigos 410014, 200002, 200054 e 515001, com a descrição de cada um) foi tirada
da tabela de classificação tributária (cClassTrib) do repositório
`calculadora-rtc-regime-regular`, publicado pela Receita Federal no GitHub.

```
MIT License

Copyright (c) 2026 Receita Federal do Brasil

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
