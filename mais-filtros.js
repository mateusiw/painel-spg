// "Mais filtros" no celular (padrão do Sistema SPG, como no Estoque): em vez de mostrar todos os filtros
// de uma vez, fica à vista só o principal (busca ou período) e o resto abre num botão.
// No computador nada muda.
//
// Uso: marque a caixa dos filtros com data-mais-filtros. Os filhos diretos dela são os filtros.
//   data-filtro-fixo  -> filho que fica sempre à vista (se nenhum for marcado, o primeiro filho fica)
//   data-filtro-acao  -> filho que também fica sempre à vista (botão principal, avisos, barra de exibição)
// O botão mostra quantos filtros escondidos estão em uso: "Mais filtros · 2".
// Caixas criadas depois (telas que redesenham) são preparadas sozinhas.
(function () {
    'use strict';
    if (window.MaisFiltros) return;

    const estilo = document.createElement('style');
    estilo.textContent = `
        .mf-botao { display: none; }
        @media (max-width: 1023px) {
            [data-mais-filtros]:not(.mf-aberto) > :not([data-filtro-fixo]):not([data-filtro-acao]):not(.mf-botao) { display: none !important; }
            .mf-botao {
                display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; grid-column: 1 / -1;
                min-height: 44px; padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 14px; background: #fff;
                font: inherit; font-size: 13px; font-weight: 700; color: #334155; cursor: pointer;
                -webkit-tap-highlight-color: transparent; transition: background-color .15s, transform .1s;
            }
            .mf-botao:active { transform: scale(.98); background: #f8fafc; }
            .mf-botao svg { width: 16px; height: 16px; color: #059669; flex: none; transition: transform .2s; }
            .mf-aberto > .mf-botao svg.mf-seta { transform: rotate(180deg); }
            .mf-conta { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; background: #059669; color: #fff; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }
            .mf-conta[hidden] { display: none; }
        }
        @media print { .mf-botao { display: none !important; } }
    `;
    (document.head || document.documentElement).appendChild(estilo);

    const ICONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/></svg>';
    const SETA = '<svg class="mf-seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

    // Quantos filtros escondidos estão em uso (campo preenchido, caixinha marcada ou lista com valor)
    function emUso(caixa) {
        let n = 0;
        [...caixa.children].forEach(filho => {
            if (filho.matches('[data-filtro-fixo], [data-filtro-acao], .mf-botao')) return;
            const campos = filho.matches('input, select, textarea') ? [filho] : [...filho.querySelectorAll('input, select, textarea')];
            // Cada campo em uso conta um. Lista suspensa: conta quando sai da primeira opção ("Todos", "Todas"...).
            // Grupo de caixinhas (ex.: seleção múltipla) conta um, se tiver alguma marcada.
            const grupos = new Set();
            campos.forEach(c => {
                if (c.type === 'hidden' || c.type === 'button' || c.type === 'submit' || c.type === 'search' && c.closest('[role="listbox"], [aria-haspopup]')) return;
                if (c.hasAttribute('data-filtro-ignorar')) return;
                if (c.type === 'checkbox' || c.type === 'radio') {
                    if (!c.checked || c.hasAttribute('data-padrao-marcado')) return;
                    const grupo = c.closest('[role="listbox"]') || c.name || c;
                    if (!grupos.has(grupo)) { grupos.add(grupo); n++; }
                    return;
                }
                if (c.tagName === 'SELECT') { if (c.selectedIndex > 0) n++; return; }
                if (String(c.value || '').trim() !== '') n++;
            });
            n += filho.querySelectorAll('[data-filtro-ativo]').length;
        });
        return n;
    }

    function atualizar(caixa) {
        const botao = caixa.querySelector(':scope > .mf-botao');
        if (!botao) return;
        const aberto = caixa.classList.contains('mf-aberto');
        const n = emUso(caixa);
        botao.querySelector('.mf-texto').textContent = aberto ? 'Menos filtros' : 'Mais filtros';
        const conta = botao.querySelector('.mf-conta');
        conta.textContent = n;
        conta.hidden = aberto || !n;
        botao.setAttribute('aria-expanded', String(aberto));
    }

    // Caixas que a tela redesenha (mesmo nome em data-mais-filtros) lembram se estavam abertas
    const abertas = new Set();

    function preparar(caixa) {
        if (caixa.dataset.mfPronto) { atualizar(caixa); return; }
        const filhos = [...caixa.children];
        if (!filhos.some(f => f.hasAttribute('data-filtro-fixo')) && filhos[0]) filhos[0].setAttribute('data-filtro-fixo', '');
        // Só vale a pena se houver algo para esconder
        if (!filhos.some(f => !f.matches('[data-filtro-fixo], [data-filtro-acao]'))) return;
        caixa.dataset.mfPronto = '1';
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'mf-botao';
        botao.innerHTML = `${ICONE}<span class="mf-texto">Mais filtros</span><span class="mf-conta" hidden></span>${SETA}`;
        const chave = caixa.getAttribute('data-mais-filtros');
        if (chave && abertas.has(chave)) caixa.classList.add('mf-aberto');
        botao.addEventListener('click', () => {
            const aberto = caixa.classList.toggle('mf-aberto');
            if (chave) { if (aberto) abertas.add(chave); else abertas.delete(chave); }
            atualizar(caixa);
        });
        // Logo depois do filtro fixo (antes das ações), para o botão ficar junto dos filtros
        const ultimoFixo = [...caixa.children].filter(f => f.hasAttribute('data-filtro-fixo')).pop();
        if (ultimoFixo && ultimoFixo.nextSibling) caixa.insertBefore(botao, ultimoFixo.nextSibling); else caixa.appendChild(botao);
        caixa.addEventListener('input', () => atualizar(caixa));
        caixa.addEventListener('change', () => atualizar(caixa));
        atualizar(caixa);
    }

    function prepararTudo(raiz) {
        (raiz || document).querySelectorAll('[data-mais-filtros]').forEach(preparar);
    }

    function iniciar() {
        prepararTudo();
        new MutationObserver(lista => {
            for (const m of lista) {
                // A tela redesenhou os filtros por dentro da caixa: o botão sumiu, prepara de novo
                const caixa = m.target.nodeType === 1 && m.target.matches('[data-mais-filtros]') ? m.target : null;
                if (caixa && !caixa.querySelector(':scope > .mf-botao')) { delete caixa.dataset.mfPronto; preparar(caixa); }
            }
            for (const m of lista) for (const no of m.addedNodes) {
                if (no.nodeType !== 1) continue;
                if (no.matches('[data-mais-filtros]')) preparar(no);
                if (no.querySelector && no.querySelector('[data-mais-filtros]')) prepararTudo(no);
            }
        }).observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();

    // Para telas que mudam o valor dos filtros por código (ex.: "Limpar"): MaisFiltros.atualizar()
    window.MaisFiltros = { preparar, atualizar: () => document.querySelectorAll('[data-mais-filtros]').forEach(atualizar) };
})();
