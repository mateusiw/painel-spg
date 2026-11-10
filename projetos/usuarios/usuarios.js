// Cadastro central de usuários: quem acessa cada projeto e o que fica liberado dentro dele.
// Somente o administrador. perfis.modulos = áreas com acesso; perfis.bloqueios = abas/seções retiradas.
(function () {
    'use strict';

    const API = window.IrrigacaoAPI;
    const MENU = '../../index.html';
    const NOVO = '__novo__';
    const PROJETOS = API.PROJETOS.filter(p => !p.soAdmin);

    if (!API.isAdmin()) { location.replace(MENU); return; }

    let usuarios = [];
    let emails = {};
    // Antes de rodar o SQL dos e-mails, mostra o endereço montado a partir do login
    const emailDe = u => emails[u.id] || (u.usuario + '@' + ((window.SUPABASE_CONFIG || {}).emailDominio || 'spgoasis.local'));
    let editando = null;
    let r = {};
    let filtroAtual = 'todos';
    let localFiltro = 'todos';
    try { localFiltro = localStorage.getItem('spg_usuarios_local') || 'todos'; } catch (e) { /* começa em Todos */ }
    let erroEditor = '';
    let salvando = false;
    const NOVO_LOCAL = '__novo_local__';
    let modoLocais = false;
    let localEditando = null;
    let rl = {};
    let erroLocal = '';

    const el = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const icones = () => { if (window.lucide) lucide.createIcons(); };
    const semAcento = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const mesmaLista = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    const listaDe = (v, padrao) => Array.isArray(v) ? v.slice() : padrao.slice();
    const atual = () => editando === NOVO ? null : usuarios.find(u => u.id === editando);

    // "MATEUS PAULO DA SILVA" -> "Mateus Silva"
    function sugerirNomeCurto(nome) {
        const partes = String(nome || '').trim().split(/\s+/).filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase());
        return partes.length <= 1 ? partes.join('') : `${partes[0]} ${partes[partes.length - 1]}`;
    }

    // Primeiro nome sem acento; se já existir, tenta com o sobrenome e depois com número
    function sugerirLogin(nome) {
        const partes = String(nome || '').trim().split(/\s+/).map(s => semAcento(s).replace(/[^a-z0-9]/g, '')).filter(Boolean);
        if (!partes.length) return '';
        const existe = u => usuarios.some(p => p.usuario === u);
        const opcoes = [partes[0]];
        if (partes.length > 1) opcoes.push(`${partes[0]}.${partes[partes.length - 1]}`);
        const livre = opcoes.find(u => u.length >= 2 && !existe(u));
        if (livre) return livre.slice(0, 30);
        for (let n = 2; n < 100; n++) if (!existe(partes[0] + n)) return (partes[0] + n).slice(0, 30);
        return '';
    }

    // Senha fácil de ditar: sem letras parecidas (l/1, O/0)
    function gerarSenha() {
        const letras = 'abcdefghjkmnpqrstuvwxyz', numeros = '23456789';
        const sorteio = (base, n) => Array.from({ length: n }, () => base[Math.floor(Math.random() * base.length)]).join('');
        return sorteio(letras, 4) + sorteio(numeros, 4);
    }

    function janela({ titulo, texto, botao = 'OK', cancelar = true, aoConfirmar }) {
        el('janelaTitulo').innerText = titulo;
        el('janelaTexto').innerText = texto;
        el('janelaOk').innerText = botao;
        el('janelaCancelar').classList.toggle('hidden', !cancelar);
        el('janelaOk').onclick = () => { fecharJanela(); if (aoConfirmar) aoConfirmar(); };
        el('janela').classList.remove('hidden');
        el('janela').classList.add('flex');
        el('janelaOk').focus();
    }
    function fecharJanela() {
        el('janela').classList.add('hidden');
        el('janela').classList.remove('flex');
    }

    // Resumo do acesso: "Irrigação", ou "Irrigação 3/4" quando parte das opções está bloqueada
    function resumoProjetos(u) {
        if (u.administrador) return [{ nome: 'Todos os projetos', parcial: false }];
        return PROJETOS.map(p => {
            const principais = p.areas.filter(a => !a.extra);
            const areas = principais.filter(a => API.modulosDoUsuario(u).includes(a.modulo));
            if (!areas.length) return null;
            const todos = principais.flatMap(a => a.recursos.length ? a.recursos.map(x => x.id) : [a.modulo]);
            const liberados = areas.flatMap(a => a.recursos.length ? a.recursos.filter(x => API.recursoLiberado(x.id, u)).map(x => x.id) : [a.modulo]);
            const parcial = liberados.length < todos.length;
            return { nome: p.nome + (parcial ? ` ${liberados.length}/${todos.length}` : ''), parcial };
        }).filter(Boolean);
    }

    const locaisAtivos = () => API.todosLocais().filter(l => l.ativo !== false);
    const locaisDe = u => listaDe(u.locais, ['oasis']);
    const semLocalValido = u => !u.administrador && !locaisDe(u).some(id => locaisAtivos().some(l => l.id === id));

    // O administrador acessa tudo: aparece só em Todos, para não repetir em cada local
    function pertenceAoLocal(u, id) {
        if (id === 'todos') return true;
        if (id === 'sem') return semLocalValido(u);
        return !u.administrador && locaisDe(u).includes(id);
    }

    function renderAbasLocais() {
        const abas = [{ id: 'todos', nome: 'Todos' }, ...locaisAtivos().map(l => ({ id: l.id, nome: l.nome }))];
        if (usuarios.some(u => u.ativo && semLocalValido(u))) abas.push({ id: 'sem', nome: 'Sem local' });
        if (!abas.some(a => a.id === localFiltro)) localFiltro = 'todos';
        el('abasLocais').innerHTML = abas.map(a => {
            const ativa = a.id === localFiltro;
            const qtd = usuarios.filter(u => u.ativo && pertenceAoLocal(u, a.id)).length;
            return `<button type="button" data-acao="localFiltro" data-id="${esc(a.id)}" aria-pressed="${ativa}" class="flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 -mb-px transition-colors ${ativa ? 'border-emerald-600 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}">
                ${a.id === 'todos' ? '' : '<i data-lucide="map-pin" class="w-3.5 h-3.5"></i>'}${esc(a.nome)}
                <span class="text-[10px] font-black px-1.5 py-0.5 rounded-full ${ativa ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}">${qtd}</span>
            </button>`;
        }).join('');
    }

    function cartao(u) {
        const nome = u.nome_curto || u.nome;
        const iniciais = nome.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase();
        const selo = (cor, texto) => `<span class="inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full ${cor}">${esc(texto)}</span>`;
        const eu = (API.usuarioAtual() || {}).id === u.id;
        const projetos = resumoProjetos(u);
        return `<button type="button" data-acao="editar" data-id="${esc(u.id)}" aria-current="${editando === u.id}"
            class="w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-all ${editando === u.id ? 'border-amber-400 ring-2 ring-amber-200' : 'border-slate-200 hover:shadow-sm'} ${u.ativo ? '' : 'opacity-60'}">
            <span class="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black shrink-0 ${u.administrador ? 'bg-slate-800 text-white' : u.papel === 'gestor' ? 'bg-sky-50 text-sky-700' : 'bg-green-50 text-green-700'}">${esc(iniciais)}</span>
            <span class="min-w-0 flex-1">
                <span class="block text-sm font-black text-slate-800 truncate ${u.ativo ? '' : 'line-through'}">${esc(nome)}${eu ? ' <span class="text-[10px] font-medium text-slate-400">(você)</span>' : ''}</span>
                <span class="block text-[11px] text-slate-500 truncate" title="${esc(emailDe(u))}">${esc(emailDe(u))}</span>
                <span class="flex flex-wrap gap-1 mt-1">
                    ${u.administrador ? selo('bg-slate-800 text-white', 'Administrador') : u.papel === 'gestor' ? selo('bg-sky-50 text-sky-700', 'Gestor') : ''}
                    ${localFiltro === 'todos' && !u.administrador ? locaisDe(u).map(id => selo('bg-emerald-50 text-emerald-800', API.nomeLocal(id))).join('') : ''}
                    ${projetos.length ? projetos.map(p => selo(p.parcial ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600', p.nome)).join('') : selo('bg-red-50 text-red-600', 'Sem acesso')}
                    ${u.ativo ? '' : selo('bg-red-50 text-red-600', 'Desativado')}
                </span>
            </span>
            <i data-lucide="chevron-right" class="w-4 h-4 text-slate-300 shrink-0"></i>
        </button>`;
    }

    function renderLista() {
        renderAbasLocais();
        const doLocal = usuarios.filter(u => pertenceAoLocal(u, localFiltro));
        const FILTROS = {
            todos: { rotulo: 'Todos', teste: u => u.ativo },
            gestor: { rotulo: 'Gestores', teste: u => u.ativo && u.papel === 'gestor' },
            sem: { rotulo: 'Sem acesso', teste: u => u.ativo && !u.administrador && !resumoProjetos(u).length },
            desativados: { rotulo: 'Desativados', teste: u => !u.ativo }
        };
        // Um filtro que não tem ninguém neste local some da tela e deixa de valer
        if (filtroAtual !== 'todos' && filtroAtual !== 'gestor' && !doLocal.some(FILTROS[filtroAtual].teste)) filtroAtual = 'todos';
        el('filtros').innerHTML = Object.entries(FILTROS).map(([id, f]) => {
            const qtd = doLocal.filter(f.teste).length;
            if (id !== 'todos' && id !== 'gestor' && !qtd) return '';
            const ativo = filtroAtual === id;
            return `<button type="button" data-acao="filtro" data-id="${id}" aria-pressed="${ativo}" class="px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${ativo ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'}">${f.rotulo} <span class="${ativo ? 'text-slate-300' : 'text-slate-400'}">${qtd}</span></button>`;
        }).join('');

        const busca = semAcento(el('busca').value.trim());
        const nome = u => u.nome_curto || u.nome;
        const visiveis = doLocal
            .filter(u => (FILTROS[filtroAtual] || FILTROS.todos).teste(u) && (!busca || [u.nome, u.nome_curto, u.usuario, emailDe(u)].some(v => semAcento(v).includes(busca))))
            .sort((a, b) => (Number(b.administrador) - Number(a.administrador)) || nome(a).localeCompare(nome(b), 'pt-BR'));
        el('lista').innerHTML = visiveis.map(cartao).join('') || `<p class="text-xs text-slate-400 text-center py-8">${busca ? 'Nenhum usuário encontrado.' : 'Nenhum usuário neste local.'}</p>`;

        const ativos = usuarios.filter(u => u.ativo).length;
        el('contagem').innerText = `${ativos} ativo${ativos === 1 ? '' : 's'}`;
        icones();
    }

    function interruptor(acao, id, ligado, rotulo) {
        return `<button type="button" role="switch" aria-checked="${ligado}" aria-label="${esc(rotulo)}" data-acao="${acao}" data-id="${esc(id)}" class="relative inline-block w-10 h-6 rounded-full transition-colors shrink-0 ${ligado ? 'bg-emerald-500' : 'bg-slate-300'}"><span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${ligado ? 'translate-x-4' : ''}"></span></button>`;
    }

    function blocoProjeto(p) {
        const areas = p.areas.map(a => {
            const ligado = r.modulos.includes(a.modulo);
            const mostrarTitulo = p.areas.length > 1;
            const opcoes = a.recursos.length ? `
                <div class="mt-2 ${mostrarTitulo ? 'pl-1' : ''}">
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">${ligado ? 'O que fica liberado' : 'Opções deste acesso (toque para ligar)'}</p>
                    <div class="flex flex-wrap gap-1.5">${a.recursos.map(x => {
                        if (!ligado) return `<button type="button" aria-pressed="false" data-acao="ligarArea" data-id="${esc(a.modulo)}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-dashed border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-400 hover:border-slate-400 transition-all"><i data-lucide="${x.icone}" class="w-3.5 h-3.5"></i>${esc(x.nome)}</button>`;
                        const liberado = !r.bloqueios.includes(x.id);
                        return `<button type="button" aria-pressed="${liberado}" data-acao="recurso" data-id="${esc(x.id)}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-[11px] font-bold transition-all ${liberado ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-400'}"><i data-lucide="${liberado ? 'check' : 'x'}" class="w-3.5 h-3.5"></i>${esc(x.nome)}</button>`;
                    }).join('')}</div>
                </div>` : '';
            return `<div class="py-2.5">
                <div class="flex items-center justify-between gap-3">
                    <span class="text-sm font-bold ${ligado ? 'text-slate-800' : 'text-slate-400'}">${esc(a.nome)}</span>
                    ${interruptor('area', a.modulo, ligado, a.nome)}
                </div>${opcoes}</div>`;
        }).join('<div class="border-t border-slate-100"></div>');

        const papelTravado = editando !== NOVO && (atual().administrador || atual().id === (API.usuarioAtual() || {}).id);
        const funcao = p.id === 'irrigacao' && r.modulos.includes('irrigacao') ? `
            <div class="border-t border-slate-100 pt-2.5 pb-1">
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Função na irrigação</p>
                <div class="grid grid-cols-2 gap-1.5">${[['irrigador', 'Irrigador', 'Registra irrigação, poços e reservatórios'], ['gestor', 'Gestor', 'Edita programação, cadastros e vê o log']].map(([id, nome, desc]) => {
                    const ativo = r.papel === id;
                    return `<button type="button" ${papelTravado ? 'disabled' : ''} aria-pressed="${ativo}" data-acao="papel" data-id="${id}" class="text-left px-3 py-2 rounded-xl border-2 ${ativo ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-600'} ${papelTravado && !ativo ? 'opacity-40' : ''}"><span class="block text-xs font-black">${nome}</span><span class="block text-[10px] mt-0.5 ${ativo ? 'text-slate-300' : 'text-slate-400'}">${desc}</span></button>`;
                }).join('')}</div>
                ${papelTravado ? '<p class="text-[10px] text-slate-400 mt-1">Não dá para mudar a própria função.</p>' : ''}
            </div>` : '';

        return `<article class="border border-slate-200 rounded-2xl overflow-hidden">
            <header class="flex items-center gap-2.5 px-4 py-3 bg-slate-50 border-b border-slate-100">
                <span class="w-8 h-8 rounded-lg flex items-center justify-center ${p.cor}"><i data-lucide="${p.icone}" class="w-4 h-4"></i></span>
                <h3 class="text-sm font-black text-slate-800">${esc(p.nome)}</h3>
                ${API.locaisDoProjeto(p.id) ? `<span class="ml-auto text-[10px] font-bold text-slate-400 text-right">${esc(API.locaisDoProjeto(p.id).map(id => API.nomeLocal(id)).join(', '))}</span>` : ''}
            </header>
            <div class="px-4 py-1">${areas}${funcao}</div>
        </article>`;
    }

    // --- LOCAIS (Fazenda Oásis, SPG Sede, Estufa...) ---
    function sugerirCodigoLocal(nome) {
        return semAcento(nome).replace(/^spg\s+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
    }

    const pessoasDoLocal = id => usuarios.filter(u => u.ativo && pertenceAoLocal(u, id)).length;
    const todosOrdenados = () => API.todosLocais().slice().sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || a.nome.localeCompare(b.nome, 'pt-BR'));

    function editorLocal(l) {
        const novo = !l;
        const campo = 'w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-2.5 px-3 text-sm font-medium text-slate-800 outline-none focus:border-slate-400 focus:bg-white';
        const rotulo = (t, para) => `<label for="${para}" class="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">${t}</label>`;
        return `<div class="border-2 border-amber-300 rounded-2xl p-4 space-y-3">
            <p class="text-xs font-black text-amber-800 uppercase tracking-wide">${novo ? 'Novo local' : 'Editar ' + esc(l.nome)}</p>
            <div>${rotulo('Nome <span class="text-red-400">*</span>', 'locNome')}<input id="locNome" data-campo-local="nome" value="${esc(rl.nome)}" maxlength="40" placeholder="ex: SPG Sede" class="${campo} font-bold"></div>
            <div class="grid grid-cols-[1.4fr_0.6fr] gap-2">
                <div>${rotulo('Código' + (novo ? ' <span class="text-red-400">*</span>' : ''), 'locCodigo')}<input id="locCodigo" data-campo-local="id" value="${esc(rl.id)}" maxlength="30" ${novo ? '' : 'disabled'} autocapitalize="none" spellcheck="false" class="${campo} font-mono ${novo ? '' : 'opacity-60'}"></div>
                <div>${rotulo('Ordem', 'locOrdem')}<input id="locOrdem" data-campo-local="ordem" type="number" value="${esc(rl.ordem)}" min="0" step="1" inputmode="numeric" class="${campo}"></div>
            </div>
            <p class="text-[11px] text-slate-500">${novo ? 'O código é interno e não pode ser trocado depois. Use letras minúsculas, números, "-" ou "_".' : 'O código não muda, pois os dados do local ficam ligados a ele.'}</p>
            ${erroLocal ? `<p role="alert" class="text-xs font-bold text-red-500">${esc(erroLocal)}</p>` : ''}
            <div class="flex gap-2">
                <button type="button" data-acao="cancelarLocal" class="flex-1 bg-slate-100 text-slate-600 font-bold py-2.5 rounded-xl text-sm">Cancelar</button>
                <button type="button" id="locSalvar" data-acao="salvarLocal" ${salvando ? 'disabled' : ''} class="flex-1 bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white font-bold py-2.5 rounded-xl text-sm">${salvando ? 'Salvando...' : novo ? 'Criar local' : 'Salvar'}</button>
            </div>
        </div>`;
    }

    function cartaoLocal(l) {
        const ativo = l.ativo !== false;
        const qtd = pessoasDoLocal(l.id);
        return `<div class="flex items-center gap-3 p-3 rounded-xl border border-slate-200 ${ativo ? '' : 'opacity-60'}">
            <span class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0"><i data-lucide="map-pin" class="w-5 h-5"></i></span>
            <span class="min-w-0 flex-1">
                <span class="block text-sm font-black text-slate-800 truncate ${ativo ? '' : 'line-through'}">${esc(l.nome)}</span>
                <span class="block text-[11px] text-slate-500 truncate"><span class="font-mono">${esc(l.id)}</span> · ordem ${esc(l.ordem ?? 0)} · ${qtd} pessoa${qtd === 1 ? '' : 's'}</span>
                ${ativo ? '' : '<span class="block text-[10px] font-bold text-red-500">Desativado</span>'}
            </span>
            <button type="button" data-acao="editarLocal" data-id="${esc(l.id)}" aria-label="Editar ${esc(l.nome)}" title="Editar" class="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg shrink-0"><i data-lucide="pencil" class="w-4 h-4"></i></button>
            ${interruptor('ativoLocal', l.id, ativo, (ativo ? 'Desativar ' : 'Reativar ') + l.nome)}
        </div>`;
    }

    // --- EM QUAIS LOCAIS CADA PROJETO EXISTE ---
    let salvandoProjeto = false;

    function blocoProjetoLocais(p) {
        const marcados = API.locaisDoProjeto(p.id) || [];
        const opcoes = p.local
            ? `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-[11px] font-bold text-slate-600"><i data-lucide="lock" class="w-3.5 h-3.5"></i>${esc(API.nomeLocal(p.local))}</span>`
            : locaisAtivos().map(l => {
                const on = marcados.includes(l.id);
                return `<button type="button" aria-pressed="${on}" data-acao="projetoLocal" data-projeto="${esc(p.id)}" data-id="${esc(l.id)}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-[11px] font-bold transition-all ${on ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}"><i data-lucide="${on ? 'check' : 'map-pin'}" class="w-3.5 h-3.5"></i>${esc(l.nome)}</button>`;
            }).join('');
        const situacao = p.local ? 'Dados exclusivos deste local' : marcados.length ? '' : 'Vale para todos os locais';
        return `<article class="p-3 rounded-xl border border-slate-200">
            <div class="flex items-center gap-2.5 mb-2">
                <span class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${p.cor}"><i data-lucide="${p.icone}" class="w-4 h-4"></i></span>
                <span class="min-w-0"><span class="block text-sm font-black text-slate-800 truncate">${esc(p.nome)}</span>${situacao ? `<span class="block text-[11px] text-slate-500">${situacao}</span>` : ''}</span>
            </div>
            <div class="flex flex-wrap gap-1.5">${opcoes}</div>
        </article>`;
    }

    async function alternarLocalDoProjeto(projeto, local) {
        if (salvandoProjeto) return;
        const atuais = API.locaisDoProjeto(projeto) || [];
        salvandoProjeto = true;
        try {
            await API.salvarLocaisProjeto(projeto, alternar(atuais, local));
            renderLocais();
        } catch (e) {
            janela({ titulo: 'Não foi possível salvar', texto: e.message, cancelar: false });
        } finally {
            salvandoProjeto = false;
        }
    }

    function renderLocais() {
        const painel = el('painelEditor');
        const locais = todosOrdenados();
        const ativos = locais.filter(l => l.ativo !== false).length;
        painel.className = 'fixed inset-0 z-40 overflow-y-auto bg-slate-50 p-4 lg:static lg:z-auto lg:overflow-visible lg:bg-transparent lg:p-0';
        painel.innerHTML = `<div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden max-w-xl mx-auto lg:max-w-none">
            <div class="bg-gradient-to-r from-slate-700 to-slate-800 px-5 py-4 flex items-center justify-between gap-2">
                <div class="min-w-0">
                    <h2 class="text-base font-bold text-white">Locais e projetos</h2>
                    <p id="locaisContagem" class="text-[11px] text-slate-300">${ativos} ativo${ativos === 1 ? '' : 's'}${locais.length > ativos ? ` · ${locais.length - ativos} desativado${locais.length - ativos === 1 ? '' : 's'}` : ''}</p>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <button type="button" data-acao="novoLocal" class="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-white text-slate-800 hover:bg-slate-100"><i data-lucide="plus" class="w-4 h-4"></i>Novo local</button>
                    <button type="button" data-acao="fechar" aria-label="Fechar" class="p-1.5 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg"><i data-lucide="x" class="w-4 h-4"></i></button>
                </div>
            </div>
            <div id="locaisLista" class="p-4 space-y-2">
                ${localEditando === NOVO_LOCAL ? editorLocal(null) : ''}
                ${locais.map(l => l.id === localEditando ? editorLocal(l) : cartaoLocal(l)).join('')}
            </div>
            <p class="px-5 pb-4 text-[11px] text-slate-500">Cada local tem os seus próprios dados. O acesso de cada pessoa é marcado no cadastro dela. Precisa de internet.</p>
            <section class="border-t border-slate-100 p-4 space-y-2" aria-labelledby="tituloProjetosLocais">
                <h3 id="tituloProjetosLocais" class="text-sm font-black text-slate-800">Projetos em cada local</h3>
                <p class="text-[11px] text-slate-500">Marque onde cada projeto existe. Sem nenhum marcado, ele vale para todos os locais.</p>
                <div id="projetosLocais" class="space-y-2">${PROJETOS.map(blocoProjetoLocais).join('')}</div>
            </section>
        </div>`;
        icones();
    }

    function abrirLocais() {
        editando = null;
        erroEditor = '';
        modoLocais = true;
        localEditando = null;
        erroLocal = '';
        renderLocais();
        renderLista();
    }

    function editarLocal(id) {
        localEditando = id;
        erroLocal = '';
        if (id === NOVO_LOCAL) {
            const ordens = API.todosLocais().map(l => Number(l.ordem) || 0);
            rl = { id: '', nome: '', ordem: (ordens.length ? Math.max(...ordens) : 0) + 1, codigoAuto: true };
        } else {
            const l = API.todosLocais().find(x => x.id === id);
            rl = l ? { id: l.id, nome: l.nome, ordem: l.ordem ?? 0 } : {};
        }
        renderLocais();
        const campo = el('locNome');
        if (campo) campo.focus();
    }

    async function salvarLocal() {
        const novo = localEditando === NOVO_LOCAL;
        const nome = String(rl.nome || '').replace(/\s+/g, ' ').trim();
        const ordem = parseInt(rl.ordem, 10) || 0;
        const outros = API.todosLocais().filter(l => novo || l.id !== localEditando);
        erroLocal = !nome ? 'Informe o nome do local.'
            : novo && !/^[a-z0-9_-]{2,30}$/.test(rl.id || '') ? 'O código precisa ter de 2 a 30 caracteres: letras minúsculas, números, "-" ou "_".'
            : novo && outros.some(l => l.id === rl.id) ? `Já existe um local com o código "${rl.id}".`
            : outros.some(l => semAcento(l.nome) === semAcento(nome)) ? `Já existe um local chamado "${nome}".` : '';
        if (erroLocal) { renderLocais(); return; }
        salvando = true;
        renderLocais();
        try {
            await API.salvarLocal(novo ? { id: rl.id, nome, ordem, ativo: true } : { id: localEditando, nome, ordem }, novo);
            salvando = false;
            localEditando = null;
            renderLocais();
            renderLista();
            if (novo) janela({ titulo: 'Local criado', texto: `${nome} já aparece nas abas de usuários. Marque esse local no cadastro de quem vai acessá-lo.`, cancelar: false });
        } catch (e) {
            salvando = false;
            erroLocal = e.message;
            renderLocais();
        }
    }

    function alternarAtivoLocal(id) {
        const l = API.todosLocais().find(x => x.id === id);
        if (!l) return;
        const ativo = l.ativo !== false;
        if (ativo && API.todosLocais().filter(x => x.ativo !== false).length === 1) {
            janela({ titulo: 'Não é possível desativar', texto: 'O sistema precisa ter pelo menos um local ativo.', cancelar: false });
            return;
        }
        const qtd = pessoasDoLocal(id);
        janela({
            titulo: ativo ? 'Desativar local?' : 'Reativar local?',
            texto: ativo ? `${l.nome} sai do seletor de local e ninguém consegue abrir. ${qtd ? `${qtd} pessoa${qtd === 1 ? '' : 's'} com acesso a este local. ` : ''}Os dados continuam salvos e voltam se o local for reativado.` : `${l.nome} volta a aparecer no seletor de local.`,
            botao: ativo ? 'Desativar' : 'Reativar',
            aoConfirmar: async () => {
                try {
                    await API.salvarLocal({ id, ativo: !ativo }, false);
                    renderLocais();
                    renderLista();
                } catch (e) { janela({ titulo: 'Não foi possível alterar', texto: e.message, cancelar: false }); }
            }
        });
    }

    function renderEditor() {
        if (modoLocais) { renderLocais(); return; }
        const painel = el('painelEditor');
        if (!editando) {
            painel.className = 'hidden lg:block';
            painel.innerHTML = `<div class="bg-white rounded-2xl border border-dashed border-slate-300 py-20 text-center text-slate-400"><i data-lucide="users" class="w-8 h-8 mx-auto mb-2"></i><p class="text-xs font-semibold">Escolha um usuário para definir os acessos.</p></div>`;
            icones();
            return;
        }
        const u = atual();
        const novo = !u;
        const admin = !!(u && u.administrador);
        const eu = u && u.id === (API.usuarioAtual() || {}).id;
        const campo = 'w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-2.5 px-3 text-sm font-medium text-slate-800 outline-none focus:border-slate-400 focus:bg-white';
        const rotulo = (t, para) => `<label${para ? ` for="${para}"` : ''} class="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">${t}</label>`;

        const secaoAcessos = admin
            ? `<p class="text-sm text-slate-600 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3"><i data-lucide="crown" class="w-4 h-4 text-amber-500 shrink-0"></i>O administrador acessa todos os projetos, locais e opções.</p>`
            : `<div>
                    ${rotulo('Locais de acesso <span class="text-red-400">*</span>')}
                    <div class="flex flex-wrap gap-1.5">${API.todosLocais().filter(l => l.ativo !== false).map(l => {
                        const marcado = r.locais.includes(l.id);
                        return `<button type="button" aria-pressed="${marcado}" data-acao="local" data-id="${esc(l.id)}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-[11px] font-bold ${marcado ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-500'}"><i data-lucide="${marcado ? 'check' : 'map-pin'}" class="w-3.5 h-3.5"></i>${esc(l.nome)}</button>`;
                    }).join('')}</div>
                </div>
                <div class="space-y-3">
                    ${rotulo('Projetos e o que fica liberado <span class="text-red-400">*</span>')}
                    ${PROJETOS.map(blocoProjeto).join('')}
                </div>`;

        painel.className = 'fixed inset-0 z-40 overflow-y-auto bg-slate-50 p-4 lg:static lg:z-auto lg:overflow-visible lg:bg-transparent lg:p-0';
        painel.innerHTML = `<div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden max-w-xl mx-auto lg:max-w-none">
            <div class="bg-gradient-to-r from-slate-700 to-slate-800 px-5 py-4 flex items-center justify-between gap-2">
                <div class="min-w-0">
                    <h2 class="text-base font-bold text-white truncate">${novo ? 'Novo usuário' : 'Editar ' + esc(u.nome_curto || u.nome)}</h2>
                    ${novo ? '' : `<p class="text-[11px] text-slate-300 truncate">${esc(emailDe(u))}</p>`}
                </div>
                <button type="button" data-acao="fechar" aria-label="Fechar" class="p-1.5 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg"><i data-lucide="x" class="w-4 h-4"></i></button>
            </div>
            <div class="p-5 space-y-4">
                <div>${rotulo('Nome completo <span class="text-red-400">*</span>', 'edNome')}<input id="edNome" data-campo="nome" value="${esc(r.nome)}" placeholder="Aparece nos relatórios" class="${campo} font-bold"></div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>${rotulo('Nome curto', 'edCurto')}<input id="edCurto" data-campo="nome_curto" value="${esc(r.nome_curto)}" maxlength="40" class="${campo}"></div>
                    ${novo ? `<div>${rotulo('Usuário (login) <span class="text-red-400">*</span>', 'edLogin')}<input id="edLogin" data-campo="usuario" value="${esc(r.usuario)}" maxlength="30" autocapitalize="none" spellcheck="false" class="${campo} font-bold"></div>` : ''}
                </div>
                <div>
                    ${rotulo(novo ? 'Senha <span class="text-red-400">*</span>' : 'Nova senha', 'edSenha')}
                    <div class="flex gap-2">
                        <div class="relative flex-1">
                            <input id="edSenha" type="${r.verSenha ? 'text' : 'password'}" data-campo="senha" value="${esc(r.senha)}" autocomplete="new-password" placeholder="${novo ? 'Mínimo 6 caracteres' : 'Deixe vazio para manter a atual'}" class="${campo} pr-10">
                            <button type="button" data-acao="verSenha" aria-label="${r.verSenha ? 'Esconder senha' : 'Mostrar senha'}" class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400"><i data-lucide="${r.verSenha ? 'eye-off' : 'eye'}" class="w-4 h-4"></i></button>
                        </div>
                        <button type="button" data-acao="gerar" class="flex items-center gap-1 px-3 rounded-xl border-2 border-slate-200 text-xs font-bold text-slate-600 hover:border-slate-400"><i data-lucide="sparkles" class="w-3.5 h-3.5 text-amber-500"></i>Gerar</button>
                    </div>
                </div>
                ${secaoAcessos}
                ${erroEditor ? `<p role="alert" class="text-xs font-bold text-red-500">${esc(erroEditor)}</p>` : ''}
                <div class="flex gap-2 pt-1">
                    <button type="button" data-acao="fechar" class="flex-1 bg-slate-100 text-slate-600 font-bold py-3 rounded-xl text-sm">Cancelar</button>
                    <button type="button" id="edSalvar" data-acao="salvar" ${salvando ? 'disabled' : ''} class="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white font-bold py-3 rounded-xl text-sm"><i data-lucide="${novo ? 'user-plus' : 'save'}" class="w-4 h-4"></i>${salvando ? 'Salvando...' : novo ? 'Criar usuário' : 'Salvar'}</button>
                </div>
                ${!novo && !admin && !eu ? `<div class="border-t border-slate-100 pt-3"><button type="button" data-acao="ativo" class="w-full text-xs font-bold py-2.5 rounded-xl ${u.ativo ? 'text-red-600 hover:bg-red-50' : 'text-emerald-700 hover:bg-emerald-50'}">${u.ativo ? 'Desativar usuário' : 'Reativar usuário'}</button></div>` : ''}
            </div>
        </div>`;
        icones();
    }

    function abrirEditor(id) {
        modoLocais = false;
        editando = id;
        erroEditor = '';
        const u = atual();
        r = u
            ? { nome: u.nome || '', nome_curto: u.nome_curto || '', papel: u.papel, senha: '', verSenha: false,
                locais: listaDe(u.locais, ['oasis']), modulos: listaDe(u.modulos, ['irrigacao']), bloqueios: listaDe(u.bloqueios, []) }
            : { usuario: '', nome: '', nome_curto: '', papel: 'irrigador', senha: '', verSenha: false, curtoAuto: true, loginAuto: true,
                locais: [localFiltro !== 'todos' && localFiltro !== 'sem' ? localFiltro : API.localAtual()], modulos: [], bloqueios: [] };
        renderEditor();
        renderLista();
    }
    function fecharEditor() {
        modoLocais = false;
        localEditando = null;
        editando = null;
        erroEditor = '';
        renderEditor();
        renderLista();
    }

    const alternar = (lista, id) => lista.includes(id) ? lista.filter(x => x !== id) : lista.concat(id);

    function validar(u, novo) {
        if (!r.nome.trim()) return 'Informe o nome completo.';
        if (novo) {
            if (String(r.usuario || '').length < 2) return 'O usuário (login) precisa ter pelo menos 2 caracteres.';
            if (usuarios.some(x => x.usuario === r.usuario)) return `O usuário "${r.usuario}" já existe.`;
            if (r.senha.length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
        } else if (r.senha && r.senha.length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
        if (u && u.administrador) return '';
        if (!r.locais.length) return 'Marque pelo menos um local de acesso.';
        if (!r.modulos.length) return 'Libere pelo menos um projeto.';
        for (const p of PROJETOS) {
            for (const a of p.areas) {
                if (!r.modulos.includes(a.modulo)) continue;
                if (a.requer && !r.modulos.includes(a.requer)) return `${a.nome} exige também o acesso a ${p.nome}.`;
                const doProjeto = API.locaisDoProjeto(p.id);
                if (doProjeto && !doProjeto.some(id => r.locais.includes(id))) return `${p.nome} só existe em ${doProjeto.map(id => API.nomeLocal(id)).join(', ')}. Marque um desses locais.`;
                if (a.recursos.length && a.recursos.every(x => r.bloqueios.includes(x.id))) return `Libere pelo menos uma opção em ${a.nome}.`;
            }
        }
        return '';
    }

    async function salvar() {
        const u = atual();
        const novo = !u;
        erroEditor = validar(u, novo);
        if (erroEditor) { renderEditor(); return; }
        const nome = r.nome.replace(/\s+/g, ' ').trim();
        const curto = r.nome_curto.replace(/\s+/g, ' ').trim();
        // Bloqueios só de áreas ainda ligadas; os demais não têm efeito
        const validos = PROJETOS.flatMap(p => p.areas).filter(a => r.modulos.includes(a.modulo)).flatMap(a => a.recursos.map(x => x.id));
        const bloqueios = r.bloqueios.filter(b => validos.includes(b));
        const senha = r.senha;
        salvando = true;
        renderEditor();
        try {
            if (novo) {
                await API.criarUsuario({ usuario: r.usuario, senha, nome, nome_curto: curto, papel: r.papel, locais: r.locais, modulos: r.modulos, bloqueios });
            } else {
                const valores = { nome, nome_curto: curto || null };
                const eu = u.id === (API.usuarioAtual() || {}).id;
                if (!eu && !u.administrador && r.papel !== u.papel) valores.papel = r.papel;
                if (!u.administrador) {
                    if (!mesmaLista(r.locais, listaDe(u.locais, ['oasis']))) valores.locais = r.locais;
                    if (!mesmaLista(r.modulos, listaDe(u.modulos, ['irrigacao']))) valores.modulos = r.modulos;
                    if (!mesmaLista(bloqueios, listaDe(u.bloqueios, []))) valores.bloqueios = bloqueios;
                }
                await API.atualizarUsuario(u.id, valores);
                if (senha) await API.redefinirSenha(u.id, senha);
            }
            salvando = false;
            const login = novo ? r.usuario : u.usuario;
            await carregar();
            fecharEditor();
            if (novo) janela({ titulo: 'Usuário criado', texto: `Login: ${login}\nSenha: ${senha}\nA pessoa já pode entrar no sistema.`, cancelar: false });
            else if (senha) janela({ titulo: 'Senha alterada', texto: `Nova senha de ${curto || nome}: ${senha}\nJá vale para o próximo login.`, cancelar: false });
        } catch (e) {
            salvando = false;
            erroEditor = e.message;
            renderEditor();
        }
    }

    function alternarAtivo() {
        const u = atual();
        const nome = u.nome_curto || u.nome;
        janela({
            titulo: u.ativo ? 'Desativar usuário?' : 'Reativar usuário?',
            texto: u.ativo ? `${nome} perde o acesso ao sistema. Tudo o que já registrou continua salvo.` : `${nome} volta a ter acesso ao sistema.`,
            botao: u.ativo ? 'Desativar' : 'Reativar',
            aoConfirmar: async () => {
                try {
                    await API.atualizarUsuario(u.id, { ativo: !u.ativo });
                    await carregar();
                    fecharEditor();
                } catch (e) { janela({ titulo: 'Não foi possível alterar', texto: e.message, cancelar: false }); }
            }
        });
    }

    document.addEventListener('click', e => {
        const b = e.target.closest('[data-acao]');
        if (!b) return;
        const { acao, id } = b.dataset;
        if (acao === 'novo') abrirEditor(NOVO);
        else if (acao === 'editar') abrirEditor(id);
        else if (acao === 'fechar') fecharEditor();
        else if (acao === 'salvar') salvar();
        else if (acao === 'ativo') alternarAtivo();
        else if (acao === 'projetoLocal') alternarLocalDoProjeto(b.dataset.projeto, id);
        else if (acao === 'gerenciarLocais') abrirLocais();
        else if (acao === 'novoLocal') editarLocal(NOVO_LOCAL);
        else if (acao === 'editarLocal') editarLocal(id);
        else if (acao === 'cancelarLocal') { localEditando = null; erroLocal = ''; renderLocais(); }
        else if (acao === 'salvarLocal') salvarLocal();
        else if (acao === 'ativoLocal') alternarAtivoLocal(id);
        else if (acao === 'filtro') { filtroAtual = id; renderLista(); }
        else if (acao === 'localFiltro') {
            localFiltro = id;
            try { localStorage.setItem('spg_usuarios_local', id); } catch (e) { /* só não lembra a aba */ }
            renderLista();
        }
        else {
            if (acao === 'area' || acao === 'ligarArea') r.modulos = alternar(r.modulos, id);
            else if (acao === 'recurso') r.bloqueios = alternar(r.bloqueios, id);
            else if (acao === 'local') r.locais = alternar(r.locais, id);
            else if (acao === 'papel') r.papel = id;
            else if (acao === 'verSenha') r.verSenha = !r.verSenha;
            else if (acao === 'gerar') { r.senha = gerarSenha(); r.verSenha = true; }
            else return;
            erroEditor = '';
            renderEditor();
        }
    });

    document.addEventListener('input', e => {
        if (e.target.id === 'busca') { renderLista(); return; }
        const campoLocal = e.target.dataset.campoLocal;
        if (campoLocal) {
            if (campoLocal === 'id') {
                e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30);
                rl.codigoAuto = false;
            }
            rl[campoLocal] = e.target.value;
            if (campoLocal === 'nome' && localEditando === NOVO_LOCAL && rl.codigoAuto) {
                rl.id = sugerirCodigoLocal(rl.nome);
                el('locCodigo').value = rl.id;
            }
            return;
        }
        const c = e.target.dataset.campo;
        if (!c) return;
        if (c === 'nome') {
            e.target.value = e.target.value.toUpperCase();
            r.nome = e.target.value;
            if (r.curtoAuto) { r.nome_curto = sugerirNomeCurto(r.nome); el('edCurto').value = r.nome_curto; }
            if (editando === NOVO && r.loginAuto) { r.usuario = sugerirLogin(r.nome); el('edLogin').value = r.usuario; }
        } else if (c === 'usuario') {
            e.target.value = semAcento(e.target.value).replace(/[^a-z0-9._-]/g, '');
            r.usuario = e.target.value;
            r.loginAuto = false;
        } else {
            r[c] = e.target.value;
            if (c === 'nome_curto') r.curtoAuto = false;
        }
    });

    el('janelaCancelar').addEventListener('click', fecharJanela);

    async function carregar() {
        [usuarios, emails] = await Promise.all([API.listarPerfis(true), API.listarEmailsUsuarios().catch(() => ({}))]);
        renderLista();
    }

    (async function iniciar() {
        icones();
        renderEditor();
        if (!navigator.onLine) { el('lista').innerHTML = '<p class="text-xs font-medium text-red-500 text-center py-8">Sem conexão. O cadastro de usuários precisa de internet.</p>'; return; }
        if (!await API.sessaoValida()) { location.replace(MENU); return; }
        el('lista').innerHTML = '<div class="py-10 flex justify-center"><i data-lucide="loader-circle" class="w-6 h-6 text-slate-300 animate-spin"></i></div>';
        icones();
        try {
            await API.carregarLocais().catch(() => {});
            await carregar();
        } catch (e) {
            el('lista').innerHTML = `<p class="text-xs font-medium text-red-500 text-center py-8">Não foi possível carregar: ${esc(e.message)}</p>`;
        }
    })();

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        window.addEventListener('load', () => { navigator.serviceWorker.register('../../sw.js').catch(() => {}); });
    }
})();
