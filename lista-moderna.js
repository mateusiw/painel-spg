// Lista suspensa moderna para todo o Painel SPG.
// Cada <select> continua no mesmo lugar e com o mesmo valor (as telas não mudam nada);
// só o visual fechado e a janela de opções trocam: no lugar da lista do navegador abre esta.
// Campos com <datalist> (input list="...") ganham a mesma lista, com busca.
// Para manter a lista do navegador em algum campo: data-nativo.
(function () {
    'use strict';
    if (window.__listaModerna) return;
    window.__listaModerna = true;

    const SETA = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";
    const MARCA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
    const ALVO = 'select:not([multiple]):not(.msel-native):not([data-nativo])';

    const estilo = document.createElement('style');
    estilo.textContent = `
        ${ALVO} { -webkit-appearance: none !important; -moz-appearance: none !important; appearance: none !important; background-image: ${SETA} !important; background-repeat: no-repeat !important; background-position: right .65rem center !important; background-size: 1rem !important; padding-right: 2.1rem !important; cursor: pointer; }
        ${ALVO}:not([class]):not([style]) { background-color: #fff; border: 1px solid #cbd5e1; border-radius: .5rem; padding: .375rem 2.1rem .375rem .625rem; }
        ${ALVO}:disabled { cursor: not-allowed; }
        @media print { ${ALVO} { background-image: none !important; padding-right: 0 !important; } }
        .lm-menu[popover] { margin: 0; inset: auto; overflow: visible; }
        .lm-menu { position: fixed; z-index: 2147483000; display: flex; flex-direction: column; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 12px 28px -8px rgba(16,24,40,.22), 0 4px 8px -4px rgba(16,24,40,.08); padding: 4px; font-family: inherit; color: #334155; animation: lmAbrir .12s ease-out; }
        @keyframes lmAbrir { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .lm-menu { animation: none; } }
        .lm-busca { margin: 4px 4px 6px; height: 38px; padding: 0 12px; border: 1px solid #e2e8f0; border-radius: 9px; font: inherit; font-size: 14px; outline: none; background: #f8fafc; }
        .lm-busca:focus { border-color: #059669; background: #fff; box-shadow: 0 0 0 3px rgba(5,150,105,.15); }
        .lm-lista { overflow-y: auto; overscroll-behavior: contain; }
        .lm-op { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; min-height: 40px; padding: 8px 12px; border: 0; border-radius: 8px; background: none; font: inherit; font-size: 14px; color: #334155; text-align: left; cursor: pointer; }
        .lm-op span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .lm-op svg { flex: none; color: #059669; visibility: hidden; }
        .lm-op:hover, .lm-op.lm-foco { background: #f1f5f9; }
        .lm-op[aria-selected="true"] { background: #ecfdf5; color: #065f46; font-weight: 600; }
        .lm-op[aria-selected="true"] svg { visibility: visible; }
        .lm-op:disabled { color: #cbd5e1; cursor: default; background: none; }
        .lm-grupo { padding: 8px 12px 4px; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #94a3b8; }
        .lm-vazio { padding: 14px 12px; font-size: 13px; color: #94a3b8; text-align: center; }
    `;
    (document.head || document.documentElement).appendChild(estilo);

    let aberto = null;   // { campo, tipo: 'select' | 'lista', menu, busca, lista, foco }
    let toque = null;
    let digitado = '';
    let timerDigitado = null;

    // A tela pode ter redesenhado a página com a lista aberta
    function conferirAberto() { if (aberto && (!aberto.menu.isConnected || !aberto.campo.isConnected)) { aberto.menu.remove(); aberto = null; } }

    const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function selectDe(alvo) {
        const s = alvo && alvo.closest ? alvo.closest('select') : null;
        if (!s || !s.matches(ALVO) || s.disabled || (s.size && s.size > 1)) return null;
        if (s.dataset.enhanced) return null;   // já tem lista própria (Aplicações)
        return s;
    }
    function listaDe(alvo) {
        if (!alvo || alvo.tagName !== 'INPUT' || alvo.dataset.nativo !== undefined || alvo.readOnly || alvo.disabled) return null;
        if (alvo.hasAttribute('list')) { alvo.dataset.lmLista = alvo.getAttribute('list'); alvo.removeAttribute('list'); }
        return alvo.dataset.lmLista ? alvo : null;
    }

    // ---------- Itens ----------
    function itensDoSelect(s) {
        const itens = [];
        const opcao = (o, i) => { if (!o.hidden) itens.push({ tipo: 'op', texto: o.label || o.text, valor: o.value, indice: i, desabilitada: o.disabled || (o.parentElement && o.parentElement.disabled), atual: i === s.selectedIndex }); };
        let i = 0;
        [...s.children].forEach(filho => {
            if (filho.tagName === 'OPTGROUP') {
                itens.push({ tipo: 'grupo', texto: filho.label });
                [...filho.children].forEach(o => opcao(o, i++));
            } else if (filho.tagName === 'OPTION') opcao(filho, i++);
        });
        return itens;
    }
    function itensDaLista(campo) {
        const dl = document.getElementById(campo.dataset.lmLista);
        const vistos = new Set();
        return dl ? [...dl.options].map(o => o.value || o.text).filter(v => v && !vistos.has(v) && vistos.add(v))
            .map(v => ({ tipo: 'op', texto: v, valor: v, atual: v === campo.value })) : [];
    }

    // ---------- Abrir, desenhar, posicionar ----------
    function abrir(campo, tipo, comBusca) {
        fechar(false);
        const itens = tipo === 'select' ? itensDoSelect(campo) : itensDaLista(campo);
        if (tipo === 'lista' && !itens.length) return;
        const menu = document.createElement('div');
        menu.className = 'lm-menu';
        const temBusca = tipo === 'select' && itens.filter(x => x.tipo === 'op').length > 8;
        menu.innerHTML = (temBusca ? '<input type="search" class="lm-busca" placeholder="Buscar..." aria-label="Buscar opção" autocomplete="off">' : '') +
            `<div class="lm-lista" role="listbox"></div>`;
        // Campo dentro de um <dialog> aberto com showModal(): a janela fica numa camada acima de tudo
        // (z-index não adianta). O menu entra dentro dela (para não ficar inerte) e abre como "popover",
        // que também vai para essa camada de cima — assim aparece por cima da janela, sem ser cortado.
        const janela = campo.closest('dialog[open]');
        (janela || document.body).appendChild(menu);
        if (janela && typeof menu.showPopover === 'function') {
            menu.setAttribute('popover', 'manual');
            try { menu.showPopover(); } catch (e) { /* segue como antes */ }
        }
        aberto = { campo, tipo, menu, itens, busca: menu.querySelector('.lm-busca'), lista: menu.querySelector('.lm-lista'), foco: -1 };
        campo.setAttribute('aria-expanded', 'true');
        desenhar(tipo === 'lista' ? campo.value : '');
        posicionar();
        const atual = aberto.lista.querySelector('[aria-selected="true"]');
        if (atual) atual.scrollIntoView({ block: 'nearest' });
        if (aberto.busca && comBusca) aberto.busca.focus({ preventScroll: true });
    }

    function desenhar(termo) {
        const t = semAcento(String(termo || '').trim());
        const visiveis = aberto.itens.filter(x => x.tipo === 'grupo' || !t || semAcento(x.texto).includes(t));
        const html = visiveis.map((x, n) => {
            if (x.tipo === 'grupo') {
                const proxima = visiveis[n + 1];
                return proxima && proxima.tipo === 'op' ? `<div class="lm-grupo">${esc(x.texto)}</div>` : '';
            }
            return `<button type="button" tabindex="-1" role="option" class="lm-op" data-indice="${x.indice ?? ''}" data-valor="${esc(x.valor)}" aria-selected="${x.atual}"${x.desabilitada ? ' disabled' : ''}><span>${esc(x.texto)}</span>${MARCA}</button>`;
        }).join('');
        aberto.lista.innerHTML = html || '<div class="lm-vazio">Nenhum resultado</div>';
        aberto.foco = -1;
        if (aberto.tipo === 'lista' && !aberto.lista.querySelector('.lm-op')) { fechar(false); }
    }

    function posicionar() {
        if (!aberto) return;
        const r = aberto.campo.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight || (!r.width && !r.height)) { fechar(false); return; }
        const largura = Math.min(Math.max(r.width, 180), innerWidth - 16);
        const esquerda = Math.min(Math.max(r.left, 8), innerWidth - largura - 8);
        const abaixo = innerHeight - r.bottom - 12;
        const acima = r.top - 12;
        const paraBaixo = abaixo >= 220 || abaixo >= acima;
        const altura = Math.max(120, Math.min(340, paraBaixo ? abaixo : acima));
        const m = aberto.menu;
        m.style.width = largura + 'px';
        m.style.left = esquerda + 'px';
        m.style.maxHeight = altura + 'px';
        m.style.top = paraBaixo ? (r.bottom + 6) + 'px' : '';
        m.style.bottom = paraBaixo ? '' : (innerHeight - r.top + 6) + 'px';
        aberto.lista.style.maxHeight = (altura - (aberto.busca ? 52 : 8)) + 'px';
    }

    function fechar(voltarFoco) {
        if (!aberto) return;
        const { campo, menu } = aberto;
        aberto = null;
        menu.remove();
        campo.setAttribute('aria-expanded', 'false');
        if (voltarFoco) campo.focus({ preventScroll: true });
    }

    function escolher(botao) {
        if (!aberto || !botao || botao.disabled) return;
        const { campo, tipo } = aberto;
        let mudou;
        if (tipo === 'select') {
            const indice = Number(botao.dataset.indice);
            mudou = campo.selectedIndex !== indice;
            campo.selectedIndex = indice;
        } else {
            mudou = campo.value !== botao.dataset.valor;
            campo.value = botao.dataset.valor;
        }
        fechar(true);
        if (mudou) {
            campo.dispatchEvent(new Event('input', { bubbles: true }));
            campo.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    function mover(passo) {
        const ops = [...aberto.lista.querySelectorAll('.lm-op:not(:disabled)')];
        if (!ops.length) return;
        ops.forEach(o => o.classList.remove('lm-foco'));
        if (aberto.foco < 0) { const sel = ops.findIndex(o => o.getAttribute('aria-selected') === 'true'); aberto.foco = sel >= 0 ? sel : (passo > 0 ? -1 : 0); }
        aberto.foco = (aberto.foco + passo + ops.length) % ops.length;
        ops[aberto.foco].classList.add('lm-foco');
        ops[aberto.foco].scrollIntoView({ block: 'nearest' });
    }
    const emFoco = () => aberto && aberto.lista.querySelectorAll('.lm-op:not(:disabled)')[aberto.foco];

    // Tecla com o menu aberto. Devolve true quando tratou.
    function teclaNoMenu(e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); mover(e.key === 'ArrowDown' ? 1 : -1); return true; }
        if (e.key === 'Enter' || (e.key === ' ' && aberto.tipo === 'select' && e.target === aberto.campo)) {
            const alvo = emFoco();
            if (alvo) { e.preventDefault(); escolher(alvo); return true; }
            if (aberto.tipo === 'select') { e.preventDefault(); fechar(true); return true; }
            return false;
        }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(true); return true; }
        if (e.key === 'Tab') { fechar(false); return false; }
        return false;
    }

    // ---------- Eventos (todos na página, valem para listas criadas depois) ----------
    document.addEventListener('mousedown', e => {
        conferirAberto();
        if (aberto && aberto.menu.contains(e.target)) { e.preventDefault(); return; }
        const s = selectDe(e.target);
        if (!s || e.button !== 0) { if (aberto && e.target !== aberto.campo) fechar(false); return; }
        e.preventDefault();   // não abre a lista do navegador
        if (aberto && aberto.campo === s) { fechar(true); return; }
        s.focus({ preventScroll: true });
        abrir(s, 'select', true);
    }, true);

    // Celular: o toque abre esta lista (sem a roleta do aparelho); arrastar a tela não abre
    document.addEventListener('touchstart', e => {
        const s = selectDe(e.target);
        toque = s ? { s, x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    }, { capture: true, passive: true });
    document.addEventListener('touchend', e => {
        conferirAberto();
        const s = selectDe(e.target);
        if (!s || !toque || toque.s !== s) return;
        const t = e.changedTouches[0];
        const moveu = Math.abs(t.clientX - toque.x) > 10 || Math.abs(t.clientY - toque.y) > 10;
        toque = null;
        if (moveu) return;
        e.preventDefault();
        if (aberto && aberto.campo === s) { fechar(false); return; }
        abrir(s, 'select', false);
    }, { capture: true, passive: false });

    document.addEventListener('click', e => {
        if (!aberto) return;
        const op = e.target.closest && e.target.closest('.lm-op');
        if (op && aberto.menu.contains(op)) { e.preventDefault(); escolher(op); }
    }, true);

    document.addEventListener('keydown', e => {
        conferirAberto();
        if (aberto && (e.target === aberto.campo || aberto.menu.contains(e.target))) {
            if (teclaNoMenu(e)) return;
            if (aberto.tipo === 'select' && e.target === aberto.campo && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                // Letras pulam para a opção que começa com elas
                e.preventDefault();
                clearTimeout(timerDigitado);
                digitado += semAcento(e.key);
                timerDigitado = setTimeout(() => { digitado = ''; }, 700);
                const ops = [...aberto.lista.querySelectorAll('.lm-op:not(:disabled)')];
                const achou = ops.findIndex(o => semAcento(o.textContent).startsWith(digitado));
                if (achou >= 0) { aberto.foco = achou - 1; mover(1); }
            }
            return;
        }
        const s = selectDe(e.target);
        if (s && (e.key === ' ' || e.key === 'Enter' || e.key === 'F4' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')))) {
            e.preventDefault();
            abrir(s, 'select', true);
            return;
        }
        const l = e.target.dataset && e.target.dataset.lmLista ? e.target : null;
        if (l && e.key === 'ArrowDown') { e.preventDefault(); abrir(l, 'lista'); mover(1); }
    }, true);

    // Datalist: abre ao entrar no campo e filtra enquanto digita
    document.addEventListener('focusin', e => {
        const l = listaDe(e.target);
        if (l && !(aberto && aberto.campo === l)) abrir(l, 'lista');
    }, true);
    document.addEventListener('input', e => {
        if (!e.isTrusted) return;
        const l = e.target.dataset && e.target.dataset.lmLista ? e.target : null;
        if (!l) return;
        if (aberto && aberto.campo === l) desenhar(l.value); else abrir(l, 'lista');
        if (aberto && aberto.campo === l) posicionar();
    }, true);
    document.addEventListener('input', e => {
        if (aberto && aberto.busca && e.target === aberto.busca) { desenhar(aberto.busca.value); posicionar(); }
    }, true);
    document.addEventListener('focusout', e => {
        if (!aberto || e.target !== aberto.campo || aberto.tipo !== 'lista') return;
        if (e.relatedTarget && aberto.menu.contains(e.relatedTarget)) return;
        fechar(false);
    }, true);

    document.addEventListener('scroll', e => { if (aberto && !aberto.menu.contains(e.target)) posicionar(); }, true);
    window.addEventListener('resize', () => fechar(false));
    window.addEventListener('blur', () => fechar(false));
    document.addEventListener('pointerdown', e => {
        if (aberto && !aberto.menu.contains(e.target) && e.target !== aberto.campo) fechar(false);
    }, true);
})();
