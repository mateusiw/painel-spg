// Janelas de aviso e confirmação modernas para todo o Painel SPG (no lugar do alert/confirm do navegador).
//
//   await Dialogo.avisar('Texto', { titulo: 'Atenção', tipo: 'erro' });          // tipo: info | sucesso | erro | aviso
//   if (!(await Dialogo.confirmar('Excluir este item?', { botao: 'Excluir', perigo: true }))) return;
//
// Tem o próprio visual (não depende do Tailwind), então funciona em qualquer página, inclusive
// no Estoque. Qualquer alert() que sobrar no código também passa a abrir esta janela.
(function () {
    'use strict';
    if (window.Dialogo) return;

    const css = document.createElement('style');
    css.textContent = `
        .dlg-fundo { position: fixed; inset: 0; z-index: 2147483600; display: flex; align-items: flex-end; justify-content: center;
            background: rgba(2, 6, 23, .55); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px);
            opacity: 0; transition: opacity .18s ease; font-family: inherit; }
        @media (min-width: 640px) { .dlg-fundo { align-items: center; padding: 20px; } }
        .dlg-fundo.dlg-aberto { opacity: 1; }
        .dlg-caixa { width: 100%; max-width: 420px; max-height: 90dvh; overflow: auto; box-sizing: border-box; background: #fff; color: #0f172a;
            border-radius: 24px 24px 0 0; box-shadow: 0 30px 70px -20px rgba(2, 6, 23, .45), 0 0 0 1px rgba(226, 232, 240, .9);
            padding: 24px 22px max(20px, env(safe-area-inset-bottom)); text-align: center;
            transform: translateY(16px); transition: transform .22s cubic-bezier(.2, .8, .2, 1); }
        @media (min-width: 640px) { .dlg-caixa { border-radius: 24px; padding-bottom: 22px; transform: translateY(8px) scale(.98); } }
        .dlg-fundo.dlg-aberto .dlg-caixa { transform: none; }
        .dlg-icone { width: 56px; height: 56px; margin: 0 auto 14px; border-radius: 18px; display: flex; align-items: center; justify-content: center; }
        .dlg-icone svg { width: 28px; height: 28px; }
        .dlg-info    .dlg-icone { background: #eff6ff; color: #2563eb; }
        .dlg-sucesso .dlg-icone { background: #ecfdf5; color: #059669; }
        .dlg-erro    .dlg-icone { background: #fef2f2; color: #dc2626; }
        .dlg-aviso   .dlg-icone { background: #fffbeb; color: #d97706; }
        .dlg-pergunta .dlg-icone { background: #ecfdf5; color: #059669; }
        .dlg-perigo  .dlg-icone { background: #fef2f2; color: #dc2626; }
        .dlg-titulo { margin: 0; font-size: 18px; line-height: 1.3; font-weight: 800; color: #1e293b; }
        .dlg-texto { margin: 8px 0 0; font-size: 14px; line-height: 1.55; color: #64748b; white-space: pre-line; overflow-wrap: anywhere; }
        .dlg-botoes { display: flex; gap: 10px; margin-top: 22px; }
        .dlg-botoes button { flex: 1; min-height: 48px; border: 0; border-radius: 14px; font: inherit; font-size: 14px; font-weight: 800; cursor: pointer;
            transition: transform .1s ease, background-color .15s ease, box-shadow .15s ease; }
        .dlg-botoes button:active { transform: scale(.97); }
        .dlg-botoes button:focus-visible { outline: 3px solid rgba(16, 185, 129, .45); outline-offset: 2px; }
        .dlg-cancelar { background: #f1f5f9; color: #475569; }
        .dlg-cancelar:hover { background: #e2e8f0; }
        .dlg-ok { color: #fff; background: linear-gradient(to bottom, #10b981, #059669); box-shadow: 0 8px 18px -8px rgba(5, 150, 105, .55); }
        .dlg-ok:hover { background: linear-gradient(to bottom, #059669, #047857); }
        .dlg-perigo .dlg-ok { background: linear-gradient(to bottom, #ef4444, #dc2626); box-shadow: 0 8px 18px -8px rgba(220, 38, 38, .55); }
        .dlg-perigo .dlg-ok:hover { background: linear-gradient(to bottom, #dc2626, #b91c1c); }
        @media (prefers-reduced-motion: reduce) { .dlg-fundo, .dlg-caixa { transition: none; } }
    `;
    (document.head || document.documentElement).appendChild(css);

    const svg = corpo => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${corpo}</svg>`;
    const ICONES = {
        info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
        sucesso: svg('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
        erro: svg('<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>'),
        aviso: svg('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>'),
        pergunta: svg('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>'),
        perigo: svg('<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>')
    };
    const TITULOS = { info: 'Aviso', sucesso: 'Pronto', erro: 'Algo deu errado', aviso: 'Atenção', pergunta: 'Confirmar', perigo: 'Tem certeza?' };
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // Monta a janela e devolve uma promessa com o botão escolhido (true = confirmar)
    function abrir({ tipo, titulo, texto, botao, cancelar }) {
        return new Promise(resolver => {
            const voltarFoco = document.activeElement;
            const fundo = document.createElement('div');
            fundo.className = `dlg-fundo dlg-${tipo}`;
            fundo.setAttribute('role', cancelar ? 'alertdialog' : 'dialog');
            fundo.setAttribute('aria-modal', 'true');
            const id = 'dlg' + Math.random().toString(36).slice(2, 8);
            fundo.setAttribute('aria-labelledby', id + 't');
            fundo.setAttribute('aria-describedby', id + 'x');
            fundo.innerHTML = `<div class="dlg-caixa">
                <div class="dlg-icone">${ICONES[tipo] || ICONES.info}</div>
                <h3 class="dlg-titulo" id="${id}t">${esc(titulo || TITULOS[tipo])}</h3>
                ${texto ? `<p class="dlg-texto" id="${id}x">${esc(texto)}</p>` : ''}
                <div class="dlg-botoes">
                    ${cancelar ? `<button type="button" class="dlg-cancelar" data-dlg="nao">${esc(cancelar)}</button>` : ''}
                    <button type="button" class="dlg-ok" data-dlg="sim">${esc(botao)}</button>
                </div>
            </div>`;
            document.body.appendChild(fundo);
            requestAnimationFrame(() => fundo.classList.add('dlg-aberto'));
            const ok = fundo.querySelector('[data-dlg="sim"]');
            setTimeout(() => (fundo.querySelector('[data-dlg="nao"]') && tipo === 'perigo' ? fundo.querySelector('[data-dlg="nao"]') : ok).focus(), 30);

            let fechado = false;
            const fechar = valor => {
                if (fechado) return;
                fechado = true;
                fundo.classList.remove('dlg-aberto');
                setTimeout(() => { fundo.remove(); if (voltarFoco && voltarFoco.focus) try { voltarFoco.focus({ preventScroll: true }); } catch (e) {} }, 180);
                resolver(valor);
            };
            fundo.addEventListener('click', e => {
                const b = e.target.closest('[data-dlg]');
                if (b) fechar(b.dataset.dlg === 'sim');
                else if (e.target === fundo && !cancelar) fechar(true); // aviso: tocar fora fecha
            });
            fundo.addEventListener('keydown', e => {
                e.stopPropagation();
                if (e.key === 'Escape') { e.preventDefault(); fechar(!cancelar); }
                else if (e.key === 'Tab') {
                    // O foco fica dentro da janela
                    const bts = [...fundo.querySelectorAll('button')];
                    const i = bts.indexOf(document.activeElement);
                    e.preventDefault();
                    bts[(i + (e.shiftKey ? -1 : 1) + bts.length) % bts.length].focus();
                }
            });
        });
    }

    function avisar(texto, opcoes = {}) {
        return abrir({ tipo: opcoes.tipo || 'info', titulo: opcoes.titulo, texto, botao: opcoes.botao || 'Entendi', cancelar: null }).then(() => undefined);
    }
    function confirmar(texto, opcoes = {}) {
        return abrir({ tipo: opcoes.perigo ? 'perigo' : (opcoes.tipo || 'pergunta'), titulo: opcoes.titulo, texto, botao: opcoes.botao || 'Confirmar', cancelar: opcoes.cancelar || 'Cancelar' });
    }

    const alertNativo = window.alert;
    window.Dialogo = { avisar, confirmar, alertNativo };
    // Qualquer alert() que ainda exista no código abre a janela moderna
    window.alert = mensagem => { avisar(String(mensagem ?? '')); };
})();
