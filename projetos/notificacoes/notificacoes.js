// Tela do administrador: define quais sites têm notificação, cria os avisos automáticos de cada um
// (assunto, dias, horário, quem recebe e texto) e permite mandar um recado aos usuários de um site.
// Cada pessoa escolhe o que quer receber no botão do sino do menu (notificacoes.js, na raiz).
(function () {
    'use strict';
    const API = window.IrrigacaoAPI;
    if (!API.isAdmin()) { location.replace('../../index.html'); return; }

    const sb = API.cliente;
    const el = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const sitesDoPainel = () => API.PROJETOS.filter(p => !p.soAdmin);
    const modulosDe = p => p.areas.filter(a => !a.extra).map(a => a.modulo);

    let sites = new Map(), tipos = [], abertoAviso = null, siteAberto = null;
    let usuarios = [], filtroUsuarios = 'todos', pessoas = [];
    let catalogo = [], faltaSql = false, ed = null, campoTexto = 'mensagem';

    const ICONE_TIPO = { Celular: 'smartphone', Tablet: 'tablet', Chromebook: 'laptop', Computador: 'monitor' };
    const ESTADOS = {
        ativas: ['Ativadas', 'bg-emerald-50 text-emerald-700'],
        nao_ativadas: ['Não ativadas', 'bg-amber-50 text-amber-700'],
        bloqueadas: ['Bloqueadas', 'bg-rose-50 text-rose-700'],
        precisa_instalar: ['Falta instalar', 'bg-amber-50 text-amber-700'],
        sem_suporte: ['Navegador não aceita', 'bg-slate-100 text-slate-600'],
    };

    function avisar(texto, erro) {
        const a = el('avisoGeral');
        a.textContent = texto;
        // Fixo na tela: o botão que gerou o aviso costuma estar bem abaixo do topo da página
        a.className = `fixed z-50 top-16 left-3 right-3 sm:left-auto sm:w-96 rounded-2xl p-3 text-sm font-semibold shadow-xl border ${erro ? 'bg-rose-50 text-rose-800 border-rose-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`;
        clearTimeout(avisar.t);
        avisar.t = setTimeout(() => a.classList.add('hidden'), erro ? 9000 : 7000);
    }
    const interruptor = (attr, ligado, rotulo) => `<button type="button" role="switch" aria-checked="${ligado}" aria-label="${esc(rotulo)}" ${attr} class="relative w-11 h-6 rounded-full shrink-0 transition-colors ${ligado ? 'bg-emerald-600' : 'bg-slate-300'}"><span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${ligado ? 'translate-x-5' : ''}"></span></button>`;

    async function chamar(corpo) {
        const { data, error } = await sb.functions.invoke('notificacoes', { body: corpo });
        if (error) {
            let msg = 'A função de notificações não respondeu. Confira se ela foi publicada no Supabase.';
            try { const j = await error.context.json(); if (j && j.erro) msg = j.erro; } catch (e) { /* mantém a mensagem padrão */ }
            throw new Error(msg);
        }
        return data;
    }

    const DIAS = [[1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [7, 'Dom']];
    const listaDias = t => (Array.isArray(t.dias) && t.dias.length) ? t.dias : DIAS.map(d => d[0]);

    function textoDias(lista) {
        const d = [...lista].sort((a, b) => a - b).join();
        if (d === '1,2,3,4,5,6,7') return 'Todos os dias';
        if (d === '1,2,3,4,5') return 'Seg a Sex';
        if (d === '1,2,3,4,5,6') return 'Seg a Sáb';
        if (d === '6,7') return 'Fim de semana';
        return DIAS.filter(([n]) => lista.includes(n)).map(([, nome]) => nome).join(', ');
    }
    function textoPublico(t) {
        if (t.publico === 'todos') return 'Todos';
        if (t.publico === 'pessoas') { const n = (t.pessoas || []).length; return `${n} pessoa${n === 1 ? '' : 's'}`; }
        return 'Com acesso';
    }
    const geradoresDoSite = p => catalogo.filter(g => g.sites.includes('*') || g.sites.includes(p.id));
    // Assunto de evento: sai na hora em que acontece no app, sem horário marcado
    const ehEvento = idGerador => !!(catalogo.find(g => g.id === idGerador) || {}).evento;

    function desenharTipo(t) {
        const partes = [ehEvento(t.gerador) ? 'Na hora' : t.horario, textoDias(listaDias(t)), textoPublico(t), t.local ? API.nomeLocal(t.local) : ''].filter(Boolean).join(' · ');
        const podeEditar = catalogo.length && !faltaSql;
        return `<div class="p-3 rounded-xl bg-slate-50 ${t.ativo ? '' : 'opacity-70'}" data-tipo="${esc(t.id)}">
            <div class="flex items-center justify-between gap-3">
                <div class="min-w-0"><p class="text-sm font-bold text-slate-800 truncate">${esc(t.nome)}</p><p class="text-xs text-slate-500">${esc(partes)}</p></div>
                ${interruptor(`data-tipo-ativo="${esc(t.id)}"`, t.ativo, `Ligar ${t.nome}`)}
            </div>
            <div class="flex items-center gap-2 mt-2">
                ${podeEditar ? `<button type="button" data-editar="${esc(t.id)}" class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-100">Editar</button>` : ''}
                <button type="button" data-testar="${esc(t.id)}" class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-100" title="Manda só para você, com os dados de hoje">Testar</button>
            </div>
        </div>`;
    }

    function desenharSites() {
        el('listaSites').innerHTML = sitesDoPainel().map(p => {
            const ativo = sites.get(p.id) === true;
            const meus = tipos.filter(t => t.projeto === p.id);
            const aberto = ativo && siteAberto === p.id;
            const ligados = meus.filter(t => t.ativo).length;
            const resumo = !ativo ? 'Sem notificações' : meus.length ? `${ligados} de ${meus.length} aviso${meus.length === 1 ? '' : 's'} ligado${ligados === 1 ? '' : 's'}` : 'Nenhum aviso automático';
            return `<article class="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div class="flex items-center justify-between gap-3 p-4">
                    <button type="button" ${ativo ? `data-abrir-site="${esc(p.id)}" aria-expanded="${aberto}"` : 'disabled'} class="min-w-0 flex-1 flex items-center gap-3 text-left">
                        <span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${p.cor}"><i data-lucide="${esc(p.icone)}" class="w-4 h-4"></i></span>
                        <span class="min-w-0 flex-1"><span class="block text-sm font-extrabold text-slate-800 truncate">${esc(p.nome)}</span><span class="block text-xs text-slate-500">${resumo}</span></span>
                        ${ativo ? `<i data-lucide="${aberto ? 'chevron-up' : 'chevron-down'}" class="w-4 h-4 text-slate-400 shrink-0"></i>` : ''}
                    </button>
                    ${interruptor(`data-site="${esc(p.id)}"`, ativo, `Notificações de ${p.nome}`)}
                </div>
                ${aberto ? `<div class="px-4 pb-4 space-y-2">
                    ${meus.map(desenharTipo).join('')}
                    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                        ${catalogo.length && !faltaSql ? `<button type="button" data-novo-tipo="${esc(p.id)}" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"><i data-lucide="plus" class="w-4 h-4"></i>Novo aviso automático</button>` : ''}
                        ${abertoAviso === p.id ? '' : `<button type="button" data-aviso="${esc(p.id)}" class="text-xs font-bold text-emerald-700 hover:underline">Enviar um recado agora</button>`}
                    </div>
                    ${abertoAviso === p.id ? `<form data-form-aviso="${esc(p.id)}" class="p-3 rounded-xl bg-slate-50 space-y-2">
                        <div><label class="rotulo" for="t-${esc(p.id)}">Título</label><input id="t-${esc(p.id)}" name="titulo" maxlength="80" required class="campo w-full"></div>
                        <div><label class="rotulo" for="m-${esc(p.id)}">Mensagem</label><textarea id="m-${esc(p.id)}" name="corpo" maxlength="300" rows="2" required class="campo w-full"></textarea></div>
                        <div class="flex justify-end gap-2"><button type="button" data-aviso-cancelar class="px-3 py-2 rounded-xl text-xs font-bold text-slate-500">Cancelar</button><button class="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">Enviar para quem tem acesso</button></div>
                    </form>` : ''}
                </div>` : ''}
            </article>`;
        }).join('');
        lucide.createIcons();
    }

    // ----- Editor de um aviso automático -----
    const geradorAtual = () => catalogo.find(g => g.id === ed.gerador);

    function abrirEditor(projeto, t) {
        const p = API.PROJETOS.find(x => x.id === projeto);
        const g = t ? catalogo.find(x => x.id === t.gerador) : geradoresDoSite(p)[0];
        if (!g) { avisar('Este aviso usa um assunto que não existe mais.', true); return; }
        ed = {
            id: t ? t.id : null, projeto, gerador: g.id,
            nome: t ? t.nome : g.nome,
            local: t ? (t.local || '') : '',
            parametro: t ? (t.parametro ?? 0) : (g.parametro ? g.parametro.padrao : 0),
            horario: t ? t.horario : '17:00',
            dias: t ? [...listaDias(t)] : DIAS.map(d => d[0]),
            publico: t ? t.publico : 'acesso',
            pessoas: t ? [...(t.pessoas || [])] : [],
            titulo: (t && t.titulo) || g.titulo,
            mensagem: (t && t.mensagem) || g.mensagem,
            busca: '', erro: '', confirmarExclusao: false, salvando: false,
        };
        campoTexto = 'mensagem';
        desenharEditor(true);
    }
    function fecharEditor() { ed = null; desenharEditor(); }

    function trocarGerador(id) {
        const antigo = geradorAtual(), novo = catalogo.find(g => g.id === id);
        if (ed.nome === antigo.nome) ed.nome = novo.nome;
        ed.titulo = novo.titulo;
        ed.mensagem = novo.mensagem;
        ed.gerador = id;
        ed.local = '';
        ed.parametro = novo.parametro ? novo.parametro.padrao : 0;
        desenharEditor(true);
    }

    function textoPrevia() {
        const g = geradorAtual();
        // A prévia mostra o local do próprio aviso, e não o do exemplo (que era sempre Oásis)
        const p = API.PROJETOS.find(x => x.id === ed.projeto) || {};
        const idLocal = g.local === 'escolher' ? ed.local : p.local;
        const doLocal = idLocal ? { local: API.nomeLocal(idLocal), ...(idLocal === 'estufa' && g.exemplo.blocos ? { blocos: 'Setores 1 e 2' } : {}) } : {};
        const vars = { data: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), hora: g.evento ? new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ed.horario, ...g.exemplo, ...doLocal };
        const preencher = t => String(t || '').replace(/\{(\w+)\}/g, (o, n) => vars[n] ?? o);
        return { titulo: preencher(ed.titulo.trim() || g.titulo), corpo: preencher(ed.mensagem.trim() || g.mensagem) };
    }
    function atualizarPrevia() {
        const p = textoPrevia();
        el('edPreviaTitulo').textContent = p.titulo;
        el('edPreviaCorpo').textContent = p.corpo;
    }
    function filtrarPessoas() {
        const termo = ed.busca.trim().toLowerCase();
        document.querySelectorAll('[data-ed-pessoa]').forEach(b => { b.classList.toggle('hidden', !!termo && !b.dataset.nome.toLowerCase().includes(termo)); });
    }

    function desenharEditor(doTopo) {
        const caixa = el('editorAviso');
        if (!ed) { caixa.className = 'hidden'; caixa.innerHTML = ''; return; }
        const rolagem = !doTopo && el('edCorpo') ? el('edCorpo').scrollTop : 0;
        const p = API.PROJETOS.find(x => x.id === ed.projeto);
        const g = geradorAtual();
        const pilula = (ativo, attr, texto) => `<button type="button" ${attr} aria-pressed="${ativo}" class="px-3 py-1.5 rounded-full border-2 text-[11px] font-bold ${ativo ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}">${esc(texto)}</button>`;
        const titulo = t => `<h3 class="text-xs font-black text-slate-700 mb-2">${t}</h3>`;
        const locais = API.todosLocais().filter(l => l.ativo !== false);
        const fixo = g.local !== 'escolher' && p.local;
        const variaveis = [...g.variaveis, ['data', 'Data de hoje'], ['hora', g.evento ? 'Hora em que aconteceu' : 'Hora do envio']];
        caixa.className = 'fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm sm:p-4';
        caixa.innerHTML = `<div role="dialog" aria-modal="true" aria-labelledby="edTitulo" class="bg-white w-full sm:max-w-xl h-[92dvh] sm:h-auto sm:max-h-[90vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div class="bg-gradient-to-r from-green-600 to-green-700 px-5 py-3.5 flex items-center justify-between gap-2 shrink-0">
                <div class="min-w-0"><h2 id="edTitulo" class="text-base font-bold text-white truncate">${ed.id ? 'Editar aviso' : 'Novo aviso automático'}</h2><p class="text-[11px] text-green-100 truncate">${esc(p.nome)}</p></div>
                <button type="button" data-ed-fechar aria-label="Fechar" class="p-1.5 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg"><i data-lucide="x" class="w-4 h-4"></i></button>
            </div>
            <div id="edCorpo" class="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
                <section>
                    ${titulo('O que avisar')}
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div><label class="rotulo" for="edGerador">Assunto</label><select id="edGerador" data-ed="gerador" class="campo w-full">${geradoresDoSite(p).map(x => `<option value="${esc(x.id)}"${x.id === ed.gerador ? ' selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>
                        <div><label class="rotulo" for="edNome">Nome do aviso</label><input id="edNome" data-ed="nome" maxlength="60" value="${esc(ed.nome)}" class="campo w-full"></div>
                    </div>
                    <p class="text-xs text-slate-500 mt-2">${esc(g.descricao)}</p>
                    ${g.local === 'escolher' || g.parametro ? `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                        ${g.local === 'escolher' ? `<div><label class="rotulo" for="edLocal">Local</label><select id="edLocal" data-ed="local" class="campo w-full"><option value="">Todos, um aviso por local</option>${locais.map(l => `<option value="${esc(l.id)}"${l.id === ed.local ? ' selected' : ''}>${esc(l.nome)}</option>`).join('')}</select></div>` : ''}
                        ${g.parametro ? `<div><label class="rotulo" for="edParametro">${esc(g.parametro.rotulo)}</label><input id="edParametro" data-ed="parametro" type="number" min="0" max="60" value="${esc(ed.parametro)}" class="campo w-full"></div>` : ''}
                    </div>` : ''}
                    ${fixo ? `<p class="text-xs text-slate-500 mt-2">Local: <b>${esc(API.nomeLocal(p.local))}</b></p>` : ''}
                </section>
                <section class="border-t border-slate-100 pt-5">
                    ${titulo('Quando enviar')}
                    <div class="flex flex-wrap items-end gap-3">
                        ${g.evento ? '<p class="w-full text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">Enviado na hora em que acontece, nos dias marcados abaixo.</p>' : `<div><label class="rotulo" for="edHorario">Horário</label><input id="edHorario" data-ed="horario" type="time" value="${esc(ed.horario)}" class="campo w-32"></div>`}
                        <div role="group" aria-label="Dias da semana" class="flex flex-wrap gap-1.5">${DIAS.map(([n, nome]) => pilula(ed.dias.includes(n), `data-ed-dia="${n}"`, nome)).join('')}</div>
                    </div>
                </section>
                <section class="border-t border-slate-100 pt-5">
                    ${titulo('Quem recebe')}
                    <div role="group" aria-label="Quem recebe" class="flex flex-wrap gap-1.5">${[['acesso', 'Com acesso ao site'], ['todos', 'Todos'], ['pessoas', 'Pessoas escolhidas']].map(([id, nome]) => pilula(ed.publico === id, `data-ed-publico="${id}"`, nome)).join('')}</div>
                    ${ed.publico === 'pessoas' ? `<div class="mt-3">
                        <input type="search" data-ed="busca" value="${esc(ed.busca)}" placeholder="Buscar pessoa" aria-label="Buscar pessoa" class="campo w-full mb-2">
                        <div class="max-h-44 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">${pessoas.map(u => { const m = ed.pessoas.includes(u.id); return `<button type="button" data-ed-pessoa="${esc(u.id)}" data-nome="${esc(u.nome)}" aria-pressed="${m}" class="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm font-semibold ${m ? 'text-emerald-800 bg-emerald-50' : 'text-slate-600'}"><i data-lucide="${m ? 'check-square' : 'square'}" class="w-4 h-4 shrink-0"></i><span class="truncate">${esc(u.nome)}</span></button>`; }).join('')}</div>
                        <p class="text-[11px] font-semibold text-slate-500 mt-1">${ed.pessoas.length} selecionada(s)</p>
                    </div>` : ''}
                </section>
                <section class="border-t border-slate-100 pt-5 space-y-3">
                    ${titulo('Texto da notificação')}
                    <div><label class="rotulo" for="edTexto1">Título</label><input id="edTexto1" data-ed="titulo" maxlength="80" value="${esc(ed.titulo)}" class="campo w-full"></div>
                    <div><label class="rotulo" for="edTexto2">Mensagem</label><textarea id="edTexto2" data-ed="mensagem" maxlength="300" rows="3" class="campo w-full">${esc(ed.mensagem)}</textarea></div>
                    <div><p class="rotulo">Toque para incluir no texto</p><div class="flex flex-wrap gap-1.5">${variaveis.map(([n, d]) => `<button type="button" data-ed-var="${esc(n)}" title="{${esc(n)}}" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-600">${esc(d)}</button>`).join('')}</div></div>
                    <div class="rounded-xl bg-slate-50 border border-slate-200 p-3"><p class="rotulo">Exemplo de como chega</p><p id="edPreviaTitulo" class="text-sm font-bold text-slate-800"></p><p id="edPreviaCorpo" class="text-xs text-slate-600 whitespace-pre-line"></p></div>
                </section>
                ${ed.id ? `<div class="border-t border-slate-100 pt-3"><button type="button" data-ed-excluir class="w-full text-xs font-bold py-2.5 rounded-xl text-red-600 hover:bg-red-50">${ed.confirmarExclusao ? 'Toque de novo para confirmar a exclusão' : 'Excluir este aviso'}</button></div>` : ''}
            </div>
            <div class="shrink-0 border-t border-slate-200 bg-white px-5 py-3">
                ${ed.erro ? `<p role="alert" class="text-xs font-bold text-red-500 mb-2">${esc(ed.erro)}</p>` : ''}
                <div class="flex gap-2">
                    <button type="button" data-ed-fechar class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2.5 rounded-xl text-sm">Cancelar</button>
                    <button type="button" data-ed-salvar ${ed.salvando ? 'disabled' : ''} class="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold py-2.5 rounded-xl text-sm">${ed.salvando ? 'Salvando...' : ed.id ? 'Salvar' : 'Criar aviso'}</button>
                </div>
            </div>
        </div>`;
        lucide.createIcons();
        atualizarPrevia();
        filtrarPessoas();
        el('edCorpo').scrollTop = rolagem;
    }

    function validarEditor() {
        if (!ed.nome.trim()) return 'Dê um nome para o aviso.';
        if (!geradorAtual().evento && !/^\d{2}:\d{2}$/.test(ed.horario)) return 'Informe o horário.';
        if (!ed.dias.length) return 'Escolha pelo menos um dia da semana.';
        if (ed.publico === 'pessoas' && !ed.pessoas.length) return 'Escolha pelo menos uma pessoa.';
        if (!ed.mensagem.trim() && !geradorAtual().mensagem) return 'Escreva a mensagem do lembrete.';
        return '';
    }

    async function salvarEditor() {
        ed.erro = validarEditor();
        if (ed.erro) { desenharEditor(); return; }
        const p = API.PROJETOS.find(x => x.id === ed.projeto), g = geradorAtual();
        const antigo = ed.id ? tipos.find(t => t.id === ed.id) : null;
        const dias = ed.dias.length === DIAS.length ? [] : [...ed.dias].sort((a, b) => a - b);
        const valores = {
            gerador: ed.gerador, nome: ed.nome.trim(), horario: ed.horario, dias, publico: ed.publico,
            pessoas: ed.publico === 'pessoas' ? ed.pessoas : [], titulo: ed.titulo.trim(), mensagem: ed.mensagem.trim(),
            local: g.local === 'escolher' ? (ed.local || null) : (p.local || null),
            parametro: g.parametro ? Math.max(0, parseInt(ed.parametro, 10) || 0) : 0,
        };
        ed.salvando = true;
        desenharEditor();
        let error;
        if (antigo) {
            // Mudou o quê ou quando avisar: pode mandar de novo hoje
            const reenviar = antigo.horario !== valores.horario || antigo.gerador !== valores.gerador || String(antigo.dias || []) !== String(dias);
            const extra = { ...(reenviar ? { ultimo_envio: null } : {}), ...(antigo.gerador !== valores.gerador ? { descricao: g.descricao } : {}) };
            ({ error } = await sb.from('notif_tipos').update({ ...valores, ...extra }).eq('id', antigo.id));
            if (!error) Object.assign(antigo, valores, extra);
        } else {
            const novo = { id: crypto.randomUUID(), projeto: p.id, descricao: g.descricao, modulos: modulosDe(p), ativo: true, ordem: Math.max(0, ...tipos.map(t => t.ordem || 0)) + 10, ...valores };
            ({ error } = await sb.from('notif_tipos').insert(novo));
            if (!error) tipos.push(novo);
        }
        if (error) { ed.salvando = false; ed.erro = 'Não foi possível salvar: ' + error.message; desenharEditor(); return; }
        fecharEditor();
        desenharSites();
        avisar('Aviso salvo.');
    }

    async function excluirEditor() {
        if (!ed.confirmarExclusao) { ed.confirmarExclusao = true; desenharEditor(); return; }
        const { error } = await sb.from('notif_tipos').delete().eq('id', ed.id);
        if (error) { ed.confirmarExclusao = false; ed.erro = 'Não foi possível excluir: ' + error.message; desenharEditor(); return; }
        tipos = tipos.filter(t => t.id !== ed.id);
        fecharEditor();
        desenharSites();
        avisar('Aviso excluído.');
    }

    function cliqueNoEditor(e) {
        if (!ed) return false;
        if (e.target.closest('[data-ed-fechar]')) { fecharEditor(); return true; }
        if (e.target.closest('[data-ed-salvar]')) { salvarEditor(); return true; }
        if (e.target.closest('[data-ed-excluir]')) { excluirEditor(); return true; }
        const dia = e.target.closest('[data-ed-dia]');
        if (dia) { const n = Number(dia.dataset.edDia); ed.dias = ed.dias.includes(n) ? ed.dias.filter(x => x !== n) : [...ed.dias, n]; ed.erro = ''; desenharEditor(); return true; }
        const publico = e.target.closest('[data-ed-publico]');
        if (publico) { ed.publico = publico.dataset.edPublico; ed.erro = ''; desenharEditor(); return true; }
        const pessoa = e.target.closest('[data-ed-pessoa]');
        if (pessoa) { const id = pessoa.dataset.edPessoa; ed.pessoas = ed.pessoas.includes(id) ? ed.pessoas.filter(x => x !== id) : [...ed.pessoas, id]; ed.erro = ''; desenharEditor(); return true; }
        const variavel = e.target.closest('[data-ed-var]');
        if (variavel) {
            const campo = document.querySelector(`[data-ed="${campoTexto}"]`);
            const trecho = `{${variavel.dataset.edVar}}`;
            const ini = campo.selectionStart ?? campo.value.length, fim = campo.selectionEnd ?? campo.value.length;
            campo.setRangeText(trecho, ini, fim, 'end');
            ed[campoTexto] = campo.value;
            campo.focus();
            atualizarPrevia();
            return true;
        }
        return e.target.closest('#editorAviso') !== null;
    }

    async function carregarEnvios() {
        const { data } = await sb.from('notif_envios').select('*').order('criado_em', { ascending: false }).limit(15);
        el('listaEnvios').innerHTML = (data || []).map(e => `<div class="p-3">
            <div class="flex items-baseline justify-between gap-3"><p class="text-sm font-bold text-slate-800 truncate">${esc(e.titulo || e.tipo)}</p><span class="text-[11px] font-semibold text-slate-400 shrink-0">${new Date(e.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>
            ${e.erro ? `<p class="text-xs text-rose-700">Erro: ${esc(e.erro)}</p>` : `<p class="text-xs text-slate-500">${esc(e.corpo)}</p><p class="text-[11px] font-semibold text-slate-400 mt-0.5">${e.enviados} de ${e.aparelhos} aparelho(s)${e.falhas ? ` · ${e.falhas} falha(s)` : ''}</p>`}
        </div>`).join('') || '<p class="p-4 text-sm text-slate-400">Nenhum envio ainda.</p>';
    }

    function desenharAparelhos() {
        const ativaram = usuarios.filter(u => u.ativou).length;
        el('resumoAparelhos').textContent = `${ativaram} de ${usuarios.length} usuário(s) ativaram as notificações em algum aparelho.`;
        el('filtroAparelhos').innerHTML = [['todos', 'Todos'], ['sim', 'Ativaram'], ['nao', 'Não ativaram']].map(([id, nome]) =>
            `<button type="button" data-filtro-usuarios="${id}" class="px-2.5 py-1 rounded-lg text-[11px] font-bold ${filtroUsuarios === id ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}">${nome}</button>`).join('');
        const visiveis = usuarios.filter(u => filtroUsuarios === 'todos' || (filtroUsuarios === 'sim') === u.ativou);
        el('listaAparelhos').innerHTML = visiveis.map(u => `<div class="p-3">
            <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-bold text-slate-800 truncate">${esc(u.nome)}</p>
                <span class="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${u.ativou ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}">${u.ativou ? 'Ativou' : 'Não ativou'}</span>
            </div>
            ${u.aparelhos.length ? u.aparelhos.map(a => {
                const [rotulo, cor] = ESTADOS[a.estado] || ESTADOS.nao_ativadas;
                const detalhes = [a.sistema, a.modelo, a.navegador, a.instalado ? 'App instalado' : ''].filter(Boolean).join(' · ');
                return `<div class="flex items-start gap-2.5 mt-2">
                    <span class="p-1.5 rounded-lg bg-slate-100 text-slate-500 shrink-0"><i data-lucide="${ICONE_TIPO[a.tipo] || 'monitor'}" class="w-3.5 h-3.5"></i></span>
                    <div class="min-w-0 flex-1">
                        <p class="text-xs font-bold text-slate-700">${esc(a.tipo || 'Aparelho')} <span class="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cor}">${rotulo}</span></p>
                        <p class="text-[11px] text-slate-500 break-words">${esc(detalhes)}</p>
                        <p class="text-[11px] text-slate-400">Visto em ${new Date(a.visto_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                </div>`;
            }).join('') : '<p class="text-[11px] text-slate-400 mt-1">Ainda não abriu o Painel depois desta atualização, então o aparelho é desconhecido.</p>'}
        </div>`).join('') || '<p class="p-4 text-sm text-slate-400">Nenhum usuário neste filtro.</p>';
        lucide.createIcons();
    }

    async function carregarAparelhos() {
        const [perfis, disp] = await Promise.all([API.listarPerfis(true).catch(() => []), sb.from('notif_dispositivos').select('*').order('visto_em', { ascending: false })]);
        pessoas = (perfis || []).filter(p => p.ativo).map(p => ({ id: p.id, nome: p.nome_curto || p.nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        if (disp.error) {
            el('resumoAparelhos').textContent = '';
            el('filtroAparelhos').innerHTML = '';
            el('listaAparelhos').innerHTML = '<p class="p-4 text-sm font-semibold text-amber-900 bg-amber-50">Rode o arquivo supabase/notificacoes_dispositivos.sql no Supabase para ver os aparelhos.</p>';
            return;
        }
        usuarios = (perfis || []).filter(p => p.ativo).map(p => {
            const aparelhos = disp.data.filter(d => d.usuario === p.id);
            return { nome: p.nome_curto || p.nome, ativou: aparelhos.some(a => a.estado === 'ativas'), aparelhos };
        }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        desenharAparelhos();
    }

    async function carregar() {
        const [s, t] = await Promise.all([sb.from('notif_sites').select('*'), sb.from('notif_tipos').select('*').order('ordem'), API.carregarLocais().catch(() => {})]);
        if (s.error || t.error) {
            el('listaSites').innerHTML = '<p class="bg-amber-50 text-amber-900 rounded-2xl p-4 text-sm font-semibold">Rode o arquivo supabase/notificacoes.sql no Supabase para ativar esta tela.</p>';
            return;
        }
        sites = new Map(s.data.map(x => [x.projeto, x.ativo]));
        tipos = t.data;
        faltaSql = t.data.length > 0 && !('dias' in t.data[0]);
        try { catalogo = (await chamar({ acao: 'catalogo' })).geradores || []; } catch (err) { catalogo = []; }
        const pendencia = faltaSql ? 'Para personalizar os avisos, rode o arquivo supabase/notificacoes_personalizadas.sql no Supabase.'
            : !catalogo.length ? 'Para personalizar os avisos, publique de novo a função notificacoes no Supabase, com o Verify JWT desligado.' : '';
        el('avisoPendencia').textContent = pendencia;
        el('avisoPendencia').classList.toggle('hidden', !pendencia);
        desenharSites();
        lucide.createIcons();
        carregarEnvios();
        carregarAparelhos();
    }

    async function salvarTipo(id, valores) {
        const { error } = await sb.from('notif_tipos').update(valores).eq('id', id);
        if (error) { avisar('Não foi possível salvar: ' + error.message, true); return false; }
        Object.assign(tipos.find(t => t.id === id), valores);
        return true;
    }

    document.addEventListener('click', async e => {
        const filtro = e.target.closest('[data-filtro-usuarios]');
        if (filtro) { filtroUsuarios = filtro.dataset.filtroUsuarios; desenharAparelhos(); return; }
        const site = e.target.closest('[data-site]');
        if (site) {
            const ligar = sites.get(site.dataset.site) !== true;
            const { error } = await sb.from('notif_sites').upsert({ projeto: site.dataset.site, ativo: ligar, atualizado_em: new Date().toISOString() }, { onConflict: 'projeto' });
            if (error) { avisar('Não foi possível salvar: ' + error.message, true); return; }
            sites.set(site.dataset.site, ligar);
            desenharSites();
            return;
        }
        const tipoAtivo = e.target.closest('[data-tipo-ativo]');
        if (tipoAtivo) {
            const t = tipos.find(x => x.id === tipoAtivo.dataset.tipoAtivo);
            if (await salvarTipo(t.id, { ativo: !t.ativo })) desenharSites();
            return;
        }
        const abrir = e.target.closest('[data-abrir-site]');
        if (abrir) { siteAberto = siteAberto === abrir.dataset.abrirSite ? null : abrir.dataset.abrirSite; desenharSites(); return; }
        const novo = e.target.closest('[data-novo-tipo]');
        if (novo) { abrirEditor(novo.dataset.novoTipo, null); return; }
        const editar = e.target.closest('[data-editar]');
        if (editar) { const t = tipos.find(x => x.id === editar.dataset.editar); abrirEditor(t.projeto, t); return; }
        if (cliqueNoEditor(e)) return;
        const aviso = e.target.closest('[data-aviso]');
        if (aviso) { abertoAviso = aviso.dataset.aviso; desenharSites(); return; }
        if (e.target.closest('[data-aviso-cancelar]')) { abertoAviso = null; desenharSites(); return; }
        const testar = e.target.closest('[data-testar]');
        if (testar) {
            const tipo = tipos.find(t => t.id === testar.dataset.testar);
            testar.disabled = true;
            testar.textContent = 'Testando…';
            testar.classList.add('opacity-60');
            try {
                const r = await chamar({ acao: 'testar_tipo', tipo: testar.dataset.testar });
                avisar(r.semDados
                    ? `${tipo ? tipo.nome : 'Este aviso'}: hoje não há dados, então nenhuma notificação foi enviada. Para testar o celular, use "Enviar teste" no sino do menu.`
                    : 'Prévia enviada para os seus aparelhos. Deve chegar em instantes.');
            } catch (err) { avisar(err.message, true); }
            testar.disabled = false;
            testar.textContent = 'Testar';
            testar.classList.remove('opacity-60');
        }
    });

    document.addEventListener('change', e => {
        const campo = e.target.closest('[data-ed]');
        if (!campo || !ed) return;
        if (campo.dataset.ed === 'gerador') trocarGerador(campo.value);
        else ed[campo.dataset.ed] = campo.value;
    });

    document.addEventListener('input', e => {
        const campo = e.target.closest('[data-ed]');
        if (!campo || !ed || campo.dataset.ed === 'gerador') return;
        ed[campo.dataset.ed] = campo.value;
        if (campo.dataset.ed === 'titulo' || campo.dataset.ed === 'mensagem') { campoTexto = campo.dataset.ed; atualizarPrevia(); }
        if (campo.dataset.ed === 'busca') filtrarPessoas();
    });

    document.addEventListener('focusin', e => {
        const campo = e.target.closest('[data-ed="titulo"], [data-ed="mensagem"]');
        if (campo) campoTexto = campo.dataset.ed;
    });

    document.addEventListener('submit', async e => {
        const form = e.target.closest('[data-form-aviso]');
        if (!form) return;
        e.preventDefault();
        const projeto = API.PROJETOS.find(p => p.id === form.dataset.formAviso);
        const botao = form.querySelector('button:not([type=button])');
        botao.disabled = true;
        try {
            const r = await chamar({ acao: 'manual', projeto: projeto.id, titulo: form.titulo.value, corpo: form.corpo.value, modulos: modulosDe(projeto) });
            avisar(`Aviso enviado para ${r.enviados} de ${r.aparelhos} aparelho(s).`);
            abertoAviso = null;
            desenharSites();
            carregarEnvios();
        } catch (err) { avisar(err.message, true); botao.disabled = false; }
    });

    carregar();
})();
