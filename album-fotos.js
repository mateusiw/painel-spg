// ============================================================
//  Álbum de fotos (tela cheia), usado no Descarte e nas Leituras.
//
//  AlbumFotos.abrir({ itens, inicio, grade, titulo })
//    itens: [{ src, mini, titulo, sub, link }]
//      src   = foto grande          mini = miniatura (opcional; usa src)
//      titulo/sub = legenda          link = "Abrir no Drive" (opcional)
//    inicio: índice da foto que abre primeiro (padrão 0)
//    grade:  true = abre mostrando todas as fotos em grade
//    titulo: nome do álbum (ex.: "Leituras de energia · novembro")
//
//  Navegação: setas na tela, deslizar o dedo, ← → no teclado, Esc fecha.
//  Embaixo, a faixa de miniaturas; o botão de grade mostra todas de uma vez.
// ============================================================
(function () {
    const ICONES = {
        x: '<path d="M18 6 6 18M6 6l12 12"/>',
        esq: '<path d="m15 18-6-6 6-6"/>',
        dir: '<path d="m9 18 6-6-6-6"/>',
        grade: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
        foto: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
        link: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'
    };
    const ic = (n, cls = 'w-5 h-5') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}" aria-hidden="true">${ICONES[n]}</svg>`;
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const BTN = 'w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition active:scale-95';

    let raiz = null, itens = [], atual = 0, emGrade = false, tituloAlbum = '', focoAntes = null;
    const $ = sel => raiz.querySelector(sel);

    function montar() {
        raiz = document.createElement('div');
        raiz.id = 'albumFotos';
        raiz.setAttribute('role', 'dialog');
        raiz.setAttribute('aria-modal', 'true');
        raiz.setAttribute('aria-label', 'Álbum de fotos');
        raiz.className = 'fixed inset-0 z-[95] hidden flex-col bg-black/95 text-white select-none';
        raiz.style.cssText = 'padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom);';
        raiz.innerHTML = `
            <div class="flex items-center gap-2 px-3 py-2.5 shrink-0">
                <div class="min-w-0 flex-1">
                    <p data-a="titulo" class="text-sm font-extrabold truncate"></p>
                    <p data-a="contador" class="text-[11px] font-semibold text-white/60 tabular-nums"></p>
                </div>
                <a data-a="link" href="#" target="_blank" rel="noopener" title="Abrir no Drive" aria-label="Abrir no Drive" class="${BTN}">${ic('link', 'w-[18px] h-[18px]')}</a>
                <button type="button" data-a="modo" class="${BTN}"></button>
                <button type="button" data-a="fechar" title="Fechar" aria-label="Fechar" class="${BTN}">${ic('x')}</button>
            </div>
            <div data-a="visor" class="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden" style="touch-action: pan-y pinch-zoom;">
                <img data-a="img" alt="" referrerpolicy="no-referrer" draggable="false" class="max-w-full max-h-full object-contain transition-opacity duration-200">
                <div data-a="carregando" class="absolute inset-0 flex items-center justify-center pointer-events-none"><span class="w-9 h-9 rounded-full border-[3px] border-white/20 border-t-white/80 animate-spin"></span></div>
                <button type="button" data-a="ant" aria-label="Foto anterior" class="${BTN} absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 !w-12 !h-12 bg-black/40 backdrop-blur">${ic('esq', 'w-6 h-6')}</button>
                <button type="button" data-a="prox" aria-label="Próxima foto" class="${BTN} absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 !w-12 !h-12 bg-black/40 backdrop-blur">${ic('dir', 'w-6 h-6')}</button>
            </div>
            <div data-a="grade" class="hidden flex-1 min-h-0 overflow-y-auto px-3 pb-4">
                <div data-a="gradeLista" class="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-1.5"></div>
            </div>
            <div data-a="rodape" class="shrink-0 px-3 pt-2 pb-3 space-y-2.5">
                <div class="text-center min-h-[34px]">
                    <p data-a="legTitulo" class="text-sm font-bold truncate"></p>
                    <p data-a="legSub" class="text-xs text-white/65 truncate"></p>
                </div>
                <div data-a="faixa" class="flex gap-1.5 overflow-x-auto pb-1" style="scrollbar-width: none;"></div>
            </div>`;
        document.body.appendChild(raiz);

        $('[data-a="fechar"]').addEventListener('click', fechar);
        $('[data-a="ant"]').addEventListener('click', () => ir(atual - 1));
        $('[data-a="prox"]').addEventListener('click', () => ir(atual + 1));
        $('[data-a="modo"]').addEventListener('click', () => { emGrade = !emGrade; desenhar(); });
        $('[data-a="faixa"]').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) ir(Number(b.dataset.i)); });
        $('[data-a="gradeLista"]').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) { emGrade = false; ir(Number(b.dataset.i)); } });
        const img = $('[data-a="img"]');
        img.addEventListener('load', () => { img.style.opacity = '1'; $('[data-a="carregando"]').classList.add('hidden'); });
        img.addEventListener('error', () => { $('[data-a="carregando"]').classList.add('hidden'); });

        // Deslizar o dedo para os lados troca de foto
        let x0 = null, y0 = 0;
        const visor = $('[data-a="visor"]');
        visor.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; x0 = e.clientX; y0 = e.clientY; });
        visor.addEventListener('pointerup', e => {
            if (x0 === null) return;
            const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
            if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) ir(atual + (dx < 0 ? 1 : -1));
            else if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && e.target === visor) fechar();   // toque fora da foto fecha
        });
        visor.addEventListener('pointercancel', () => { x0 = null; });

        document.addEventListener('keydown', e => {
            if (!raiz || raiz.classList.contains('hidden')) return;
            if (e.key === 'Escape') { e.preventDefault(); if (emGrade && itens.length > 1) { emGrade = false; desenhar(); } else fechar(); }
            else if (!emGrade && e.key === 'ArrowLeft') ir(atual - 1);
            else if (!emGrade && e.key === 'ArrowRight') ir(atual + 1);
        });
    }

    function ir(i) {
        if (!itens.length) return;
        atual = (i + itens.length) % itens.length;
        desenhar();
    }

    function desenhar() {
        const it = itens[atual] || {};
        const varias = itens.length > 1;
        $('[data-a="titulo"]').textContent = tituloAlbum || it.titulo || 'Fotos';
        $('[data-a="contador"]').textContent = emGrade ? `${itens.length} foto${itens.length === 1 ? '' : 's'}` : `${atual + 1} de ${itens.length}`;
        const modo = $('[data-a="modo"]');
        modo.innerHTML = ic(emGrade ? 'foto' : 'grade');
        modo.title = emGrade ? 'Ver uma por vez' : 'Ver todas';
        modo.setAttribute('aria-label', modo.title);
        modo.classList.toggle('hidden', !varias);
        const link = $('[data-a="link"]');
        link.classList.toggle('hidden', emGrade || !it.link);
        if (it.link) link.href = it.link;

        $('[data-a="visor"]').classList.toggle('hidden', emGrade);
        $('[data-a="visor"]').classList.toggle('flex', !emGrade);
        $('[data-a="rodape"]').classList.toggle('hidden', emGrade);
        $('[data-a="grade"]').classList.toggle('hidden', !emGrade);

        if (emGrade) {
            $('[data-a="gradeLista"]').innerHTML = itens.map((f, i) => `<button type="button" data-i="${i}" class="relative aspect-square rounded-lg overflow-hidden bg-white/5 ring-2 ${i === atual ? 'ring-white' : 'ring-transparent'} hover:ring-white/60 transition" aria-label="${esc(f.titulo || 'Foto ' + (i + 1))}">
                <img src="${esc(f.mini || f.src)}" alt="" loading="lazy" referrerpolicy="no-referrer" class="w-full h-full object-cover">
                ${f.titulo ? `<span class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pt-4 pb-1 text-[10px] font-bold text-left leading-tight truncate">${esc(f.titulo)}</span>` : ''}
            </button>`).join('');
            const sel = $(`[data-a="gradeLista"] [data-i="${atual}"]`);
            if (sel) sel.scrollIntoView({ block: 'center' });
            return;
        }

        const img = $('[data-a="img"]');
        if (img.getAttribute('src') !== it.src) {
            img.style.opacity = '0';
            $('[data-a="carregando"]').classList.remove('hidden');
            img.src = it.src || '';
        }
        $('[data-a="ant"]').classList.toggle('hidden', !varias);
        $('[data-a="prox"]').classList.toggle('hidden', !varias);
        $('[data-a="legTitulo"]').textContent = it.titulo || '';
        $('[data-a="legSub"]').textContent = it.sub || '';

        const faixa = $('[data-a="faixa"]');
        faixa.classList.toggle('hidden', !varias);
        if (varias) {
            if (faixa.childElementCount !== itens.length) {
                faixa.innerHTML = itens.map((f, i) => `<button type="button" data-i="${i}" aria-label="Foto ${i + 1}" class="shrink-0 w-14 h-14 rounded-lg overflow-hidden ring-2 transition bg-white/5"><img src="${esc(f.mini || f.src)}" alt="" loading="lazy" referrerpolicy="no-referrer" class="w-full h-full object-cover"></button>`).join('');
            }
            [...faixa.children].forEach((b, i) => {
                b.classList.toggle('ring-white', i === atual);
                b.classList.toggle('ring-transparent', i !== atual);
                b.style.opacity = i === atual ? '1' : '.55';
            });
            const b = faixa.children[atual];
            if (b) b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
        }
        // Já baixa a anterior e a próxima, para a troca ser rápida
        [atual - 1, atual + 1].forEach(i => { const f = itens[(i + itens.length) % itens.length]; if (f && f.src) { const p = new Image(); p.referrerPolicy = 'no-referrer'; p.src = f.src; } });
    }

    function abrir(op) {
        op = op || {};
        itens = (op.itens || []).filter(f => f && f.src);
        if (!itens.length) return false;
        if (!raiz) montar();
        atual = Math.max(0, Math.min(itens.length - 1, op.inicio || 0));
        emGrade = !!op.grade && itens.length > 1;
        tituloAlbum = op.titulo || '';
        $('[data-a="faixa"]').innerHTML = '';
        focoAntes = document.activeElement;
        raiz.classList.remove('hidden');
        raiz.classList.add('flex');
        desenhar();
        $('[data-a="fechar"]').focus({ preventScroll: true });
        return true;
    }

    function fechar() {
        if (!raiz) return;
        raiz.classList.add('hidden');
        raiz.classList.remove('flex');
        $('[data-a="img"]').removeAttribute('src');
        if (focoAntes && focoAntes.focus) try { focoAntes.focus({ preventScroll: true }); } catch (e) { }
    }

    window.AlbumFotos = { abrir, fechar };
})();
