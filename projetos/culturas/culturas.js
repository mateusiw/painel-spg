// Administração: culturas e variedades de cada local que tem Resumo da Colheita.
// As listas e as regras ficam em catalogo-colheita.js, o mesmo usado pela aba Lançar.
(function () {
    'use strict';
    const API = window.IrrigacaoAPI;
    if (!API.isAdmin()) { location.replace('../../index.html'); return; }

    const K_LOCAL = 'spg_culturas_local';
    const el = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // Um novo Resumo da Colheita em outro local entra aqui sozinho
    const locais = API.PROJETOS.filter(p => p.id.startsWith('resumo-colheita-') && p.local).map(p => p.local);
    const catalogos = new Map();
    let atual = locais.includes(localStorage.getItem(K_LOCAL)) ? localStorage.getItem(K_LOCAL) : locais[0];
    let timerAviso = null;

    function avisar(texto) {
        const a = el('aviso');
        a.textContent = texto;
        a.classList.remove('hidden');
        clearTimeout(timerAviso);
        timerAviso = setTimeout(() => a.classList.add('hidden'), 3500);
    }

    function desenharLocais() {
        el('locais').innerHTML = locais.map(id => `<button type="button" role="tab" aria-selected="${id === atual}" data-local="${esc(id)}"
            class="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${id === atual ? 'bg-white shadow-sm ring-1 ring-slate-200/80 text-emerald-700' : 'text-slate-500'}">${esc(API.nomeLocal(id))}</button>`).join('');
    }

    // Cada local tem o próprio painel: trocar de local não perde a busca do outro
    function abrir(id) {
        atual = id;
        try { localStorage.setItem(K_LOCAL, id); } catch (e) { /* só não lembra o local */ }
        desenharLocais();
        document.querySelectorAll('#paineis > [data-painel]').forEach(p => p.classList.toggle('hidden', p.dataset.painel !== id));
        if (catalogos.has(id)) return;
        const painel = document.createElement('div');
        painel.dataset.painel = id;
        el('paineis').appendChild(painel);
        const catalogo = window.CatalogoColheita.criar({ local: id, cliente: API.cliente, ehAdmin: true, nomeLocal: API.nomeLocal(id) });
        catalogos.set(id, catalogo);
        catalogo.desenhar(painel, { avisar });
    }

    el('locais').addEventListener('click', e => {
        const b = e.target.closest('[data-local]');
        if (b && b.dataset.local !== atual) abrir(b.dataset.local);
    });
    abrir(atual);
})();
