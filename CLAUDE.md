# Sistema SPG — padrão de telas

PWA estática (HTML + Tailwind CDN + JS puro) com dados no Supabase. Cada projeto é uma página em
`projetos/<id>/index.html`, aberta pelo Painel (`index.html`). Textos da interface em português do Brasil.

**Referência visual: a Irrigação (`projetos/irrigacao/index.html`).** Toda página nova (ou refeita) segue o
mesmo padrão abaixo. O Descarte de Parceiros (`projetos/descarte-parceiros/index.html`) é um exemplo menor
e completo do padrão, bom para copiar.

## Cabeçalho (`<head>`), nesta ordem

```html
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/lucide@latest"></script>               <!-- ícones: <i data-lucide="nome"> + lucide.createIcons() -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"></script>
<script src="../../supabase-config.js"></script>
<script src="../../supabase-api.js"></script>                           <!-- window.IrrigacaoAPI: login, módulos, fila offline -->
<script src="../../lista-moderna.js"></script>                          <!-- listas suspensas modernas (obrigatório) -->
<script src="../../trava-fundo.js"></script>                            <!-- trava a rolagem do fundo com modal aberto -->
<script src="../../seletor-periodo.js"></script>                        <!-- quando houver filtro de datas -->
<script src="../../barra-abas.js"></script>                             <!-- quando a página tiver abas -->
<script src="../../mais-filtros.js"></script>                           <!-- quando houver barra de filtros -->
```

Ícone da aba: `../../favicon.png`; ícone de app: `../../icone-app.png`.

## Componentes padrão

- **Barra do topo** (`#navbar`): vidro claro com um fio colorido em cima, sticky, com `icone-app.png`, título em
  `text-sm sm:text-[15px] font-extrabold` e subtítulo `text-[10px] font-semibold text-slate-400`.
  Copiar o CSS de `#navbar` / `#navbar::before` da Irrigação ou do Descarte.
- **Fundo**: `bg-slate-50`; conteúdo em `max-w-md lg:max-w-[1400px] mx-auto px-4`.
- **Abas**:
  - **Computador:** pílula segmentada no topo (`bg-slate-100/80 rounded-2xl ring-1 p-1`; a ativa fica
    `bg-white shadow-sm ring-1 text-emerald-700`).
  - **Celular:** a pílula do topo fica `hidden lg:block`, e as abas vão para a barra flutuante "liquid glass"
    do rodapé com `BarraAbas.criar({ rotulo, abas: () => [{ id, nome, icone, cor: 'r, g, b', ativa }], abrir })`.
    Chamar `barra.atualizar()` ao trocar de aba. A barra recolhe ao rolar e sai da frente do teclado.
- **Cartões**: `bg-white rounded-3xl shadow-sm ring-1 ring-slate-200/80 p-4`.
- **Campos**: rótulo com a classe `.rotulo` (ícone + texto uppercase cinza) e campo com a classe `.campo`
  (`bg-slate-50`, borda 2px `slate-200`, `rounded-xl`, foco verde). Copiar `.rotulo` e `.campo` do Descarte.
- **Listas suspensas**: sempre `<select>` normal + `lista-moderna.js`. Para manter a lista do navegador em algum
  campo, usar `data-nativo`. Para seleção múltipla, usar um painel com caixinhas (ver o filtro de Parceiro em
  Descarte → Recentes).
- **Filtros no celular ("Mais filtros")**: a caixa dos filtros leva `data-mais-filtros="nome"`. No celular fica
  à vista só o filtro principal (o primeiro filho, ou o marcado com `data-filtro-fixo`), e o resto abre no botão
  "Mais filtros", que mostra quantos estão em uso. Botões principais e barras de exibição levam `data-filtro-acao`
  e ficam sempre à vista. No computador nada muda.
- **Período**: `SeletorPeriodo.montar(...)` ou `SeletorPeriodo.paraCampos(...)` (Dia | Mês | Ano | Intervalo).
  Nunca usar `input type=date` solto para filtros de período.
- **Botões**:
  - **Principal:** `bg-gradient-to-b from-emerald-500 to-emerald-600 text-white rounded-xl shadow-md
    shadow-emerald-600/25 ring-1 ring-emerald-700/20 font-bold text-xs active:scale-95`.
  - **Secundário:** `bg-white ring-1 ring-slate-200 rounded-xl text-slate-600 font-bold text-xs`.
- **Tabelas**: dentro do cartão, com `overflow-auto`, cabeçalho fixo (`th` sticky) e primeira coluna fixa no
  celular. Os filtros ficam **fora** da área que rola: só a tabela rola.
- **Gráficos**: barras finas com ponta arredondada, uma cor por série, dica (tooltip) ao passar o dedo/mouse,
  e sempre cabendo na largura do cartão (sem rolagem lateral).
- **Imagens para enviar (WhatsApp)**: `html-to-image` com `pixelRatio` até 3, limitado a 15 MP para o iPhone:
  `Math.max(1, Math.min(3, Math.sqrt(15e6 / (largura * altura))))`.
- **Celular**: área de toque de 44px ou mais; nada fica escondido atrás da barra flutuante (o
  `barra-abas.js` já põe o espaço no `body`).

## Regras técnicas

- **Modelos de HTML dentro do `<script>`** (impressão, imagem): escrever `<\/script>`, `<\/body>`, `<\/html>`,
  `<\/head>`. Sem isso, o Live Server corta o script e o código aparece na página.
- **Dados**: Supabase via `window.IrrigacaoAPI` (`cliente`, `temModulo`, `isAdmin`, `nomeUsuario`). Gravações que
  precisam funcionar sem internet passam por `API.enfileirar(tabela, 'upsert' | 'update' | 'delete', dados)`.
- **Projeto novo**:
  - registrar em `PROJETOS` no `supabase-api.js` (módulos e recursos);
  - criar o SQL com RLS em `supabase/<nome>.sql` (`tem_modulo()`, `is_admin()`);
  - acrescentar os arquivos em `ARQUIVOS_APP` no `sw.js`.
- **Toda alteração**: subir a versão `CACHE = 'sistema-vNNN'` no `sw.js`, para os celulares baixarem a versão nova.
- **Conferir a sintaxe** dos scripts das páginas: extrair os `<script>` sem `src` e rodar `node --check`.
- **Nunca colocar segredos no código** (chaves ficam nos Secrets do Supabase).
