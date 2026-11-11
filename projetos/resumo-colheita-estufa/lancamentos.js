// Aba "Lançar": preenche Colheita, Calendário (previsão) e Descarte direto no sistema (no lugar da planilha).
// Funciona sem internet: grava na mesma fila usada pela irrigação e envia quando houver sinal.
(function () {
    'use strict';

    const API = window.IrrigacaoAPI;
    const LOCAL = 'estufa';
    const ehAdmin = !!API.isAdmin();
    const catalogo = window.CatalogoColheita.criar({ local: LOCAL, cliente: API.cliente, ehAdmin, nomeLocal: API.nomeLocal(LOCAL) });
    const STATUS_PADRAO = ['Pendente', 'Em andamento'];

    const CAMPOS_BLOCO = [
        { id: 'bloco', rotulo: 'Setor', icone: 'grid-2x2', obrig: true, lista: true },
        { id: 'ciclo', rotulo: 'Ciclo', icone: 'repeat', obrig: true, lista: true },
        { id: 'cultura', rotulo: 'Cultura', icone: 'sprout', obrig: true, lista: true },
        { id: 'variedade', rotulo: 'Variedade', icone: 'leaf', lista: true }
    ];
    const n = (v, d = 0) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: d });

    // Sugestões do transplantio; qualquer outro nome pode ser digitado
    const MUDAS_POR_BANDEJA = 200;
    const VARIEDADES = {
        'Pepino': ['Aikido', 'Feltrin', 'Kenzan', 'Soldier', 'Tikara', 'TSV 40404', 'Tsuyataro']
    };
    const BLOCOS_CAMPO = [...Array.from({ length: 19 }, (_, i) => String(i + 1)), 'A', 'B', 'C', 'D', 'E'];

    const TIPOS = {
        colheita: {
            rotulo: 'Colheita', icone: 'tractor', gradiente: 'from-sky-600 to-sky-700', botao: 'from-sky-600 to-sky-700 shadow-sky-600/20', acento: 'text-sky-500', ativo: 'text-sky-700',
            data: 'data_entrega', dias: [-30, 0], semFuturo: true,
            campos: [
                { id: 'data_entrega', rotulo: 'Data da entrega', icone: 'calendar', tipo: 'date', obrig: true, largo: true, padraoHoje: true },
                ...CAMPOS_BLOCO,
                { id: 'caixas', rotulo: 'Caixas', icone: 'package', tipo: 'number', decimal: true },
                { id: 'entregue_unidades', rotulo: 'Unidades', icone: 'hash', tipo: 'number', decimal: false },
                { id: 'entregue_kg', rotulo: 'Peso (kg)', icone: 'scale', tipo: 'number', decimal: true },
                { id: 'tamanho_medio_cm', rotulo: 'Tamanho médio (cm)', icone: 'ruler', tipo: 'number', decimal: true }
            ],
            validar: v => (v.entregue_unidades || v.entregue_kg) ? '' : 'Informe as unidades ou o peso entregue.',
            ajustar: v => { if (v.entregue_unidades === null) v.entregue_unidades = 0; },
            linha: r => [`${n(r.entregue_unidades)} un`, `${n(r.entregue_kg, 2)} kg`, r.caixas ? `${n(r.caixas, 1)} cx` : ''],
            total: l => `${n(soma(l, 'entregue_unidades'))} un · ${n(soma(l, 'entregue_kg'), 2)} kg`
        },
        previsao: {
            rotulo: 'Calendário', icone: 'calendar-days', gradiente: 'from-emerald-600 to-emerald-700', botao: 'from-emerald-600 to-emerald-700 shadow-emerald-600/20', acento: 'text-emerald-500', ativo: 'text-emerald-700',
            data: 'inicio_colheita', dias: [-60, 180],
            campos: [
                ...CAMPOS_BLOCO,
                { id: 'data_plantio', rotulo: 'Data do transplantio', icone: 'calendar-plus', tipo: 'date' },
                { id: 'inicio_colheita', rotulo: 'Início da colheita', icone: 'calendar-check', tipo: 'date', dica: '40 dias após o transplantio' },
                { id: 'idade_dias', rotulo: 'Idade da muda (dias)', icone: 'hourglass', tipo: 'number', decimal: false },
                { id: 'status', rotulo: 'Status', icone: 'flag', tipo: 'status', obrig: true },
                { id: '_equipe', tipo: 'secao', rotulo: 'Equipe e horário', virtual: true },
                { id: 'colaboradores', rotulo: 'Colaboradores', icone: 'users', tipo: 'number', decimal: false, largo: true },
                { id: 'hora_inicio', rotulo: 'Início', icone: 'clock', tipo: 'time' },
                { id: 'hora_fim', rotulo: 'Fim', icone: 'clock', tipo: 'time' },
                { id: 'intervalo', rotulo: 'Intervalo', icone: 'coffee', dica: '15 min' },
                { id: 'duracao', rotulo: 'Total', icone: 'timer', leitura: true, dica: '--:--' },
                { id: '_mudas', tipo: 'secao', rotulo: 'Mudas e perdas', virtual: true },
                { id: 'bandejas', rotulo: 'Bandejas', icone: 'layout-grid', tipo: 'number', decimal: false },
                { id: 'mudas', rotulo: 'Mudas (total)', icone: 'sprout', tipo: 'number', decimal: false, modoMudas: true },
                { id: 'total_plantas', rotulo: 'Plantado (efetivo)', icone: 'flower-2', tipo: 'number', decimal: false, largo: true },
                { id: '_perdas', tipo: 'perdas', virtual: true },
                { id: 'observacoes', rotulo: 'Observações', icone: 'message-square', largo: true, dica: 'Mudas pequenas...' }
            ],
            ajustar: v => {
                if (!v.inicio_colheita && v.data_plantio) {
                    const d = new Date(v.data_plantio + 'T12:00:00'); d.setDate(d.getDate() + 40);
                    v.inicio_colheita = d.toISOString().slice(0, 10);
                }
                v.duracao = duracaoDe(v.hora_inicio, v.hora_fim, v.intervalo);
                const temPerda = v.mudas > 0 && v.total_plantas > 0;
                v.perdas = temPerda ? v.mudas - v.total_plantas : null;
                v.perda_percentual = temPerda ? Math.round((v.perdas / v.mudas) * 100) : null;
            },
            validar: v => !v.inicio_colheita && !v.data_plantio ? 'Informe a data do transplantio ou o início da colheita.' : (v.data_plantio && v.inicio_colheita && v.inicio_colheita < v.data_plantio) ? 'O início da colheita não pode ser antes do transplantio.' : '',
            imagem: r => !!r.data_plantio && r.data_plantio <= hoje(),
            linha: r => [`${n(r.total_plantas)} plantas`, r.perdas != null ? `${n(r.perdas)} perdas (${n(r.perda_percentual)}%)` : '', r.status],
            total: l => `${n(soma(l, 'total_plantas'))} plantas`
        },
        descarte: {
            rotulo: 'Descarte', icone: 'trash-2', gradiente: 'from-rose-600 to-rose-700', botao: 'from-rose-600 to-rose-700 shadow-rose-600/20', acento: 'text-rose-500', ativo: 'text-rose-700',
            data: 'data_descarte', dias: [-30, 0], semFuturo: true,
            campos: [
                { id: 'data_descarte', rotulo: 'Data do descarte', icone: 'calendar', tipo: 'date', obrig: true, largo: true, padraoHoje: true },
                { id: 'bloco', rotulo: 'Setor', icone: 'grid-2x2', obrig: true, lista: true },
                { id: 'ciclo', rotulo: 'Ciclo', icone: 'repeat', obrig: true, lista: true },
                { id: 'cultura', rotulo: 'Cultura', icone: 'sprout', obrig: true, lista: true },
                { id: 'variedade', rotulo: 'Variedade', icone: 'leaf', obrig: true, largo: true, lista: true },
                { id: 'motivo', rotulo: 'Causa da perda', icone: 'message-square-warning', obrig: true, largo: true, lista: true },
                { id: 'local_perda', rotulo: 'Local da perda', icone: 'map-pin', largo: true, lista: true },
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
            titulo: r => [r.bloco ? 'Setor ' + r.bloco : '', r.ciclo ? 'Ciclo ' + r.ciclo : '', r.variedade].filter(Boolean).join(' · ') || 'Sem variedade',
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
    const POR_PAGINA = 4;
    const K_SUGESTAO_DISPENSADA = 'spg_sugestao_pesagem_' + LOCAL;
    const VERIFICAR_SUGESTOES_MS = 30000;
    let conferencia = null;       // pesagem conferida de hoje
    let sugestoes = [];           // itens conferidos que ainda não foram lançados
    let sugestaoPausada = false;  // preenchendo um item: não abre a janela por cima
    let timerSugestoes = null;
    let pagina = 1;
    let plantios = [];   // transplantios usados para mostrar os prazos no histórico
    let filtro = null;
    let montado = false;
    let carga = 0;
    let pendentesAntes = 0;
    let recarregarAoTerminar = false;
    let timerAviso = null;
    let ultimoTransplantio = null;
    let ofertaImagem = null;
    let gerandoImagem = false;
    let imagemAtual = null;
    let rascunho = null;
    let mudasManual = false;
    let aCadastrar = null;
    const K_OCULTOS = 'spg_calendario_ocultos';
    let ocultos = new Set();
    try { ocultos = new Set(JSON.parse(localStorage.getItem(K_OCULTOS)) || []); } catch (e) { /* sem itens ocultos */ }

    const CLASSE_CAMPO = 'w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-3 px-3 text-sm font-medium text-slate-800 outline-none focus:border-slate-400 focus:bg-white transition-all';

    function periodoPadrao(tipo) {
        const [de, ate] = TIPOS[tipo].dias;
        return { de: somarDias(hoje(), de), ate: somarDias(hoje(), ate), busca: '' };
    }

    function montar() {
        raiz().innerHTML = `
            <div class="mx-auto p-4 lg:px-6 space-y-4 max-w-md md:max-w-2xl lg:max-w-none 2xl:max-w-[1720px] mt-2">
                <div id="lancAbas" class="flex bg-slate-100/80 rounded-2xl ring-1 ring-slate-200/70 p-1 gap-1 max-w-md" role="tablist" aria-label="Tipo de lançamento"></div>
                <div id="lancStatus" class="hidden"></div>
                <div id="lancSugestaoAviso" class="hidden"></div>
                <div class="lg:grid lg:grid-cols-[minmax(0,430px)_minmax(0,1fr)] lg:gap-6 lg:items-start space-y-4 lg:space-y-0">
                    <div id="lancForm" class="bg-white rounded-2xl shadow-sm border border-slate-200"></div>
                    <div id="lancPainel" class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"></div>
                </div>
            </div>
            <div id="lancImagemModal"></div>
            <div id="lancSugestaoModal"></div>
            <div id="lancAviso" role="status" aria-live="polite" class="hidden fixed left-1/2 -translate-x-1/2 bottom-24 lg:bottom-6 z-[60] max-w-[90vw] bg-slate-900 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-xl"></div>`;

        // Janela da imagem e aviso ficam direto no body: a animação de entrada da aba (transform)
        // prenderia o position:fixed dentro dela, e a janela aparecia lá embaixo da lista
        ['lancImagemModal', 'lancSugestaoModal', 'lancAviso'].forEach(id => { const n = el(id); document.body.appendChild(n); n.addEventListener('click', aoClicar); });
        raiz().addEventListener('click', aoClicar);
        raiz().addEventListener('change', aoMudar);
        raiz().addEventListener('input', e => { if (e.target.id === 'lancBusca') { filtro.busca = e.target.value; pagina = 1; renderLista(); } if (e.target.getAttribute('role') === 'combobox') mostrarLista(e.target.id, true); aoDigitar(e); });
        raiz().addEventListener('submit', aoSalvar);
        // Valor preenchido sozinho fica selecionado: o que a pessoa digitar substitui, em vez de somar (2 virava 22)
        raiz().addEventListener('focusin', e => {
            if (e.target.dataset && e.target.dataset.auto) { delete e.target.dataset.auto; e.target.select(); }
            if (e.target.getAttribute && e.target.getAttribute('role') === 'combobox') mostrarLista(e.target.id, false);
        });
        raiz().addEventListener('focusout', e => {
            if (e.target.getAttribute && e.target.getAttribute('role') === 'combobox' && !(e.relatedTarget && e.target.closest('[data-combo]').contains(e.relatedTarget))) fecharLista();
        });
        raiz().addEventListener('keydown', aoTeclar);
        // Tocar numa opção não tira o foco do campo
        raiz().addEventListener('mousedown', e => { if (e.target.closest('[role=listbox], [data-acao=abrirLista]')) e.preventDefault(); });
        API.onStatus(renderStatus);
        montado = true;
    }

    const tiposLiberados = () => Object.keys(TIPOS).filter(id => API.recursoLiberado('lancar_estufa.' + id));

    function renderAbas() {
        el('lancAbas').innerHTML = Object.entries(TIPOS).filter(([id]) => tiposLiberados().includes(id)).map(([id, t]) => {
            const ativo = id === tipoAtual;
            return `<button type="button" role="tab" aria-selected="${ativo}" data-acao="tipo" data-valor="${id}"
                class="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${ativo ? 'bg-white shadow-sm ring-1 ring-slate-200/80 ' + t.ativo : 'text-slate-500'}">
                <i data-lucide="${t.icone}" class="w-3.5 h-3.5"></i>${t.rotulo}</button>`;
        }).join('');
    }

    // Campo com lista suspensa: digita livre e escolhe das sugestões (somenteLista: só escolhe)
    function comboHtml(id, val, obrig, somenteLista) {
        return `<div class="relative" data-combo>
            <input type="text" id="${id}" value="${esc(val)}"${obrig} role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}_lista" autocomplete="off"${somenteLista ? ' readonly' : ''} class="${CLASSE_CAMPO} pr-10${somenteLista ? ' cursor-pointer' : ''}">
            <button type="button" tabindex="-1" data-acao="abrirLista" data-valor="${id}" aria-label="Mostrar opções" class="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"><i data-lucide="chevron-down" class="w-4 h-4"></i></button>
            <div id="${id}_lista" role="listbox" class="hidden absolute z-30 left-0 right-0 mt-1.5 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl ring-1 ring-black/5 p-1"></div>
        </div>`;
    }

    function campoHtml(c, t, valores) {
        if (c.tipo === 'secao') return `<h3 class="col-span-2 pt-2 mt-1 border-t border-slate-100 text-[11px] font-black text-slate-500 uppercase tracking-wider">${c.rotulo}</h3>`;
        if (c.tipo === 'perdas') return `<div class="col-span-2 grid grid-cols-2 gap-3 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2.5">
            <div><p class="text-[10px] font-bold text-rose-400 uppercase">Perdas</p><p id="lancPerdas" class="text-sm font-black text-rose-700">-</p></div>
            <div><p class="text-[10px] font-bold text-rose-400 uppercase">% Perda</p><p id="lancPerdasPct" class="text-sm font-black text-rose-700">-</p></div>
        </div>`;
        const val = valores[c.id] ?? (c.padraoHoje ? hoje() : c.tipo === 'status' ? 'Pendente' : '');
        const id = 'lanc_' + c.id;
        const obrig = c.obrig ? ' required' : '';
        let entrada;
        if (c.tipo === 'date') {
            entrada = `<input type="date" id="${id}" value="${esc(val)}"${obrig}${t.semFuturo ? ` max="${hoje()}"` : ''} class="${CLASSE_CAMPO}">`;
        } else if (c.tipo === 'time') {
            entrada = `<input type="time" id="${id}" value="${esc(val)}" class="${CLASSE_CAMPO}">`;
        } else if (c.tipo === 'number') {
            entrada = `<input type="number" id="${id}" value="${esc(val)}" min="0" step="any" inputmode="${c.decimal ? 'decimal' : 'numeric'}" placeholder="0" class="${CLASSE_CAMPO}">`;
        } else if (c.tipo === 'status') {
            entrada = comboHtml(id, val, obrig, true);
        } else if (c.lista) {
            entrada = comboHtml(id, val, obrig, false);
        } else {
            entrada = `<input type="text" id="${id}" value="${esc(val)}"${obrig}${c.dica ? ` placeholder="${esc(c.dica)}"` : ''}${c.leitura ? ' readonly tabindex="-1"' : ''} autocomplete="off" class="${CLASSE_CAMPO}">`;
        }
        return `<div class="${c.largo ? 'col-span-2' : ''} min-w-0">
            <label for="${id}" class="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                <i data-lucide="${c.icone}" class="w-3.5 h-3.5 ${t.acento}"></i><span id="${id}_rotulo">${c.rotulo}</span>${c.obrig ? ' <span class="text-red-400">*</span>' : ''}</label>
            ${c.modoMudas ? `<div class="flex bg-slate-100 rounded-lg p-0.5 mb-1.5" role="group" aria-label="Como calcular as mudas">
                <button type="button" id="lancModoAuto" data-acao="modoMudas" data-valor="auto" class="flex-1 text-[10px] font-bold py-1 rounded-md">Automático</button>
                <button type="button" id="lancModoManual" data-acao="modoMudas" data-valor="manual" class="flex-1 text-[10px] font-bold py-1 rounded-md">Manual</button>
            </div>` : ''}
            ${entrada}</div>`;
    }

    function renderForm() {
        const t = TIPOS[tipoAtual];
        const valores = editando || rascunho || {};
        rascunho = null;
        mudasManual = valores.mudas != null && !(valores.bandejas && Number(valores.bandejas) * MUDAS_POR_BANDEJA === Number(valores.mudas));
        const oferta = !editando && tipoAtual === 'previsao' ? ofertaImagem : null;
        ofertaImagem = null;
        el('lancForm').innerHTML = `
            <div class="bg-gradient-to-r ${t.gradiente} rounded-t-2xl px-5 py-4 flex justify-between items-center">
                <h2 class="text-base font-bold text-white flex items-center gap-2"><i data-lucide="${editando ? 'pencil' : t.icone}" class="w-5 h-5 opacity-90"></i>${editando ? 'Editar' : 'Novo lançamento:'} ${t.rotulo.toLowerCase()}</h2>
                ${editando ? `<button type="button" data-acao="cancelar" class="flex items-center gap-1 text-xs font-bold text-white/90 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg"><i data-lucide="x" class="w-3 h-3"></i> Cancelar</button>` : tipoAtual === 'previsao' ? `<button type="button" data-acao="limpar" class="flex items-center gap-1 text-xs font-bold text-white/90 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg"><i data-lucide="eraser" class="w-3 h-3"></i> Limpar</button>` : ''}
            </div>
            ${oferta ? `<div class="m-5 mb-0 flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                <p class="text-xs font-bold text-emerald-800">Transplantio de ${emPt(oferta.data_plantio)} salvo.</p>
                <button type="button" data-acao="imagem" data-valor="${esc(oferta.data_plantio)}" class="shrink-0 inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-lg"><i data-lucide="image" class="w-3.5 h-3.5"></i>Gerar imagem</button>
            </div>` : ''}
            <form id="lancFormulario" novalidate class="p-5 space-y-4">
                <div class="grid grid-cols-2 gap-3">${t.campos.map(c => campoHtml(c, t, valores)).join('')}</div>
                <p id="lancErro" role="alert" class="hidden text-xs font-bold text-red-500"></p>
                ${tipoAtual === 'previsao' && !editando ? `<button type="button" data-acao="salvarVariedade" class="w-full flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold py-3 rounded-xl text-sm active:scale-[.98] transition-all"><i data-lucide="plus" class="w-4 h-4"></i>Salvar e adicionar variedade no bloco</button>` : ''}
                <button type="submit" class="w-full flex items-center justify-center gap-2 bg-gradient-to-b ${t.botao} text-white font-bold py-3.5 rounded-xl text-sm shadow-md active:scale-[.98] transition-all">
                    <i data-lucide="${editando ? 'save' : 'check'}" class="w-4 h-4"></i>${editando ? 'Salvar alterações' : 'Salvar lançamento'}</button>
            </form>`;
        atualizarListas();
        if (tipoAtual === 'previsao') { aplicarModoMudas(); atualizarDuracao(); atualizarPerdas(); }
        iconesAgora();
    }

    function renderPainel() {
        el('lancPainel').innerHTML = `
            <div class="px-5 py-4 border-b border-slate-100 space-y-3">
                <h3 class="text-sm font-bold text-slate-700 flex items-center gap-2"><i data-lucide="list" class="w-4 h-4 text-slate-400"></i>Lançamentos</h3>
                <div class="grid grid-cols-2 lg:grid-cols-[170px_170px_minmax(0,1fr)] gap-2">
                    <div class="min-w-0"><label for="lancDe" class="text-[10px] font-bold text-slate-400 uppercase">De</label><input type="date" id="lancDe" value="${filtro.de}" class="${CLASSE_CAMPO} !py-2"></div>
                    <div class="min-w-0"><label for="lancAte" class="text-[10px] font-bold text-slate-400 uppercase">Até</label><input type="date" id="lancAte" value="${filtro.ate}" class="${CLASSE_CAMPO} !py-2"></div>
                    <div class="min-w-0 col-span-2 lg:col-span-1"><label for="lancBusca" class="text-[10px] font-bold text-slate-400 uppercase">Buscar</label><input type="search" id="lancBusca" value="${esc(filtro.busca)}" placeholder="Bloco, cultura, variedade..." class="${CLASSE_CAMPO} !py-2"></div>
                </div>
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
        // Calendário: agrupa pela data do transplantio, para a imagem sair com tudo que foi plantado no dia
        const campoGrupo = tipoAtual === 'previsao' ? 'data_plantio' : t.data;
        const itens = tipoAtual === 'previsao'
            ? filtrados().slice().sort((a, b) => String(b.data_plantio || '').localeCompare(String(a.data_plantio || '')))
            : filtrados();
        if (!itens.length) {
            alvo.innerHTML = `<div class="py-10 text-center text-slate-400"><i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2"></i><p class="text-xs font-semibold">Nenhum lançamento neste período.</p></div>`;
            iconesAgora();
            return;
        }
        const totalPaginas = Math.ceil(itens.length / POR_PAGINA);
        pagina = Math.min(Math.max(pagina, 1), totalPaginas);
        const inicio = (pagina - 1) * POR_PAGINA;
        const grupos = new Map();
        itens.slice(inicio, inicio + POR_PAGINA).forEach(r => { const d = r[campoGrupo] || ''; if (!grupos.has(d)) grupos.set(d, []); grupos.get(d).push(r); });
        // O total do dia considera o dia inteiro, mesmo quando ele continua na outra página
        const doDia = d => itens.filter(r => (r[campoGrupo] || '') === d);
        const paginacao = totalPaginas > 1 ? `<nav aria-label="Páginas dos lançamentos" class="flex items-center justify-between gap-2 pt-1">
            <button type="button" data-acao="paginaLanc" data-valor="${pagina - 1}"${pagina === 1 ? ' disabled' : ''} class="inline-flex items-center gap-1 pl-2 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"><i data-lucide="chevron-left" class="w-4 h-4"></i>Anterior</button>
            <span class="text-xs font-semibold text-slate-500 text-center">Página <b class="text-slate-800">${pagina}</b> de ${totalPaginas} <span class="text-slate-400">· ${itens.length.toLocaleString('pt-BR')} lançamentos</span></span>
            <button type="button" data-acao="paginaLanc" data-valor="${pagina + 1}"${pagina === totalPaginas ? ' disabled' : ''} class="inline-flex items-center gap-1 pl-3 pr-2 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">Próxima<i data-lucide="chevron-right" class="w-4 h-4"></i></button>
        </nav>` : '';
        alvo.innerHTML = [...grupos.entries()].map(([data, regs]) => `
            <section>
                <header class="flex items-center justify-between px-1 mb-1.5">
                    <h4 class="text-[11px] font-black text-slate-500 uppercase tracking-wider">${tipoAtual === 'previsao' ? (data ? 'Transplantio ' + emPt(data) : 'Sem data de transplantio') : emPt(data)}</h4>
                    <div class="flex items-center gap-2">
                        <span class="text-[11px] font-bold text-slate-400">${esc(t.total(doDia(data)))}</span>
                        ${t.imagem && doDia(data).some(t.imagem) ? `<button type="button" data-acao="imagem" data-valor="${esc(data)}" title="Gerar imagem com todas as variedades transplantadas neste dia" class="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg"><i data-lucide="image" class="w-3.5 h-3.5"></i>Gerar imagem</button>` : ''}
                    </div>
                </header>
                <div class="grid grid-cols-1 xl:grid-cols-2 gap-2">${regs.map(r => cartao(r, t)).join('')}</div>
            </section>`).join('') + paginacao + (lista.length >= 1000 ? `<p class="text-[11px] text-amber-700 bg-amber-50 rounded-lg p-2 text-center">Mostrando os 1.000 mais recentes. Reduza o período para ver os demais.</p>` : '');
        iconesAgora();
    }

    const textoDias = n => `${n} ${n === 1 ? 'dia' : 'dias'}`;
    const mesmoTexto = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

    // Transplantio do lançamento: mesmo bloco, ciclo e cultura. Prefere a mesma variedade e,
    // se o bloco foi replantado, o plantio mais recente até a data do lançamento.
    function transplantioDe(r, t) {
        if (!r.bloco) return null;
        const doBloco = plantios.filter(p => mesmoTexto(limparBloco(p.bloco), limparBloco(r.bloco))
            && (!r.ciclo || mesmoTexto(p.ciclo, r.ciclo)) && (!r.cultura || mesmoTexto(p.cultura, r.cultura)));
        const daVariedade = r.variedade ? doBloco.filter(p => mesmoTexto(p.variedade, r.variedade)) : [];
        const opcoesPlantio = (daVariedade.length ? daVariedade : doBloco).slice().sort((a, b) => String(b.data_plantio || '').localeCompare(String(a.data_plantio || '')));
        const data = r[t.data] || '';
        return opcoesPlantio.find(p => p.data_plantio && p.data_plantio <= data) || opcoesPlantio[0] || null;
    }

    const CICLO_ENCERRADO = /conclu|finaliz|encerr|colhid/i;
    function dadosDoPrazo(r, t) {
        const p = tipoAtual === 'previsao' ? r : transplantioDe(r, t);
        if (!p) return null;
        const itens = [];
        if (p.data_plantio) itens.push(['sprout', 'Plantado em', emPt(p.data_plantio)]);
        if (p.inicio_colheita) itens.push(['calendar-check', 'Início previsto', emPt(p.inicio_colheita)]);
        if (p.data_plantio) {
            const data = r[t.data];
            if (tipoAtual !== 'previsao' && data && data >= p.data_plantio) itens.push(['timer', tipoAtual === 'colheita' ? 'Colhido com' : 'Lançado com', textoDias(diasEntre(p.data_plantio, data))]);
            if (hoje() >= p.data_plantio && !CICLO_ENCERRADO.test(p.status || '')) itens.push(['hourglass', 'Hoje está com', textoDias(diasEntre(p.data_plantio, hoje()))]);
        }
        return itens;
    }

    function cartao(r, t) {
        const planilha = r.origem === 'planilha';
        const metricas = t.linha(r).filter(Boolean);
        const prazos = dadosDoPrazo(r, t);
        const blocoInformado = !!r.bloco;
        return `<article class="p-3 rounded-2xl border border-slate-200 bg-white ${ocultos.has(r.id) ? 'opacity-50' : ''} ${editando && editando.id === r.id ? 'ring-2 ring-amber-400' : ''}">
            <div class="flex items-start gap-2">
                <div class="min-w-0 flex-1">
                    <p class="text-sm font-black text-slate-800 truncate">${t.titulo ? esc(t.titulo(r)) : `Setor ${esc(r.bloco)}${r.ciclo ? ` <span class="font-semibold text-slate-400">· Ciclo ${esc(r.ciclo)}</span>` : ''}`}</p>
                    <p class="text-xs text-slate-500 truncate">${esc(t.subtitulo ? t.subtitulo(r) : [r.cultura, r.variedade].filter(Boolean).join(' · '))}</p>
                </div>
                <div class="flex shrink-0 items-center -mr-1 -mt-1">
                ${t.imagem && t.imagem(r) ? `<button type="button" data-acao="ocultar" data-valor="${esc(r.id)}" aria-pressed="${ocultos.has(r.id)}" aria-label="${ocultos.has(r.id) ? 'Mostrar na imagem' : 'Ocultar da imagem'}" title="${ocultos.has(r.id) ? 'Mostrar na imagem' : 'Ocultar da imagem'}" class="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><i data-lucide="${ocultos.has(r.id) ? 'eye-off' : 'eye'}" class="w-4 h-4"></i></button>` : ''}
                ${planilha
                    ? `<span title="Veio da planilha: alterações são feitas lá até a migração terminar" class="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full"><i data-lucide="lock" class="w-3 h-3"></i>Planilha</span>`
                    : `<button type="button" data-acao="editar" data-valor="${esc(r.id)}" aria-label="Editar lançamento" title="Editar" class="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                       <button type="button" data-acao="excluir" data-valor="${esc(r.id)}" aria-label="Excluir lançamento" title="Excluir" class="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`}
                </div>
            </div>
            ${metricas.length ? `<div class="flex flex-wrap gap-1.5 mt-2">${metricas.map(m => `<span class="px-2 py-1 rounded-lg bg-slate-100 text-xs font-bold text-slate-700">${esc(m)}</span>`).join('')}</div>` : ''}
            ${prazos && prazos.length ? `<dl class="grid grid-cols-2 gap-x-3 gap-y-2 mt-2.5 pt-2.5 border-t border-slate-100">${prazos.map(([icone, rotulo, valor]) => `<div class="min-w-0">
                <dt class="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400"><i data-lucide="${icone}" class="w-3 h-3 shrink-0"></i><span class="truncate">${rotulo}</span></dt>
                <dd class="text-xs font-black text-slate-800 tabular-nums">${esc(valor)}</dd>
            </div>`).join('')}</dl>`
                : (blocoInformado && tipoAtual !== 'previsao' ? '<p class="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-400">Sem transplantio lançado para este bloco e ciclo.</p>' : '')}
            ${r._pendente ? `<span class="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full"><i data-lucide="cloud-off" class="w-3 h-3"></i>Aguardando envio</span>` : ''}
            ${!r._pendente && r.criado_por_nome ? `<p class="mt-1.5 text-[10px] text-slate-400 truncate">por ${esc(r.criado_por_nome)}</p>` : ''}
        </article>`;
    }

    // ---------- Sugestão de preenchimento pela pesagem conferida ----------
    const lancTelaVisivel = () => !raiz().classList.contains('hidden');

    async function verificarSugestoes(forcarAbrir) {
        if (!tiposLiberados().includes('colheita') || !lancTelaVisivel()) return;
        let conf = null, feitos = [];
        try {
            const lido = await API.colheita.syncLer(LOCAL, ['pesagem']);
            const dados = lido.pesagem && lido.pesagem.data;
            if (dados && dados.date === hoje() && dados.conferido && Array.isArray(dados.conferido.itens)) conf = dados.conferido;
            if (conf) feitos = await API.lancamentos.listar(LOCAL, 'colheita', conf.date, conf.date);
        } catch (e) { return; } // sem conexão: tenta de novo na próxima verificação
        conferencia = conf;
        sugestoes = conf ? conf.itens.filter(i => !feitos.some(f => mesmoTexto(limparBloco(f.bloco), limparBloco(i.bloco)) && mesmoTexto(f.ciclo, i.ciclo) && mesmoTexto(f.cultura, i.cultura) && mesmoTexto(f.variedade, i.variedade))) : [];
        renderAvisoSugestoes();
        const janela = el('lancSugestaoModal');
        if (!sugestoes.length) { if (janela) janela.innerHTML = ''; return; }
        if (janela && janela.firstElementChild) { desenharSugestoes(); return; }
        if (forcarAbrir === true) { desenharSugestoes(); return; }
        const dispensada = localStorage.getItem(K_SUGESTAO_DISPENSADA) === conf.hash;
        const digitando = document.activeElement && document.activeElement.closest && document.activeElement.closest('#lancFormulario');
        if (!dispensada && !sugestaoPausada && !editando && !digitando) desenharSugestoes();
    }

    function renderAvisoSugestoes() {
        const alvo = el('lancSugestaoAviso');
        if (!alvo) return;
        if (!sugestoes.length) { alvo.className = 'hidden'; alvo.innerHTML = ''; return; }
        alvo.className = 'flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-3 py-2.5 text-xs font-bold';
        alvo.innerHTML = `<span class="flex items-center gap-2 min-w-0"><i data-lucide="scale" class="w-4 h-4 shrink-0"></i><span>${sugestoes.length} ${sugestoes.length === 1 ? 'peso conferido aguardando' : 'pesos conferidos aguardando'} lançamento</span></span><button type="button" data-acao="sugestaoVer" class="shrink-0 underline">Ver</button>`;
        iconesAgora();
    }

    function desenharSugestoes() {
        const quando = conferencia.at ? new Date(conferencia.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
        el('lancSugestaoModal').innerHTML = `<div class="fixed inset-0 z-[70] bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-4">
            <div role="dialog" aria-modal="true" aria-labelledby="lancSugestaoTitulo" class="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[88vh] flex flex-col overflow-hidden">
                <div class="bg-gradient-to-r from-emerald-600 to-emerald-700 px-5 py-4">
                    <h3 id="lancSugestaoTitulo" class="text-base font-bold text-white flex items-center gap-2"><i data-lucide="scale" class="w-5 h-5"></i>Pesagem conferida</h3>
                    <p class="text-xs text-white/85 mt-0.5">${conferencia.by ? 'Por ' + esc(conferencia.by) + (quando ? ' às ' + quando : '') + '. ' : ''}Escolha um item para preencher o lançamento e conferir antes de salvar.</p>
                </div>
                <div class="p-3 space-y-2 overflow-y-auto">${sugestoes.map((s, i) => `<div class="flex items-center gap-3 p-3 rounded-2xl border border-slate-200">
                    <div class="min-w-0 flex-1">
                        <p class="text-sm font-black text-slate-800 truncate">Setor ${esc(s.bloco)}${s.ciclo ? ` <span class="font-semibold text-slate-400">· Ciclo ${esc(s.ciclo)}</span>` : ''}</p>
                        <p class="text-xs text-slate-500 truncate">${esc([s.cultura, s.variedade].filter(Boolean).join(' · '))}</p>
                        <p class="text-xs font-bold text-slate-700 mt-0.5">${[s.unidades ? n(s.unidades) + ' un' : '', n(s.kg, 2) + ' kg', s.caixas ? n(s.caixas, 1) + ' cx' : ''].filter(Boolean).join(' · ')}</p>
                    </div>
                    <button type="button" data-acao="sugestaoPreencher" data-valor="${i}" class="shrink-0 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">Preencher</button>
                </div>`).join('')}</div>
                <div class="p-3 border-t border-slate-100"><button type="button" data-acao="sugestaoFechar" class="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold">Agora não</button></div>
            </div>
        </div>`;
        iconesAgora();
    }

    function preencherSugestao(s) {
        el('lancSugestaoModal').innerHTML = '';
        sugestaoPausada = true;
        const trocouTipo = tipoAtual !== 'colheita';
        tipoAtual = 'colheita';
        editando = null;
        rascunho = { data_entrega: conferencia.date, bloco: s.bloco, ciclo: s.ciclo, cultura: s.cultura, variedade: s.variedade, caixas: s.caixas, entregue_unidades: s.unidades, entregue_kg: s.kg };
        if (trocouTipo) { pagina = 1; filtro = periodoPadrao('colheita'); lista = []; renderTudo(); carregar(); }
        else { renderAbas(); renderForm(); }
        el('lancForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
        aviso('Dados preenchidos. Confira e salve o lançamento.');
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

    const valorCampo = id => { const c = el('lanc_' + id); return c ? c.value.trim() : ''; };
    const ehPepino = cultura => /pepino/i.test(cultura || '');

    function sugestoesFixas(id) {
        if (tipoAtual !== 'previsao') return [];
        const cultura = valorCampo('cultura');
        if (id === 'cultura') return Object.keys(VARIEDADES);
        if (id === 'variedade') return VARIEDADES[cultura] || [];
        if (id === 'bloco') return ehPepino(cultura) ? ['1', '2', '3', '4'] : VARIEDADES[cultura] ? BLOCOS_CAMPO : [];
        return [];
    }

    // ---------- Contas do transplantio ----------
    function minutosDoIntervalo(texto) {
        const t = String(texto || '').trim().toLowerCase();
        if (!t) return 0;
        const hm = t.match(/^(\d{1,2}):(\d{2})$/);
        if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
        const h = t.match(/(\d+)\s*h/);
        const m = t.match(/(\d+)\s*m/);
        if (h || m) return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
        const numero = t.match(/(\d+)/);
        return numero ? Number(numero[1]) : 0;
    }

    function duracaoDe(inicio, fim, intervalo) {
        if (!inicio || !fim) return '';
        const minutos = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
        let total = minutos(fim) - minutos(inicio);
        if (total < 0) total += 24 * 60;
        total = Math.max(0, total - minutosDoIntervalo(intervalo));
        return `${Math.floor(total / 60)}h ${total % 60}min`;
    }

    function atualizarDuracao() {
        const campo = el('lanc_duracao');
        if (campo) campo.value = duracaoDe(valorCampo('hora_inicio'), valorCampo('hora_fim'), valorCampo('intervalo'));
    }

    function atualizarPerdas() {
        const perdas = el('lancPerdas');
        if (!perdas) return;
        const mudas = Number(valorCampo('mudas')) || 0;
        const plantado = Number(valorCampo('total_plantas')) || 0;
        const tem = mudas > 0 && plantado > 0;
        perdas.textContent = tem ? n(mudas - plantado) : '-';
        el('lancPerdasPct').textContent = tem ? n(((mudas - plantado) / mudas) * 100) + '%' : '-';
    }

    function calcularMudas() {
        if (mudasManual) return;
        const bandejas = Number(valorCampo('bandejas')) || 0;
        el('lanc_mudas').value = bandejas > 0 ? bandejas * MUDAS_POR_BANDEJA : '';
    }

    function aplicarModoMudas() {
        const campo = el('lanc_mudas');
        if (!campo) return;
        campo.readOnly = !mudasManual;
        campo.placeholder = mudasManual ? 'Digite o valor' : 'Automático';
        const estilo = (botao, ativo) => { botao.className = 'flex-1 text-[10px] font-bold py-1 rounded-md ' + (ativo ? 'bg-emerald-600 text-white' : 'text-slate-500'); botao.setAttribute('aria-pressed', String(ativo)); };
        estilo(el('lancModoAuto'), !mudasManual);
        estilo(el('lancModoManual'), mudasManual);
    }

    function aoDigitar(e) {
        const id = e.target.id;
        if (id === 'lanc_bandejas') calcularMudas();
        if (['lanc_bandejas', 'lanc_mudas', 'lanc_total_plantas'].includes(id)) atualizarPerdas();
        if (['lanc_hora_inicio', 'lanc_hora_fim', 'lanc_intervalo'].includes(id)) atualizarDuracao();
    }

    // Outro bloco no mesmo dia: repete a equipe e os horários já lançados, sem apagar o que foi digitado
    function preencherEquipeDoDia() {
        const base = transplantiosDoDia(valorCampo('data_plantio')).find(r => r.colaboradores || r.hora_inicio);
        if (!base) return;
        ['colaboradores', 'hora_inicio', 'hora_fim', 'intervalo'].forEach(id => { const c = el('lanc_' + id); if (c && !c.value && base[id]) c.value = base[id]; });
        atualizarDuracao();
    }

    let comboAberto = null;
    let destaque = -1;
    const semAcento = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    function mostrarLista(campoId, comFiltro) {
        const campo = el(campoId);
        const menu = el(campoId + '_lista');
        if (!campo || !menu) return;
        if (comboAberto && comboAberto !== campoId) fecharLista();
        const termo = comFiltro && !campo.readOnly ? semAcento(campo.value.trim()) : '';
        let visiveis = 0;
        menu.querySelectorAll('[data-acao=opcao]').forEach(b => {
            const aparece = !termo || semAcento(b.dataset.valor).includes(termo);
            const atual = b.dataset.valor === campo.value;
            b.classList.toggle('hidden', !aparece);
            b.classList.remove('bg-slate-100');
            b.classList.toggle('bg-emerald-50', atual);
            b.classList.toggle('text-emerald-800', atual);
            b.setAttribute('aria-selected', String(atual));
            if (aparece) visiveis++;
        });
        destaque = -1;
        menu.classList.toggle('hidden', !visiveis);
        campo.setAttribute('aria-expanded', String(visiveis > 0));
        comboAberto = visiveis ? campoId : null;
    }

    function fecharLista() {
        if (!comboAberto) return;
        const menu = el(comboAberto + '_lista');
        const campo = el(comboAberto);
        if (menu) menu.classList.add('hidden');
        if (campo) campo.setAttribute('aria-expanded', 'false');
        comboAberto = null;
        destaque = -1;
    }

    function escolherOpcao(campoId, valor) {
        const campo = el(campoId);
        if (!campo) return;
        campo.value = valor;
        delete campo.dataset.auto;
        fecharLista();
        campo.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function opcoesVisiveis() { return comboAberto ? [...el(comboAberto + '_lista').querySelectorAll('[data-acao=opcao]:not(.hidden)')] : []; }

    function aoTeclar(e) {
        const campo = e.target;
        if (!campo.getAttribute || campo.getAttribute('role') !== 'combobox') return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (comboAberto !== campo.id) mostrarLista(campo.id, false);
            const itens = opcoesVisiveis();
            if (!itens.length) return;
            itens.forEach(b => b.classList.remove('bg-slate-100'));
            destaque = (destaque + (e.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length;
            itens[destaque].classList.add('bg-slate-100');
            itens[destaque].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter' && comboAberto === campo.id && destaque >= 0) {
            e.preventDefault();
            escolherOpcao(campo.id, opcoesVisiveis()[destaque].dataset.valor);
        } else if (e.key === 'Escape' && comboAberto) {
            fecharLista();
        }
    }

    function preencherLista(id, valores) {
        const menu = el('lanc_' + id + '_lista');
        if (!menu) return;
        menu.innerHTML = [...new Set(valores.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
            .map(v => `<button type="button" tabindex="-1" role="option" data-acao="opcao" data-campo="lanc_${id}" data-valor="${esc(v)}" class="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 truncate">${esc(v)}</button>`).join('');
        if (comboAberto === 'lanc_' + id) mostrarLista(comboAberto, true);
    }

    // Com o cadastro ativo, cultura e variedade só oferecem os nomes cadastrados.
    // Na colheita continua mostrando primeiro o que está plantado no bloco escolhido.
    function opcoesDoCampo(id, sugeridas) {
        if (!catalogo.pronto || (id !== 'cultura' && id !== 'variedade')) return sugeridas;
        const cadastradas = id === 'cultura' ? catalogo.culturas() : catalogo.variedades(valorCampo('cultura'));
        if (tipoAtual !== 'colheita') return cadastradas;
        const noBloco = sugeridas.map(v => catalogo.oficial(id, v, valorCampo('cultura'))).filter(Boolean);
        return noBloco.length ? noBloco : cadastradas;
    }

    function atualizarListas() {
        ['bloco', 'ciclo', 'cultura', 'variedade'].forEach(id => preencherLista(id, opcoesDoCampo(id, [...candidatos(id).map(b => b[id]), ...sugestoesFixas(id)])));
        const rotuloBloco = el('lanc_bloco_rotulo');
        if (rotuloBloco) rotuloBloco.textContent = 'Setor';
        preencherLista('motivo', opcoes.motivos);
        preencherLista('local_perda', opcoes.locaisPerda);
        preencherLista('status', [...STATUS_PADRAO, ...opcoes.status, valorCampo('status')]);
    }

    function autopreencher() {
        ['ciclo', 'cultura', 'variedade'].forEach(id => {
            const campo = el('lanc_' + id);
            if (!campo || campo.value.trim()) return;
            const unicos = [...new Set(candidatos(id).map(b => b[id]))];
            if (unicos.length === 1 && unicos[0]) { campo.value = unicos[0]; campo.dataset.auto = '1'; }
        });
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
            pagina = 1;
            if (filtro.de && filtro.ate) carregar();
            return;
        }
        if (alvo.id === 'lanc_data_plantio' && !editando) preencherEquipeDoDia();
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
        if (acao === 'sugestaoPreencher') {
            const item = sugestoes[Number(valor)];
            if (item) preencherSugestao(item);
        } else if (acao === 'sugestaoFechar') {
            if (conferencia) localStorage.setItem(K_SUGESTAO_DISPENSADA, conferencia.hash);
            el('lancSugestaoModal').innerHTML = '';
        } else if (acao === 'sugestaoVer') {
            sugestaoPausada = false;
            verificarSugestoes(true);
        } else if (acao === 'cadastrarNome') {
            if (!aCadastrar) return;
            catalogo.adicionar(aCadastrar.cultura, aCadastrar.variedade).then(() => {
                aCadastrar = null;
                el('lancErro').classList.add('hidden');
                atualizarListas();
                aviso('Cadastrado. Agora é só salvar o lançamento.');
            }).catch(err => aviso(err.message));
        } else if (acao === 'paginaLanc') {
            pagina = Number(valor) || 1;
            renderLista();
            el('lancPainel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else if (acao === 'tipo' && valor !== tipoAtual) {
            pagina = 1;
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
            showConfirm('Excluir lançamento?', `<b>${esc(TIPOS[tipoAtual].titulo ? TIPOS[tipoAtual].titulo(r) : 'Setor ' + r.bloco)}</b> de ${emPt(r[TIPOS[tipoAtual].data])} será excluído.`, 'danger', 'Excluir', () => {
                API.lancamentos.excluir(tipoAtual, valor);
                if (ultimoTransplantio && ultimoTransplantio.id === valor) ultimoTransplantio = null;
                if (editando && editando.id === valor) { editando = null; renderForm(); }
                aviso(navigator.onLine ? 'Lançamento excluído.' : 'Exclusão salva. Será enviada quando houver internet.');
                carregar();
            });
        } else if (acao === 'opcao') {
            escolherOpcao(b.dataset.campo, valor);
        } else if (acao === 'abrirLista') {
            if (comboAberto === valor) fecharLista();
            else { el(valor).focus(); mostrarLista(valor, false); }
        } else if (acao === 'limpar') {
            renderForm();
        } else if (acao === 'modoMudas') {
            mudasManual = valor === 'manual';
            aplicarModoMudas();
            calcularMudas();
            atualizarPerdas();
        } else if (acao === 'salvarVariedade') {
            salvarFormulario(true);
        } else if (acao === 'ocultar') {
            if (ocultos.has(valor)) ocultos.delete(valor); else ocultos.add(valor);
            try { localStorage.setItem(K_OCULTOS, JSON.stringify([...ocultos])); } catch (e) { /* vale até fechar a página */ }
            renderLista();
        } else if (acao === 'imagem') {
            gerarImagem(valor);
        } else if (acao === 'imagemCompartilhar') {
            compartilharImagem();
        } else if (acao === 'imagemBaixar') {
            baixarImagem();
        } else if (acao === 'imagemFechar') {
            fecharImagem();
        } else if (acao === 'reenviar') {
            API.reenviarFalhas();
        } else if (acao === 'tentar') {
            carregar();
        }
    }

    function lerFormulario(t) {
        const v = {};
        t.campos.forEach(c => {
            if (c.virtual) return;
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
        if (catalogo.pronto) {
            for (const id of ['cultura', 'variedade']) {
                const campo = t.campos.find(c => c.id === id);
                if (!campo || !v[id]) continue;
                const oficial = catalogo.oficial(id, v[id], id === 'variedade' ? v.cultura : '');
                if (oficial) { v[id] = oficial; continue; }
                // Lançamento antigo com nome fora do cadastro continua podendo ser editado
                if (editando && String(editando[id] || '').trim() === v[id]) continue;
                return {
                    erro: `${campo.rotulo} "${v[id]}" não está cadastrada.${ehAdmin ? '' : ' Peça ao administrador para cadastrar.'}`,
                    campo: id,
                    cadastrar: { cultura: v.cultura || '', variedade: id === 'variedade' ? v[id] : '' }
                };
            }
        }
        const regra = t.validar(v);
        return regra ? { erro: regra } : null;
    }

    function aoSalvar(e) {
        if (e.target.id !== 'lancFormulario') return;
        e.preventDefault();
        salvarFormulario(false);
    }

    function salvarFormulario(maisVariedade) {
        const t = TIPOS[tipoAtual];
        const v = lerFormulario(t);
        const problema = validar(t, v);
        const erro = el('lancErro');
        if (problema) {
            erro.innerText = problema.erro;
            erro.classList.remove('hidden');
            aCadastrar = problema.cadastrar || null;
            if (aCadastrar && ehAdmin) erro.insertAdjacentHTML('beforeend', ' <button type="button" data-acao="cadastrarNome" class="underline">Cadastrar agora</button>');
            if (problema.campo) el('lanc_' + problema.campo).focus();
            return;
        }
        if (t.ajustar) t.ajustar(v);
        try {
            const eraEdicao = !!editando;
            if (!eraEdicao) pagina = 1; // lançamento novo aparece no início
            const salvo = Object.assign({ id: editando ? editando.id : API.novoId() }, v);
            API.lancamentos.salvar(LOCAL, tipoAtual, salvo);
            sugestaoPausada = false;
            setTimeout(verificarSugestoes, 500); // abre o próximo item conferido
            editando = null;
            ultimoTransplantio = t.imagem && t.imagem(salvo) ? salvo : null;
            ofertaImagem = ultimoTransplantio;
            if (tipoAtual === 'previsao') {
                rascunho = maisVariedade
                    ? Object.assign({}, v, { variedade: '', bandejas: null, mudas: null, total_plantas: null, perdas: null, perda_percentual: null, observacoes: '' })
                    : (v.data_plantio ? { data_plantio: v.data_plantio, colaboradores: v.colaboradores, hora_inicio: v.hora_inicio, hora_fim: v.hora_fim, intervalo: v.intervalo } : null);
            }
            renderForm();
            aviso(navigator.onLine ? (eraEdicao ? 'Alterações salvas.' : 'Lançamento salvo.') : 'Salvo no aparelho. Será enviado quando houver internet.');
            if (maisVariedade) el('lanc_variedade').focus();
            carregar();
        } catch (err) {
            erro.innerText = err.message;
            erro.classList.remove('hidden');
        }
    }

    // ---------- Imagem do transplantio (para enviar à equipe) ----------
    // Todas as variedades transplantadas no dia, mesmo as que estão fora do período filtrado na tela
    async function transplantiosDoDia(data) {
        const porId = new Map();
        try {
            const { data: linhas, error } = await API.cliente.from('colheita_previsao').select('*').eq('local', LOCAL).eq('data_plantio', data);
            if (error) throw error;
            (linhas || []).forEach(r => porId.set(r.id, r));
        } catch (e) { console.warn('Transplantios do dia (usando só os da tela):', e.message || e); }
        // A versão da tela vale mais: pode ter alteração ainda aguardando envio
        lista.forEach(r => { if (porId.has(r.id) || r.data_plantio === data) porId.set(r.id, r); });
        if (ultimoTransplantio && (porId.has(ultimoTransplantio.id) || ultimoTransplantio.data_plantio === data)) porId.set(ultimoTransplantio.id, ultimoTransplantio);
        return [...porId.values()].filter(r => r.data_plantio === data).sort((a, b) => String(a.bloco).localeCompare(String(b.bloco), 'pt-BR', { numeric: true }));
    }

    async function logoEmDados() {
        try {
            const resp = await fetch('../../favicon.png');
            const blob = await resp.blob();
            return await new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = erro; r.readAsDataURL(blob); });
        } catch (e) { return ''; }
    }

    function diasEntre(de, ate) { return Math.round((new Date(ate + 'T12:00:00Z') - new Date(de + 'T12:00:00Z')) / 86400000); }

    function caixaImagem(rotulo, valor, detalhe, cores, grande) {
        return `<div style="flex:1;background:${cores.fundo};border:1px solid ${cores.borda};border-radius:10px;padding:10px 12px;text-align:center;">
            <div style="font-size:11px;font-weight:800;color:${cores.titulo};text-transform:uppercase;letter-spacing:.04em;">${rotulo}</div>
            <div style="font-size:${grande ? 28 : 22}px;font-weight:900;color:${cores.valor};line-height:1.2;">${esc(valor)}</div>
            ${detalhe ? `<div style="font-size:12px;font-weight:600;color:${cores.titulo};">${esc(detalhe)}</div>` : ''}
        </div>`;
    }

    const CORES_PLANTADO = { fundo: '#f0fdf4', borda: '#bbf7d0', titulo: '#16a34a', valor: '#15803d' };
    const CORES_PERDAS = { fundo: '#fff1f2', borda: '#fecaca', titulo: '#dc2626', valor: '#b91c1c' };

    function caixasPlantio(regs, grande) {
        const plantado = soma(regs, 'total_plantas');
        const comMudas = regs.filter(r => Number(r.mudas) > 0 && Number(r.total_plantas) > 0);
        if (!comMudas.length) return caixaImagem('Plantado', n(plantado), '', CORES_PLANTADO, grande);
        const mudas = soma(comMudas, 'mudas');
        const perdas = mudas - soma(comMudas, 'total_plantas');
        return caixaImagem('Plantado', n(plantado), `${n(100 - (perdas / mudas) * 100)}% de sucesso`, CORES_PLANTADO, grande)
            + caixaImagem('Perdas', n(perdas), `${n((perdas / mudas) * 100)}% de perdas`, CORES_PERDAS, grande);
    }

    function htmlDaImagem(data, regs, logo) {
        const diaSemana = new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' });
        const porBloco = new Map();
        regs.forEach(r => { const k = r.bloco + '|' + (r.ciclo || ''); if (!porBloco.has(k)) porBloco.set(k, []); porBloco.get(k).push(r); });
        const blocos = [...porBloco.values()].map(itens => {
            const a = itens[0];
            const rotulo = ehPepino(a.cultura) ? 'Setor' : 'Bloco';
            const base = itens.find(r => r.colaboradores || r.hora_inicio) || a;
            const horario = base.hora_inicio || base.hora_fim ? `${base.hora_inicio || '--:--'} - ${base.hora_fim || '--:--'}${base.duracao ? ` (${base.duracao})` : ''}` : '';
            const meta = [base.colaboradores ? `${n(base.colaboradores)} colaboradores` : '', horario].filter(Boolean).join(' • ');
            const variedades = itens.map(r => {
                const dias = r.inicio_colheita ? diasEntre(data, r.inicio_colheita) : null;
                return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-top:8px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px;">
                        <span style="font-size:15px;font-weight:700;color:#334155;">${esc(r.cultura)} <span style="color:#94a3b8;font-weight:500;">${esc(r.variedade)}</span></span>
                        ${r.idade_dias ? `<span style="font-size:12px;font-weight:600;color:#94a3b8;">Idade: ${n(r.idade_dias)} dias</span>` : ''}
                    </div>
                    <div style="display:flex;gap:8px;">${caixasPlantio([r])}</div>
                    ${r.inicio_colheita ? `<div style="font-size:12px;font-weight:600;color:#64748b;margin-top:8px;">Início da colheita: <b style="color:#1d4ed8;">${emPt(r.inicio_colheita)}</b> · ${n(dias)} dias até colher</div>` : ''}
                    ${r.observacoes ? `<div style="font-size:12px;font-weight:500;color:#64748b;margin-top:4px;">Obs.: ${esc(r.observacoes)}</div>` : ''}
                </div>`;
            }).join('');
            const totalBloco = itens.length > 1 ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:8px;border-top:1px dashed #e2e8f0;font-size:13px;font-weight:800;color:#475569;"><span>Total ${rotulo} ${esc(a.bloco)}</span><span style="color:#15803d;">${n(soma(itens, 'total_plantas'))} plantados</span></div>` : '';
            return `<div style="padding:16px 24px;border-bottom:1px solid #f1f5f9;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <span style="font-size:20px;font-weight:800;color:#1e293b;">${rotulo} ${esc(a.bloco)}</span>
                    ${a.ciclo ? `<span style="font-size:12px;font-weight:700;background:#e8f4ee;color:#0d5c3a;padding:3px 10px;border-radius:99px;border:1px solid #c5ddd4;">Ciclo ${esc(a.ciclo)}</span>` : ''}
                </div>
                ${meta ? `<div style="font-size:12px;font-weight:600;color:#94a3b8;margin-top:2px;">${esc(meta)}</div>` : ''}
                ${variedades}${totalBloco}
            </div>`;
        }).join('');
        return `<div style="width:640px;background:#fff;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
            <div style="background:linear-gradient(to right,#059669,#047857);padding:22px 24px;display:flex;align-items:center;gap:16px;color:#fff;">
                ${logo ? `<img src="${logo}" alt="" style="width:68px;height:68px;background:#fff;border-radius:50%;padding:2px;">` : ''}
                <div><div style="font-size:26px;font-weight:800;line-height:1.15;">Resumo do Transplantio</div>
                <div style="font-size:15px;font-weight:600;opacity:.92;margin-top:4px;">${esc(API.nomeLocal(LOCAL))} · ${emPt(data)} · ${esc(diaSemana)}</div></div>
            </div>
            <div style="padding:16px 24px;display:flex;gap:10px;border-bottom:1px solid #e2e8f0;">${caixasPlantio(regs, true)}</div>
            ${blocos}
            <div style="padding:14px 24px;display:flex;justify-content:space-between;font-size:13px;font-weight:700;color:#475569;background:#f8faf9;">
                <span>${porBloco.size === 1 ? '1 bloco' : porBloco.size + ' blocos'}</span><span style="color:#94a3b8;">Painel SPG</span>
            </div>
        </div>`;
    }

    async function gerarImagem(data) {
        if (gerandoImagem || !data) return;
        gerandoImagem = true;
        aviso('Gerando imagem...');
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:-10000px;top:0;';
        try {
            const regs = (await transplantiosDoDia(data)).filter(r => !ocultos.has(r.id));
            if (!regs.length) { aviso('Todos os blocos deste dia estão ocultos da imagem.'); return; }
            host.innerHTML = htmlDaImagem(data, regs, await logoEmDados());
            document.body.appendChild(host);
            const opcoesImg = { pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true };
            // A primeira captura pode sair sem a logo em alguns celulares; vale a segunda
            await htmlToImage.toBlob(host.firstElementChild, opcoesImg);
            const blob = await htmlToImage.toBlob(host.firstElementChild, opcoesImg);
            if (!blob) throw new Error('imagem vazia');
            imagemAtual = { url: URL.createObjectURL(blob), nome: `Transplantio_${data}.png`, texto: `Transplantio realizado em ${emPt(data)}`, arquivo: new File([blob], `Transplantio_${data}.png`, { type: 'image/png' }) };
            mostrarImagem();
            el('lancAviso').classList.add('hidden');
        } catch (e) {
            console.error('Imagem do transplantio:', e);
            aviso('Não foi possível gerar a imagem. Tente de novo.');
        } finally {
            host.remove();
            gerandoImagem = false;
        }
    }

    function mostrarImagem() {
        const podeCompartilhar = !!(navigator.canShare && navigator.canShare({ files: [imagemAtual.arquivo] }));
        el('lancImagemModal').innerHTML = `<div class="fixed inset-0 z-[70] bg-slate-900/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Imagem do transplantio">
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-full flex flex-col overflow-hidden">
                <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <h3 class="text-sm font-bold text-slate-700">Imagem do transplantio</h3>
                    <button type="button" data-acao="imagemFechar" aria-label="Fechar" class="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"><i data-lucide="x" class="w-5 h-5"></i></button>
                </div>
                <div class="p-4 overflow-y-auto bg-slate-50"><img id="lancImagemPrevia" src="${imagemAtual.url}" alt="Prévia da imagem do transplantio" class="w-full rounded-lg shadow-sm"></div>
                <div class="p-4 flex gap-2 border-t border-slate-100">
                    ${podeCompartilhar ? `<button type="button" data-acao="imagemCompartilhar" class="flex-1 inline-flex items-center justify-center gap-2 bg-gradient-to-b from-emerald-600 to-emerald-700 text-white font-bold py-3 rounded-xl text-sm"><i data-lucide="share-2" class="w-4 h-4"></i>Compartilhar</button>` : ''}
                    <button type="button" data-acao="imagemBaixar" class="flex-1 inline-flex items-center justify-center gap-2 ${podeCompartilhar ? 'bg-white border-2 border-slate-200 text-slate-700' : 'bg-gradient-to-b from-emerald-600 to-emerald-700 text-white'} font-bold py-3 rounded-xl text-sm"><i data-lucide="download" class="w-4 h-4"></i>Baixar</button>
                </div>
            </div>
        </div>`;
        iconesAgora();
    }

    async function compartilharImagem() {
        try {
            await navigator.share({ files: [imagemAtual.arquivo], title: imagemAtual.texto, text: imagemAtual.texto });
        } catch (e) {
            if (e && e.name !== 'AbortError') baixarImagem();
        }
    }

    function baixarImagem() {
        const a = document.createElement('a');
        a.href = imagemAtual.url;
        a.download = imagemAtual.nome;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    function fecharImagem() {
        el('lancImagemModal').innerHTML = '';
        if (imagemAtual) URL.revokeObjectURL(imagemAtual.url);
        imagemAtual = null;
    }

    async function carregar() {
        if (!filtro.de || !filtro.ate) return;
        const minha = ++carga;
        const tipo = tipoAtual;
        const alvo = el('lancLista');
        if (alvo && !lista.length) alvo.innerHTML = `<div class="py-10 flex justify-center"><i data-lucide="loader-circle" class="w-6 h-6 text-slate-300 animate-spin"></i></div>`;
        iconesAgora();
        try {
            const [dados, transplantios] = await Promise.all([
                API.lancamentos.listar(LOCAL, tipo, filtro.de, filtro.ate),
                // Colheita acontece meses depois do plantio: busca uma janela maior que o período da tela
                tipo === 'previsao' ? [] : API.lancamentos.listar(LOCAL, 'previsao', somarDias(filtro.de, -400), somarDias(filtro.ate, 400)).catch(() => [])
            ]);
            if (minha !== carga) return;
            lista = dados;
            plantios = transplantios;
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
        catalogo.carregar().then(atualizarListas).catch(() => {});
        verificarSugestoes();
        if (!timerSugestoes) timerSugestoes = setInterval(() => { if (document.visibilityState === 'visible') verificarSugestoes(); }, VERIFICAR_SUGESTOES_MS);
    };
})();
