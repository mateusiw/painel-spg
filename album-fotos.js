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
        link: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
        mais: '<path d="M5 12h14M12 5v14"/>',
        menos: '<path d="M5 12h14"/>'
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
            <div data-a="visor" class="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden" style="touch-action: none;">
                <img data-a="img" alt="" referrerpolicy="no-referrer" draggable="false" class="max-w-full max-h-full object-contain" style="transform-origin: center center; will-change: transform; transition: opacity .2s;">
                <div data-a="zoomBarra" class="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-full bg-black/55 backdrop-blur p-1">
                    <button type="button" data-a="menos" aria-label="Diminuir zoom" class="w-10 h-10 inline-flex items-center justify-center rounded-full hover:bg-white/15 text-white">${ic('menos', 'w-5 h-5')}</button>
                    <button type="button" data-a="nivel" title="Voltar ao tamanho normal" class="min-w-[52px] h-10 px-1 rounded-full hover:bg-white/15 text-[12px] font-bold tabular-nums text-white">100%</button>
                    <button type="button" data-a="mais" aria-label="Aumentar zoom" class="w-10 h-10 inline-flex items-center justify-center rounded-full hover:bg-white/15 text-white">${ic('mais', 'w-5 h-5')}</button>
                </div>
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
        img.addEventListener('load', () => { img.style.opacity = '1'; $('[data-a="carregando"]').classList.add('hidden'); zerarZoom(); });
        img.addEventListener('error', () => { $('[data-a="carregando"]').classList.add('hidden'); });

        // ---------- Zoom ----------
        // Celular: pinça com dois dedos, toque duplo, arrastar a foto ampliada.
        // Computador: roda do mouse (no ponto do cursor), clique duplo, arrastar, teclas + e -.
        // Sem zoom, deslizar para os lados troca de foto.
        const visor = $('[data-a="visor"]');
        const toques = new Map();
        let gesto = null, ultimoToque = { t: 0, x: 0, y: 0 };
        visor.addEventListener('pointerdown', e => {
            if (e.target.closest('button')) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            try { visor.setPointerCapture(e.pointerId); } catch (err) { }
            toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
            gesto = iniciarGesto(e.target);
            if (zoom > 1) visor.style.cursor = 'grabbing';
        });
        visor.addEventListener('pointermove', e => {
            if (!toques.has(e.pointerId) || !gesto) return;
            toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
            const pts = [...toques.values()];
            if (pts.length >= 2) {
                // pinça: escala pela distância entre os dedos, em volta do ponto do meio (que também arrasta)
                const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
                const m = relativo((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
                const z = limitarZoom(gesto.z0 * d / gesto.d0);
                tx = m.x - (gesto.m0.x - gesto.tx0) * (z / gesto.z0);
                ty = m.y - (gesto.m0.y - gesto.ty0) * (z / gesto.z0);
                zoom = z; gesto.pinca = true; gesto.mexeu = true;
                aplicarZoom();
            } else {
                const dx = pts[0].x - gesto.x0, dy = pts[0].y - gesto.y0;
                if (Math.abs(dx) > 6 || Math.abs(dy) > 6) gesto.mexeu = true;
                if (zoom > 1 && !gesto.pinca) { tx = gesto.tx0 + dx; ty = gesto.ty0 + dy; aplicarZoom(); }
            }
        });
        const soltar = e => {
            if (!toques.has(e.pointerId)) return;
            const p = toques.get(e.pointerId);
            toques.delete(e.pointerId);
            visor.style.cursor = zoom > 1 ? 'grab' : '';
            if (toques.size) { gesto = iniciarGesto(null, gesto); return; }   // ainda tem um dedo: segue arrastando
            const g = gesto; gesto = null;
            if (!g || e.type === 'pointercancel') return;
            const dx = p.x - g.x0, dy = p.y - g.y0;
            if (g.pinca) return;
            // Sem zoom: deslizar para os lados troca de foto
            if (zoom <= 1.01 && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) { ir(atual + (dx < 0 ? 1 : -1)); return; }
            if (g.mexeu) return;
            // Toque duplo / clique duplo na foto: amplia nesse ponto (ou volta ao normal)
            const agora = Date.now();
            if (g.naFoto && agora - ultimoToque.t < 320 && Math.hypot(p.x - ultimoToque.x, p.y - ultimoToque.y) < 30) {
                ultimoToque.t = 0;
                if (zoom > 1.01) zerarZoom(true); else zoomEm(p.x, p.y, 2.5, true);
                return;
            }
            ultimoToque = { t: agora, x: p.x, y: p.y };
            if (!g.naFoto && zoom <= 1.01) fechar();   // toque fora da foto fecha
        };
        visor.addEventListener('pointerup', soltar);
        visor.addEventListener('pointercancel', soltar);
        visor.addEventListener('wheel', e => {
            if (emGrade) return;
            e.preventDefault();
            const passo = e.ctrlKey ? 0.012 : 0.0022;   // pinça no touchpad chega como ctrl + roda
            zoomEm(e.clientX, e.clientY, zoom * Math.exp(-e.deltaY * passo));
        }, { passive: false });
        $('[data-a="mais"]').addEventListener('click', () => zoomNoCentro(zoom * 1.5));
        $('[data-a="menos"]').addEventListener('click', () => zoomNoCentro(zoom / 1.5));
        $('[data-a="nivel"]').addEventListener('click', () => zerarZoom(true));
        addEventListener('resize', () => { if (raiz && !raiz.classList.contains('hidden')) aplicarZoom(); });

        document.addEventListener('keydown', e => {
            if (!raiz || raiz.classList.contains('hidden')) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                if (!emGrade && zoom > 1.01) zerarZoom(true);
                else if (emGrade && itens.length > 1) { emGrade = false; desenhar(); }
                else fechar();
            }
            else if (!emGrade && e.key === 'ArrowLeft') ir(atual - 1);
            else if (!emGrade && e.key === 'ArrowRight') ir(atual + 1);
            else if (!emGrade && (e.key === '+' || e.key === '=')) zoomNoCentro(zoom * 1.5);
            else if (!emGrade && (e.key === '-' || e.key === '_')) zoomNoCentro(zoom / 1.5);
            else if (!emGrade && e.key === '0') zerarZoom(true);
        });
    }

    // Estado do zoom: escala e deslocamento (em px, a partir do centro do visor)
    const ZOOM_MAX = 6;
    let zoom = 1, tx = 0, ty = 0;
    const limitarZoom = z => Math.max(1, Math.min(ZOOM_MAX, z));
    function relativo(x, y) {
        const r = $('[data-a="visor"]').getBoundingClientRect();
        return { x: x - (r.left + r.width / 2), y: y - (r.top + r.height / 2) };
    }
    function iniciarGesto(alvo, anterior) {
        const pts = [...toques.values()];
        const g = { x0: pts[0].x, y0: pts[0].y, tx0: tx, ty0: ty, z0: zoom, mexeu: !!(anterior && anterior.mexeu), pinca: !!(anterior && anterior.pinca),
            naFoto: anterior ? anterior.naFoto : alvo === $('[data-a="img"]') };
        if (pts.length >= 2) {
            g.d0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
            g.m0 = relativo((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
        }
        return g;
    }
    // Não deixa a foto ampliada sair do visor (sobra no máximo a borda dela)
    function prender() {
        const img = $('[data-a="img"]'), v = $('[data-a="visor"]');
        const folgaX = Math.max(0, (img.offsetWidth * zoom - v.clientWidth) / 2);
        const folgaY = Math.max(0, (img.offsetHeight * zoom - v.clientHeight) / 2);
        tx = Math.max(-folgaX, Math.min(folgaX, tx));
        ty = Math.max(-folgaY, Math.min(folgaY, ty));
    }
    function aplicarZoom(animar) {
        if (!raiz) return;
        if (zoom <= 1.001) { zoom = 1; tx = 0; ty = 0; } else prender();
        const img = $('[data-a="img"]');
        img.style.transition = animar ? 'transform .22s ease-out, opacity .2s' : 'opacity .2s';
        img.style.transform = zoom === 1 ? '' : `translate(${tx}px, ${ty}px) scale(${zoom})`;
        $('[data-a="nivel"]').textContent = Math.round(zoom * 100) + '%';
        $('[data-a="menos"]').disabled = zoom <= 1;
        $('[data-a="menos"]').style.opacity = zoom <= 1 ? '.4' : '1';
        $('[data-a="mais"]').disabled = zoom >= ZOOM_MAX;
        $('[data-a="mais"]').style.opacity = zoom >= ZOOM_MAX ? '.4' : '1';
        const v = $('[data-a="visor"]');
        if (!toques.size) v.style.cursor = zoom > 1 ? 'grab' : '';
        // com zoom, as setas laterais saem da frente (troca pelas miniaturas, teclado ou voltando ao normal)
        const varias = itens.length > 1;
        $('[data-a="ant"]').classList.toggle('hidden', !varias || zoom > 1);
        $('[data-a="prox"]').classList.toggle('hidden', !varias || zoom > 1);
    }
    // Amplia mantendo parado o ponto da tela (x, y) que está embaixo do dedo/cursor
    function zoomEm(x, y, novo, animar) {
        const z = limitarZoom(novo), p = relativo(x, y);
        tx = p.x - (p.x - tx) * (z / zoom);
        ty = p.y - (p.y - ty) * (z / zoom);
        zoom = z;
        aplicarZoom(animar);
    }
    function zoomNoCentro(novo) {
        const r = $('[data-a="visor"]').getBoundingClientRect();
        zoomEm(r.left + r.width / 2, r.top + r.height / 2, novo, true);
    }
    function zerarZoom(animar) { zoom = 1; tx = 0; ty = 0; aplicarZoom(animar); }

    function ir(i) {
        if (!itens.length) return;
        atual = (i + itens.length) % itens.length;
        zerarZoom();
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
        zerarZoom();
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
