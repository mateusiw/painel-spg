// Log de atividades: o que cada pessoa registrou, alterou ou excluiu, em todos os projetos do Painel.
// Antes ficava numa janela dentro da Irrigação e mostrava gente de outros projetos; agora é uma tela geral,
// com filtro por dia, projeto e pessoa. Os dados vêm da tabela "auditoria" (gatilhos no banco).
(function () {
    'use strict';
    const API = window.IrrigacaoAPI;
    if (!API.isAdmin()) { location.replace('../../index.html'); return; }

    const DIA_MS = 24 * 3600 * 1000;
    const el = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const icones = () => { if (window.lucide) lucide.createIcons(); };
    const hora = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const dataHora = iso => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const diaIso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dataBr = d => String(d).slice(0, 10).split('-').reverse().join('/');
    const corta = (t, n) => { t = String(t); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
    const CORES = ['bg-sky-100 text-sky-800', 'bg-emerald-100 text-emerald-800', 'bg-amber-100 text-amber-800', 'bg-violet-100 text-violet-800', 'bg-rose-100 text-rose-800', 'bg-teal-100 text-teal-800'];
    const corDe = id => CORES[[...String(id)].reduce((t, c) => t + c.charCodeAt(0), 0) % CORES.length];

    // ----- De qual projeto é cada tabela, e como chamar o item -----
    const PROJETO_DA_TABELA = {
        registros_irrigacao: 'irrigacao', programacoes: 'irrigacao', motor_diario: 'irrigacao', envios_relatorio: 'irrigacao',
        pocos: 'irrigacao', leituras_poco: 'irrigacao', reservatorios: 'irrigacao', leituras_reservatorio: 'irrigacao',
        dados_bloco: 'irrigacao', manutencoes_poco: 'irrigacao', horas_poco_dia: 'irrigacao', culturas_bloco: 'irrigacao', configuracoes: 'irrigacao',
        programacao_linhas: 'programacao', programacao_controle_colaboradores: 'programacao', programacao_avaliacoes: 'programacao', programacao_avaliacoes_equipe: 'programacao',
        colheita_entregas: 'resumo-colheita-oasis', colheita_previsao: 'resumo-colheita-oasis', colheita_descartes: 'resumo-colheita-oasis',
        checklist_veiculos: 'checklist', checklist_pop_respostas: 'checklist', programacao_limpeza: 'checklist', programacao_limpeza_rotina: 'checklist',
        aplicacoes_registros: 'aplicacoes-fitossanitarias',
        perfis: 'usuarios', usuarios_login: 'usuarios', locais: 'usuarios',
        organograma: 'organograma'
    };
    const ROTULOS_TABELA = {
        registros_irrigacao: 'registro de irrigação', programacoes: 'item da programação da irrigação', motor_diario: 'hora do motor',
        envios_relatorio: 'envio de relatório', pocos: 'poço', leituras_poco: 'leitura de poço', reservatorios: 'reservatório',
        leituras_reservatorio: 'nível de reservatório', dados_bloco: 'dados do bloco', manutencoes_poco: 'manutenção de poço',
        horas_poco_dia: 'horas ligado do poço', culturas_bloco: 'cultura do bloco', configuracoes: 'configuração',
        programacao_linhas: 'linha da programação', programacao_controle_colaboradores: 'controle de colaborador',
        programacao_avaliacoes: 'avaliação de colaborador', programacao_avaliacoes_equipe: 'avaliação de equipe',
        colheita_entregas: 'entrega da colheita', colheita_previsao: 'previsão de colheita', colheita_descartes: 'descarte da colheita',
        checklist_veiculos: 'checklist de veículo', checklist_pop_respostas: 'resposta do POP', programacao_limpeza: 'limpeza do dia',
        programacao_limpeza_rotina: 'rotina de limpeza', aplicacoes_registros: 'aplicação fitossanitária',
        perfis: 'perfil de usuário', usuarios_login: 'login de usuário', locais: 'local',
        organograma: 'pessoa do organograma'
    };
    // Itens que podem voltar ao valor anterior (mesma lista da função restaurar_auditoria do banco)
    const TABELAS_RESTAURAVEIS = ['registros_irrigacao', 'programacoes', 'motor_diario', 'pocos', 'leituras_poco', 'reservatorios',
        'leituras_reservatorio', 'manutencoes_poco', 'horas_poco_dia', 'culturas_bloco', 'dados_bloco'];

    const ROTULOS_CAMPO = {
        data: 'Data', bloco: 'Bloco', blocos: 'Blocos', minutos: 'Tempo', turno: 'Turno', observacao: 'Observação', observacoes: 'Observações',
        responsavel: 'Responsável', dia: 'Dia', dia_semana: 'Dia da semana', semana: 'Semana', motor_ligado: 'Motor ligado', motor_desligado: 'Motor desligado',
        numero: 'Número', nome: 'Nome', ativo: 'Ativo', status: 'Status', motivo: 'Motivo', tipo: 'Tipo', descricao: 'Descrição', cultura: 'Cultura',
        variedade: 'Variedade', ciclo: 'Ciclo', papel: 'Papel', nome_curto: 'Nome curto', excluido_em: 'Excluído em', local: 'Local',
        setor: 'Setor', equipe: 'Equipe', colaborador: 'Colaborador', operador: 'Operador', programador: 'Programador', operacoes: 'Operações',
        realizado: 'Realizado', estimativa: 'Estimativa', quantidade: 'Quantidade', produto: 'Produto', alvo: 'Alvo', tempo: 'Tempo', combustivel: 'Combustível',
        veiculo: 'Veículo', motorista: 'Motorista', requer_manutencao: 'Requer manutenção', hora: 'Hora', hora_inicio: 'Início', hora_fim: 'Fim',
        solicitante: 'Solicitante', aplicador: 'Aplicador', produtos: 'Produtos', caixas: 'Caixas', o_que_fez: 'O que fez',
        titulo: 'Título', pop: 'POP', questao_texto: 'Questão', resposta: 'Resposta', data_entrega: 'Data da entrega', data_descarte: 'Data do descarte',
        data_plantio: 'Data do plantio', entregue_kg: 'Entregue (kg)', entregue_unidades: 'Entregue (un.)', unidades: 'Unidades', peso_kg: 'Peso (kg)',
        cargo: 'Cargo', subtitulo: 'Subtítulo', superiores: 'Líderes', tema: 'Cor', empresa: 'Empresa', agrupado: 'Agrupado', nascimento: 'Nascimento',
        contratacao: 'Contratação', contato: 'Contato', local_fisico: 'Local físico', metadados: 'Sexo e funções'
    };
    // Campos internos que não interessam no antes/depois
    const CAMPOS_OCULTOS = ['id', 'seq', 'linha', 'envio_id', 'created_at', 'updated_at', 'criado_por', 'atualizado_por', 'vazao_lh', 'litros_por_min',
        'data_envio', 'registrado_em', 'itens', 'assinatura'];
    // Ordem dos campos usados no resumo de uma linha
    const CAMPOS_RESUMO = ['cargo', 'tipo', 'setor', 'bloco', 'blocos', 'minutos', 'turno', 'veiculo', 'motorista', 'colaborador', 'equipe', 'operador', 'operacoes',
        'cultura', 'variedade', 'titulo', 'questao_texto', 'resposta', 'data', 'data_entrega', 'data_descarte', 'dia', 'dia_semana', 'numero', 'nome', 'status'];

    let projetos = API.projetosDoUsuario();
    const projetoPorId = id => projetos.find(p => p.id === id);
    const projetoDe = l => {
        const id = PROJETO_DA_TABELA[l.tabela];
        if (id === 'resumo-colheita-oasis' && l.local === 'estufa') return projetoPorId('resumo-colheita-estufa') || null;
        return projetoPorId(id) || null;
    };

    let perfis = [];
    const nomeDe = (id, reserva) => {
        const p = perfis.find(x => x.id === id);
        return p ? (p.nome_curto || p.nome) : (reserva || (id ? 'Sem nome' : 'Sistema'));
    };
    const papelDe = id => {
        const p = perfis.find(x => x.id === id);
        return !p ? '' : p.administrador ? 'Admin' : p.papel === 'gestor' ? 'Gestor' : 'Colaborador';
    };

    // ----- Estado -----
    let dia = diaIso();
    let linhas = [];
    let erro = '';
    let carregando = true;
    let filtroProjeto = '';
    let filtroPessoa = '';
    let pessoaAberta = null;
    const detalhesAbertos = new Set();

    function rotuloDia(d) {
        const ontem = diaIso(new Date(Date.now() - DIA_MS));
        if (d === diaIso()) return 'Hoje · ' + dataBr(d).slice(0, 5);
        if (d === ontem) return 'Ontem · ' + dataBr(d).slice(0, 5);
        const semana = new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
        return semana + ', ' + dataBr(d);
    }

    // ----- Como mostrar cada atividade -----
    function ehExclusao(l) {
        return l.acao === 'DELETE' || (l.acao === 'UPDATE' && l.dados_depois && l.dados_depois.excluido_em && !(l.dados_antes || {}).excluido_em);
    }
    function acaoDe(l) {
        return l.acao === 'CRIAR_LOGIN' ? { verbo: 'criou', icone: 'user-plus', cor: 'text-sky-600 bg-sky-50' }
             : l.acao === 'REDEFINIR_SENHA' ? { verbo: 'redefiniu a senha de um', icone: 'key-round', cor: 'text-amber-600 bg-amber-50' }
             : ehExclusao(l) ? { verbo: 'excluiu', icone: 'trash-2', cor: 'text-red-500 bg-red-50' }
             : l.acao === 'INSERT' ? { verbo: 'registrou', icone: 'plus', cor: 'text-green-600 bg-green-50' }
             : { verbo: 'alterou', icone: 'pencil', cor: 'text-amber-600 bg-amber-50' };
    }

    function duracao(min) {
        min = Math.round(Number(min) || 0);
        const h = Math.floor(min / 60), m = min % 60;
        return h ? `${h}h${m ? ' ' + m + 'min' : ''}` : `${m} min`;
    }

    function valor(campo, v) {
        if (v === null || v === undefined || v === '') return '—';
        if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
        if (campo === 'minutos') return duracao(v);
        if (campo === 'local') return API.nomeLocal(v);
        if (campo === 'tipo' && ({ Fito: 'Defensivos', Multiplicacao: 'Laboratório', Adubacao: 'Adubação' })[v]) return ({ Fito: 'Defensivos', Multiplicacao: 'Laboratório', Adubacao: 'Adubação' })[v];
        if (Array.isArray(v)) {
            if (!v.length) return '—';
            if (v.every(x => typeof x !== 'object' || x === null)) return v.join(', ');
            return v.map(x => x && (x.name || x.nome || x.item || x.sistema)).filter(Boolean).join(', ') || `${v.length} itens`;
        }
        if (typeof v === 'object') return JSON.stringify(v);
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return dataBr(v);
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return dataHora(v);
        if (typeof v === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(v)) return v.slice(0, 5);
        return String(v);
    }

    function resumo(l) {
        const d = l.dados_depois || l.dados_antes || {};
        if (l.tabela === 'envios_relatorio') return `Relatório de ${d.tipo === 'programacao' ? 'programação' : 'irrigação'} · ${d.qtd_registros ?? 0} itens`;
        if (d.usuario && ['perfis', 'usuarios_login'].includes(l.tabela)) return [d.nome, '@' + d.usuario].filter(Boolean).join(' · ');
        return CAMPOS_RESUMO.filter(c => d[c] !== null && d[c] !== undefined && d[c] !== '' && !(Array.isArray(d[c]) && !d[c].length))
            .slice(0, 4).map(c => corta((c === 'bloco' ? 'Bloco ' : '') + valor(c, d[c]), 40)).join(' · ');
    }

    // Campos que mudaram numa alteração
    function camposMudados(l) {
        const a = l.dados_antes || {}, d = l.dados_depois || {};
        return [...new Set([...Object.keys(a), ...Object.keys(d)])]
            .filter(c => !CAMPOS_OCULTOS.includes(c))
            .filter(c => JSON.stringify(a[c] ?? null) !== JSON.stringify(d[c] ?? null));
    }

    function frase(l) {
        const a = acaoDe(l);
        const r = resumo(l);
        let texto = `<span class="font-black">${esc(nomeDe(l.usuario_id, l.usuario_nome))}</span> ${esc(a.verbo)} ${esc(ROTULOS_TABELA[l.tabela] || String(l.tabela).replace(/_/g, ' '))}`;
        if (r) texto += `<span class="text-slate-500"> · ${esc(r)}</span>`;
        if (l.acao === 'UPDATE' && !ehExclusao(l)) {
            const antes = l.dados_antes || {}, depois = l.dados_depois || {};
            const mudou = camposMudados(l).slice(0, 2).map(c => `${esc(ROTULOS_CAMPO[c] || c.replace(/_/g, ' '))} <span class="text-red-600 line-through">${esc(corta(valor(c, antes[c]), 30))}</span> → <b class="text-green-700">${esc(corta(valor(c, depois[c]), 30))}</b>`);
            if (mudou.length) texto += `: ${mudou.join(' · ')}`;
        }
        return texto;
    }

    function detalhes(l) {
        const antes = l.dados_antes || {}, depois = l.dados_depois || {};
        const campos = [...new Set([...Object.keys(antes), ...Object.keys(depois)])].filter(c => !CAMPOS_OCULTOS.includes(c));
        const rotulo = c => ROTULOS_CAMPO[c] || c.replace(/_/g, ' ');
        let corpo;
        if (l.acao === 'UPDATE') {
            const mudou = camposMudados(l);
            corpo = !mudou.length ? '<p class="text-slate-400">Nenhum campo visível mudou.</p>' : mudou.map(c => `
                <div class="flex flex-wrap items-baseline gap-x-1.5 py-1">
                    <span class="font-bold text-slate-500 w-32 shrink-0">${esc(rotulo(c))}</span>
                    <span class="text-red-600 line-through break-words min-w-0">${esc(valor(c, antes[c]))}</span>
                    <span class="text-slate-400">→</span>
                    <span class="text-green-700 font-bold break-words min-w-0">${esc(valor(c, depois[c]))}</span>
                </div>`).join('');
        } else {
            const fonte = l.acao === 'DELETE' ? antes : depois;
            corpo = campos.filter(c => fonte[c] !== null && fonte[c] !== undefined && fonte[c] !== '').map(c => `
                <div class="flex gap-1.5 py-1">
                    <span class="font-bold text-slate-500 w-32 shrink-0">${esc(rotulo(c))}</span>
                    <span class="${l.acao === 'DELETE' ? 'text-red-600' : 'text-slate-700'} break-words min-w-0">${esc(valor(c, fonte[c]))}</span>
                </div>`).join('') || '<p class="text-slate-400">Sem detalhes.</p>';
        }
        const titulo = l.acao === 'UPDATE' ? 'Antes → Depois' : l.acao === 'DELETE' ? 'Como estava antes de excluir' : 'Valores registrados';
        const noAparelho = depois.registrado_em || antes.registrado_em;
        const regAparelho = noAparelho && Math.abs(new Date(noAparelho) - new Date(l.criado_em)) > 60000
            ? `<p class="text-[10px] text-slate-400 mt-1">Registrado no aparelho em ${dataHora(noAparelho)} · gravado no banco em ${dataHora(l.criado_em)}</p>` : '';
        let botao = '';
        if (TABELAS_RESTAURAVEIS.includes(l.tabela) && ['INSERT', 'UPDATE', 'DELETE'].includes(l.acao)) {
            const desfazer = l.acao === 'INSERT';
            botao = `<button type="button" data-restaurar="${Number(l.id)}" class="mt-2 w-full flex items-center justify-center gap-1.5 text-[11px] font-black uppercase tracking-wider py-2 rounded-lg ${desfazer ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-sky-50 text-sky-700 hover:bg-sky-100'}">
                <i data-lucide="${desfazer ? 'undo-2' : 'history'}" class="w-3.5 h-3.5"></i> ${desfazer ? 'Desfazer este registro' : 'Restaurar como estava às ' + hora(l.criado_em)}</button>`;
        }
        return `<div class="mt-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-[11px]">
            <p class="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">${titulo}</p>
            ${corpo}${regAparelho}${botao}
        </div>`;
    }

    function seloProjeto(l) {
        const p = projetoDe(l);
        const local = l.local ? `<span class="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border bg-white text-slate-500 border-slate-200"><i data-lucide="map-pin" class="w-2.5 h-2.5"></i>${esc(API.nomeLocal(l.local).replace(/^SPG\s+/i, ''))}</span>` : '';
        const proj = p ? `<span class="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${p.cor}"><i data-lucide="${p.icone}" class="w-2.5 h-2.5"></i>${esc(p.nome)}</span>` : '';
        return proj || local ? `<span class="inline-flex flex-wrap gap-1">${proj}${local}</span>` : '';
    }

    function itemAtividade(l) {
        const a = acaoDe(l);
        const aberto = detalhesAbertos.has(l.id);
        return `<div class="py-2">
            <button type="button" data-detalhe="${Number(l.id)}" aria-expanded="${aberto}" class="w-full text-left flex items-start gap-2.5">
                <span class="w-7 h-7 rounded-full ${a.cor} flex items-center justify-center shrink-0"><i data-lucide="${a.icone}" class="w-3.5 h-3.5"></i></span>
                <span class="min-w-0 flex-1">
                    <span class="block text-xs text-slate-700 leading-snug">${frase(l)}</span>
                    <span class="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-slate-400">${hora(l.criado_em)} ${seloProjeto(l)}
                        <i data-lucide="chevron-down" class="w-3 h-3 transition-transform ${aberto ? 'rotate-180' : ''}"></i></span>
                </span>
            </button>
            ${aberto ? `<div class="pl-9">${detalhes(l)}</div>` : ''}
        </div>`;
    }

    // ----- Agrupamentos e filtros -----
    const doProjeto = l => !filtroProjeto || (PROJETO_DA_TABELA[l.tabela] || 'outros') === filtroProjeto;

    function pessoasDe(lista) {
        const mapa = new Map();
        lista.forEach(l => {
            const id = l.usuario_id || 'sistema';
            if (!mapa.has(id)) mapa.set(id, { id, nome: l.usuario_id ? nomeDe(l.usuario_id, l.usuario_nome) : 'Sistema', papel: l.usuario_id ? papelDe(l.usuario_id) : '', linhas: [] });
            mapa.get(id).linhas.push(l);
        });
        return [...mapa.values()].map(g => Object.assign(g, {
            qtd: g.linhas.length, ultima: g.linhas[0].criado_em, primeira: g.linhas[g.linhas.length - 1].criado_em,
            projetos: [...new Set(g.linhas.map(projetoDe).filter(Boolean))]
        })).sort((a, b) => String(b.ultima).localeCompare(String(a.ultima)));
    }

    function chip(atributo, valorChip, conteudo, ativo, qtd) {
        return `<button type="button" ${atributo}="${esc(valorChip)}" aria-pressed="${ativo}" class="inline-flex items-center gap-1.5 shrink-0 h-8 pl-1.5 pr-3 rounded-full border text-xs font-bold transition-colors ${ativo ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}">${conteudo}${qtd != null ? `<span class="text-[10px] font-black px-1.5 rounded-full ${ativo ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}">${qtd}</span>` : ''}</button>`;
    }

    function desenhar() {
        el('diaRotulo').textContent = rotuloDia(dia);
        el('diaProximo').disabled = dia >= diaIso();
        el('subtitulo').textContent = carregando ? 'Carregando...' : erro ? 'Sem conexão' : 'Todos os projetos · ' + rotuloDia(dia);

        // Chips de projeto: só os que tiveram atividade no dia
        const porProjeto = new Map();
        linhas.forEach(l => { const id = PROJETO_DA_TABELA[l.tabela] || 'outros'; porProjeto.set(id, (porProjeto.get(id) || 0) + 1); });
        if (filtroProjeto && !porProjeto.has(filtroProjeto)) filtroProjeto = '';
        el('filtroProjetos').innerHTML = !linhas.length ? '' :
            chip('data-filtro-projeto', '', '<i data-lucide="layers" class="w-3.5 h-3.5 ml-1"></i>Todos os projetos', !filtroProjeto, linhas.length) +
            [...porProjeto.entries()].sort((a, b) => b[1] - a[1]).map(([id, qtd]) => {
                const p = projetoPorId(id);
                return chip('data-filtro-projeto', id, p ? `<span class="w-5 h-5 rounded-full bg-gradient-to-br ${p.gradiente} text-white flex items-center justify-center"><i data-lucide="${p.icone}" class="w-3 h-3"></i></span>${esc(p.nome)}` : '<i data-lucide="circle-help" class="w-3.5 h-3.5 ml-1"></i>Outros', filtroProjeto === id, qtd);
            }).join('');

        const doFiltro = linhas.filter(doProjeto);
        const pessoas = pessoasDe(doFiltro);
        if (filtroPessoa && !pessoas.some(p => p.id === filtroPessoa)) filtroPessoa = '';
        el('filtroPessoas').innerHTML = !pessoas.length ? '' :
            chip('data-filtro-pessoa', '', '<i data-lucide="users" class="w-3.5 h-3.5 ml-1"></i>Todos', !filtroPessoa) +
            pessoas.slice().sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome, 'pt-BR')).map(p =>
                chip('data-filtro-pessoa', p.id, `<span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${corDe(p.id)}">${esc(p.nome.charAt(0).toUpperCase())}</span>${esc(p.nome)}`, filtroPessoa === p.id, p.qtd)).join('');

        const lista = filtroPessoa ? pessoas.filter(p => p.id === filtroPessoa) : pessoas;
        const total = doFiltro.length;
        el('tituloLista').textContent = carregando || erro || !total ? '' : filtroPessoa
            ? `${lista[0].qtd} atividade${lista[0].qtd === 1 ? '' : 's'} de ${lista[0].nome}`
            : `${total} atividade${total === 1 ? '' : 's'} · ${pessoas.length} pessoa${pessoas.length === 1 ? '' : 's'}`;

        if (carregando && !linhas.length) {
            el('lista').innerHTML = '<div class="flex items-center justify-center gap-2 text-sm text-slate-400 py-12"><i data-lucide="loader-circle" class="w-4 h-4 animate-spin"></i> Carregando...</div>';
        } else if (erro) {
            el('lista').innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-sm font-semibold" role="alert">${esc(erro)}</div>`;
        } else if (!total) {
            el('lista').innerHTML = `<div class="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center text-sm text-slate-500">Nenhuma atividade ${dia === diaIso() ? 'hoje' : 'neste dia'}.</div>`;
        } else {
            el('lista').innerHTML = lista.map(g => {
                const aberto = !!filtroPessoa || pessoaAberta === g.id;
                const periodo = g.primeira === g.ultima ? hora(g.ultima) : `${hora(g.primeira)} – ${hora(g.ultima)}`;
                return `<article class="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <button type="button" data-pessoa="${esc(g.id)}" aria-expanded="${aberto}" class="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50">
                        <span class="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${corDe(g.id)}">${esc(g.nome.charAt(0).toUpperCase())}</span>
                        <span class="min-w-0 flex-1">
                            <span class="block text-sm font-bold text-slate-800 truncate">${esc(g.nome)}</span>
                            <span class="block text-[11px] text-slate-400 mt-0.5">${g.papel ? `<span class="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 mr-1">${esc(g.papel)}</span>` : ''}<b class="text-slate-500">${g.qtd} alteraç${g.qtd === 1 ? 'ão' : 'ões'}</b> · ${periodo}</span>
                            ${g.projetos.length ? `<span class="mt-1 flex flex-wrap gap-1">${g.projetos.map(p => `<span class="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${p.cor}"><i data-lucide="${p.icone}" class="w-2.5 h-2.5"></i>${esc(p.nome)}</span>`).join('')}</span>` : ''}
                        </span>
                        <i data-lucide="chevron-down" class="w-4 h-4 text-slate-400 shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}"></i>
                    </button>
                    ${aberto ? `<div class="border-t border-slate-100 bg-slate-50/60 px-4 divide-y divide-slate-100">${g.linhas.map(itemAtividade).join('')}</div>` : ''}
                </article>`;
            }).join('');
        }
        icones();
    }

    // ----- Busca -----
    let pedido = 0;
    async function buscar() {
        const meu = ++pedido;
        carregando = true;
        el('btnAtualizar').disabled = true;
        desenhar();
        const inicio = new Date(dia + 'T00:00:00');
        try {
            const resultado = await API.listarAuditoriaGeral(inicio.toISOString(), new Date(inicio.getTime() + DIA_MS).toISOString());
            if (meu !== pedido) return;   // trocou de dia enquanto carregava: vale a busca nova
            linhas = resultado;
            erro = '';
        } catch (e) {
            if (meu !== pedido) return;
            erro = 'Não foi possível carregar: ' + (e.message || 'sem conexão');
        }
        carregando = false;
        el('btnAtualizar').disabled = false;
        desenhar();
    }

    function irParaDia(novo) {
        if (!novo || novo > diaIso() || novo === dia) return;
        dia = novo;
        el('diaFiltro').value = dia;
        linhas = []; erro = ''; pessoaAberta = null; detalhesAbertos.clear();
        buscar();
    }

    // ----- Restaurar (desfazer) um item pelo log -----
    function confirmar(titulo, texto, rotuloOk) {
        return new Promise(ok => {
            const caixa = document.createElement('div');
            caixa.className = 'fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-5';
            caixa.setAttribute('role', 'dialog');
            caixa.setAttribute('aria-modal', 'true');
            caixa.innerHTML = `<div class="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-6 text-center">
                <h3 class="text-lg font-extrabold text-slate-800">${esc(titulo)}</h3>
                <p class="text-sm text-slate-500 mt-2 leading-relaxed">${esc(texto)}</p>
                <div class="flex gap-2 mt-5">
                    <button type="button" data-nao class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl text-sm">Cancelar</button>
                    <button type="button" data-sim class="flex-1 bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl text-sm">${esc(rotuloOk)}</button>
                </div>
            </div>`;
            const fechar = r => { caixa.remove(); ok(r); };
            caixa.addEventListener('click', e => {
                if (e.target === caixa || e.target.closest('[data-nao]')) fechar(false);
                else if (e.target.closest('[data-sim]')) fechar(true);
            });
            caixa.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(false); });
            document.body.appendChild(caixa);
            caixa.querySelector('[data-sim]').focus();
        });
    }

    function aviso(texto, ruim) {
        const t = document.createElement('div');
        t.className = `fixed left-1/2 -translate-x-1/2 bottom-6 z-50 max-w-sm w-[calc(100%-2rem)] px-4 py-3 rounded-xl text-sm font-bold shadow-lg ${ruim ? 'bg-red-600 text-white' : 'bg-slate-800 text-white'}`;
        t.setAttribute('role', 'status');
        t.textContent = texto;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 4000);
    }

    async function restaurar(id) {
        const l = linhas.find(x => Number(x.id) === id);
        if (!l) return;
        const d = l.dados_depois || l.dados_antes || {};
        const item = l.tabela === 'registros_irrigacao' ? `a irrigação do Bloco ${d.bloco || '?'}` : (ROTULOS_TABELA[l.tabela] || l.tabela);
        const quem = nomeDe(l.usuario_id, l.usuario_nome);
        const desfazer = l.acao === 'INSERT';
        const texto = desfazer
            ? `Isso apaga ${item} registrada por ${quem} em ${dataHora(l.criado_em)}.`
            : `${item.charAt(0).toUpperCase() + item.slice(1)} volta a ficar como estava antes da ação de ${quem} em ${dataHora(l.criado_em)}${l.acao === 'DELETE' ? ' (será criada de novo)' : ''}. A restauração também fica registrada no log.`;
        if (!await confirmar(desfazer ? 'Desfazer registro?' : 'Restaurar valor anterior?', texto, desfazer ? 'Desfazer' : 'Restaurar')) return;
        try {
            await API.restaurarAuditoria(id);
            aviso(desfazer ? 'Registro desfeito.' : 'Restaurado. O valor anterior já está no banco de dados.');
            buscar();
        } catch (e) {
            aviso('Não foi possível restaurar: ' + (e.message || 'erro'), true);
        }
    }

    // ----- Eventos -----
    document.querySelector('main').addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.hasAttribute('data-filtro-projeto')) { filtroProjeto = b.dataset.filtroProjeto; pessoaAberta = null; desenhar(); return; }
        if (b.hasAttribute('data-filtro-pessoa')) { filtroPessoa = b.dataset.filtroPessoa; pessoaAberta = null; desenhar(); return; }
        if (b.dataset.pessoa) { if (!filtroPessoa) { pessoaAberta = pessoaAberta === b.dataset.pessoa ? null : b.dataset.pessoa; desenhar(); } return; }
        if (b.dataset.detalhe) { const id = Number(b.dataset.detalhe); if (detalhesAbertos.has(id)) detalhesAbertos.delete(id); else detalhesAbertos.add(id); desenhar(); return; }
        if (b.dataset.restaurar) { restaurar(Number(b.dataset.restaurar)); }
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
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && dia === diaIso()) buscar(); });

    API.listarPerfis().then(p => { perfis = p || []; desenhar(); }).catch(() => {});
    buscar();
})();
