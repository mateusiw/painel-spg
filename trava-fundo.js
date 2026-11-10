// Regra do Painel SPG: com uma janela (pop-up) aberta por cima da tela, o fundo fica parado.
// Não precisa mexer nas telas: qualquer camada fixa que cubra a tela inteira e esteja por cima
// trava a rolagem da página; quando ela some, a rolagem volta no mesmo ponto.
// Para uma camada não travar: data-sem-trava.
(function () {
    'use strict';
    if (window.__travaFundo) return;
    window.__travaFundo = true;

    const estilo = document.createElement('style');
    estilo.textContent = `
        html.trava-fundo.trava-com-barra { scrollbar-gutter: stable; }
        html.trava-fundo, html.trava-fundo body { overflow: hidden !important; overscroll-behavior: none; }
    `;
    (document.head || document.documentElement).appendChild(estilo);

    const CANDIDATOS = '.fixed, [role="dialog"], [aria-modal="true"], dialog[open], [class*="modal" i], [id*="modal" i], [class*="overlay" i], [id*="overlay" i]';
    let agendado = false;

    function visivel(el, cs) {
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none' || Number(cs.opacity) < 0.05) return false;
        if (el.checkVisibility) return el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
        return true;
    }

    // Camada que cobre a tela e está por cima de tudo no centro dela
    function bloqueia(el) {
        if (el.closest('[data-sem-trava]')) return false;
        if (el.tagName === 'DIALOG') { try { if (el.matches(':modal')) return true; } catch (e) { /* navegador antigo */ } }
        const cs = getComputedStyle(el);
        if (cs.position !== 'fixed' || !visivel(el, cs) || (parseInt(cs.zIndex, 10) < 0)) return false;
        const r = el.getBoundingClientRect();
        const w = innerWidth, h = innerHeight;
        if (r.width < w * 0.9 || r.height < h * 0.9 || r.left > w * 0.05 || r.top > h * 0.05) return false;
        const topo = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 0), w - 1), Math.min(Math.max(r.top + r.height / 2, 0), h - 1));
        return !!topo && el.contains(topo);
    }

    function conferir() {
        agendado = false;
        const raiz = document.documentElement;
        let travar = false;
        for (const el of document.querySelectorAll(CANDIDATOS)) { if (bloqueia(el)) { travar = true; break; } }
        if (travar !== raiz.classList.contains('trava-fundo')) {
            // Guarda e devolve a posição: alguns navegadores voltam ao topo ao destravar
            // Só reserva o espaço da barra de rolagem se ela existia (senão a tela encolheria)
            if (travar) { travaY = scrollY; raiz.classList.toggle('trava-com-barra', innerWidth - raiz.clientWidth > 0); raiz.classList.add('trava-fundo'); }
            else { raiz.classList.remove('trava-fundo', 'trava-com-barra'); if (Math.abs(scrollY - travaY) > 1) scrollTo(scrollX, travaY); }
        }
    }
    let travaY = 0;

    function agendar() {
        if (agendado) return;
        agendado = true;
        requestAnimationFrame(conferir);
    }

    function iniciar() {
        new MutationObserver(agendar).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] });
        // Transições (aparecer aos poucos) terminam depois da mudança de classe
        document.addEventListener('transitionend', agendar, true);
        document.addEventListener('animationend', agendar, true);
        window.addEventListener('resize', agendar);
        agendar();
    }
    if (document.body) iniciar(); else document.addEventListener('DOMContentLoaded', iniciar);
})();
