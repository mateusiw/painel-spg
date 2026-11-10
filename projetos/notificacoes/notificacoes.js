// Tela do administrador: define quais sites têm notificação, os avisos automáticos de cada um
// (horário e quem recebe) e permite mandar um aviso escrito à mão para os usuários de um site.
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

    let sites = new Map(), tipos = [], abertoAviso = null;

    function avisar(texto, erro) {
        const a = el('avisoGeral');
        a.textContent = texto;
        a.className = `rounded-2xl p-3 text-sm font-semibold ${erro ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`;
        clearTimeout(avisar.t);
        avisar.t = setTimeout(() => a.classList.add('hidden'), 6000);
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

    function desenharTipo(t) {
        return `<div class="p-3 rounded-xl bg-slate-50" data-tipo="${esc(t.id)}">
            <div class="flex items-center justify-between gap-3">
                <div class="min-w-0"><p class="text-sm font-bold text-slate-800">${esc(t.nome)}</p><p class="text-xs text-slate-500">${esc(t.descricao)}</p></div>
                ${interruptor(`data-tipo-ativo="${esc(t.id)}"`, t.ativo, `Ligar ${t.nome}`)}
            </div>
            ${t.ativo ? `<div class="grid grid-cols-[110px_1fr_auto] gap-2 mt-2.5 items-end">
                <div><label class="rotulo" for="h-${esc(t.id)}">Horário</label><input id="h-${esc(t.id)}" type="time" class="campo w-full" value="${esc(t.horario)}" data-horario="${esc(t.id)}"></div>
                <div><label class="rotulo" for="p-${esc(t.id)}">Quem recebe</label><select id="p-${esc(t.id)}" class="campo w-full" data-publico="${esc(t.id)}"><option value="todos"${t.publico === 'todos' ? ' selected' : ''}>Todos</option><option value="acesso"${t.publico === 'acesso' ? ' selected' : ''}>Com acesso</option></select></div>
                <button type="button" data-testar="${esc(t.id)}" class="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-100" title="Manda só para você, com os dados de hoje">Testar</button>
            </div>` : ''}
        </div>`;
    }

    function desenharSites() {
        el('listaSites').innerHTML = sitesDoPainel().map(p => {
            const ativo = sites.get(p.id) === true;
            const meus = tipos.filter(t => t.projeto === p.id);
            return `<article class="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div class="flex items-center justify-between gap-3 p-4">
                    <div class="min-w-0"><p class="text-sm font-extrabold text-slate-800">${esc(p.nome)}</p><p class="text-xs text-slate-500">${ativo ? (meus.length ? `${meus.filter(t => t.ativo).length} aviso(s) automático(s) e recados` : 'Recados enviados por você') : 'Sem notificações'}</p></div>
                    ${interruptor(`data-site="${esc(p.id)}"`, ativo, `Notificações de ${p.nome}`)}
                </div>
                ${ativo ? `<div class="px-4 pb-4 space-y-2">
                    ${meus.map(desenharTipo).join('')}
                    ${abertoAviso === p.id ? `<form data-form-aviso="${esc(p.id)}" class="p-3 rounded-xl bg-slate-50 space-y-2">
                        <div><label class="rotulo" for="t-${esc(p.id)}">Título</label><input id="t-${esc(p.id)}" name="titulo" maxlength="80" required class="campo w-full"></div>
                        <div><label class="rotulo" for="m-${esc(p.id)}">Mensagem</label><textarea id="m-${esc(p.id)}" name="corpo" maxlength="300" rows="2" required class="campo w-full"></textarea></div>
                        <div class="flex justify-end gap-2"><button type="button" data-aviso-cancelar class="px-3 py-2 rounded-xl text-xs font-bold text-slate-500">Cancelar</button><button class="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">Enviar para quem tem acesso</button></div>
                    </form>` : `<button type="button" data-aviso="${esc(p.id)}" class="text-xs font-bold text-emerald-700 hover:underline">Escrever um aviso para os usuários deste site</button>`}
                </div>` : ''}
            </article>`;
        }).join('');
    }

    async function carregarEnvios() {
        const { data } = await sb.from('notif_envios').select('*').order('criado_em', { ascending: false }).limit(15);
        el('listaEnvios').innerHTML = (data || []).map(e => `<div class="p-3">
            <div class="flex items-baseline justify-between gap-3"><p class="text-sm font-bold text-slate-800 truncate">${esc(e.titulo || e.tipo)}</p><span class="text-[11px] font-semibold text-slate-400 shrink-0">${new Date(e.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>
            ${e.erro ? `<p class="text-xs text-rose-700">Erro: ${esc(e.erro)}</p>` : `<p class="text-xs text-slate-500">${esc(e.corpo)}</p><p class="text-[11px] font-semibold text-slate-400 mt-0.5">${e.enviados} de ${e.aparelhos} aparelho(s)${e.falhas ? ` · ${e.falhas} falha(s)` : ''}</p>`}
        </div>`).join('') || '<p class="p-4 text-sm text-slate-400">Nenhum envio ainda.</p>';
    }

    async function carregar() {
        const [s, t] = await Promise.all([sb.from('notif_sites').select('*'), sb.from('notif_tipos').select('*').order('ordem')]);
        if (s.error || t.error) {
            el('listaSites').innerHTML = '<p class="bg-amber-50 text-amber-900 rounded-2xl p-4 text-sm font-semibold">Rode o arquivo supabase/notificacoes.sql no Supabase para ativar esta tela.</p>';
            return;
        }
        sites = new Map(s.data.map(x => [x.projeto, x.ativo]));
        tipos = t.data;
        desenharSites();
        lucide.createIcons();
        carregarEnvios();
    }

    async function salvarTipo(id, valores) {
        const { error } = await sb.from('notif_tipos').update(valores).eq('id', id);
        if (error) { avisar('Não foi possível salvar: ' + error.message, true); return false; }
        Object.assign(tipos.find(t => t.id === id), valores);
        return true;
    }

    document.addEventListener('click', async e => {
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
        const aviso = e.target.closest('[data-aviso]');
        if (aviso) { abertoAviso = aviso.dataset.aviso; desenharSites(); return; }
        if (e.target.closest('[data-aviso-cancelar]')) { abertoAviso = null; desenharSites(); return; }
        const testar = e.target.closest('[data-testar]');
        if (testar) {
            testar.disabled = true;
            try {
                const r = await chamar({ acao: 'testar_tipo', tipo: testar.dataset.testar });
                avisar(r.semDados ? 'Hoje não há dados para este aviso, então nada foi enviado.' : 'Prévia enviada para os seus aparelhos.');
            } catch (err) { avisar(err.message, true); }
            testar.disabled = false;
        }
    });

    document.addEventListener('change', async e => {
        const horario = e.target.closest('[data-horario]');
        if (horario) {
            if (!horario.value) return;
            // Mudou o horário: pode mandar de novo hoje, no novo horário
            if (await salvarTipo(horario.dataset.horario, { horario: horario.value, ultimo_envio: null })) avisar('Horário salvo.');
            return;
        }
        const publico = e.target.closest('[data-publico]');
        if (publico && await salvarTipo(publico.dataset.publico, { publico: publico.value })) avisar('Salvo.');
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
