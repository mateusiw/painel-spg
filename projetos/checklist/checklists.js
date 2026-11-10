// Projeto Check List: cada lista roda isolada no próprio quadro. Elas só carregam quando abertas
// e continuam abertas ao alternar, porque vários formulários não guardam rascunho.
(function () {
    'use strict';

    const LISTAS = [
        { id: 'geral', nome: 'Geral', icone: 'truck', arquivo: 'listas/geral.html' },
        { id: 'embarque', nome: 'Embarque', icone: 'ship', arquivo: 'listas/embarque.html' },
        { id: 'limpeza', nome: 'Limpeza', icone: 'sparkles', arquivo: 'listas/limpeza-diaria.html' },
        { id: 'cronograma', nome: 'Cronograma de Limpeza', icone: 'calendar-check', arquivo: 'listas/cronograma-limpeza.html' },
        { id: 'packing', nome: 'Packing House', icone: 'package', arquivo: 'listas/packing.html' },
        { id: 'pop', nome: 'POP', icone: 'clipboard-check', arquivo: 'listas/pop.html' }
    ];
    const CHAVE = 'spg_checklist_atual';
    const MENU = '../../index.html';
    const API = window.IrrigacaoAPI;
    const quadros = new Map();
    let atual = null;
    let bloqueiosIniciais = '[]';

    const el = id => document.getElementById(id);
    const liberadas = () => LISTAS.filter(l => API.recursoLiberado('checklist.' + l.id));

    function renderAbas() {
        el('checklistAbas').innerHTML = liberadas().map(l => {
            const ativa = l.id === atual;
            return `<button type="button" role="tab" aria-selected="${ativa}" data-checklist="${l.id}" class="shrink-0 flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${ativa ? 'bg-white shadow-sm ring-1 ring-slate-200/80 text-emerald-700' : 'text-slate-500 hover:text-slate-800'}"><i data-lucide="${l.icone}" class="w-3.5 h-3.5"></i>${l.nome}</button>`;
        }).join('');
        lucide.createIcons();
    }

    function criarQuadro(lista) {
        const carregando = el('checklistCarregando');
        carregando.classList.remove('hidden');
        const quadro = document.createElement('iframe');
        quadro.title = 'Check-list ' + lista.nome;
        quadro.className = 'absolute inset-0 w-full h-full border-0';
        quadro.addEventListener('load', () => { if (atual === lista.id) carregando.classList.add('hidden'); });
        quadro.src = lista.arquivo;
        el('checklistArea').appendChild(quadro);
        quadros.set(lista.id, quadro);
    }

    function abrir(id) {
        const opcoes = liberadas();
        const lista = opcoes.find(l => l.id === id) || opcoes[0];
        atual = lista.id;
        try { localStorage.setItem(CHAVE, atual); } catch (e) { /* só não lembra a escolha */ }
        el('checklistCarregando').classList.add('hidden');
        if (!quadros.has(atual)) criarQuadro(lista);
        quadros.forEach((q, chave) => q.classList.toggle('hidden', chave !== atual));
        renderAbas();
    }

    // O administrador pode ter mudado as permissões desde o último acesso
    async function conferirAcesso() {
        if (!navigator.onLine) return;
        if (!await API.sessaoValida()) { location.replace(MENU); return; }
        let perfil;
        try { perfil = await API.atualizarPerfil(); } catch (e) { return; }
        if (!perfil || !API.projetosDoUsuario().some(p => p.id === 'checklist')) location.replace(MENU);
        else if (JSON.stringify(perfil.bloqueios || []) !== bloqueiosIniciais) location.reload();
    }

    window.iniciarChecklists = function () {
        if (!API.projetosDoUsuario().some(p => p.id === 'checklist')) { location.replace(MENU); return; }
        bloqueiosIniciais = JSON.stringify((API.usuarioAtual() || {}).bloqueios || []);
        el('nomeUsuario').textContent = API.nomeUsuario();
        const varios = API.projetosDoUsuario().length > 1;
        el('btnMenuProjetos').classList.toggle('hidden', !varios);
        el('btnMenuProjetos').classList.toggle('flex', varios);
        el('checklistAbas').addEventListener('click', e => {
            const b = e.target.closest('[data-checklist]');
            if (b) abrir(b.dataset.checklist);
        });
        el('btnSair').addEventListener('click', async () => {
            try { await API.logout(); } catch (e) { /* sai mesmo assim */ }
            location.replace(MENU);
        });
        let salvo = null;
        try { salvo = localStorage.getItem(CHAVE); } catch (e) { /* abre a primeira */ }
        abrir(salvo);
        conferirAcesso();
    };
})();
