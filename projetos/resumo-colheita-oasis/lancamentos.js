// Aba "Lançar": preenche Colheita, Previsão e Descarte direto no sistema (no lugar da planilha).
// Funciona sem internet: grava na mesma fila usada pela irrigação e envia quando houver sinal.
(function () {
    'use strict';

    const API = window.IrrigacaoAPI;
    const LOCAL = 'oasis';
    const STATUS_PADRAO = ['Pendente', 'Em andamento'];

    const CAMPOS_BLOCO = [
        { id: 'bloco', rotulo: 'Bloco', icone: 'grid-2x2', obrig: true, lista: true },
        { id: 'ciclo', rotulo: 'Ciclo', icone: 'repeat', obrig: true, lista: true },
        { id: 'cultura', rotulo: 'Cultura', icone: 'sprout', obrig: true, lista: true },
        { id: 'variedade', rotulo: 'Variedade', icone: 'leaf', lista: true }
    ];
    const n = (v, d = 0) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: d });

    const TIPOS = {
        colheita: {
            rotulo: 'Colheita', icone: 'tractor', gradiente: 'from-sky-600 to-sky-700', botao: 'from-sky-600 to-sky-700 shadow-sky-600/20', acento: 'text-sky-500', ativo: 'text-sky-700',
            data: 'data_entrega', dias: [-30, 0], semFuturo: true,
            campos: [
                { id: 'data_entrega', rotulo: 'Data da entrega', icone: 'calendar', tipo: 'date', obrig: true, largo: true, padraoHoje: true },
                ...CAMPOS_BLOCO,
                { id: 'total_plantas_campo', rotulo: 'Plantas no campo', icone: 'flower-2', tipo: 'number', decimal: false },
                { id: 'caixas', rotulo: 'Caixas', icone: 'package', tipo: 'number', decimal: true },
                { id: 'entregue_unidades', rotulo: 'Unidades', icone: 'hash', tipo: 'number', decimal: false },
                { id: 'entregue_kg', rotulo: 'Peso (kg)', icone: 'scale', tipo: 'number', decimal: true }
            ],
            validar: v => (v.entregue_unidades || v.entregue_kg) ? '' : 'Informe as unidades ou o peso entregue.',
            ajustar: v => { if (v.entregue_unidades === null) v.entregue_unidades = 0; },
            linha: r => [`${n(r.entregue_unidades)} un`, `${n(r.entregue_kg, 2)} kg`, r.caixas ? `${n(r.caixas, 1)} cx` : ''],
            total: l => `${n(soma(l, 'entregue_unidades'))} un · ${n(soma(l, 'entregue_kg'), 2)} kg`
        },
        previsao: {
            rotulo: 'Previsão', icone: 'calendar-clock', gradiente: 'from-emerald-600 to-emerald-700', botao: 'from-emerald-600 to-emerald-700 shadow-emerald-600/20', acento: 'text-emerald-500', ativo: 'text-emerald-700',
            data: 'inicio_colheita', dias: [-60, 180],
            campos: [
                ...CAMPOS_BLOCO,
                { id: 'data_plantio', rotulo: 'Data do plantio', icone: 'calendar-plus', tipo: 'date' },
                { id: 'inicio_colheita', rotulo: 'Início da colheita', icone: 'calendar-check', tipo: 'date', obrig: true },
                { id: 'total_plantas', rotulo: 'Total de plantas', icone: 'flower-2', tipo: 'number', decimal: false },
                { id: 'status', rotulo: 'Status', icone: 'flag', tipo: 'status', obrig: true }
            ],
            validar: v => (v.data_plantio && v.inicio_colheita < v.data_plantio) ? 'O início da colheita não pode ser antes do plantio.' : '',
            linha: r => [`${n(r.total_plantas)} plantas`, r.status],
            total: l => `${n(soma(l, 'total_plantas'))} plantas`
        },
        descarte: {
            rotulo: 'Descarte', icone: 'trash-2', gradiente: 'from-rose-600 to-rose-700', botao: 'from-rose-600 to-rose-700 shadow-rose-600/20', acento: 'text-rose-500', ativo: 'text-rose-700',
            data: 'data_descarte', dias: [-30, 0], semFuturo: true,
            campos: [
                { id: 'data_descarte', rotulo: 'Data do descarte', icone: 'calendar', tipo: 'date', obrig: true, largo: true, padraoHoje: true },
                { id: 'variedade', rotulo: 'Variedade', icone: 'leaf', obrig: true, largo: true, lista: true },
                { id: 'motivo', rotulo: 'Causa da perda', icone: 'message-square-warning', obrig: true, largo: true, lista: true },
                { id: 'local_perda', rotulo: 'Local da perda', icone: 'map-pin', obrig: true, largo: true, lista: true },
                { id: 'unidades', rotulo: 'Unidades', icone: 'hash', tipo: 'number', decimal: false },
                { id: 'peso_kg', rotulo: 'Peso (kg)', icone: 'scale', tipo: 'number', decimal: true }
            ],
            validar: v => (v.unidades || v.peso_kg) ? '' : 'Informe as unidades ou o peso descartado.',
            // Média, ano e semana são calculados, como as colunas da planilha
            ajustar: v => {
                v.media_gr = v.unidades > 0 && v.peso_kg > 0 ? Math.round(v.peso_kg * 100000 / v.unidades) / 100 : null;
                v.ano = v.data_descarte.slice(0, 4);
                v.semana = String(getWeekNumber(new Date(v.data_descarte + 'T12:00:00')));
            },
            titulo: r => r.variedade || 'Sem variedade',
            subtitulo: r => [r.local_perda, r.semana ? 'Semana ' + r.semana : ''].filter(Boolean).join(' · '),
            linha: r => [r.motivo, `${n(r.unidades)} un`, `${n(r.peso_kg, 2)} kg`, r.media_gr ? `${n(r.media_gr, 1)} g` : ''],
            total: l => `${n(soma(l, 'unidades'))} un · ${n(soma(l, 'peso_kg'), 2)} kg`
        }
    };

    const soma = (lista, campo) => lista.reduce((t, r) => t + Number(r[campo] || 0), 0);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const limparBloco = s => String(s || '').replace(/^\s*(talh[aã]o|bloco)\s*/i, '').trim();
    const iconesAgora = () => { if (window.lucide) lucide.createIcons(); };
    const raiz = () => document.getElementById('view-lancamentos');
    const el = id => document.getElementById(id);
    const emPt = iso => iso ? iso.split('-').reverse().join('/') : 'Sem data';

    function hoje() {
        const d = new Date();
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    }
    function somarDias(iso, dias) {
        const d = new Date(iso + 'T12:00:00Z');
        d.setUTCDate(d.getUTCDate() + dias);
        return d.toISOString().slice(0, 10);
    }

    let tipoAtual = 'colheita';
    let editando = null;
    let opcoes = { blocos: [], status: [], motivos: [], locaisPerda: [] };
    let lista = [];
    let filtro = null;
    let montado = false;
    let carga = 0;
    let pendentesAntes = 0;
    let recarregarAoTerminar = false;
    let timerAviso = null;

    const CLASSE_CAMPO = 'w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-3 px-3 text-sm font-medium text-slate-800 outline-none focus:border-slate-400 focus:bg-white transition-all';

    function periodoPadrao(tipo) {
        const [de, ate] = TIPOS[tipo].dias;
        return { de: somarDias(hoje(), de), ate: somarDias(hoje(), ate), busca: '' };
    }

    function montar() {
        raiz().innerHTML = `
            <div class="container mx-auto p-4 space-y-4 max-w-md lg:max-w-5xl mt-2">
                <div id="lancAbas" class="flex bg-slate-100/80 rounded-2xl ring-1 ring-slate-200/70 p-1 gap-1 max-w-md" role="tablist" aria-label="Tipo de lançamento"></div>
                <div id="lancStatus" class="hidden"></div>
                <div class="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start space-y-4 lg:space-y-0">
                    <div id="lancForm" class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"></div>
                    <div id="lancPainel" class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"></div>
                </div>
            </div>
            <div id="lancAviso" role="status" aria-live="polite" class="hidden fixed left-1/2 -translate-x-1/2 bottom-24 lg:bottom-6 z-[60] max-w-[90vw] bg-slate-900 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-xl"></div>`;

        raiz().addEventListener('click', aoClicar);
        raiz().addEventListener('change', aoMudar);
        raiz().addEventListener('input', e => { if (e.target.id === 'lancBusca') { filtro.busca = e.target.value; renderLista(); } });
        raiz().addEventListener('submit', aoSalvar);
        API.onStatus(renderStatus);
        montado = true;
    }

    const tiposLiberados = () => Object.keys(TIPOS).filter(id => API.recursoLiberado('lancar.' + id));

    function renderAbas() {
        el('lancAbas').innerHTML = Object.entries(TIPOS).filter(([id]) => tiposLiberados().includes(id)).map(([id, t]) => {
            const ativo = id === tipoAtual;
            return `<button type="button" role="tab" aria-selected="${ativo}" data-acao="tipo" data-valor="${id}"
                class="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${ativo ? 'bg-white shadow-sm ring-1 ring-slate-200/80 ' + t.ativo : 'text-slate-500'}">
                <i data-lucide="${t.icone}" class="w-3.5 h-3.5"></i>${t.rotulo}</button>`;
        }).join('');
    }

    function campoHtml(c, t, valores) {
        const val = valores[c.id] ?? (c.padraoHoje ? hoje() : c.tipo === 'status' ? 'Pendente' : '');
        const id = 'lanc_' + c.id;
        const obrig = c.obrig ? ' required' : '';
        let entrada;
        if (c.tipo === 'date') {
            entrada = `<input type="date" id="${id}" value="${esc(val)}"${obrig}${t.semFuturo ? ` max="${hoje()}"` : ''} class="${CLASSE_CAMPO}">`;
        } else if (c.tipo === 'number') {
            entrada = `<input type="number" id="${id}" value="${esc(val)}" min="0" step="any" inputmode="${c.decimal ? 'decimal' : 'numeric'}" placeholder="0" class="${CLASSE_CAMPO}">`;
        } else if (c.tipo === 'status') {
            const todos = [...new Set([...STATUS_PADRAO, ...opcoes.status, val].filter(Boolean))];
            entrada = `<select id="${id}"${obrig} class="${CLASSE_CAMPO}">${todos.map(s => `<option value="${esc(s)}"${s === val ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>`;
        } else {
            entrada = `<input type="text" id="${id}" value="${esc(val)}"${obrig} autocomplete="off"${c.lista ? ` list="${id}_lista"` : ''} class="${CLASSE_CAMPO}">${c.lista ? `<datalist id="${id}_lista"></datalist>` : ''}`;
        }
        return `<div class="${c.largo ? 'col-span-2' : ''} min-w-0">
            <label for="${id}" class="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                <i data-lucide="${c.icone}" class="w-3.5 h-3.5 ${t.acento}"></i>${c.rotulo}${c.obrig ? ' <span class="text-red-400">*</span>' : ''}</label>
            ${entrada}</div>`;
    }

    function renderForm() {
        const t = TIPOS[tipoAtual];
        const valores = editando || {};
        el('lancForm').innerHTML = `
            <div class="bg-gradient-to-r ${t.gradiente} px-5 py-4 flex justify-between items-center">
                <h2 class="text-base font-bold text-white flex items-center gap-2"><i data-lucide="${editando ? 'pencil' : t.icone}" class="w-5 h-5 opacity-90"></i>${editando ? 'Editar' : 'Novo lançamento:'} ${t.rotulo.toLowerCase()}</h2>
                ${editando ? `<button type="button" data-acao="cancelar" class="flex items-center gap-1 text-xs font-bold text-white/90 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg"><i data-lucide="x" class="w-3 h-3"></i> Cancelar</button>` : ''}
            </div>
            <form id="lancFormulario" novalidate class="p-5 space-y-4">
                <div class="grid grid-cols-2 gap-3">${t.campos.map(c => campoHtml(c, t, valores)).join('')}</div>
                <p id="lancErro" role="alert" class="hidden text-xs font-bold text-red-500"></p>
                <button type="submit" class="w-full flex items-center justify-center gap-2 bg-gradient-to-b ${t.botao} text-white font-bold py-3.5 rounded-xl text-sm shadow-md active:scale-[.98] transition-all">
                    <i data-lucide="${editando ? 'save' : 'check'}" class="w-4 h-4"></i>${editando ? 'Salvar alterações' : 'Salvar lançamento'}</button>
            </form>`;
        atualizarListas();
        iconesAgora();
    }

    function renderPainel() {
        el('lancPainel').innerHTML = `
            <div class="px-5 py-4 border-b border-slate-100 space-y-3">
                <h3 class="text-sm font-bold text-slate-700 flex items-center gap-2"><i data-lucide="list" class="w-4 h-4 text-slate-400"></i>Lançamentos</h3>
                <div class="grid grid-cols-2 gap-2">
                    <div class="min-w-0"><label for="lancDe" class="text-[10px] font-bold text-slate-400 uppercase">De</label><input type="date" id="lancDe" value="${filtro.de}" class="${CLASSE_CAMPO} !py-2"></div>
                    <div class="min-w-0"><label for="lancAte" class="text-[10px] font-bold text-slate-400 uppercase">Até</label><input type="date" id="lancAte" value="${filtro.ate}" class="${CLASSE_CAMPO} !py-2"></div>
                </div>
                <input type="search" id="lancBusca" value="${esc(filtro.busca)}" placeholder="Buscar..." aria-label="Buscar lançamentos" class="${CLASSE_CAMPO} !py-2">
            </div>
            <div id="lancLista" class="p-3 space-y-4"></div>`;
        iconesAgora();
    }

    function filtrados() {
        const busca = filtro.busca.trim().toLowerCase();
        if (!busca) return lista;
        return lista.filter(r => ['bloco', 'ciclo', 'cultura', 'variedade', 'motivo', 'local_perda', 'status', 'criado_por_nome'].some(c => String(r[c] || '').toLowerCase().includes(busca)));
    }

    function renderLista() {
        const alvo = el('lancLista');
        if (!alvo) return;
        const t = TIPOS[tipoAtual];
        const itens = filtrados();
        if (!itens.length) {
            alvo.innerHTML = `<div class="py-10 text-center text-slate-400"><i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2"></i><p class="text-xs font-semibold">Nenhum lançamento neste período.</p></div>`;
            iconesAgora();
            return;
        }
        const grupos = new Map();
        itens.forEach(r => { const d = r[t.data] || ''; if (!grupos.has(d)) grupos.set(d, []); grupos.get(d).push(r); });
        alvo.innerHTML = [...grupos.entries()].map(([data, regs]) => `
            <section>
                <header class="flex items-center justify-between px-1 mb-1.5">
                    <h4 class="text-[11px] font-black text-slate-500 uppercase tracking-wider">${emPt(data)}</h4>
                    <span class="text-[11px] font-bold text-slate-400">${esc(t.total(regs))}</span>
                </header>
                <div class="space-y-1.5">${regs.map(r => cartao(r, t)).join('')}</div>
            </section>`).join('') + (lista.length >= 1000 ? `<p class="text-[11px] text-amber-700 bg-amber-50 rounded-lg p-2 text-center">Mostrando os 1.000 mais recentes. Reduza o período para ver os demais.</p>` : '');
        iconesAgora();
    }

    function cartao(r, t) {
        const planilha = r.origem === 'planilha';
        const detalhes = t.linha(r).filter(Boolean).map(esc).join(' · ');
        return `<article class="flex items-center gap-2 p-3 rounded-xl border border-slate-200 ${editando && editando.id === r.id ? 'ring-2 ring-amber-400' : ''}">
            <div class="min-w-0 flex-1">
                <p class="text-sm font-black text-slate-800 truncate">${t.titulo ? esc(t.titulo(r)) : `Bloco ${esc(r.bloco)}${r.ciclo ? ` <span class="font-semibold text-slate-400">· Ciclo ${esc(r.ciclo)}</span>` : ''}`}</p>
                <p class="text-[11px] text-slate-500 truncate">${esc(t.subtitulo ? t.subtitulo(r) : [r.cultura, r.variedade].filter(Boolean).join(' · '))}</p>
                <p class="text-xs font-bold text-slate-700 truncate">${detalhes}</p>
                ${r._pendente ? `<span class="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full"><i data-lucide="cloud-off" class="w-3 h-3"></i>Aguardando envio</span>` : ''}
                ${!r._pendente && r.criado_por_nome ? `<p class="text-[10px] text-slate-400 truncate">por ${esc(r.criado_por_nome)}</p>` : ''}
            </div>
            ${planilha
                ? `<span title="Veio da planilha: alterações são feitas lá até a migração terminar" class="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full"><i data-lucide="lock" class="w-3 h-3"></i>Planilha</span>`
                : `<div class="flex shrink-0">
                    <button type="button" data-acao="editar" data-valor="${esc(r.id)}" aria-label="Editar lançamento" title="Editar" class="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                    <button type="button" data-acao="excluir" data-valor="${esc(r.id)}" aria-label="Excluir lançamento" title="Excluir" class="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                  </div>`}
        </article>`;
    }

    function renderStatus(s) {
        const alvo = el('lancStatus');
        if (!alvo) return;
        let html = '';
        if (s.falhas > 0) {
            html = `<div class="flex items-center justify-between gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 text-xs font-bold"><span>${s.falhas} lançamento(s) recusado(s) pelo servidor.</span><button type="button" data-acao="reenviar" class="underline shrink-0">Tentar de novo</button></div>`;
        } else if (s.pendentes > 0) {
            html = `<div class="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2 text-xs font-bold"><i data-lucide="cloud-off" class="w-4 h-4 shrink-0"></i><span>${s.pendentes} aguardando envio. Ficam salvos neste aparelho até ter internet.</span></div>`;
        }
        alvo.innerHTML = html;
        alvo.classList.toggle('hidden', !html);
        iconesAgora();
        // A fila zera durante a sincronização: recarrega só quando ela termina
        if (pendentesAntes > 0 && s.pendentes === 0) recarregarAoTerminar = true;
        pendentesAntes = s.pendentes;
        if (recarregarAoTerminar && !s.sincronizando) {
            recarregarAoTerminar = false;
            if (!raiz().classList.contains('hidden')) carregar();
        }
    }

    // Sugestões em cascata: o que já foi preenchido limita as opções dos demais campos
    function candidatos(ignorar) {
        const v = id => { const c = el('lanc_' + id); return c ? c.value.trim() : ''; };
        const bloco = limparBloco(v('bloco'));
        return opcoes.blocos.filter(b =>
            (ignorar === 'bloco' || !bloco || b.bloco === bloco) &&
            (ignorar === 'ciclo' || !v('ciclo') || b.ciclo === v('ciclo')) &&
            (ignorar === 'cultura' || !v('cultura') || b.cultura === v('cultura')) &&
            (ignorar === 'variedade' || !v('variedade') || b.variedade === v('variedade')));
    }

    function preencherLista(id, valores) {
        const dl = el('lanc_' + id + '_lista');
        if (dl) dl.innerHTML = [...new Set(valores.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })).map(v => `<option value="${esc(v)}"></option>`).join('');
    }

    function atualizarListas() {
        ['bloco', 'ciclo', 'cultura', 'variedade'].forEach(id => preencherLista(id, candidatos(id).map(b => b[id])));
        preencherLista('motivo', opcoes.motivos);
        preencherLista('local_perda', opcoes.locaisPerda);
    }

    function autopreencher() {
        ['ciclo', 'cultura', 'variedade'].forEach(id => {
            const campo = el('lanc_' + id);
            if (!campo || campo.value.trim()) return;
            const unicos = [...new Set(candidatos(id).map(b => b[id]))];
            if (unicos.length === 1 && unicos[0]) campo.value = unicos[0];
        });
        const plantas = el('lanc_total_plantas_campo');
        const achados = candidatos();
        if (plantas && !plantas.value && achados.length === 1 && achados[0].plantas != null) plantas.value = achados[0].plantas;
    }

    function aviso(texto) {
        const a = el('lancAviso');
        a.innerText = texto;
        a.classList.remove('hidden');
        clearTimeout(timerAviso);
        timerAviso = setTimeout(() => a.classList.add('hidden'), 3500);
    }

    function aoMudar(e) {
        const alvo = e.target;
        if (alvo.id === 'lancDe' || alvo.id === 'lancAte') {
            filtro[alvo.id === 'lancDe' ? 'de' : 'ate'] = alvo.value;
            if (filtro.de && filtro.ate) carregar();
            return;
        }
        if (['lanc_bloco', 'lanc_ciclo', 'lanc_cultura', 'lanc_variedade'].includes(alvo.id)) {
            if (alvo.id === 'lanc_bloco') alvo.value = limparBloco(alvo.value);
            autopreencher();
            atualizarListas();
        }
    }

    function aoClicar(e) {
        const b = e.target.closest('[data-acao]');
        if (!b) return;
        const { acao, valor } = b.dataset;
        if (acao === 'tipo' && valor !== tipoAtual) {
            tipoAtual = valor;
            editando = null;
            filtro = periodoPadrao(tipoAtual);
            lista = [];
            renderTudo();
            carregar();
        } else if (acao === 'cancelar') {
            editando = null;
            renderForm();
            renderLista();
        } else if (acao === 'editar') {
            editando = lista.find(r => r.id === valor) || null;
            renderForm();
            renderLista();
            el('lancForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (acao === 'excluir') {
            const r = lista.find(x => x.id === valor);
            if (!r) return;
            showConfirm('Excluir lançamento?', `<b>${esc(TIPOS[tipoAtual].titulo ? TIPOS[tipoAtual].titulo(r) : 'Bloco ' + r.bloco)}</b> de ${emPt(r[TIPOS[tipoAtual].data])} será excluído.`, 'danger', 'Excluir', () => {
                API.lancamentos.excluir(tipoAtual, valor);
                if (editando && editando.id === valor) { editando = null; renderForm(); }
                aviso(navigator.onLine ? 'Lançamento excluído.' : 'Exclusão salva. Será enviada quando houver internet.');
                carregar();
            });
        } else if (acao === 'reenviar') {
            API.reenviarFalhas();
        } else if (acao === 'tentar') {
            carregar();
        }
    }

    function lerFormulario(t) {
        const v = {};
        t.campos.forEach(c => {
            const campo = el('lanc_' + c.id);
            const bruto = campo.value.trim();
            if (c.tipo === 'number') v[c.id] = bruto === '' ? null : Number(bruto);
            else if (c.tipo === 'date') v[c.id] = bruto || null;
            else v[c.id] = c.id === 'bloco' ? limparBloco(bruto) : bruto;
        });
        return v;
    }

    function validar(t, v) {
        const falta = t.campos.find(c => c.obrig && !v[c.id]);
        if (falta) return { erro: `Preencha: ${falta.rotulo}.`, campo: falta.id };
        const negativo = t.campos.find(c => c.tipo === 'number' && v[c.id] !== null && (!Number.isFinite(v[c.id]) || v[c.id] < 0));
        if (negativo) return { erro: `Valor inválido em ${negativo.rotulo}.`, campo: negativo.id };
        if (t.semFuturo && v[t.data] > hoje()) return { erro: 'A data não pode ser no futuro.', campo: t.data };
        const regra = t.validar(v);
        return regra ? { erro: regra } : null;
    }

    function aoSalvar(e) {
        if (e.target.id !== 'lancFormulario') return;
        e.preventDefault();
        const t = TIPOS[tipoAtual];
        const v = lerFormulario(t);
        const problema = validar(t, v);
        const erro = el('lancErro');
        if (problema) {
            erro.innerText = problema.erro;
            erro.classList.remove('hidden');
            if (problema.campo) el('lanc_' + problema.campo).focus();
            return;
        }
        if (t.ajustar) t.ajustar(v);
        try {
            const eraEdicao = !!editando;
            API.lancamentos.salvar(LOCAL, tipoAtual, Object.assign({ id: editando ? editando.id : API.novoId() }, v));
            editando = null;
            renderForm();
            aviso(navigator.onLine ? (eraEdicao ? 'Alterações salvas.' : 'Lançamento salvo.') : 'Salvo no aparelho. Será enviado quando houver internet.');
            carregar();
        } catch (err) {
            erro.innerText = err.message;
            erro.classList.remove('hidden');
        }
    }

    async function carregar() {
        if (!filtro.de || !filtro.ate) return;
        const minha = ++carga;
        const tipo = tipoAtual;
        const alvo = el('lancLista');
        if (alvo && !lista.length) alvo.innerHTML = `<div class="py-10 flex justify-center"><i data-lucide="loader-circle" class="w-6 h-6 text-slate-300 animate-spin"></i></div>`;
        iconesAgora();
        try {
            const dados = await API.lancamentos.listar(LOCAL, tipo, filtro.de, filtro.ate);
            if (minha !== carga) return;
            lista = dados;
            renderLista();
        } catch (e) {
            if (minha !== carga || !el('lancLista')) return;
            el('lancLista').innerHTML = `<div class="py-8 text-center"><p class="text-xs font-semibold text-slate-500 mb-2">${esc(e.message)}</p><button type="button" data-acao="tentar" class="text-xs font-bold text-sky-700 underline">Tentar de novo</button></div>`;
        }
    }

    async function carregarOpcoes() {
        try {
            opcoes = Object.assign({ blocos: [], status: [], motivos: [], locaisPerda: [] }, await API.lancamentos.opcoes(LOCAL));
            atualizarListas();
            // Acrescenta os status cadastrados sem redesenhar o formulário (não apaga o que já foi digitado)
            const status = el('lanc_status');
            if (status) opcoes.status.filter(s => ![...status.options].some(o => o.value === s)).forEach(s => status.add(new Option(s, s)));
        } catch (e) { console.warn('Sem sugestões de blocos:', e.message); }
    }

    function renderTudo() {
        renderAbas();
        renderForm();
        renderPainel();
        renderLista();
    }

    window.lanc_abrir = function () {
        if (!montado) montar();
        if (!tiposLiberados().includes(tipoAtual)) { tipoAtual = tiposLiberados()[0]; filtro = null; }
        if (!filtro) filtro = periodoPadrao(tipoAtual);
        renderTudo();
        renderStatus(API.status());
        carregar();
        carregarOpcoes();
    };
})();
