// Usuários online: quem está usando o Painel agora, em qual página, há quanto tempo e de onde.
// Os dados vêm das sessões que cada aparelho atualiza a cada minuto (supabase-api.js).
(function () {
    'use strict';
    const API = window.IrrigacaoAPI;
    if (!API.isAdmin()) { location.replace('../../index.html'); return; }

    const ONLINE_MS = 2 * 60 * 1000;          // sem sinal há mais de 2 min = saiu
    const BUSCAR_A_CADA_MS = 30 * 1000;
    const el = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const iniciais = nome => String(nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
    const hora = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const CORES = ['bg-emerald-100 text-emerald-800', 'bg-sky-100 text-sky-800', 'bg-amber-100 text-amber-800', 'bg-violet-100 text-violet-800', 'bg-rose-100 text-rose-800', 'bg-teal-100 text-teal-800'];
    const corDe = id => CORES[[...String(id)].reduce((t, c) => t + c.charCodeAt(0), 0) % CORES.length];

    let sessoes = [];
    let erro = '';
    let ultimaBusca = null;

    const estaOnline = s => !s.fim && Date.now() - new Date(s.ultimo_sinal).getTime() < ONLINE_MS;
    const fimDe = s => estaOnline(s) ? Date.now() : new Date(s.fim || s.ultimo_sinal).getTime();

    function duracao(ms) {
        const min = Math.max(0, Math.floor(ms / 60000));
        if (min < 1) return 'menos de 1 min';
        if (min < 60) return min + ' min';
        const h = Math.floor(min / 60);
        return h + ' h' + (min % 60 ? ' ' + String(min % 60).padStart(2, '0') + ' min' : '');
    }
    function haQuanto(iso) {
        const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
        if (s < 60) return 'agora';
        return 'há ' + duracao(s * 1000);
    }

    function inicioDoDia() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); }

    // Junta as sessões de cada pessoa
    function porPessoa() {
        const mapa = new Map();
        sessoes.forEach(s => {
            if (!mapa.has(s.usuario_id)) mapa.set(s.usuario_id, { id: s.usuario_id, nome: s.usuario_nome || 'Sem nome', sessoes: [] });
            mapa.get(s.usuario_id).sessoes.push(s);
        });
        return [...mapa.values()].map(p => {
            p.sessoes.sort((a, b) => String(b.ultimo_sinal).localeCompare(String(a.ultimo_sinal)));
            p.online = p.sessoes.filter(estaOnline);
            p.ultima = p.sessoes[0];
            p.totalMs = p.sessoes.reduce((t, s) => t + (fimDe(s) - new Date(s.inicio).getTime()), 0);
            return p;
        });
    }

    function linhaInfo(icone, texto, extra) {
        if (!texto) return '';
        return `<p class="flex items-start gap-2 text-xs text-slate-600 min-w-0"><i data-lucide="${icone}" class="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5"></i><span class="min-w-0 break-words">${texto}${extra ? ` <span class="text-slate-400">${extra}</span>` : ''}</span></p>`;
    }

    function blocoSessao(s, varias) {
        const onde = [s.cidade, s.provedor].filter(Boolean).map(esc).join(' · ');
        return `<div class="${varias ? 'rounded-xl bg-slate-50 p-3' : ''} space-y-1.5">
            <p class="text-sm font-bold text-slate-800 flex items-start gap-2"><i data-lucide="app-window" class="w-4 h-4 text-emerald-600 shrink-0 mt-0.5"></i><span class="min-w-0 break-words">${esc(s.aba || 'Início do Painel')}</span></p>
            ${linhaInfo('timer', `Online há <b class="text-slate-800">${duracao(Date.now() - new Date(s.inicio).getTime())}</b>`, `desde ${hora(s.inicio)} · sinal ${haQuanto(s.ultimo_sinal)}`)}
            ${linhaInfo('smartphone', esc(s.dispositivo), s.versao_app ? 'versão ' + esc(s.versao_app) : '')}
            ${linhaInfo('map-pin', s.local ? esc(API.nomeLocal(s.local)) : '')}
            ${linhaInfo('navigation', onde)}
            ${linhaInfo('globe', s.ip ? 'IP <b class="text-slate-800 font-mono">' + esc(s.ip) + '</b>' : '<span class="text-slate-400">IP não informado</span>')}
        </div>`;
    }

    function cartaoOnline(p) {
        const varias = p.online.length > 1;
        return `<article class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm" data-usuario="${esc(p.id)}">
            <header class="flex items-center gap-3 mb-3">
                <span class="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0 ${corDe(p.id)}">${esc(iniciais(p.nome))}</span>
                <div class="min-w-0 flex-1">
                    <h3 class="text-sm font-extrabold text-slate-900 truncate">${esc(p.nome)}</h3>
                    <p class="text-[11px] font-bold text-emerald-700 flex items-center gap-1.5"><span class="pulso w-2 h-2 rounded-full bg-emerald-500"></span>Online${varias ? ` em ${p.online.length} aparelhos` : ''}</p>
                </div>
            </header>
            <div class="space-y-2">${p.online.map(s => blocoSessao(s, varias)).join('')}</div>
        </article>`;
    }

    function linhaHoje(p) {
        const s = p.ultima;
        return `<div class="flex items-center gap-3 px-4 py-3" data-usuario="${esc(p.id)}">
            <span class="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${corDe(p.id)}">${esc(iniciais(p.nome))}</span>
            <div class="min-w-0 flex-1">
                <p class="text-sm font-bold text-slate-800 truncate">${esc(p.nome)}</p>
                <p class="text-[11px] text-slate-500 truncate">${esc(s.aba || 'Início do Painel')} · ${esc(s.dispositivo || '')}</p>
                <p class="text-[11px] text-slate-400 truncate">${[s.cidade, s.ip ? 'IP ' + s.ip : 'IP não informado'].filter(Boolean).map(esc).join(' · ')}</p>
            </div>
            <div class="text-right shrink-0">
                <p class="text-xs font-bold text-slate-700">Visto ${haQuanto(s.ultimo_sinal)}</p>
                <p class="text-[11px] text-slate-400">${duracao(p.totalMs)} hoje</p>
            </div>
        </div>`;
    }

    function desenhar() {
        const pessoas = porPessoa();
        const online = pessoas.filter(p => p.online.length).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        const antes = pessoas.filter(p => !p.online.length).sort((a, b) => String(b.ultima.ultimo_sinal).localeCompare(String(a.ultima.ultimo_sinal)));
        el('resumoOnline').textContent = online.length;
        el('resumoHoje').textContent = pessoas.length;
        el('resumoAparelhos').textContent = online.reduce((t, p) => t + p.online.length, 0);
        el('listaOnline').innerHTML = erro
            ? `<div class="sm:col-span-2 lg:col-span-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-sm font-semibold" role="alert">${esc(erro)}</div>`
            : online.length ? online.map(cartaoOnline).join('')
            : `<div class="sm:col-span-2 lg:col-span-3 bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center text-sm text-slate-500">Ninguém online agora.</div>`;
        el('listaHoje').innerHTML = antes.length ? antes.map(linhaHoje).join('') : '<p class="px-4 py-6 text-center text-sm text-slate-400">Ninguém mais usou hoje.</p>';
        el('atualizadoEm').textContent = ultimaBusca ? 'Atualiza sozinho · última às ' + ultimaBusca.toLocaleTimeString('pt-BR') : 'Carregando...';
        if (window.lucide) lucide.createIcons();
    }

    let buscando = false;
    async function buscar() {
        if (buscando) return;
        buscando = true;
        el('btnAtualizar').disabled = true;
        try {
            sessoes = await API.listarSessoes(inicioDoDia());
            erro = '';
            ultimaBusca = new Date();
        } catch (e) {
            erro = 'Não foi possível carregar: ' + (e.message || 'sem conexão') + '. Tentando de novo em instantes.';
        } finally {
            buscando = false;
            el('btnAtualizar').disabled = false;
            desenhar();
        }
    }

    el('btnAtualizar').addEventListener('click', buscar);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') buscar(); });
    setInterval(() => { if (document.visibilityState === 'visible') buscar(); }, BUSCAR_A_CADA_MS);
    setInterval(() => { if (document.visibilityState === 'visible' && !buscando) desenhar(); }, 15 * 1000);   // minutos andando
    buscar();
})();
