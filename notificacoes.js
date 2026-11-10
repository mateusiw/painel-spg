// Notificações no celular: autorização do aparelho e escolha do que cada pessoa quer receber.
// Roda só na janela principal do Painel, porque o navegador exige isso para pedir permissão.
// NotificacoesSPG.abrir()       -> janela "Notificações" (botão do sino no menu)
// NotificacoesSPG.sincronizar() -> depois do login: liga o aparelho a quem entrou e oferece ativar
// NotificacoesSPG.aoSair()      -> antes de sair: este aparelho deixa de receber as notificações da pessoa
(function () {
    'use strict';
    if (window.NotificacoesSPG) return;

    const API = window.IrrigacaoAPI;
    const sb = API.cliente;
    const K_DISPENSOU = 'spg_notif_dispensou';
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const temSuporte = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    const ehIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const instalado = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    const precisaInstalar = () => ehIphone() && !instalado();

    async function registroSW() {
        const espera = new Promise(r => setTimeout(() => r(null), 6000));
        return Promise.race([navigator.serviceWorker.ready, espera]);
    }
    async function assinaturaAtual() {
        if (!temSuporte()) return null;
        const reg = await registroSW();
        return reg ? reg.pushManager.getSubscription() : null;
    }

    async function chamar(corpo) {
        const { data, error } = await sb.functions.invoke('notificacoes', { body: corpo });
        if (error) {
            let msg = error.message;
            try { const j = await error.context.json(); if (j && j.erro) msg = j.erro; } catch (e) { /* mantém a mensagem padrão */ }
            throw new Error(msg);
        }
        return data;
    }
    function base64ParaBytes(s) {
        const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
        return Uint8Array.from(b, c => c.charCodeAt(0));
    }
    async function gravarAparelho(sub) {
        const j = sub.toJSON();
        const { error } = await sb.rpc('notif_registrar_aparelho', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_agente: navigator.userAgent });
        if (error) throw new Error(error.message);
    }
    async function ativarAparelho() {
        const permissao = await Notification.requestPermission();
        if (permissao !== 'granted') throw new Error(permissao === 'denied' ? 'As notificações foram bloqueadas neste aparelho.' : 'Autorização não concedida.');
        const reg = await registroSW();
        if (!reg) throw new Error('O aplicativo ainda está carregando. Tente de novo em instantes.');
        const { publica } = await chamar({ acao: 'chave' });
        const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaBytes(publica) });
        await gravarAparelho(sub);
    }
    async function desativarAparelho() {
        const sub = await assinaturaAtual();
        if (!sub) return;
        await sb.rpc('notif_remover_aparelho', { p_endpoint: sub.endpoint });
        await sub.unsubscribe();
    }

    // ----- O que esta pessoa pode escolher -----
    async function carregarOpcoes() {
        const [sites, tipos, prefs] = await Promise.all([
            sb.from('notif_sites').select('projeto').eq('ativo', true),
            sb.from('notif_tipos').select('id,projeto,nome,descricao,publico,horario,ativo,ordem').eq('ativo', true).order('ordem'),
            sb.from('notif_preferencias').select('tipo,ativo'),
        ]);
        if (sites.error || tipos.error) throw new Error((sites.error || tipos.error).message);
        const ativos = new Set(sites.data.map(s => s.projeto));
        const meus = new Map(API.projetosDoUsuario().filter(p => !p.soAdmin).map(p => [p.id, p]));
        const desligadas = new Set((prefs.data || []).filter(p => !p.ativo).map(p => p.tipo));
        const automaticas = tipos.data
            .filter(t => ativos.has(t.projeto) && (t.publico === 'todos' || meus.has(t.projeto)))
            .map(t => ({ id: t.id, nome: t.nome, nota: `${t.descricao} Às ${t.horario}.` }));
        const avisos = [...meus.values()].filter(p => ativos.has(p.id))
            .map(p => ({ id: `aviso:${p.id}`, nome: `Avisos de ${p.nome}`, nota: 'Recados enviados pela administração.' }));
        return [...automaticas, ...avisos].map(o => ({ ...o, ligada: !desligadas.has(o.id) }));
    }

    // ----- Janela -----
    let janela = null;
    function fechar() { if (janela) { janela.remove(); janela = null; } }
    const interruptor = (id, ligado) => `<button type="button" role="switch" aria-checked="${ligado}" data-pref="${esc(id)}" class="relative w-11 h-6 rounded-full shrink-0 transition-colors ${ligado ? 'bg-emerald-600' : 'bg-slate-300'}"><span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${ligado ? 'translate-x-5' : ''}"></span></button>`;

    async function desenhar(aviso) {
        const corpo = janela.querySelector('[data-corpo]');
        corpo.innerHTML = '<p class="text-sm text-slate-400 text-center py-8">Carregando…</p>';
        let opcoes = [], erroOpcoes = '';
        try { opcoes = await carregarOpcoes(); } catch (e) { erroOpcoes = e.message; }
        const sub = await assinaturaAtual();
        const permissao = temSuporte() ? Notification.permission : 'indisponivel';
        const ativo = !!sub && permissao === 'granted';

        let estado;
        if (precisaInstalar()) {
            estado = `<div class="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900"><p class="font-bold mb-1">Adicione o Painel à tela de início</p><p>No iPhone, as notificações só funcionam com o aplicativo instalado. No Safari, toque em Compartilhar, depois em <b>Adicionar à Tela de Início</b>, e abra o Painel pelo ícone criado.</p></div>`;
        } else if (!temSuporte()) {
            estado = `<div class="rounded-xl bg-slate-100 p-3 text-sm text-slate-600">Este navegador não aceita notificações. No celular, use o Chrome no Android ou o aplicativo instalado no iPhone.</div>`;
        } else if (permissao === 'denied') {
            estado = `<div class="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-800"><p class="font-bold mb-1">Notificações bloqueadas</p><p>Libere nas configurações do navegador ou do celular, na permissão de notificações deste site, e abra esta janela de novo.</p></div>`;
        } else if (ativo) {
            estado = `<div class="rounded-xl bg-emerald-50 border border-emerald-200 p-3"><p class="text-sm font-bold text-emerald-800 flex items-center gap-2"><i data-lucide="bell-ring" class="w-4 h-4"></i> Ativas neste aparelho</p><div class="flex gap-2 mt-2.5"><button type="button" data-acao="teste" class="flex-1 px-3 py-2 rounded-xl bg-white border border-emerald-200 text-sm font-bold text-emerald-800">Enviar teste</button><button type="button" data-acao="desativar" class="px-3 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-white">Desativar</button></div></div>`;
        } else {
            estado = `<button type="button" data-acao="ativar" class="w-full py-3 rounded-xl bg-gradient-to-b from-emerald-600 to-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2"><i data-lucide="bell-ring" class="w-4 h-4"></i> Ativar neste aparelho</button>`;
        }

        const lista = erroOpcoes
            ? `<p class="text-sm text-rose-700">Não foi possível carregar as opções: ${esc(erroOpcoes)}</p>`
            : opcoes.length
                ? opcoes.map(o => `<div class="flex items-center justify-between gap-3 py-3 border-b border-slate-100 last:border-0"><div class="min-w-0"><p class="text-sm font-bold text-slate-800">${esc(o.nome)}</p><p class="text-xs text-slate-500">${esc(o.nota)}</p></div>${interruptor(o.id, o.ligada)}</div>`).join('')
                : '<p class="text-sm text-slate-400 py-3">Nenhuma notificação disponível para você no momento.</p>';

        corpo.innerHTML = `${aviso ? `<p class="mb-3 text-sm font-semibold ${aviso.erro ? 'text-rose-700' : 'text-emerald-700'}">${esc(aviso.texto)}</p>` : ''}${estado}
            <p class="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mt-5 mb-1">O que receber</p>${lista}`;
        if (window.lucide) lucide.createIcons();
    }

    async function aoClicar(e) {
        if (e.target === janela || e.target.closest('[data-fechar]')) { fechar(); return; }
        const pref = e.target.closest('[data-pref]');
        if (pref) {
            const ligar = pref.getAttribute('aria-checked') !== 'true';
            pref.setAttribute('aria-checked', String(ligar));
            pref.classList.toggle('bg-emerald-600', ligar);
            pref.classList.toggle('bg-slate-300', !ligar);
            pref.firstElementChild.classList.toggle('translate-x-5', ligar);
            const { error } = await sb.from('notif_preferencias').upsert({ usuario: API.usuarioAtual().id, tipo: pref.dataset.pref, ativo: ligar }, { onConflict: 'usuario,tipo' });
            if (error) desenhar({ erro: true, texto: 'Não foi possível salvar sua escolha. Tente de novo.' });
            return;
        }
        const botao = e.target.closest('[data-acao]');
        if (!botao) return;
        botao.disabled = true; botao.classList.add('opacity-60');
        try {
            if (botao.dataset.acao === 'ativar') { await ativarAparelho(); await desenhar({ texto: 'Pronto! Este aparelho vai receber as notificações.' }); }
            else if (botao.dataset.acao === 'desativar') { await desativarAparelho(); await desenhar({ texto: 'Este aparelho não vai mais receber notificações.' }); }
            else if (botao.dataset.acao === 'teste') { await chamar({ acao: 'teste' }); await desenhar({ texto: 'Teste enviado. A notificação deve chegar em instantes.' }); }
        } catch (err) {
            await desenhar({ erro: true, texto: err.message });
        }
    }

    function abrir() {
        if (janela) return;
        janela = document.createElement('div');
        janela.className = 'fixed inset-0 z-[120] bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-4';
        janela.innerHTML = `<div role="dialog" aria-modal="true" aria-labelledby="tituloNotif" class="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[88vh] flex flex-col">
            <div class="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
                <h3 id="tituloNotif" class="text-base font-extrabold text-slate-800">Notificações</h3>
                <button type="button" data-fechar aria-label="Fechar" class="p-2 -mr-2 rounded-lg text-slate-400 hover:bg-slate-100"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
            <div data-corpo class="p-5 overflow-y-auto"></div>
        </div>`;
        janela.addEventListener('click', aoClicar);
        document.body.appendChild(janela);
        if (window.lucide) lucide.createIcons();
        desenhar();
    }

    // ----- Depois do login -----
    function oferecerAtivar() {
        if (document.getElementById('convite-notif')) return;
        const c = document.createElement('div');
        c.id = 'convite-notif';
        c.className = 'fixed z-[110] left-3 right-3 bottom-3 sm:left-auto sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4';
        c.innerHTML = `<p class="text-sm font-extrabold text-slate-800">Receber avisos no celular?</p>
            <p class="text-xs text-slate-500 mt-0.5">Aniversários, transplantio e uso de água do dia. Você escolhe o que quer receber.</p>
            <div class="flex justify-end gap-2 mt-3">
                <button type="button" data-nao class="px-3 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100">Agora não</button>
                <button type="button" data-sim class="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">Ver opções</button>
            </div>`;
        c.addEventListener('click', e => {
            const sim = e.target.closest('[data-sim]');
            if (!sim && !e.target.closest('[data-nao]')) return;
            try { localStorage.setItem(K_DISPENSOU, '1'); } catch (err) { /* só volta a perguntar */ }
            c.remove();
            if (sim) abrir();
        });
        document.body.appendChild(c);
    }

    async function sincronizar() {
        try {
            if (!temSuporte()) return;
            if (Notification.permission === 'granted') {
                const sub = await assinaturaAtual();
                if (sub) { await gravarAparelho(sub); return; }
            }
            if (Notification.permission === 'denied' || localStorage.getItem(K_DISPENSOU)) return;
            if (precisaInstalar()) return;
            if ((await carregarOpcoes()).length) oferecerAtivar();
        } catch (e) { /* sem conexão ou tabelas ainda não criadas: fica para a próxima */ }
    }

    async function aoSair() {
        fechar();
        const convite = document.getElementById('convite-notif');
        if (convite) convite.remove();
        try {
            const sub = await assinaturaAtual();
            if (sub) await sb.rpc('notif_remover_aparelho', { p_endpoint: sub.endpoint });
        } catch (e) { /* sai mesmo assim */ }
    }

    window.NotificacoesSPG = { abrir, sincronizar, aoSair };
})();
