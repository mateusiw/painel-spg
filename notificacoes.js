// Notificações no celular: autorização do aparelho e escolha do que cada pessoa quer receber.
// Roda só na janela principal do Painel, porque o navegador exige isso para pedir permissão.
// NotificacoesSPG.abrir()       -> janela "Notificações" (botão do sino no menu)
// NotificacoesSPG.sincronizar() -> depois do login: liga o aparelho a quem entrou e lembra de instalar e ativar
// NotificacoesSPG.aoSair()      -> antes de sair: este aparelho deixa de receber as notificações da pessoa
(function () {
    'use strict';
    if (window.NotificacoesSPG) return;

    const API = window.IrrigacaoAPI;
    const sb = API.cliente;
    const K_LEMBRAR = 'spg_lembrete_ate';
    const UMA_HORA = 60 * 60 * 1000;
    const K_APARELHO = 'spg_notif_aparelho';
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
        relatarDispositivo();
    }
    async function desativarAparelho() {
        const sub = await assinaturaAtual();
        if (!sub) return;
        await sb.rpc('notif_remover_aparelho', { p_endpoint: sub.endpoint });
        await sub.unsubscribe();
        relatarDispositivo();
    }

    // ----- Qual é este aparelho (para o administrador saber quem ativou e onde) -----
    function codigoAparelho() {
        let c = localStorage.getItem(K_APARELHO);
        if (!c) {
            c = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
            localStorage.setItem(K_APARELHO, c);
        }
        return c;
    }
    function nomeNavegador(ua, alta) {
        const marcas = (alta.fullVersionList || []).filter(m => !/not.?a.?brand|^chromium$/i.test(m.brand));
        if (marcas.length) return marcas[0].brand.replace(/^Google /, '').replace(/^Microsoft /, '') + ' ' + parseInt(marcas[0].version, 10);
        const regras = [[/Edg(?:e|A|iOS)?\/(\d+)/, 'Edge'], [/OPR\/(\d+)/, 'Opera'], [/SamsungBrowser\/(\d+)/, 'Samsung Internet'], [/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'], [/(?:Chrome|CriOS)\/(\d+)/, 'Chrome'], [/Version\/(\d+).*Safari/, 'Safari']];
        for (const [re, nome] of regras) { const m = ua.match(re); if (m) return nome + ' ' + m[1]; }
        return 'Navegador';
    }
    function sistemaWindows(ua, alta) {
        // O navegador informa "Windows NT 10.0" tanto no 10 quanto no 11: quem separa é a versão detalhada
        if (alta.platform === 'Windows' && alta.platformVersion) {
            const maior = parseInt(alta.platformVersion, 10);
            return maior >= 13 ? 'Windows 11' : maior > 0 ? 'Windows 10' : 'Windows 8 ou anterior';
        }
        const nt = (ua.match(/Windows NT (\d+\.\d+)/) || [])[1];
        return { '10.0': 'Windows 10 ou 11', '6.3': 'Windows 8.1', '6.2': 'Windows 8', '6.1': 'Windows 7' }[nt] || 'Windows';
    }
    async function infoDispositivo() {
        const ua = navigator.userAgent;
        let alta = {};
        try {
            if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
                alta = await navigator.userAgentData.getHighEntropyValues(['platform', 'platformVersion', 'model', 'fullVersionList']);
            }
        } catch (e) { /* segue só com o texto do navegador */ }
        const navegador = nomeNavegador(ua, alta);
        const base = { modelo: '', navegador, instalado: instalado() };
        if (/CrOS/.test(ua) || alta.platform === 'Chrome OS') return { ...base, tipo: 'Chromebook', sistema: 'ChromeOS' };
        if (/Android/.test(ua)) {
            const versao = alta.platformVersion ? parseInt(alta.platformVersion, 10) : (ua.match(/Android (\d+)/) || [])[1];
            const modeloUa = (ua.match(/Android [^;)]+; ([^;)]+?)(?: Build|\))/) || [])[1] || '';
            return { ...base, tipo: /Mobile/.test(ua) ? 'Celular' : 'Tablet', sistema: 'Android' + (versao ? ' ' + versao : ''), modelo: alta.model || (modeloUa === 'K' ? '' : modeloUa) };
        }
        if (ehIphone()) {
            const tablet = /ipad/i.test(ua) || !/iphone|ipod/i.test(ua);
            const v = ua.match(/OS (\d+)[_.](\d+)/) || ua.match(/Version\/(\d+)\.(\d+)/);
            return { ...base, tipo: tablet ? 'Tablet' : 'Celular', sistema: (tablet ? 'iPadOS' : 'iOS') + (v ? ' ' + v[1] + '.' + v[2] : ''), modelo: tablet ? 'iPad' : 'iPhone' };
        }
        if (/Windows/.test(ua)) return { ...base, tipo: 'Computador', sistema: sistemaWindows(ua, alta) };
        if (/Macintosh/.test(ua)) return { ...base, tipo: 'Computador', sistema: 'macOS' + (alta.platformVersion ? ' ' + parseInt(alta.platformVersion, 10) : '') };
        if (/Linux/.test(ua)) return { ...base, tipo: 'Computador', sistema: 'Linux' };
        return { ...base, tipo: 'Computador', sistema: alta.platform || 'Não identificado' };
    }
    async function estadoAtual() {
        if (precisaInstalar()) return 'precisa_instalar';
        if (!temSuporte()) return 'sem_suporte';
        if (Notification.permission === 'denied') return 'bloqueadas';
        return Notification.permission === 'granted' && await assinaturaAtual() ? 'ativas' : 'nao_ativadas';
    }
    async function relatarDispositivo(estadoForcado) {
        try {
            const u = API.usuarioAtual();
            if (!u) return;
            await sb.from('notif_dispositivos').upsert({
                usuario: u.id, aparelho: codigoAparelho(), ...(await infoDispositivo()),
                estado: estadoForcado || await estadoAtual(), visto_em: new Date().toISOString()
            }, { onConflict: 'usuario,aparelho' });
        } catch (e) { /* é só informação: nunca atrapalha quem está usando */ }
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

    // ----- Lembrete de instalar o aplicativo e ativar as notificações -----
    // Android e computador avisam que dá para instalar (beforeinstallprompt), e isso só acontece na
    // janela principal; no iPhone o Safari não tem esse aviso, então mostramos o passo a passo.
    // "Lembrar em 1 hora" vale para este aparelho. Depois disso o aviso volta até estar tudo feito.
    let pedidoInstalacao = null, lembrete = null, timerLembrete = null, avaliando = false;

    const podeInstalar = () => !instalado() && (!!pedidoInstalacao || ehIphone());
    const adiadoAte = () => { try { return Number(localStorage.getItem(K_LEMBRAR) || 0); } catch (e) { return 0; } };

    async function pendencias() {
        const instalar = podeInstalar();
        let ativar = false;
        if (temSuporte() && !precisaInstalar() && Notification.permission !== 'denied') {
            ativar = !(Notification.permission === 'granted' && await assinaturaAtual());
            if (ativar) { try { ativar = (await carregarOpcoes()).length > 0; } catch (e) { ativar = false; } }
        }
        return { instalar, ativar };
    }
    function fecharLembrete() { if (lembrete) { lembrete.remove(); lembrete = null; } }
    function agendarLembrete() {
        clearTimeout(timerLembrete);
        const falta = adiadoAte() - Date.now();
        if (falta > 0) timerLembrete = setTimeout(avaliarLembrete, falta + 500);
    }

    function desenharLembrete({ instalar, ativar }, erro) {
        if (!lembrete) {
            lembrete = document.createElement('div');
            lembrete.className = 'fixed inset-0 z-[115] bg-slate-900/60 flex items-center justify-center p-5';
            lembrete.addEventListener('click', aoClicarLembrete);
            document.body.appendChild(lembrete);
        }
        const titulo = instalar && ativar ? 'Deixe o Painel pronto' : instalar ? 'Instale o aplicativo' : 'Ative as notificações';
        const passosIphone = instalar && !pedidoInstalacao ? `<ol class="text-left bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[13px] text-slate-600 space-y-2 mt-3">
            <li class="flex items-center gap-2"><span class="w-5 h-5 rounded-full bg-green-600 text-white text-[11px] font-black flex items-center justify-center shrink-0">1</span><span>Toque em <i data-lucide="share" class="inline w-4 h-4 text-sky-600 align-text-bottom"></i> <b>Compartilhar</b> na barra do Safari</span></li>
            <li class="flex items-center gap-2"><span class="w-5 h-5 rounded-full bg-green-600 text-white text-[11px] font-black flex items-center justify-center shrink-0">2</span><span>Escolha <i data-lucide="square-plus" class="inline w-4 h-4 text-slate-600 align-text-bottom"></i> <b>Adicionar à Tela de Início</b></span></li>
            <li class="flex items-center gap-2"><span class="w-5 h-5 rounded-full bg-green-600 text-white text-[11px] font-black flex items-center justify-center shrink-0">3</span><span>Toque em <b>Adicionar</b> e abra o Painel pelo ícone</span></li>
        </ol>` : '';
        const blocoInstalar = instalar ? `<div class="${ativar ? 'pb-4 border-b border-slate-100' : ''}">
            <div class="flex items-center gap-3 text-left">
                <span class="p-2 rounded-xl bg-green-50 text-green-700 shrink-0"><i data-lucide="download" class="w-5 h-5"></i></span>
                <div class="min-w-0 flex-1"><p class="text-sm font-extrabold text-slate-800">Instalar o aplicativo</p><p class="text-xs text-slate-500">Abre direto da tela inicial e funciona melhor sem internet.</p></div>
                ${pedidoInstalacao ? '<button type="button" data-lembrete="instalar" class="px-3.5 py-2 rounded-xl bg-green-600 text-white text-sm font-bold shrink-0">Instalar</button>' : ''}
            </div>${passosIphone}
            ${ehIphone() ? '<p class="text-xs text-slate-500 mt-2">No iPhone, as notificações só podem ser ativadas depois de instalar.</p>' : ''}
        </div>` : '';
        const blocoAtivar = ativar ? `<div class="flex items-center gap-3 text-left ${instalar ? 'pt-4' : ''}">
            <span class="p-2 rounded-xl bg-amber-50 text-amber-600 shrink-0"><i data-lucide="bell-ring" class="w-5 h-5"></i></span>
            <div class="min-w-0 flex-1"><p class="text-sm font-extrabold text-slate-800">Ativar as notificações</p><p class="text-xs text-slate-500">Aniversários, transplantio e uso de água do dia. Você escolhe o que quer receber.</p></div>
            <button type="button" data-lembrete="ativar" class="px-3.5 py-2 rounded-xl bg-green-600 text-white text-sm font-bold shrink-0">Ativar</button>
        </div>` : '';
        lembrete.innerHTML = `<div role="dialog" aria-modal="true" aria-labelledby="tituloLembrete" class="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-6 text-center">
            <img src="./icone-app.png" alt="" class="w-14 h-14 rounded-2xl mx-auto mb-3 shadow">
            <h3 id="tituloLembrete" class="text-lg font-black text-slate-800 mb-4">${titulo}</h3>
            ${erro ? `<p class="mb-3 text-sm font-semibold text-rose-700">${esc(erro)}</p>` : ''}
            ${blocoInstalar}${blocoAtivar}
            <button type="button" data-lembrete="adiar" class="w-full mt-5 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm">Lembrar em 1 hora</button>
        </div>`;
        if (window.lucide) lucide.createIcons();
    }

    async function atualizarLembrete(erro) {
        const p = await pendencias();
        if (!p.instalar && !p.ativar) { fecharLembrete(); return; }
        desenharLembrete(p, erro);
    }

    async function aoClicarLembrete(e) {
        const botao = e.target.closest('[data-lembrete]');
        if (!botao) return;
        const acao = botao.dataset.lembrete;
        if (acao === 'adiar') {
            try { localStorage.setItem(K_LEMBRAR, String(Date.now() + UMA_HORA)); } catch (err) { /* volta a lembrar ao abrir de novo */ }
            fecharLembrete();
            agendarLembrete();
            return;
        }
        botao.disabled = true; botao.classList.add('opacity-60');
        if (acao === 'instalar' && pedidoInstalacao) {
            const pedido = pedidoInstalacao;
            pedidoInstalacao = null; // o mesmo pedido só pode ser usado uma vez
            pedido.prompt();
            try { await pedido.userChoice; } catch (err) { /* fechou sem escolher */ }
            atualizarLembrete();
        } else if (acao === 'ativar') {
            try { await ativarAparelho(); atualizarLembrete(); } catch (err) { atualizarLembrete(err.message); }
        }
    }

    async function avaliarLembrete() {
        if (avaliando || lembrete || janela || !API.usuarioAtual()) return;
        if (adiadoAte() > Date.now()) { agendarLembrete(); return; }
        avaliando = true;
        try {
            const p = await pendencias();
            if ((p.instalar || p.ativar) && !lembrete && !janela && API.usuarioAtual()) desenharLembrete(p);
        } finally { avaliando = false; }
    }

    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        pedidoInstalacao = e;
        if (lembrete) atualizarLembrete(); else setTimeout(avaliarLembrete, 1500);
    });
    window.addEventListener('appinstalled', () => {
        pedidoInstalacao = null;
        if (lembrete) atualizarLembrete();
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) avaliarLembrete(); });

    // ----- Depois do login -----
    async function sincronizar() {
        relatarDispositivo();
        try {
            if (temSuporte() && Notification.permission === 'granted') {
                const sub = await assinaturaAtual();
                if (sub) await gravarAparelho(sub);
            }
        } catch (e) { /* sem conexão ou tabelas ainda não criadas: fica para a próxima */ }
        avaliarLembrete();
    }

    async function aoSair() {
        fechar();
        fecharLembrete();
        clearTimeout(timerLembrete);
        try {
            const sub = await assinaturaAtual();
            if (sub) await sb.rpc('notif_remover_aparelho', { p_endpoint: sub.endpoint });
            await relatarDispositivo('nao_ativadas');
        } catch (e) { /* sai mesmo assim */ }
    }

    window.NotificacoesSPG = { abrir, sincronizar, aoSair, infoDispositivo };
})();
