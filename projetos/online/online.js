// Usuários online: quem está usando o Painel agora, em qual página, há quanto tempo e de onde.
// Também mostra dias anteriores e, ao tocar numa pessoa, as sessões e o que ela registrou/alterou no dia
// (antes isso ficava numa janela dentro da Irrigação).
// Os dados vêm das sessões que cada aparelho atualiza a cada minuto (supabase-api.js).
(function () {
    'use strict';
    const API = window.IrrigacaoAPI;
    if (!API.isAdmin()) { location.replace('../../index.html'); return; }

    const ONLINE_MS = 2 * 60 * 1000;          // sem sinal há mais de 2 min = saiu
    const BUSCAR_A_CADA_MS = 30 * 1000;
    const DIA_MS = 24 * 3600 * 1000;
    const el = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const iniciais = nome => String(nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
    const hora = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const CORES = ['bg-emerald-100 text-emerald-800', 'bg-sky-100 text-sky-800', 'bg-amber-100 text-amber-800', 'bg-violet-100 text-violet-800', 'bg-rose-100 text-rose-800', 'bg-teal-100 text-teal-800'];
    const corDe = id => CORES[[...String(id)].reduce((t, c) => t + c.charCodeAt(0), 0) % CORES.length];

    // Dia no fuso do aparelho: "2026-11-10"
    const diaIso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dataBr = dia => dia.split('-').reverse().join('/');
    const ehHoje = () => dia === diaIso();

    let dia = diaIso();
    let sessoes = [];
    let autores = [];                 // quem registrou/alterou algo no dia: [{ id, nome, qtd }]
    let erro = '';
    let ultimaBusca = null;
    const abertos = new Set();        // pessoas com o detalhe do dia aberto
    const atividades = new Map();     // "dia|id" → { linhas } | { erro } | { carregando: true }

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

    // "Hoje · 10/11", "Ontem · 09/11" ou "qui, 05/11/2026"
    function rotuloDia(d) {
        const ontem = diaIso(new Date(Date.now() - DIA_MS));
        if (d === diaIso()) return 'Hoje · ' + dataBr(d).slice(0, 5);
        if (d === ontem) return 'Ontem · ' + dataBr(d).slice(0, 5);
        const semana = new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
        return semana + ', ' + dataBr(d);
    }

    function periodoDoDia() {
        const inicio = new Date(dia + 'T00:00:00');
        return { inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + DIA_MS).toISOString() };
    }

    // Junta as sessões e as alterações de cada pessoa no dia
    function porPessoa() {
        const mapa = new Map();
        const pessoa = (id, nome) => {
            if (!mapa.has(id)) mapa.set(id, { id, nome: nome || 'Sem nome', sessoes: [], alteracoes: 0 });
            const p = mapa.get(id);
            if (p.nome === 'Sem nome' && nome) p.nome = nome;
            return p;
        };
        sessoes.forEach(s => pessoa(s.usuario_id, s.usuario_nome).sessoes.push(s));
        autores.forEach(a => { pessoa(a.id, a.nome).alteracoes = a.qtd; });
        return [...mapa.values()].map(p => {
            p.sessoes.sort((a, b) => String(b.ultimo_sinal).localeCompare(String(a.ultimo_sinal)));
            p.online = p.sessoes.filter(estaOnline);
            p.ultima = p.sessoes[0] || null;
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

    // --- Detalhe do dia de uma pessoa: sessões + atividades ---

    const ROTULOS_TABELA = {
        registros_irrigacao: 'registro de irrigação', programacoes: 'item da programação', motor_diario: 'hora do motor',
        envios_relatorio: 'envio de relatório', pocos: 'poço', leituras_poco: 'leitura de poço',
        reservatorios: 'reservatório', leituras_reservatorio: 'nível de reservatório', perfis: 'perfil de usuário',
        dados_bloco: 'dados do bloco', usuarios_login: 'login de usuário', manutencoes_poco: 'manutenção de poço',
        horas_poco_dia: 'horas ligado do poço', culturas_bloco: 'cultura do bloco', configuracoes: 'configuração'
    };

    function acaoDe(l) {
        const excluiu = l.acao === 'DELETE' || (l.acao === 'UPDATE' && l.dados_depois && l.dados_depois.excluido_em && !(l.dados_antes || {}).excluido_em);
        return l.acao === 'CRIAR_LOGIN' ? { verbo: 'criou', icone: 'user-plus', cor: 'text-sky-600 bg-sky-50' }
             : l.acao === 'REDEFINIR_SENHA' ? { verbo: 'redefiniu a senha de um', icone: 'key-round', cor: 'text-amber-600 bg-amber-50' }
             : excluiu ? { verbo: 'excluiu', icone: 'trash-2', cor: 'text-red-500 bg-red-50' }
             : l.acao === 'INSERT' ? { verbo: 'registrou', icone: 'plus', cor: 'text-green-600 bg-green-50' }
             : { verbo: 'alterou', icone: 'pencil', cor: 'text-amber-600 bg-amber-50' };
    }

    function resumoAtividade(l) {
        const d = l.dados_depois || l.dados_antes || {};
        const partes = [];
        if (l.tabela === 'envios_relatorio') partes.push(`Relatório de ${d.tipo === 'programacao' ? 'programação' : 'irrigação'} · ${d.qtd_registros ?? 0} itens`);
        if (d.bloco) partes.push('Bloco ' + d.bloco);
        if (d.minutos != null && l.tabela !== 'envios_relatorio') partes.push(d.minutos + ' min');
        if (d.turno) partes.push(d.turno);
        if (d.data) partes.push('dia ' + dataBr(String(d.data).slice(0, 10)));
        if (d.dia) partes.push(d.dia);
        if (d.numero) partes.push('Nº ' + d.numero);
        if (!partes.length && d.nome) partes.push(d.nome);
        return partes.join(' · ');
    }

    function linhaAtividade(l) {
        const a = acaoDe(l);
        const resumo = resumoAtividade(l);
        return `<div class="flex items-start gap-2 py-2">
            <span class="w-6 h-6 rounded-full ${a.cor} flex items-center justify-center shrink-0"><i data-lucide="${a.icone}" class="w-3 h-3"></i></span>
            <div class="min-w-0 flex-1">
                <p class="text-[12px] text-slate-700 leading-snug">${esc(a.verbo)} ${esc(ROTULOS_TABELA[l.tabela] || l.tabela || '')}${resumo ? `<span class="text-slate-500"> · ${esc(resumo)}</span>` : ''}</p>
                <p class="text-[10px] font-bold text-slate-400 mt-0.5">${hora(l.criado_em)}</p>
            </div>
        </div>`;
    }

    function linhaSessaoDoDia(s) {
        const online = estaOnline(s);
        const status = online ? 'online agora' : s.fim ? 'saiu do app' : 'app fechado ou sem internet';
        const rede = [s.ip ? 'IP ' + s.ip : '', s.provedor, s.cidade].filter(Boolean).join(' · ');
        return `<div class="flex items-start gap-2 py-2">
            <span class="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${online ? 'bg-emerald-500' : 'bg-slate-300'}"></span>
            <div class="min-w-0 flex-1">
                <p class="text-[12px] font-bold text-slate-700">${hora(s.inicio)} – ${online ? 'agora' : hora(fimDe(s))} <span class="font-medium text-slate-400">· ${duracao(fimDe(s) - new Date(s.inicio).getTime())} · ${status}</span></p>
                <p class="text-[11px] text-slate-500 break-words">${[s.aba || 'Início do Painel', s.local ? API.nomeLocal(s.local) : '', s.dispositivo, s.versao_app ? 'versão ' + s.versao_app : ''].filter(Boolean).map(esc).join(' · ')}</p>
                ${rede ? `<p class="text-[11px] text-slate-400 break-words">${esc(rede)}</p>` : ''}
            </div>
        </div>`;
    }

    function detalheDoDia(p) {
        const titulo = t => `<p class="text-[10px] font-black text-slate-400 uppercase tracking-widest pt-3">${t}</p>`;
        const info = atividades.get(dia + '|' + p.id);
        const corpoAtiv = !info || info.carregando ? '<p class="text-[11px] text-slate-400 py-3 text-center">Carregando...</p>'
            : info.erro ? `<p class="text-[11px] text-red-500 py-3 text-center">Não foi possível carregar: ${esc(info.erro)}</p>`
            : !info.linhas.length ? '<p class="text-[11px] text-slate-400 py-3 text-center">Nenhuma alteração neste dia (só consultou).</p>'
            : `<p class="text-[10px] font-bold text-slate-400 pt-2">${info.linhas.length} ${info.linhas.length === 1 ? 'ação' : 'ações'} no dia</p>` + info.linhas.map(linhaAtividade).join('');
        return `<div class="border-t border-slate-100 bg-slate-50/70 px-4 pb-3">
            ${titulo('Sessões')}
            <div class="divide-y divide-slate-100">${p.sessoes.length ? p.sessoes.map(linhaSessaoDoDia).join('')
                : '<p class="text-[11px] text-slate-400 py-2">Nenhuma sessão registrada neste dia (as alterações podem ter sido feitas sem internet e enviadas depois).</p>'}</div>
            ${titulo('Atividades')}
            <div class="divide-y divide-slate-100">${corpoAtiv}</div>
        </div>`;
    }

    async function carregarAtividades(id, silencioso) {
        const chave = dia + '|' + id;
        const atual = atividades.get(chave);
        if (atual && atual.carregando) return;
        if (atual && !silencioso) return;   // já carregado: só recarrega nas atualizações automáticas
        if (!atual) atividades.set(chave, { carregando: true });
        const { inicio, fim } = periodoDoDia();
        try {
            atividades.set(chave, { linhas: await API.atividadesDaSessao(id, inicio, fim) });
        } catch (e) {
            if (!atual || atual.erro) atividades.set(chave, { erro: e.message || 'sem conexão' });
        }
        if (abertos.has(id)) desenhar();
    }

    const seta = aberto => `<i data-lucide="chevron-down" class="w-4 h-4 text-slate-400 shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}"></i>`;
    const textoAlteracoes = p => p.alteracoes ? `${p.alteracoes} alteraç${p.alteracoes === 1 ? 'ão' : 'ões'}` : '';

    function cartaoOnline(p) {
        const varias = p.online.length > 1;
        const aberto = abertos.has(p.id);
        return `<article class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden" data-usuario="${esc(p.id)}">
            <div class="p-4">
                <header class="flex items-center gap-3 mb-3">
                    <span class="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0 ${corDe(p.id)}">${esc(iniciais(p.nome))}</span>
                    <div class="min-w-0 flex-1">
                        <h3 class="text-sm font-extrabold text-slate-900 truncate">${esc(p.nome)}</h3>
                        <p class="text-[11px] font-bold text-emerald-700 flex items-center gap-1.5"><span class="pulso w-2 h-2 rounded-full bg-emerald-500"></span>Online${varias ? ` em ${p.online.length} aparelhos` : ''}</p>
                    </div>
                </header>
                <div class="space-y-2">${p.online.map(s => blocoSessao(s, varias)).join('')}</div>
            </div>
            <button type="button" data-abrir="${esc(p.id)}" aria-expanded="${aberto}" class="w-full flex items-center justify-between gap-2 px-4 py-2.5 border-t border-slate-100 text-xs font-bold text-slate-600 hover:bg-slate-50">
                <span>Ver o dia${textoAlteracoes(p) ? ' · ' + textoAlteracoes(p) : ''}</span>${seta(aberto)}
            </button>
            ${aberto ? detalheDoDia(p) : ''}
        </article>`;
    }

    function linhaPessoa(p) {
        const s = p.ultima;
        const aberto = abertos.has(p.id);
        const online = p.online.length > 0;
        const sub = s ? [s.aba || 'Início do Painel', s.dispositivo].filter(Boolean).map(esc).join(' · ') : 'Sem sessão registrada no dia';
        const rede = s ? [s.cidade, s.ip ? 'IP ' + s.ip : 'IP não informado'].filter(Boolean).map(esc).join(' · ') : '';
        const direita = s
            ? `<p class="text-xs font-bold ${online ? 'text-emerald-700' : 'text-slate-700'}">${online ? 'Online agora' : ehHoje() ? 'Visto ' + haQuanto(s.ultimo_sinal) : hora(p.sessoes[p.sessoes.length - 1].inicio) + ' – ' + hora(fimDe(s))}</p>
               <p class="text-[11px] text-slate-400">${duracao(p.totalMs)}${ehHoje() ? ' hoje' : ' no app'}</p>` : '';
        return `<div data-usuario="${esc(p.id)}">
            <button type="button" data-abrir="${esc(p.id)}" aria-expanded="${aberto}" class="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                <span class="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${corDe(p.id)}">${esc(iniciais(p.nome))}</span>
                <div class="min-w-0 flex-1">
                    <p class="text-sm font-bold text-slate-800 truncate">${esc(p.nome)}${textoAlteracoes(p) ? `<span class="ml-1.5 text-[10px] font-black px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 align-middle">${textoAlteracoes(p)}</span>` : ''}</p>
                    <p class="text-[11px] text-slate-500 truncate">${sub}</p>
                    ${rede ? `<p class="text-[11px] text-slate-400 truncate">${rede}</p>` : ''}
                </div>
                <div class="text-right shrink-0">${direita}</div>
                ${seta(aberto)}
            </button>
            ${aberto ? detalheDoDia(p) : ''}
        </div>`;
    }

    function desenhar() {
        const hoje = ehHoje();
        const ultimoSinal = p => p.ultima ? String(p.ultima.ultimo_sinal) : '';
        const pessoas = porPessoa();
        const online = pessoas.filter(p => p.online.length).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        const lista = (hoje ? pessoas.filter(p => !p.online.length) : pessoas).sort((a, b) => ultimoSinal(b).localeCompare(ultimoSinal(a)));

        el('diaRotulo').textContent = rotuloDia(dia);
        el('diaProximo').disabled = hoje;
        el('secaoAgora').classList.toggle('hidden', !hoje);
        el('resumoOnlineRotulo').textContent = hoje ? 'Online agora' : 'Pessoas no dia';
        el('resumoHojeRotulo').textContent = hoje ? 'Usaram hoje' : 'Sessões';
        el('resumoAparelhosRotulo').textContent = hoje ? 'Aparelhos agora' : 'Alterações';
        el('resumoOnline').textContent = hoje ? online.length : pessoas.length;
        el('resumoHoje').textContent = hoje ? pessoas.length : sessoes.length;
        el('resumoAparelhos').textContent = hoje ? online.reduce((t, p) => t + p.online.length, 0) : autores.reduce((t, a) => t + a.qtd, 0);
        el('tituloHoje').textContent = hoje ? 'Usaram mais cedo hoje' : 'Quem usou em ' + rotuloDia(dia);

        const caixaErro = `<div class="sm:col-span-2 lg:col-span-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-sm font-semibold" role="alert">${esc(erro)}</div>`;
        el('listaOnline').innerHTML = erro ? caixaErro
            : online.length ? online.map(cartaoOnline).join('')
            : `<div class="sm:col-span-2 lg:col-span-3 bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center text-sm text-slate-500">Ninguém online agora.</div>`;
        el('listaHoje').innerHTML = !hoje && erro ? `<p class="px-4 py-6 text-center text-sm font-semibold text-red-600">${esc(erro)}</p>`
            : lista.length ? lista.map(linhaPessoa).join('')
            : `<p class="px-4 py-6 text-center text-sm text-slate-400">${hoje ? 'Ninguém mais usou hoje.' : 'Ninguém usou o Painel neste dia.'}</p>`;
        el('atualizadoEm').textContent = !ultimaBusca ? 'Carregando...'
            : hoje ? 'Atualiza sozinho · última às ' + ultimaBusca.toLocaleTimeString('pt-BR')
            : 'Histórico de ' + dataBr(dia);
        if (window.lucide) lucide.createIcons();
    }

    let buscando = false;
    async function buscar() {
        if (buscando) return;
        buscando = true;
        el('btnAtualizar').disabled = true;
        const diaPedido = dia;
        const { inicio, fim } = periodoDoDia();
        try {
            const [s, a] = await Promise.all([
                API.listarSessoes(inicio, fim),
                API.autoresAuditoriaPeriodo(inicio, fim).catch(() => [])
            ]);
            if (diaPedido !== dia) return;   // trocou de dia enquanto carregava: vale a busca nova
            sessoes = s;
            autores = a;
            erro = '';
            ultimaBusca = new Date();
            abertos.forEach(id => carregarAtividades(id, true));
        } catch (e) {
            if (diaPedido === dia) erro = 'Não foi possível carregar: ' + (e.message || 'sem conexão') + '. Tentando de novo em instantes.';
        } finally {
            buscando = false;
            el('btnAtualizar').disabled = false;
            if (diaPedido === dia) desenhar(); else buscar();
        }
    }

    function irParaDia(novo) {
        if (!novo || novo > diaIso() || novo === dia) return;
        dia = novo;
        el('diaFiltro').value = dia;
        sessoes = []; autores = []; erro = ''; ultimaBusca = null;
        abertos.clear();
        desenhar();
        buscar();
    }

    // Tocar numa pessoa abre/fecha o dia dela
    document.querySelector('main').addEventListener('click', e => {
        const botao = e.target.closest('[data-abrir]');
        if (!botao) return;
        const id = botao.dataset.abrir;
        if (abertos.has(id)) abertos.delete(id); else { abertos.add(id); carregarAtividades(id); }
        desenhar();
    });

    const filtro = el('diaFiltro');
    filtro.max = diaIso();
    filtro.value = dia;
    filtro.addEventListener('change', () => irParaDia(filtro.value));
    el('diaCalendario').addEventListener('click', () => { try { filtro.showPicker(); } catch (e) { filtro.focus(); filtro.click(); } });
    const mudarDia = delta => irParaDia(diaIso(new Date(new Date(dia + 'T12:00:00').getTime() + delta * DIA_MS)));
    el('diaAnterior').addEventListener('click', () => mudarDia(-1));
    el('diaProximo').addEventListener('click', () => mudarDia(1));

    el('btnAtualizar').addEventListener('click', buscar);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ehHoje()) buscar(); });
    setInterval(() => { if (document.visibilityState === 'visible' && ehHoje()) buscar(); }, BUSCAR_A_CADA_MS);
    setInterval(() => { if (document.visibilityState === 'visible' && ehHoje() && !buscando) desenhar(); }, 15 * 1000);   // minutos andando
    buscar();
})();
