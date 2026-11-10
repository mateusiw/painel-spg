// Barra de abas flutuante no celular, no padrão da Irrigação ("liquid glass" no rodapé).
// Mostra as 4 primeiras abas e um "Mais" com as outras; rolando para baixo vira um botão
// de voltar ao topo; com o teclado aberto sai da frente. No computador não aparece.
//
// const barra = BarraAbas.criar({
//     abas: () => [{ id, nome, icone, ativa, cor: '5, 150, 105' }],   // na ordem da tela
//     abrir: id => ...,                                               // troca de aba
//     rotulo: 'Abas do projeto'
// });
// barra.atualizar()            -> redesenha (aba ativa ou liberada mudou)
// barra.acompanhar(janela)     -> recolhe também ao rolar outra janela (ex.: quadro de uma lista)
(function () {
    'use strict';
    if (window.BarraAbas) return;

    const estilo = document.createElement('style');
    estilo.textContent = `
        .barra-abas, .barra-abas-mais { display: none; }
        @media (max-width: 1023px) {
            body.com-barra-abas { padding-bottom: calc(96px + env(safe-area-inset-bottom)); }
            .barra-abas {
                display: flex; position: fixed; z-index: 45;
                left: max(12px, calc((100% - 460px) / 2)); bottom: calc(12px + env(safe-area-inset-bottom));
                width: min(calc(100% - 24px), 460px); height: 64px;
                padding: 5px; gap: 2px; overflow: hidden; border-radius: 999px;
                background: linear-gradient(180deg, rgba(255,255,255,0.62), rgba(255,255,255,0.42));
                -webkit-backdrop-filter: blur(22px) saturate(190%); backdrop-filter: blur(22px) saturate(190%);
                border: 1px solid rgba(255,255,255,0.65);
                box-shadow: 0 10px 30px rgba(15,23,42,0.18), 0 2px 6px rgba(15,23,42,0.08), inset 0 1px 1px rgba(255,255,255,0.9), inset 0 -1px 1px rgba(255,255,255,0.35);
                transition: width .42s cubic-bezier(.32,.72,0,1), height .42s cubic-bezier(.32,.72,0,1), transform .3s ease, opacity .3s ease;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            }
            .barra-abas.sem-abas { display: none; }
            .barra-abas::before { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: linear-gradient(180deg, rgba(255,255,255,.55) 0%, rgba(255,255,255,0) 45%); opacity: .6; }
            .barra-abas > button:not(.barra-abas-topo) {
                position: relative; flex: 1 1 auto; min-width: 0; padding: 4px 6px; border: 0; background: transparent;
                display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
                border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: -0.02em; color: #475569; white-space: nowrap;
                transition: opacity .18s ease, transform .25s ease, background-color .25s ease, color .25s ease;
                -webkit-tap-highlight-color: transparent;
            }
            .barra-abas > button span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
            .barra-abas > button:not(.barra-abas-topo):active { transform: scale(.92); }
            .barra-abas > button svg { width: 21px; height: 21px; }
            .barra-abas > button.aba-ativa:not(.barra-abas-topo) {
                color: rgb(var(--cor)); font-weight: 800; background: rgba(var(--cor), .14);
                box-shadow: inset 0 0 0 1px rgba(var(--cor), .22), inset 0 1px 0 rgba(255,255,255,.7), 0 3px 10px rgba(var(--cor), .18);
            }
            .barra-abas > button.aba-ativa svg { stroke-width: 2.4; }
            .barra-abas-topo { display: flex; align-items: center; justify-content: center; position: absolute; left: 0; top: 0; width: 52px; height: 52px; border: 0; background: transparent; border-radius: 999px; color: #0f172a; opacity: 0; pointer-events: none; transform: scale(.6); transition: opacity .25s ease, transform .35s cubic-bezier(.32,.72,0,1); }
            .barra-abas-topo svg { width: 22px; height: 22px; }
            .barra-abas.recolhida { width: 52px; height: 52px; }
            .barra-abas.recolhida > button:not(.barra-abas-topo) { opacity: 0; transform: scale(.7); pointer-events: none; }
            .barra-abas.recolhida .barra-abas-topo { opacity: 1; pointer-events: auto; transform: scale(1); transition-delay: .08s; }
            .barra-abas.teclado { transform: translateY(160%); opacity: 0; pointer-events: none; }
            .barra-abas-mais:not(.hidden) { display: block; position: fixed; inset: 0; z-index: 44; background: rgba(15,23,42,.25); }
            .barra-abas-mais-lista { position: absolute; right: max(12px, calc((100% - 460px) / 2)); bottom: calc(86px + env(safe-area-inset-bottom)); width: 230px; padding: 6px; border-radius: 20px; background: rgba(255,255,255,.97); -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px); box-shadow: 0 18px 40px rgba(15,23,42,.22); animation: barraMaisAbrir .16s ease-out; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
            @keyframes barraMaisAbrir { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }
            .barra-abas-mais-lista button { display: flex; width: 100%; align-items: center; gap: 10px; padding: 11px 12px; border: 0; background: transparent; border-radius: 14px; font-size: 14px; font-weight: 700; color: #334155; text-align: left; }
            .barra-abas-mais-lista button svg { width: 18px; height: 18px; color: rgb(var(--cor)); flex: none; }
            .barra-abas-mais-lista button.aba-ativa { background: rgba(var(--cor), .12); color: rgb(var(--cor)); }
        }
        @media print { .barra-abas, .barra-abas-mais { display: none !important; } }
        @media (prefers-reduced-motion: reduce) { .barra-abas, .barra-abas > button, .barra-abas-topo, .barra-abas-mais-lista { transition: none !important; animation: none !important; } }
    `;
    (document.head || document.documentElement).appendChild(estilo);

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const COR_PADRAO = '5, 150, 105';
    const celular = () => window.matchMedia('(max-width: 1023px)').matches;

    function criar(opcoes) {
        const barra = document.createElement('nav');
        barra.className = 'barra-abas';
        barra.setAttribute('aria-label', opcoes.rotulo || 'Abas');
        const mais = document.createElement('div');
        mais.className = 'barra-abas-mais hidden';
        mais.innerHTML = '<div class="barra-abas-mais-lista" role="menu" aria-label="Outras abas"></div>';
        const listaMais = mais.firstElementChild;
        document.body.appendChild(barra);
        document.body.appendChild(mais);

        function montar() {
            const abas = opcoes.abas() || [];
            const tem = abas.length > 1;
            barra.classList.toggle('sem-abas', !tem);
            document.body.classList.toggle('com-barra-abas', tem);
            const principais = abas.length <= 5 ? abas : abas.slice(0, 4);
            const extras = abas.length <= 5 ? [] : abas.slice(4);
            const extraAtiva = extras.find(a => a.ativa);
            const botao = a => `<button type="button" data-aba="${esc(a.id)}" style="--cor: ${a.cor || COR_PADRAO}" class="${a.ativa ? 'aba-ativa' : ''}"${a.ativa ? ' aria-current="page"' : ''}><i data-lucide="${esc(a.icone)}"></i><span>${esc(a.nome)}</span></button>`;
            const abertoMais = !mais.classList.contains('hidden');
            barra.innerHTML = principais.map(botao).join('') +
                (extras.length ? `<button type="button" data-mais aria-haspopup="menu" aria-expanded="${abertoMais}" style="--cor: ${extraAtiva ? (extraAtiva.cor || COR_PADRAO) : '51, 65, 85'}" class="${extraAtiva ? 'aba-ativa' : ''}"><i data-lucide="${esc(extraAtiva ? extraAtiva.icone : 'ellipsis')}"></i><span>${esc(extraAtiva ? extraAtiva.nome : 'Mais')}</span></button>` : '') +
                `<button type="button" class="barra-abas-topo" aria-label="Voltar ao topo" title="Voltar ao topo"><i data-lucide="arrow-up"></i></button>`;
            listaMais.innerHTML = extras.map(a => `<button type="button" role="menuitem" data-aba="${esc(a.id)}" style="--cor: ${a.cor || COR_PADRAO}" class="${a.ativa ? 'aba-ativa' : ''}"><i data-lucide="${esc(a.icone)}"></i>${esc(a.nome)}</button>`).join('');
            if (!extras.length) fecharMais();
            if (window.lucide) lucide.createIcons();
        }

        let agendado = false;
        const atualizar = () => { if (agendado) return; agendado = true; requestAnimationFrame(() => { agendado = false; montar(); }); };

        function fecharMais() {
            mais.classList.add('hidden');
            const b = barra.querySelector('[data-mais]');
            if (b) b.setAttribute('aria-expanded', 'false');
        }
        const janelas = new Set();
        function voltarAoTopo() {
            janelas.forEach(j => { try { j.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { /* janela fechada */ } });
            barra.classList.remove('recolhida');
        }
        function abrir(id) {
            fecharMais();
            opcoes.abrir(id);
            barra.classList.remove('recolhida');
            atualizar();
        }
        barra.addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b) return;
            if (b.classList.contains('barra-abas-topo')) { voltarAoTopo(); return; }
            if (b.hasAttribute('data-mais')) { const abrirMais = mais.classList.contains('hidden'); mais.classList.toggle('hidden', !abrirMais); b.setAttribute('aria-expanded', String(abrirMais)); return; }
            if (b.dataset.aba) abrir(b.dataset.aba);
        });
        mais.addEventListener('click', e => { const b = e.target.closest('[data-aba]'); if (b) abrir(b.dataset.aba); else fecharMais(); });

        // Rolando para baixo a barra vira o botão de voltar ao topo; para cima, volta inteira.
        // Teclado aberto (campo de texto em foco): a barra sai da frente.
        function acompanhar(janela) {
            if (!janela || janelas.has(janela)) return;
            janelas.add(janela);
            let ultimoY = janela.scrollY || 0;
            janela.addEventListener('scroll', () => {
                const y = janela.scrollY;
                if (y > 160 && y > ultimoY + 6) { barra.classList.add('recolhida'); fecharMais(); }
                else if (y < ultimoY - 6 || y < 80) barra.classList.remove('recolhida');
                ultimoY = y;
            }, { passive: true });
            const doc = janela.document;
            doc.addEventListener('focusin', e => {
                if (celular() && /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && !/^(checkbox|radio|button|file|submit|range|color)$/.test(e.target.type)) barra.classList.add('teclado');
            });
            doc.addEventListener('focusout', () => barra.classList.remove('teclado'));
            doc.addEventListener('keydown', e => { if (e.key === 'Escape') fecharMais(); });
            janela.addEventListener('pagehide', () => janelas.delete(janela));
        }
        acompanhar(window);
        montar();
        return { atualizar, acompanhar, elemento: barra };
    }

    window.BarraAbas = { criar };
})();
