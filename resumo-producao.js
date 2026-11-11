// Aba "Resumo" da Produção Oásis e da Produção Estufa.
// Duas abas separadas, cada uma com os próprios filtros (período com atalhos ou calendário De/Até,
// bloco/setor, ciclo, cultura e variedade):
//  - Colheita: total (kg, cabeças/unidades, caixas), comparação com os dias anteriores, por dia e por bloco
//  - Calendário de plantio: o que foi plantado, agrupado por dia, e quando deve começar a colher
// Usa os mesmos dados que a página já carrega (colheita_painel / producao_estufa_painel):
//   historico: [{ data_entrega, bloco, ciclo, cultura, variedade_comercial, qtd_cabecas, peso_total_kg, caixas }]
//   pendentes: [{ data_plantio, nome, ciclo, cultura, variedade, qtd_plantas, data_colheita }]
//
// Uso: ResumoProducao.desenhar(elemento, dados, { local: 'SPG Oásis', unidades: 'Cabeças', rotuloBloco: 'Bloco' })
(function () {
    'use strict';
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = (v, casas = 0) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: casas });
    const isoDe = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const isoHoje = () => isoDe(new Date());
    const dataDe = iso => new Date(String(iso).slice(0, 10) + 'T12:00:00');
    const somarDias = (iso, n) => { const d = dataDe(iso); d.setDate(d.getDate() + n); return isoDe(d); };
    const diaMes = iso => iso ? String(iso).slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '—';
    const dataBR = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—';
    const semana = iso => { const s = dataDe(iso).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''); return s.charAt(0).toUpperCase() + s.slice(1); };
    const diasEntre = (de, ate) => Math.round((dataDe(ate) - dataDe(de)) / 86400000);
    const textoDias = n => `${n} ${n === 1 ? 'dia' : 'dias'}`;
    const limpo = s => String(s ?? '').trim();

    // "A" vira "Bloco A", "8" vira "Bloco 8"; o que já vem com o nome ("Bloco 8", "Setor 2", "Talhão 3") fica igual
    function nomeBloco(valor, rotulo) {
        const v = limpo(valor);
        if (!v) return '—';
        return /^(bloco|setor|talh[aã]o)\b/i.test(v) ? v : `${rotulo} ${v}`;
    }
    const ordemNatural = (a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });

    const ATALHOS = [
        ['ultima', 'Última colheita'], ['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'],
        ['mes', 'Este mês'], ['mesPassado', 'Mês passado'], ['personalizado', 'Personalizado']
    ];

    function periodoDoAtalho(atalho, ultimaColheita) {
        const hoje = isoHoje();
        const d = new Date();
        switch (atalho) {
            case 'ultima': return [ultimaColheita || hoje, ultimaColheita || hoje];
            case 'hoje': return [hoje, hoje];
            case 'ontem': return [somarDias(hoje, -1), somarDias(hoje, -1)];
            case '7': return [somarDias(hoje, -6), hoje];
            case '30': return [somarDias(hoje, -29), hoje];
            case 'mes': return [isoDe(new Date(d.getFullYear(), d.getMonth(), 1)), hoje];
            case 'mesPassado': return [isoDe(new Date(d.getFullYear(), d.getMonth() - 1, 1)), isoDe(new Date(d.getFullYear(), d.getMonth(), 0))];
            default: return null;
        }
    }

    function cartao(titulo, icone, corpo, extra = '') {
        return `<section class="bg-white rounded-[24px] shadow-soft border border-slate-100 overflow-hidden">
            <header class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-3.5 border-b border-slate-100">
                <h3 class="flex items-center gap-2 text-sm font-extrabold text-slate-700"><i data-lucide="${icone}" class="w-4 h-4 text-emerald-600"></i>${titulo}</h3>
                ${extra}
            </header>
            ${corpo}
        </section>`;
    }
    const vazio = texto => `<p class="px-5 py-8 text-center text-sm font-semibold text-slate-400">${texto}</p>`;
    const CAMPO = 'w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-2.5 px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400 focus:bg-white';
    const ROTULO = 'block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5';

    // ---------- Estado por página ----------
    // Duas visões separadas, cada uma com os próprios filtros:
    //   colheita: o que foi colhido (abre na última colheita)
    //   plantio:  calendário de plantio, o que foi plantado (abre nos últimos 30 dias)
    const VISOES = {
        colheita: { titulo: 'Colheita', icone: 'tractor', ultima: 'Última colheita', atalhoPadrao: 'ultima' },
        plantio: { titulo: 'Calendário de plantio', icone: 'sprout', ultima: 'Último plantio', atalhoPadrao: '30' }
    };
    const filtroInicial = visao => ({ atalho: VISOES[visao].atalhoPadrao, de: '', ate: '', bloco: '', ciclo: '', cultura: '', variedade: '' });

    function preparar(alvo, dados, opcoes) {
        const e = alvo._resumo || (alvo._resumo = { visao: 'colheita', filtros: { colheita: filtroInicial('colheita'), plantio: filtroInicial('plantio') } });
        e.opcoes = opcoes;
        const rotulo = opcoes.rotuloBloco || 'Bloco';
        const hoje = isoHoje();
        // Linhas já com o nome do bloco/setor completo e datas no formato AAAA-MM-DD
        e.colheitas = ((dados && dados.historico) || []).map(h => ({
            data: limpo(h.data_entrega).slice(0, 10), bloco: nomeBloco(h.bloco, rotulo), ciclo: limpo(h.ciclo),
            cultura: limpo(h.cultura), variedade: limpo(h.variedade_comercial),
            kg: Number(h.peso_total_kg) || 0, un: Number(h.qtd_cabecas) || 0, cx: Number(h.caixas) || 0
        })).filter(h => h.data && h.data <= hoje);
        e.plantios = ((dados && dados.pendentes) || []).map(p => ({
            data: limpo(p.data_plantio).slice(0, 10), bloco: nomeBloco(p.nome, rotulo), ciclo: limpo(p.ciclo),
            cultura: limpo(p.cultura), variedade: limpo(p.variedade), plantas: Number(p.qtd_plantas) || 0,
            colheita: limpo(p.data_colheita).slice(0, 10)
        })).filter(p => p.data && p.data <= hoje);
        const ultimaData = lista => lista.reduce((m, x) => x.data > m ? x.data : m, '');
        e.ultima = { colheita: ultimaData(e.colheitas), plantio: ultimaData(e.plantios) };
        Object.keys(VISOES).forEach(v => {
            const f = e.filtros[v];
            if (!f.de || f.atalho === 'ultima') [f.de, f.ate] = periodoDoAtalho(f.atalho, e.ultima[v]) || periodoDoAtalho('ultima', e.ultima[v]);
        });
        return e;
    }

    const linhasDaVisao = (e, visao) => visao === 'colheita' ? e.colheitas : e.plantios;

    function desenharAbas(alvo, e) {
        alvo.querySelector('[data-resumo-abas]').innerHTML = Object.entries(VISOES).map(([id, v]) => {
            const ativa = id === e.visao;
            return `<button type="button" role="tab" data-resumo-visao="${id}" aria-selected="${ativa}" class="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${ativa ? 'bg-white shadow-sm ring-1 ring-slate-200/80 text-emerald-700' : 'text-slate-500 hover:text-slate-700'}"><i data-lucide="${v.icone}" class="w-4 h-4"></i>${v.titulo}</button>`;
        }).join('');
    }

    function desenharFiltros(alvo, e) {
        const f = e.filtros[e.visao], rotulo = e.opcoes.rotuloBloco || 'Bloco';
        const linhas = linhasDaVisao(e, e.visao);
        const lista = campo => [...new Set(linhas.map(x => x[campo]).filter(v => v && v !== '—'))].sort(ordemNatural);
        const opcoes = (campo, rotuloTodos) => {
            const valores = lista(campo);
            if (f[campo] && !valores.includes(f[campo])) valores.unshift(f[campo]);
            return `<option value="">${rotuloTodos}</option>` + valores.map(v => `<option value="${esc(v)}"${v === f[campo] ? ' selected' : ''}>${esc(campo === 'ciclo' ? 'Ciclo ' + v : v)}</option>`).join('');
        };
        const atalhos = ATALHOS.map(([v, t]) => [v, v === 'ultima' ? VISOES[e.visao].ultima : t]);
        alvo.querySelector('[data-resumo-filtros]').innerHTML = `
            <div class="grid grid-cols-2 lg:grid-cols-[190px_150px_150px_repeat(4,minmax(0,1fr))_auto] gap-3 items-end">
                <div class="col-span-2 lg:col-span-1"><label class="${ROTULO}">Período</label>
                    <select data-filtro="atalho" class="${CAMPO}">${atalhos.map(([v, t]) => `<option value="${v}"${v === f.atalho ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
                <div><label class="${ROTULO}">De</label><input type="date" data-filtro="de" value="${f.de}" class="${CAMPO}"></div>
                <div><label class="${ROTULO}">Até</label><input type="date" data-filtro="ate" value="${f.ate}" class="${CAMPO}"></div>
                <div><label class="${ROTULO}">${esc(rotulo)}</label><select data-filtro="bloco" class="${CAMPO}">${opcoes('bloco', 'Todos')}</select></div>
                <div><label class="${ROTULO}">Ciclo</label><select data-filtro="ciclo" class="${CAMPO}">${opcoes('ciclo', 'Todos')}</select></div>
                <div><label class="${ROTULO}">Cultura</label><select data-filtro="cultura" class="${CAMPO}">${opcoes('cultura', 'Todas')}</select></div>
                <div><label class="${ROTULO}">Variedade</label><select data-filtro="variedade" class="${CAMPO}">${opcoes('variedade', 'Todas')}</select></div>
                <button type="button" data-resumo-limpar class="col-span-2 lg:col-span-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100"><i data-lucide="eraser" class="w-4 h-4"></i>Limpar</button>
            </div>`;
    }

    // Período e filtros da visão atual
    function recorte(e) {
        const f = e.filtros[e.visao];
        const [de, ate] = f.de <= f.ate ? [f.de, f.ate] : [f.ate, f.de];
        const passa = x => (!f.bloco || x.bloco === f.bloco) && (!f.ciclo || x.ciclo === f.ciclo) && (!f.cultura || x.cultura === f.cultura) && (!f.variedade || x.variedade === f.variedade);
        const umDia = de === ate;
        const hoje = isoHoje();
        const nomePeriodo = umDia ? (de === hoje ? 'Hoje' : `${semana(de)} ${dataBR(de)}`) : `${dataBR(de)} a ${dataBR(ate)}`;
        return { de, ate, passa, umDia, hoje, nomePeriodo };
    }
    const soma = (lista, c) => lista.reduce((s, x) => s + x[c], 0);
    const caixaNumero = (rot, val, cor) => `<div class="rounded-2xl ${cor} px-4 py-3"><p class="text-[10px] font-black uppercase tracking-wider opacity-70">${rot}</p><p class="text-2xl sm:text-3xl font-black tabular-nums leading-tight">${val}</p></div>`;
    const seloCiclo = c => c ? ` <span class="text-[10px] font-bold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 align-middle">Ciclo ${esc(c)}</span>` : '';

    // ---------- Visão: Colheita ----------
    function htmlColheita(e) {
        const { de, ate, passa, umDia, hoje, nomePeriodo } = recorte(e);
        const unidades = e.opcoes.unidades || 'Unidades', rotulo = e.opcoes.rotuloBloco || 'Bloco';
        const colheitas = e.colheitas.filter(h => h.data >= de && h.data <= ate && passa(h));
        if (!colheitas.length) return cartao('Colheita', 'tractor', vazio(`Nenhuma colheita ${umDia ? 'neste dia' : 'neste período'} com esses filtros.`), `<span class="text-xs font-bold text-slate-400">${esc(nomePeriodo)}</span>`);

        const kg = soma(colheitas, 'kg');
        let comparacao = '';
        if (umDia) {
            // Média dos 7 dias de colheita anteriores, com os mesmos filtros
            const porDia = new Map();
            e.colheitas.filter(h => h.data < de && passa(h)).forEach(h => porDia.set(h.data, (porDia.get(h.data) || 0) + h.kg));
            const anteriores = [...porDia.keys()].sort().reverse().slice(0, 7).map(d => porDia.get(d));
            const media = anteriores.length ? anteriores.reduce((s, v) => s + v, 0) / anteriores.length : 0;
            if (media > 0) {
                const dif = (kg - media) / media * 100, sobe = dif >= 0;
                comparacao = `<span class="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${sobe ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}"><i data-lucide="${sobe ? 'trending-up' : 'trending-down'}" class="w-3.5 h-3.5"></i>${sobe ? '+' : ''}${num(dif)}% vs. média dos dias anteriores</span>`;
            }
        }
        const diasComColheita = new Set(colheitas.map(h => h.data)).size;
        const total = cartao('Colheita', 'tractor', `<div class="p-5 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm font-bold text-slate-500">${esc(nomePeriodo)}${umDia ? '' : ` · ${textoDias(diasComColheita)} com colheita`}</p>${comparacao}
            </div>
            <div class="grid grid-cols-3 gap-2 sm:gap-3">
                ${caixaNumero('Peso (kg)', num(kg, 1), 'bg-emerald-50 text-emerald-800')}
                ${caixaNumero(esc(unidades), num(soma(colheitas, 'un')), 'bg-slate-50 text-slate-800')}
                ${caixaNumero('Caixas', num(soma(colheitas, 'cx'), 1), 'bg-amber-50 text-amber-800')}
            </div>
        </div>`);

        let porDiaHtml = '';
        if (!umDia) {
            const porDia = new Map();
            colheitas.forEach(h => { const t = porDia.get(h.data) || { kg: 0, cx: 0 }; t.kg += h.kg; t.cx += h.cx; porDia.set(h.data, t); });
            const dias = [...porDia.keys()].sort().reverse();
            const maior = Math.max(1, ...dias.map(d => porDia.get(d).kg));
            porDiaHtml = cartao('Colheita por dia', 'calendar-days', `<ul class="divide-y divide-slate-50 px-5 py-2 max-h-[420px] overflow-y-auto">
                ${dias.map(d => { const t = porDia.get(d); return `<li class="flex items-center gap-3 py-2">
                    <span class="w-24 shrink-0 text-xs font-bold ${d === hoje ? 'text-emerald-700' : 'text-slate-500'}">${d === hoje ? 'Hoje' : `${semana(d)} ${diaMes(d)}`}</span>
                    <span class="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden"><span class="block h-full rounded-full bg-emerald-500" style="width:${Math.max(3, t.kg / maior * 100).toFixed(1)}%"></span></span>
                    <span class="w-24 shrink-0 text-right text-sm font-black text-slate-800 tabular-nums">${num(t.kg, 1)} kg</span>
                    <span class="w-14 shrink-0 text-right text-xs font-bold text-slate-400 tabular-nums">${num(t.cx, 1)} cx</span>
                </li>`; }).join('')}
            </ul>`);
        }

        const porBloco = new Map();
        colheitas.forEach(h => {
            const k = [h.bloco, h.ciclo, h.variedade].join('|');
            const t = porBloco.get(k) || { bloco: h.bloco, ciclo: h.ciclo, cultura: h.cultura, variedade: h.variedade, kg: 0, un: 0, cx: 0, dias: new Set() };
            t.kg += h.kg; t.un += h.un; t.cx += h.cx; t.dias.add(h.data);
            porBloco.set(k, t);
        });
        const blocos = cartao(`Colhido por ${rotulo.toLowerCase()}`, 'grid-2x2', `<ul class="divide-y divide-slate-50 max-h-[480px] overflow-y-auto">
            ${[...porBloco.values()].sort((a, b) => b.kg - a.kg).map(l => `<li class="flex items-center justify-between gap-3 px-5 py-2.5">
                <div class="min-w-0">
                    <p class="text-sm font-extrabold text-slate-800 truncate">${esc(l.bloco)}${seloCiclo(l.ciclo)}</p>
                    <p class="text-[11px] font-semibold text-slate-400 truncate">${esc([l.cultura, l.variedade].filter(Boolean).join(' · ') || '—')}${umDia ? '' : ` · ${textoDias(l.dias.size)}`}</p>
                </div>
                <div class="text-right shrink-0"><p class="text-sm font-black text-emerald-700 tabular-nums">${num(l.kg, 1)} kg</p>
                <p class="text-[11px] font-semibold text-slate-400 tabular-nums">${num(l.un)} ${esc(unidades.toLowerCase())} · ${num(l.cx, 1)} cx</p></div>
            </li>`).join('')}
        </ul>`);

        return `<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <div class="space-y-4">${total}${porDiaHtml}</div>
            <div class="space-y-4">${blocos}</div>
        </div>`;
    }

    // ---------- Visão: Calendário de plantio ----------
    function htmlPlantio(e) {
        const { de, ate, passa, umDia, hoje, nomePeriodo } = recorte(e);
        const plantios = e.plantios.filter(p => p.data >= de && p.data <= ate && passa(p)).sort((a, b) => b.data.localeCompare(a.data) || ordemNatural(a.bloco, b.bloco));
        if (!plantios.length) return cartao('Calendário de plantio', 'sprout', vazio(`Nenhum plantio ${umDia ? 'neste dia' : 'neste período'} com esses filtros.`), `<span class="text-xs font-bold text-slate-400">${esc(nomePeriodo)}</span>`);

        const total = cartao('Plantado', 'sprout', `<div class="p-5 space-y-3">
            <p class="text-sm font-bold text-slate-500">${esc(nomePeriodo)}${umDia ? '' : ` · ${textoDias(new Set(plantios.map(p => p.data)).size)} com plantio`}</p>
            <div class="grid grid-cols-3 gap-2 sm:gap-3">
                ${caixaNumero('Plantas', num(soma(plantios, 'plantas')), 'bg-emerald-50 text-emerald-800')}
                ${caixaNumero(esc((e.opcoes.rotuloBloco || 'Bloco') + 's'), num(new Set(plantios.map(p => p.bloco + '|' + p.ciclo)).size), 'bg-slate-50 text-slate-800')}
                ${caixaNumero('Variedades', num(new Set(plantios.map(p => p.variedade).filter(Boolean)).size), 'bg-amber-50 text-amber-800')}
            </div>
        </div>`);

        // Agrupado por dia, como um calendário
        const porDia = new Map();
        plantios.forEach(p => { if (!porDia.has(p.data)) porDia.set(p.data, []); porDia.get(p.data).push(p); });
        const calendario = cartao('Plantios por dia', 'calendar-days', `<div class="divide-y divide-slate-100 max-h-[620px] overflow-y-auto">
            ${[...porDia.entries()].map(([dia, lista]) => `<div class="px-5 py-3">
                <div class="flex items-center justify-between gap-2 mb-1.5">
                    <p class="flex items-center gap-2 text-xs font-black text-emerald-700 uppercase tracking-wider">
                        <span class="inline-flex items-center justify-center rounded-lg bg-emerald-50 px-2 py-0.5">${dia === hoje ? 'Hoje' : `${semana(dia)} ${dataBR(dia)}`}</span>
                    </p>
                    <span class="text-xs font-bold text-slate-400 tabular-nums">${num(soma(lista, 'plantas'))} plantas</span>
                </div>
                <ul class="space-y-1.5">
                    ${lista.map(p => {
                        const falta = p.colheita ? diasEntre(hoje, p.colheita) : null;
                        const quando = falta === null ? '' : falta > 0 ? `colhe em ${textoDias(falta)}` : falta === 0 ? 'colhe hoje' : 'já em colheita';
                        return `<li class="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                            <div class="min-w-0">
                                <p class="text-sm font-extrabold text-slate-800 truncate">${esc(p.bloco)}${seloCiclo(p.ciclo)}</p>
                                <p class="text-[11px] font-semibold text-slate-400 truncate">${esc([p.cultura, p.variedade].filter(Boolean).join(' · ') || '—')}</p>
                            </div>
                            <div class="text-right shrink-0"><p class="text-sm font-black text-slate-800 tabular-nums">${num(p.plantas)} plantas</p>
                            ${quando ? `<p class="text-[11px] font-bold ${falta !== null && falta >= 0 && falta <= 7 ? 'text-amber-600' : 'text-slate-400'}">${quando}${p.colheita ? ' · ' + diaMes(p.colheita) : ''}</p>` : ''}</div>
                        </li>`;
                    }).join('')}
                </ul>
            </div>`).join('')}
        </div>`);

        return `<div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4 items-start">
            <div class="space-y-4">${total}</div>
            <div class="space-y-4">${calendario}</div>
        </div>`;
    }

    function desenharResultado(alvo, e) {
        alvo.querySelector('[data-resumo-resultado]').innerHTML = e.visao === 'colheita' ? htmlColheita(e) : htmlPlantio(e);
        if (window.lucide) lucide.createIcons();
    }

    function ligarEventos(alvo) {
        if (alvo._resumoLigado) return;
        alvo._resumoLigado = true;
        alvo.addEventListener('change', ev => {
            const campo = ev.target.closest('[data-filtro]');
            const e = alvo._resumo;
            if (!campo || !e) return;
            const f = e.filtros[e.visao], nome = campo.dataset.filtro;
            if (nome === 'atalho') {
                f.atalho = campo.value;
                const p = periodoDoAtalho(f.atalho, e.ultima[e.visao]);
                if (p) [f.de, f.ate] = p;
                desenharFiltros(alvo, e);
            } else if (nome === 'de' || nome === 'ate') {
                f[nome] = campo.value || f[nome];
                f.atalho = 'personalizado';
                alvo.querySelector('[data-filtro="atalho"]').value = 'personalizado';
            } else {
                f[nome] = campo.value;
            }
            desenharResultado(alvo, e);
        });
        alvo.addEventListener('click', ev => {
            const e = alvo._resumo;
            if (!e) return;
            const aba = ev.target.closest('[data-resumo-visao]');
            if (aba) {
                e.visao = aba.dataset.resumoVisao;
                desenharAbas(alvo, e); desenharFiltros(alvo, e); desenharResultado(alvo, e);
                return;
            }
            if (ev.target.closest('[data-resumo-limpar]')) {
                const f = e.filtros[e.visao] = filtroInicial(e.visao);
                [f.de, f.ate] = periodoDoAtalho(f.atalho, e.ultima[e.visao]);
                desenharFiltros(alvo, e); desenharResultado(alvo, e);
            }
        });
    }

    function desenhar(alvo, dados, opcoes = {}) {
        if (!alvo) return;
        const e = preparar(alvo, dados, opcoes);
        if (!alvo.querySelector('[data-resumo-filtros]')) {
            alvo.innerHTML = `<div class="space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-3 px-1">
                    <div>
                        <h2 class="text-lg font-black text-slate-800">Resumo${opcoes.local ? ' · ' + esc(opcoes.local) : ''}</h2>
                        <p class="text-xs font-bold text-slate-400 first-letter:uppercase">${esc(new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }))}</p>
                    </div>
                    <div data-resumo-abas role="tablist" aria-label="Resumo" class="flex w-full sm:w-auto bg-slate-100/80 rounded-2xl ring-1 ring-slate-200/70 p-1 gap-1"></div>
                </div>
                <div data-resumo-filtros class="bg-white rounded-[24px] shadow-soft border border-slate-100 p-4"></div>
                <div data-resumo-resultado></div>
            </div>`;
        }
        ligarEventos(alvo);
        desenharAbas(alvo, e);
        desenharFiltros(alvo, e);
        desenharResultado(alvo, e);
    }

    window.ResumoProducao = { desenhar };
})();
