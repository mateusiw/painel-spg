// Camada de acesso ao Supabase.
//
// - Login por usuário + senha (Supabase Auth com e-mail interno).
// - Funciona offline: toda gravação entra numa fila guardada no aparelho e é
//   enviada automaticamente quando houver conexão. Consultas usam um cache local
//   quando não há internet.
// - O cálculo de consumo (antigo Code.gs do Apps Script) roda aqui, com o mesmo
//   formato de resposta ({ sucesso, resumo, blocos, totalLitrosMil, ... }).
(function() {
    const cfg = window.SUPABASE_CONFIG || {};

    // Com sinal fraco uma requisição pode ficar "pendurada" por minutos; sem limite
    // de tempo a sincronização ficava travada e não enviava mais nada.
    const LIMITE_REQUISICAO_MS = 30 * 1000;
    function fetchComLimite(url, opcoes) {
        opcoes = opcoes || {};
        const controle = new AbortController();
        const timer = setTimeout(() => controle.abort(), LIMITE_REQUISICAO_MS);
        if (opcoes.signal) {
            if (opcoes.signal.aborted) controle.abort();
            else opcoes.signal.addEventListener('abort', () => controle.abort());
        }
        return fetch(url, Object.assign({}, opcoes, { signal: controle.signal }))
            .finally(() => clearTimeout(timer));
    }

    const sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'irrigacao-auth' },
        global: { fetch: fetchComLimite }
    });

    const K = {
        usuario: 'irrigacao_usuario',
        ultimoUsuario: 'irrigacao_ultimo_usuario',
        fila: 'irrigacao_fila_sync',
        falhas: 'irrigacao_falhas_sync',
        local: 'irrigacao_local',
        locais: 'irrigacao_locais',
        projetosLocais: 'spg_projetos_locais',
        // Cada local tem as suas cópias (a Oásis mantém os nomes antigos)
        cache: nome => 'irrigacao_cache_' + nome + (nome === 'perfis' ? '' : sufixoLocal())
    };

    // ------------------------------------------------------------
    // Utilidades
    // ------------------------------------------------------------
    function ler(chave, padrao) {
        try { const v = localStorage.getItem(chave); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; }
    }
    // Cópias que o app usa para funcionar offline: só são apagadas em último caso
    const CACHES_ESSENCIAIS = ['perfis', 'dados_bloco', 'configuracoes', 'pocos', 'reservatorios', 'programacoes', 'culturas_bloco'];

    // ------------------------------------------------------------
    // Locais (Fazenda Oásis, Estufa, ...). Todo dado pertence a um local.
    // Administrador acessa todos; gestores e irrigadores só os do seu perfil (perfis.locais).
    // ------------------------------------------------------------
    const LOCAL_PADRAO = 'oasis';
    const LOCAIS_RESERVA = [{ id: LOCAL_PADRAO, nome: 'SPG Oásis', ordem: 1, ativo: true }];
    // Tabelas que têm a coluna "local"
    const TABELAS_LOCAL = ['dados_bloco', 'programacoes', 'registros_irrigacao', 'motor_diario', 'envios_relatorio',
        'pocos', 'leituras_poco', 'reservatorios', 'leituras_reservatorio', 'horas_poco_dia', 'configuracoes',
        'culturas_bloco', 'manutencoes_poco'];

    function todosLocais() {
        const lista = ler(K.locais, null);
        return Array.isArray(lista) && lista.length ? lista : LOCAIS_RESERVA;
    }

    // Locais em que um projeto existe; null = vale para todos os locais.
    // Projeto ligado a um local no catálogo (dados exclusivos dele) não muda pela configuração.
    function locaisDoProjeto(id) {
        const p = PROJETOS.find(x => x.id === id);
        if (!p) return null;
        if (p.local) return [p.local];
        const lista = ler(K.projetosLocais, {})[id];
        return Array.isArray(lista) && lista.length ? lista : null;
    }

    // Dentro de um projeto (window.SPG_PROJETO_ATUAL), só aparecem os locais em que ele existe
    function locaisPermitidos() {
        const projeto = window.SPG_PROJETO_ATUAL;
        const doProjeto = projeto ? locaisDoProjeto(projeto) : null;
        return doProjeto ? locaisDoUsuario().filter(l => doProjeto.includes(l.id)) : locaisDoUsuario();
    }

    // Locais que o usuário logado pode acessar, na ordem de exibição
    function locaisDoUsuario() {
        const u = ler(K.usuario, null);
        const ativos = todosLocais().filter(l => l.ativo !== false);
        if (!u) return ativos;
        // Só o administrador (gestor master) acessa todos; os demais, os locais do seu perfil
        if (u.papel === 'gestor' && u.administrador === true) return ativos;
        const meus = Array.isArray(u.locais) ? u.locais : [LOCAL_PADRAO];
        return ativos.filter(l => meus.includes(l.id));
    }

    function localAtual() {
        const escolhido = localStorage.getItem(K.local);
        const permitidos = locaisPermitidos();
        if (permitidos.some(l => l.id === escolhido)) return escolhido;
        return permitidos.length ? permitidos[0].id : (escolhido || LOCAL_PADRAO);
    }

    function nomeLocal(id) {
        id = id || localAtual();
        const l = todosLocais().find(x => x.id === id);
        return l ? l.nome : id;
    }

    // Troca o local em uso. O app recarrega a página em seguida.
    function trocarLocal(id) {
        if (!locaisPermitidos().some(l => l.id === id)) throw new Error("Você não tem acesso a este local.");
        localStorage.setItem(K.local, id);
    }

    // "" para a Oásis (mantém as chaves e ids antigos); "@estufa" para os outros
    function sufixoLocal() { const l = localAtual(); return l === LOCAL_PADRAO ? '' : '@' + l; }

    // Chave do aparelho separada por local (ex.: lista de registros do dia)
    function chaveLocal(chave) { const l = localAtual(); return l === LOCAL_PADRAO ? chave : chave + '@' + l; }

    // Ids que precisam ser únicos por local (ex.: sub nome do bloco "E")
    function idComLocal(id) { const l = localAtual(); return l === LOCAL_PADRAO ? String(id) : l + '/' + id; }
    function idSemLocal(id) { const l = localAtual(); const p = l + '/'; return l !== LOCAL_PADRAO && String(id).startsWith(p) ? String(id).slice(p.length) : String(id); }

    async function carregarLocais() {
        const resp = await sb.from('locais').select('*').order('ordem').order('nome');
        if (!resp.error && resp.data && resp.data.length) gravar(K.locais, resp.data);
        const conf = await sb.from('projetos_locais').select('projeto,local');
        if (!conf.error && conf.data) {
            const mapa = {};
            conf.data.forEach(c => { (mapa[c.projeto] = mapa[c.projeto] || []).push(c.local); });
            gravar(K.projetosLocais, mapa);
        }
        return todosLocais();
    }

    // Cadastra ou altera um local (somente administrador, precisa de internet)
    async function salvarLocal(local, novo) {
        if (!navigator.onLine) throw new Error("Sem conexão com a internet.");
        const resp = novo
            ? await sb.from('locais').insert(local).select().maybeSingle()
            : await sb.from('locais').update(local).eq('id', local.id).select().maybeSingle();
        if (resp.error) {
            if (resp.error.code === '23505') throw new Error(`Já existe um local com o código "${local.id}".`);
            throw erroSupabase(resp);
        }
        if (!resp.data) throw new Error("Sem permissão para alterar locais (somente o administrador).");
        await carregarLocais();
        return resp.data;
    }

    function chavesDeCache() {
        const chaves = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('irrigacao_cache_')) chaves.push(k);
        }
        return chaves;
    }

    // Apaga cópias de consultas (podem ser baixadas de novo). "antesDe" limita às mais antigas.
    function limparCaches(incluirEssenciais, antesDe) {
        chavesDeCache().forEach(k => {
            if (!incluirEssenciais && CACHES_ESSENCIAIS.includes(k.slice('irrigacao_cache_'.length).split('@')[0])) return;
            if (antesDe) {
                const c = ler(k, null);
                if (c && c.em >= antesDe) return;
            }
            localStorage.removeItem(k);
        });
    }

    // Devolve false se não conseguiu guardar. Com o aparelho sem espaço, libera as
    // cópias de consultas e tenta de novo, para nunca perder um dado da fila.
    function gravar(chave, valor) {
        const texto = JSON.stringify(valor);
        try { localStorage.setItem(chave, texto); return true; } catch (e) {}
        if (chave.startsWith('irrigacao_cache_')) return false;
        for (const incluirEssenciais of [false, true]) {
            try { limparCaches(incluirEssenciais); } catch (e) {}
            try { localStorage.setItem(chave, texto); return true; } catch (e) {}
        }
        console.error("Erro ao salvar no aparelho (sem espaço):", chave);
        return false;
    }

    // As consultas por dia/período criam uma cópia nova a cada dia e nunca eram apagadas,
    // até encher o armazenamento do aparelho (e a fila deixava de ser gravada).
    try { limparCaches(false, Date.now() - 7 * 24 * 60 * 60 * 1000); } catch (e) {}

    function novoId() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    // Data atual no fuso GMT-3 (mesmo fuso usado no Apps Script)
    function hojeGmt3() {
        const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const dia = String(d.getUTCDate()).padStart(2, '0');
        return { iso: `${y}-${m}-${dia}`, br: `${dia}/${m}/${y}` };
    }

    // "yyyy-MM-dd" -> "dd/MM/yyyy"
    function isoParaBr(iso) {
        if (!iso) return "";
        const [y, m, d] = String(iso).split('-');
        return `${d}/${m}/${y}`;
    }

    function limparNomeBloco(nome) {
        // "06" e "6" são o mesmo bloco (os Dados dos Blocos usam "Bloco 6")
        return String(nome || "").toUpperCase().replace("BLOCO", "").trim().replace(/^0+(?=\d)/, "");
    }

    // Nome do sistema de irrigação de uma linha dos Dados dos Blocos ("MicroAspesor 90 L/H" -> "MicroAspersor").
    // Mesma regra do tipo_sistema() do banco (minutos_por_sistema.sql).
    function tipoSistema(tipo) {
        const nome = String(tipo || '').replace(/[\d.,]+\s*L\/H.*$/i, '').trim();
        if (/micro/i.test(nome)) return 'MicroAspersor';
        if (!nome || /^aspersor$/i.test(nome)) return 'Aspersor';
        if (/^fita\s*gotejo$/i.test(nome)) return 'Fita Gotejo';
        return nome;
    }

    // Minutos de cada sistema/válvula de um registro ([{ tipo, valvula?, minutos }]), só os que têm tempo
    function limparSistemas(sistemas) {
        const lista = (Array.isArray(sistemas) ? sistemas : [])
            .map(s => {
                const x = { tipo: tipoSistema(s.tipo), minutos: Math.max(0, parseInt(s.minutos) || 0) };
                const v = parseInt(s.valvula);
                if (v >= 1) x.valvula = v;
                return x;
            })
            .filter(s => s.minutos > 0);
        return lista.length ? lista : null;
    }

    // Ordem dos sistemas no bloco: MicroAspersor, Aspersor, outros e por último Fita Gotejo
    function ordemSistema(tipo) {
        const t = tipoSistema(tipo);
        return t === 'MicroAspersor' ? 0 : t === 'Aspersor' ? 1 : t === 'Fita Gotejo' ? 3 : 2;
    }

    // Válvulas de cada bloco: { bloco: [{ n, tipo, qtd, vazao, lh }] }, numeradas a partir de 1.
    // Linhas dos Dados dos Blocos em ordem de sistema (ordemSistema) e depois id; uma linha com N válvulas
    // vira N válvulas, cada uma com 1/N dos aspersores. Mesma regra do valvulas_do_bloco() do banco (minutos_por_valvula.sql).
    function valvulasDoBloco(dados) {
        const mapa = {};
        [...(dados || [])].sort((a, b) => ordemSistema(a.tipo_aspersor) - ordemSistema(b.tipo_aspersor)
            || (Number(a.id) || 0) - (Number(b.id) || 0)).forEach(linha => {
            const b = limparNomeBloco(linha.bloco);
            if (!b) return;
            const mv = String(linha.valvulas || '').match(/(\d+)/);
            const n = Math.max(1, mv ? parseInt(mv[1]) || 1 : 1);
            const tipoTxt = String(linha.tipo_aspersor || '').trim();
            const mz = tipoTxt.match(/([\d.,]+)\s*L\/H/i);
            const vazao = mz ? parseFloat(mz[1].replace(',', '.')) || 0 : 0;
            const qtd = parseFloat(String(linha.qtd_aspersores || '').trim().replace(/\./g, '').replace(/,/g, '.')) || 0;
            const lista = mapa[b] = mapa[b] || [];
            for (let i = 0; i < n; i++) lista.push({ n: lista.length + 1, tipo: tipoSistema(tipoTxt), qtd: qtd / n, vazao, lh: qtd / n * vazao });
        });
        return mapa;
    }

    // Válvula de uma parte do registro ({ tipo, valvula }), só se o tipo bate. Registros feitos antes de
    // mudar a numeração (micro antes da fita) podem apontar para outra válvula: aí usa a conta por sistema.
    function valvulaDoRegistro(valvulasBloco, parte) {
        const v = parte && parte.valvula && (valvulasBloco || [])[Number(parte.valvula) - 1];
        return v && v.tipo === tipoSistema(parte.tipo) ? v : null;
    }

    // Erro do Supabase -> Error com status (status 0 = sem conexão)
    function erroSupabase(resposta) {
        const e = new Error(resposta.error.message || 'Erro desconhecido');
        e.status = resposta.status || 0;
        e.code = resposta.error.code;
        return e;
    }

    // ------------------------------------------------------------
    // Usuário / login
    // ------------------------------------------------------------
    let sessaoExpirada = false;

    function usuarioAtual() { return ler(K.usuario, null); }
    function isGestor() { const u = usuarioAtual(); return !!u && u.papel === 'gestor'; }
    // Único gestor que pode gerenciar usuários
    function isAdmin() { const u = usuarioAtual(); return isGestor() && u.administrador === true; }
    function nomeUsuario(u) { u = u || usuarioAtual(); return u ? (u.nome_curto || u.nome) : ''; }

    async function login(usuario, senha) {
        const login = String(usuario || '').trim().toLowerCase();
        const email = login.includes('@') ? login : login + '@' + (cfg.emailDominio || 'spgoasis.local');

        const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
        if (error) {
            if (!navigator.onLine || error.status === 0 || /fetch/i.test(error.message)) {
                throw new Error("Sem conexão. O primeiro acesso de cada usuário precisa de internet.");
            }
            throw new Error(/invalid/i.test(error.message) ? "Usuário ou senha incorretos." : error.message);
        }

        const resp = await sb.from('perfis').select('*').eq('id', data.user.id).maybeSingle();
        if (resp.error || !resp.data || !resp.data.ativo) {
            await sb.auth.signOut({ scope: 'local' });
            throw new Error(resp.data && !resp.data.ativo
                ? "Usuário desativado. Fale com o gestor."
                : "Usuário sem perfil cadastrado. Fale com o gestor.");
        }

        await carregarLocais();
        const ehAdmin = resp.data.papel === 'gestor' && resp.data.administrador === true;
        const liberados = (resp.data.locais || []).filter(id => todosLocais().some(l => l.id === id && l.ativo !== false));
        if (!ehAdmin && !liberados.length) {
            await sb.auth.signOut({ scope: 'local' });
            throw new Error("Nenhum local liberado para o seu usuário. Fale com o administrador.");
        }

        const trocouDeUsuario = localStorage.getItem(K.ultimoUsuario) !== resp.data.id;
        localStorage.setItem(K.ultimoUsuario, resp.data.id);
        gravar(K.usuario, resp.data);
        sessaoExpirada = false;
        emitir();
        agendarSync();
        return { perfil: resp.data, trocouDeUsuario };
    }

    // ------------------------------------------------------------
    // Projetos do Painel SPG e permissões por módulo (perfis.modulos).
    // O administrador acessa todos. Um projeto aparece para quem tem ao menos um
    // dos seus módulos (e o local dele, quando o projeto pertence a um local).
    // ------------------------------------------------------------
    const recursos = (prefixo, lista) => lista.map(([id, nome, icone]) => ({ id: prefixo + '.' + id, nome, icone }));
    // Cada área é ligada por um módulo (perfis.modulos); dentro dela, cada recurso pode ser bloqueado (perfis.bloqueios)
    const PROJETOS = [
        { id: 'irrigacao', nome: 'Irrigação', descricao: 'Registro diário, programação, água e gráficos', icone: 'droplets', grupo: 'Operação', gradiente: 'from-sky-500 to-cyan-600',
          cor: 'bg-sky-50 text-sky-700', caminho: 'projetos/irrigacao/index.html',
          areas: [{ modulo: 'irrigacao', nome: 'Acesso à Irrigação', recursos: recursos('irrigacao', [
              ['registro', 'Registro', 'clipboard-pen'], ['programacao', 'Programação', 'calendar-days'], ['agua', 'Água', 'droplet'], ['graficos', 'Gráficos', 'chart-column']]) }] },
        { id: 'resumo-colheita-oasis', nome: 'Resumo da Colheita Oásis', descricao: 'Campo, colheita, pesagem e lançamentos', icone: 'tractor', grupo: 'Operação', gradiente: 'from-lime-500 to-green-700',
          cor: 'bg-emerald-50 text-emerald-700', caminho: 'projetos/resumo-colheita-oasis/index.html', local: 'oasis',
          areas: [
              { modulo: 'colheita_oasis', nome: 'Campo e Colheita', recursos: recursos('colheita', [['campo', 'Campo', 'truck'], ['colheita', 'Colheita', 'tractor']]) },
              { modulo: 'pesagem_oasis', nome: 'Pesagem', recursos: [], menu: false },   // menu: false -> a Pesagem fica no projeto Pesagem
              { modulo: 'lancamentos_oasis', nome: 'Lançamentos', recursos: recursos('lancar', [['colheita', 'Colheita', 'tractor'], ['previsao', 'Calendário', 'calendar-days'], ['descarte', 'Descarte', 'trash-2']]) }
          ] },
        { id: 'resumo-colheita-estufa', nome: 'Resumo da Colheita Estufa', descricao: 'Pepino: campo, colheita, pesagem e lançamentos', icone: 'tractor', grupo: 'Operação', gradiente: 'from-teal-500 to-cyan-700',
          cor: 'bg-teal-50 text-teal-700', caminho: 'projetos/resumo-colheita-estufa/index.html', local: 'estufa',
          areas: [
              { modulo: 'colheita_estufa', nome: 'Campo e Colheita', recursos: recursos('colheita_estufa', [['campo', 'Campo', 'truck'], ['colheita', 'Colheita', 'tractor']]) },
              { modulo: 'pesagem_estufa', nome: 'Pesagem', recursos: [], menu: false },
              { modulo: 'lancamentos_estufa', nome: 'Lançamentos', recursos: recursos('lancar_estufa', [['colheita', 'Colheita', 'tractor'], ['previsao', 'Calendário', 'calendar-days'], ['descarte', 'Descarte', 'trash-2']]) }
          ] },
        { id: 'producao-oasis', nome: 'Produção Oásis', descricao: 'Previsões, produtividade, calendário, ranking e análise', icone: 'bar-chart-3', grupo: 'Indicadores', gradiente: 'from-indigo-500 to-violet-600',
          cor: 'bg-indigo-50 text-indigo-700', caminho: 'projetos/producao-oasis/index.html', local: 'oasis',
          areas: [{ modulo: 'producao_oasis', nome: 'Acesso à Produção', recursos: recursos('producao', [
              ['resumo', 'Resumo', 'sun'], ['previsao', 'Previsões', 'calendar-days'], ['produtividade', 'Produtividade', 'layout-dashboard'], ['calendario', 'Calendário', 'list-todo'],
              ['entregas', 'Entregas', 'package'], ['ranking', 'Ranking', 'trophy'], ['analise', 'Análise', 'microscope'], ['comparacao', 'Comparação', 'columns-2']]) }] },
        { id: 'producao-estufa', nome: 'Produção Estufa', descricao: 'Pepino: previsões, produtividade, descarte, ranking e simulador', icone: 'warehouse', grupo: 'Indicadores', gradiente: 'from-sky-500 to-blue-700',
          cor: 'bg-sky-50 text-sky-700', caminho: 'projetos/producao-estufa/index.html', local: 'estufa',
          areas: [{ modulo: 'producao_estufa', nome: 'Acesso à Produção Estufa', recursos: recursos('producao_estufa', [
              ['resumo', 'Resumo', 'sun'], ['previsao', 'Previsões', 'calendar-days'], ['produtividade', 'Produtividade', 'layout-dashboard'], ['bruta', 'Prod. Bruta', 'package'],
              ['calendario', 'Calendário', 'list-todo'], ['ranking', 'Ranking', 'trophy'], ['analise', 'Análise', 'microscope'],
              ['comparacao', 'Comparação', 'columns-2'], ['simulador', 'Simulador', 'calculator']]) }] },
        { id: 'programacao', nome: 'Programação de Trabalho', descricao: 'Programação da semana, equipes e produtividade', icone: 'calendar-range', grupo: 'Operação', gradiente: 'from-amber-500 to-orange-600',
          cor: 'bg-amber-50 text-amber-700', caminho: 'projetos/programacao/index.html',
          areas: [{ modulo: 'programacao_semana', nome: 'Acesso à Programação', recursos: recursos('programacao', [
              ['visaogeral', 'Visão Geral', 'layout-dashboard'], ['programacao', 'Programação', 'clipboard-list'], ['equipes', 'Equipes', 'users-round'],
              ['produtividade', 'Produtividade', 'trending-up'], ['caixas', 'Caixas', 'package-check'],
              ['servicos', 'Serviços', 'wrench'], ['calendario', 'Calendário', 'calendar'], ['relatorios', 'Relatórios', 'bar-chart-3'], ['historico', 'Histórico', 'history']]) }] },
        { id: 'estoque', nome: 'Estoque de Produtos', descricao: 'Cadastro, lançamentos, compras, custos e inventário', icone: 'boxes', grupo: 'Operação', gradiente: 'from-emerald-600 to-green-800',
          cor: 'bg-emerald-50 text-emerald-700', caminho: 'projetos/estoque/index.html',
          areas: [{ modulo: 'estoque', nome: 'Acesso ao Estoque', recursos: recursos('estoque', [
              ['geral', 'Visão Geral', 'warehouse'],
              ['resumo', 'Resumo', 'layout-dashboard'], ['cadastro', 'Cadastro', 'package'], ['lancamentos', 'Lançamentos', 'arrow-left-right'],
              ['compras', 'Compras', 'shopping-cart'], ['custos', 'Custos', 'calculator'], ['inventario', 'Inventário', 'clipboard-list'],
              ['relatorio', 'Relatório', 'file-text'], ['fornecedores', 'Fornecedores', 'truck']]) }] },
        { id: 'checklist', nome: 'Check List', descricao: 'Veículos, embarque, limpeza e POP', icone: 'clipboard-check', grupo: 'Operação', gradiente: 'from-teal-500 to-emerald-700',
          cor: 'bg-teal-50 text-teal-700', caminho: 'projetos/checklist/index.html',
          areas: [{ modulo: 'checklist', nome: 'Acesso ao Check List', recursos: recursos('checklist', [
              ['geral', 'Geral', 'truck'], ['embarque', 'Embarque', 'ship'], ['limpeza', 'Limpeza', 'sparkles'], ['cronograma', 'Cronograma de Limpeza', 'calendar-check'],
              ['pop', 'POP', 'clipboard-check']]) },
              // Permissão extra, desligada por padrão: substitui a senha do dashboard do POP
              { modulo: 'pop_dashboard', nome: 'Dashboard do POP (gestão)', extra: true, requer: 'checklist', recursos: [] }] },
        { id: 'aplicacoes-fitossanitarias', nome: 'Aplicações Fitossanitárias', descricao: 'Defensivos, laboratório, adubação e dashboard', icone: 'spray-can', grupo: 'Operação', gradiente: 'from-green-500 to-emerald-700',
          cor: 'bg-green-50 text-green-700', caminho: 'projetos/aplicacoes-fitossanitarias/index.html',
          areas: [{ modulo: 'aplicacoes_fitossanitarias', nome: 'Acesso às Aplicações', recursos: recursos('aplicacoes', [['registro', 'Registro', 'clipboard-pen'], ['dashboard', 'Dashboard', 'layout-dashboard']]) }] },
        // Antigo "Registro de Descarte - SPG": grava no Supabase; a produção do parceiro ainda vem do Apps Script
        { id: 'descarte-parceiros', nome: 'Descarte de Parceiros', descricao: 'Descarte da colheita recebida dos parceiros, com o percentual sobre a produção', icone: 'trash-2', grupo: 'Operação', gradiente: 'from-rose-500 to-red-700',
          cor: 'bg-rose-50 text-rose-700', caminho: 'projetos/descarte-parceiros/index.html',
          areas: [{ modulo: 'descarte_parceiros', nome: 'Acesso ao Descarte de Parceiros', recursos: [] },
              // Permissão extra, desligada por padrão: editar/excluir qualquer descarte e as fotos (sem ela, só o que a pessoa registrou)
              { modulo: 'descarte_parceiros_editar', nome: 'Editar e excluir descartes', extra: true, requer: 'descarte_parceiros', recursos: [] }] },
        // Pesagem única (SPG Oásis e SPG Estufa): usa os acessos de Pesagem de cada Resumo da Colheita.
        // espelho: não aparece no Cadastro de Usuários (o acesso é dado nos dois Resumos da Colheita)
        { id: 'pesagem', nome: 'Pesagem', descricao: 'Pesagem da SPG Oásis, SPG Estufa e parceiros, direto para a Produtividade Packing', icone: 'scale', grupo: 'Operação', gradiente: 'from-orange-500 to-amber-600',
          cor: 'bg-orange-50 text-orange-700', caminho: 'projetos/pesagem/index.html', espelho: true,
          areas: [{ modulo: 'pesagem_oasis', nome: 'Pesagem SPG Oásis', recursos: [] }, { modulo: 'pesagem_estufa', nome: 'Pesagem SPG Estufa', recursos: [] }] },
        // Antigo app "produtividade-spg-packing" (tinha um Supabase próprio): entregas, processamento por colaborador e estoque
        { id: 'produtividade-packing', nome: 'Produtividade Packing', descricao: 'Entregas dos parceiros, processamento por colaborador, estoque e rastreio', icone: 'package-check', grupo: 'Operação', gradiente: 'from-emerald-500 to-teal-700',
          cor: 'bg-emerald-50 text-emerald-700', caminho: 'projetos/produtividade-packing/index.html',
          areas: [{ modulo: 'produtividade_packing', nome: 'Acesso à Produtividade Packing', recursos: [] }] },
        { id: 'organograma', nome: 'Organograma', descricao: 'Equipe, cargos, líderes, aniversários e tempo de casa', icone: 'network', grupo: 'Pessoas', gradiente: 'from-indigo-500 to-violet-700',
          cor: 'bg-indigo-50 text-indigo-700', caminho: 'projetos/organograma/index.html',
          areas: [{ modulo: 'organograma', nome: 'Acesso ao Organograma', recursos: [] },
              // Permissão extra, desligada por padrão: adicionar, editar e remover pessoas (substitui a senha antiga)
              { modulo: 'organograma_edicao', nome: 'Editar o organograma', extra: true, requer: 'organograma', recursos: [] }] },
        { id: 'online', nome: 'Usuários online', descricao: 'Quem está usando agora, em qual página e há quanto tempo', icone: 'radio', grupo: 'Administração', gradiente: 'from-emerald-500 to-teal-700',
          cor: 'bg-emerald-50 text-emerald-700', caminho: 'projetos/online/index.html', soAdmin: true, areas: [] },
        { id: 'culturas', nome: 'Culturas e variedades', descricao: 'Nomes usados nos lançamentos de cada local e unificação de duplicados', icone: 'sprout', grupo: 'Administração', gradiente: 'from-emerald-500 to-green-700',
          cor: 'bg-emerald-50 text-emerald-700', caminho: 'projetos/culturas/index.html', soAdmin: true, areas: [] },
        { id: 'notificacoes', nome: 'Notificações', descricao: 'Quais sites avisam os usuários no celular, horários e recados', icone: 'bell-ring', grupo: 'Administração', gradiente: 'from-amber-500 to-orange-600',
          cor: 'bg-amber-50 text-amber-700', caminho: 'projetos/notificacoes/index.html', soAdmin: true, areas: [] },
        { id: 'log', nome: 'Log de atividades', descricao: 'O que cada pessoa registrou, alterou ou excluiu em todos os projetos', icone: 'scroll-text', grupo: 'Administração', gradiente: 'from-slate-500 to-slate-700',
          cor: 'bg-slate-100 text-slate-700', caminho: 'projetos/log/index.html', soAdmin: true, areas: [] },
        { id: 'usuarios', nome: 'Cadastro de Usuários', descricao: 'Pessoas, locais e o que cada um pode acessar', icone: 'users', grupo: 'Administração', gradiente: 'from-slate-600 to-slate-800',
          cor: 'bg-slate-100 text-slate-700', caminho: 'projetos/usuarios/index.html', soAdmin: true, areas: [] }
    ];
    const MODULOS = PROJETOS.flatMap(p => p.areas.map(a => a.modulo));

    // ---- Menu organizado pelo administrador: ordem, nome e guia (grupo) de cada site ----
    // Fica em painel_config (chave 'menu') e vale para todos. É aplicado na própria lista
    // PROJETOS, então o menu lateral, os cartões do Início, a busca e o Cadastro de Usuários
    // seguem a mesma ordem e os mesmos nomes. Site novo que ainda não está na configuração
    // aparece no fim da guia dele. Guardado no aparelho para o menu já abrir organizado.
    const K_MENU = 'spg_menu_config';
    const MENU_PADRAO = PROJETOS.map(p => ({ id: p.id, nome: p.nome, grupo: p.grupo }));
    let menuAtual = null;
    function aplicarMenu(cfg) {
        const itens = cfg && Array.isArray(cfg.itens) ? cfg.itens : [];
        const posicao = new Map(itens.map((x, i) => [x.id, i]));
        const ordemPadrao = new Map(MENU_PADRAO.map((o, i) => [o.id, i]));
        MENU_PADRAO.forEach(o => {
            const p = PROJETOS.find(x => x.id === o.id);
            const c = itens.find(x => x.id === o.id) || {};
            p.nome = String(c.nome || '').trim() || o.nome;
            p.grupo = String(c.grupo || '').trim() || o.grupo;
        });
        const lugar = p => posicao.has(p.id) ? posicao.get(p.id) : 100000 + ordemPadrao.get(p.id);
        PROJETOS.sort((a, b) => lugar(a) - lugar(b));
        menuAtual = itens.length ? { itens } : null;
    }
    aplicarMenu(ler(K_MENU, null));
    // Busca a configuração no servidor; devolve true se mudou (a tela redesenha o menu)
    async function carregarMenu() {
        try {
            const { data, error } = await sb.from('painel_config').select('valor').eq('chave', 'menu').maybeSingle();
            if (error) return false;
            const novo = data && data.valor && Array.isArray(data.valor.itens) && data.valor.itens.length ? { itens: data.valor.itens } : null;
            if (JSON.stringify(novo) === JSON.stringify(menuAtual)) return false;
            gravar(K_MENU, novo);
            aplicarMenu(novo);
            return true;
        } catch (e) { return false; }
    }
    // Só o administrador (a regra do banco também confere). null = volta ao padrão.
    async function salvarMenu(cfg) {
        if (!navigator.onLine) throw new Error('Sem conexão. Organizar o menu precisa de internet.');
        const resp = cfg
            ? await sb.from('painel_config').upsert({ chave: 'menu', valor: cfg, atualizado_em: new Date().toISOString() }, { onConflict: 'chave' })
            : await sb.from('painel_config').delete().eq('chave', 'menu');
        if (resp.error) throw new Error(/painel_config/.test(resp.error.message || '') ? 'Rode o arquivo supabase/painel_config.sql no Supabase primeiro.' : resp.error.message);
        gravar(K_MENU, cfg);
        aplicarMenu(cfg);
    }
    const menuPadrao = () => MENU_PADRAO.map(o => ({ ...o }));

    function modulosDoUsuario(u) {
        u = u || usuarioAtual();
        if (!u) return [];
        if (u.papel === 'gestor' && u.administrador === true) return MODULOS.slice();
        return Array.isArray(u.modulos) ? u.modulos : ['irrigacao'];
    }
    function temModulo(id) { return modulosDoUsuario().includes(id); }
    function recursoLiberado(id, u) {
        u = u || usuarioAtual();
        if (!u) return false;
        if (u.papel === 'gestor' && u.administrador === true) return true;
        return !(Array.isArray(u.bloqueios) ? u.bloqueios : []).includes(id);
    }
    function areaLiberada(area, u) {
        if (area.requer && !modulosDoUsuario(u).includes(area.requer)) return false;
        return modulosDoUsuario(u).includes(area.modulo) && (!area.recursos.length || area.recursos.some(r => recursoLiberado(r.id, u)));
    }
    function projetosDoUsuario() {
        const u = usuarioAtual();
        if (!u) return [];
        const locais = locaisDoUsuario().map(l => l.id);
        return PROJETOS.filter(p => {
            if (p.soAdmin) return isAdmin();
            const doProjeto = locaisDoProjeto(p.id);
            // Área com menu: false (ex.: Pesagem dos Resumos da Colheita) não faz o projeto aparecer no menu
            return p.areas.some(a => a.menu !== false && areaLiberada(a, u)) && (!doProjeto || doProjeto.some(id => locais.includes(id)));
        });
    }

    async function salvarLocaisProjeto(id, locais) {
        if (!navigator.onLine) throw new Error("Sem conexão com a internet.");
        const resp = await sb.rpc('projetos_locais_salvar', { p_projeto: id, p_locais: locais });
        if (resp.error) throw erroSupabase(resp);
        await carregarLocais();
    }

    // false só quando o servidor confirma que não há sessão; na dúvida (rede ruim) mantém o usuário
    async function sessaoValida() {
        try {
            const { data, error } = await sb.auth.getSession();
            return !!(data && data.session) || !!error;
        } catch (e) { return true; }
    }

    async function logout() {
        await encerrarSessao();
        try { await sb.auth.signOut({ scope: 'local' }); } catch (e) {}
        localStorage.removeItem(K.usuario);
        sessaoExpirada = false;
        emitir();
    }

    // Atualiza papel/nome do usuário logado (pode ter sido alterado pelo gestor).
    // Devolve null se o acesso foi desativado (o perfil deixa de ser visível).
    async function atualizarPerfil() {
        const u = usuarioAtual();
        if (!u || !navigator.onLine) return u;
        const { data: sessao } = await sb.auth.getSession();
        if (!sessao.session) return u;
        const resp = await sb.from('perfis').select('*').eq('id', u.id).maybeSingle();
        if (resp.error) return u;
        if (!resp.data || !resp.data.ativo) {
            await logout();
            return null;
        }
        await carregarLocais().catch(() => {});
        gravar(K.usuario, resp.data);
        emitir();
        return resp.data;
    }

    // ------------------------------------------------------------
    // Fila de sincronização (offline)
    // ------------------------------------------------------------
    let sincronizando = false;
    let opEmAndamento = null;
    let timerSync = null;
    const ouvintes = [];

    function status() {
        const u = usuarioAtual();
        const fila = ler(K.fila, []);
        return {
            online: navigator.onLine,
            sincronizando,
            sessaoExpirada,
            pendentes: u ? fila.filter(op => op.usuarioId === u.id).length : fila.length,
            falhas: ler(K.falhas, []).length
        };
    }

    function onStatus(cb) { ouvintes.push(cb); cb(status()); }
    function emitir() { const s = status(); ouvintes.forEach(cb => { try { cb(s); } catch (e) {} }); }

    function enfileirar(tabela, tipo, dados) {
        const u = usuarioAtual();
        if (!u) throw new Error("Faça login para salvar.");
        const fila = ler(K.fila, []);

        // Novo item / gravação completa: fica no local em uso
        if (tipo === 'upsert' && TABELAS_LOCAL.includes(tabela) && !dados.local) {
            dados = Object.assign({}, dados, { local: localAtual() });
        }

        // Junta alterações seguidas do mesmo item que ainda não foram enviadas
        if (tipo === 'upsert') {
            const existente = fila.find(op => op.tabela === tabela && op.tipo === 'upsert' && op.usuarioId === u.id
                && op.dados.id === dados.id && op.opId !== opEmAndamento);
            if (existente) {
                existente.dados = Object.assign({}, existente.dados, dados);
                gravarFila(fila);
                return;
            }
        }

        fila.push({ opId: novoId(), usuarioId: u.id, tabela, tipo, dados, criadoEm: new Date().toISOString(), tentativas: 0 });
        gravarFila(fila);
    }

    function gravarFila(fila) {
        if (!gravar(K.fila, fila)) {
            const msg = "Não foi possível guardar o dado neste aparelho (armazenamento cheio). Libere espaço e registre de novo.";
            if (window.showAlert) window.showAlert("Erro ao salvar", msg); else if (window.Dialogo) Dialogo.avisar(msg, { tipo: "erro", titulo: "Erro ao salvar" }); else alert(msg);
        }
        emitir();
        agendarSync();
    }

    function pendentesDe(tabela) {
        const u = usuarioAtual();
        return ler(K.fila, []).filter(op => op.tabela === tabela && (!u || op.usuarioId === u.id));
    }

    // Aplica as gravações ainda não enviadas sobre uma lista vinda do servidor/cache
    // (só as do local em uso; a lista já vem filtrada pelo local)
    function mesclarPendentes(tabela, lista) {
        const porId = new Map((lista || []).map(item => [String(item.id), Object.assign({}, item)]));
        const local = localAtual();
        pendentesDe(tabela).forEach(op => {
            const id = String(op.dados.id);
            if (op.tipo === 'upsert' && TABELAS_LOCAL.includes(tabela) && (op.dados.local || LOCAL_PADRAO) !== local) return;
            if (op.tipo === 'upsert') porId.set(id, Object.assign({}, porId.get(id) || {}, op.dados, { _pendente: true }));
            else if (op.tipo === 'update' && porId.has(id)) porId.set(id, Object.assign({}, porId.get(id), op.dados.valores, { _pendente: true }));
            else if (op.tipo === 'delete') porId.delete(id);
        });
        return Array.from(porId.values());
    }

    function removerOp(opId) {
        gravar(K.fila, ler(K.fila, []).filter(op => op.opId !== opId));
    }

    function registrarFalha(op, erro) {
        const fila = ler(K.fila, []);
        const item = fila.find(o => o.opId === op.opId);
        if (!item) return;
        item.tentativas = (item.tentativas || 0) + 1;
        item.erro = erro.message;
        if (item.tentativas >= 3) {
            // Depois de 3 recusas do servidor, tira da fila para não travar o resto
            const falhas = ler(K.falhas, []);
            falhas.push(item);
            gravar(K.falhas, falhas);
            gravar(K.fila, fila.filter(o => o.opId !== op.opId));
            console.error("Gravação recusada pelo servidor:", item);
        } else {
            gravar(K.fila, fila);
        }
    }

    async function executar(op) {
        const montar = (dados, valores) => {
            if (op.tipo === 'upsert') return sb.from(op.tabela).upsert(dados, { onConflict: 'id' });
            if (op.tipo === 'update') return sb.from(op.tabela).update(valores).eq('id', op.dados.id);
            if (op.tipo === 'delete') return sb.from(op.tabela).delete().eq('id', op.dados.id);
            throw new Error("Operação desconhecida: " + op.tipo);
        };
        let resp = await montar(op.dados, op.dados.valores);
        // Banco ainda sem a coluna minutos_sistema (minutos_por_sistema.sql não rodado):
        // grava sem ela, o total de minutos continua indo
        if (resp.error && op.tabela === 'registros_irrigacao' && /minutos_sistema/.test(resp.error.message || '')) {
            const sem = o => { if (!o) return o; const { minutos_sistema, ...resto } = o; return resto; };
            resp = await montar(sem(op.dados), sem(op.dados.valores));
        }
        if (resp.error) throw erroSupabase(resp);
    }

    // Erros passageiros do servidor/rede: tenta de novo depois, sem contar como recusa
    function erroTemporario(status) {
        return !status || status === 408 || status === 425 || status === 429 || status >= 500;
    }

    function comLimite(promessa, ms) {
        let timer;
        return Promise.race([
            promessa,
            new Promise((_, rejeitar) => { timer = setTimeout(() => rejeitar(Object.assign(new Error("Tempo esgotado"), { status: 0 })), ms); })
        ]).finally(() => clearTimeout(timer));
    }

    let repetirSync = false;
    let promessaSync = null;

    // forcar = true (botão "Enviar dados"): tenta mesmo se o aparelho disser que está
    // offline, pois alguns celulares demoram a perceber que o Wi-Fi voltou.
    // Devolve o status ao terminar, para a tela mostrar o resultado.
    function sincronizar(forcar) {
        const u = usuarioAtual();
        if (sincronizando) { repetirSync = true; return promessaSync; } // roda de novo ao terminar (dados novos na fila)
        if (!u || (!navigator.onLine && forcar !== true)) { emitir(); return Promise.resolve(status()); }

        sincronizando = true;
        repetirSync = false;
        emitir();
        promessaSync = enviarFila(u).then(status);
        return promessaSync;
    }

    async function enviarFila(u) {
        try {
            // Depois de horas offline o token venceu e é renovado aqui; logo que o sinal
            // volta a renovação pode falhar por rede, o que não significa sessão expirada.
            const { data, error } = await comLimite(sb.auth.getSession(), LIMITE_REQUISICAO_MS + 15000);
            if (!data.session) {
                if (error && (error.name === 'AuthRetryableFetchError' || !error.status)) return;
                sessaoExpirada = true;
                return;
            }
            if (data.session.user.id !== u.id) {
                sessaoExpirada = true;
                return;
            }
            sessaoExpirada = false;

            const fila = ler(K.fila, []).filter(op => op.usuarioId === u.id);
            for (const op of fila) {
                opEmAndamento = op.opId;
                try {
                    // Relê a operação: pode ter sido mesclada com uma alteração mais nova
                    const atual = ler(K.fila, []).find(o => o.opId === op.opId);
                    if (!atual) continue;
                    await executar(atual);
                    removerOp(op.opId);
                } catch (e) {
                    if (erroTemporario(e.status)) break;                        // sem conexão / instabilidade: tenta depois
                    if (e.status === 401) { await comLimite(sb.auth.refreshSession(), LIMITE_REQUISICAO_MS + 15000).catch(() => {}); break; } // token vencido
                    registrarFalha(op, e);
                } finally {
                    opEmAndamento = null;
                    emitir();
                }
            }
        } catch (e) {
            console.error("Erro na sincronização:", e);
        } finally {
            sincronizando = false;
            emitir();
            if (repetirSync) { repetirSync = false; agendarSync(); }
        }
    }

    function agendarSync() {
        clearTimeout(timerSync);
        timerSync = setTimeout(sincronizar, 400);
    }

    window.addEventListener('online', () => { emitir(); sincronizar(); });
    window.addEventListener('offline', emitir);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sincronizar(); });
    setInterval(sincronizar, 60 * 1000);

    // ------------------------------------------------------------
    // Cache de consultas
    // ------------------------------------------------------------
    // Busca no servidor quando possível (respeitando o tempo de validade) e
    // guarda no aparelho; sem conexão, devolve a última cópia salva.
    async function buscarComCache(nome, consulta, validadeMs) {
        const cache = ler(K.cache(nome), null);
        if (cache && validadeMs && Date.now() - cache.em < validadeMs) return cache.dados;
        if (navigator.onLine && usuarioAtual()) {
            try {
                const resp = await consulta();
                if (resp.error) throw erroSupabase(resp);
                gravar(K.cache(nome), { em: Date.now(), dados: resp.data });
                return resp.data;
            } catch (e) {
                if (!cache) throw e;
                console.warn("Usando dados salvos no aparelho (" + nome + "):", e.message);
            }
        }
        if (cache) return cache.dados;
        throw new Error("Sem conexão e sem dados salvos no aparelho.");
    }

    // Aniversários do Organograma (alertas do Início): [{ id, nome, cargo, empresa, dia, mes }].
    // Qualquer pessoa ativa pode ver; guarda no aparelho por 6 h e funciona sem internet com a última cópia.
    async function aniversariosOrganograma(forcarAtualizacao) {
        return buscarComCache('aniversarios', () => sb.rpc('organograma_aniversarios'), forcarAtualizacao ? 0 : 6 * 3600 * 1000);
    }

    // Produção Estufa: colheitas, previsões e descartes da Estufa (mesmo formato do Apps Script antigo)
    function producaoEstufaPainel() {
        return buscarComCache('painel_producao_estufa', () => sb.rpc('producao_estufa_painel'), 0);
    }

    async function listarPerfis(forcarAtualizacao) {
        return buscarComCache('perfis',
            () => sb.from('perfis').select('*').order('nome'),
            forcarAtualizacao ? 0 : 10 * 60 * 1000);
    }

    // ------------------------------------------------------------
    // Gestão de usuários (somente gestor, precisa de internet)
    // ------------------------------------------------------------
    async function chamarFuncaoUsuarios(corpo) {
        if (!navigator.onLine) throw new Error("Sem conexão com a internet.");
        const { data, error } = await sb.functions.invoke('gerenciar-usuarios', { body: corpo });
        if (error) {
            let msg = error.message;
            try { const b = await error.context.json(); if (b && b.erro) msg = b.erro; } catch (e) {}
            if (/failed to send|failed to fetch|not found/i.test(msg)) {
                msg = "Não foi possível falar com o servidor. Confira se a função 'gerenciar-usuarios' foi publicada no Supabase.";
            }
            throw new Error(msg);
        }
        if (data && data.erro) throw new Error(data.erro);
        return data;
    }

    // E-mail de login de cada pessoa (somente o administrador recebe). Sem resposta, devolve vazio.
    async function listarEmailsUsuarios() {
        const resp = await sb.rpc('usuarios_emails');
        const emails = {};
        if (!resp.error && Array.isArray(resp.data)) resp.data.forEach(l => { emails[l.id] = l.email; });
        return emails;
    }

    async function atualizarUsuario(id, valores) {
        if (!navigator.onLine) throw new Error("Sem conexão com a internet.");
        const resp = await sb.from('perfis').update(valores).eq('id', id).select().maybeSingle();
        if (resp.error) throw erroSupabase(resp);
        if (!resp.data) throw new Error("Sem permissão para alterar este usuário.");
        if (id === (usuarioAtual() || {}).id) { gravar(K.usuario, resp.data); emitir(); }
        return resp.data;
    }

    // Cria o login e já ajusta nome, nome curto e papel do perfil
    async function criarUsuario(dados) {
        const r = await chamarFuncaoUsuarios({
            acao: 'criar',
            usuario: dados.usuario,
            senha: dados.senha,
            dominio: cfg.emailDominio || 'spgoasis.local'
        });
        const valores = { nome: dados.nome, nome_curto: dados.nome_curto || null, papel: dados.papel };
        if (Array.isArray(dados.locais) && dados.locais.length) valores.locais = dados.locais;
        if (Array.isArray(dados.modulos)) valores.modulos = dados.modulos;
        if (Array.isArray(dados.bloqueios)) valores.bloqueios = dados.bloqueios;
        await atualizarUsuario(r.id, valores);
        return r.id;
    }

    function redefinirSenha(id, senha) {
        return chamarFuncaoUsuarios({ acao: 'redefinir_senha', id, senha });
    }

    // ------------------------------------------------------------
    // Dados dos blocos (base do cálculo de litros) — edição só gestor, online
    // ------------------------------------------------------------
    function listarDadosBlocos(forcarAtualizacao) {
        return buscarComCache('dados_bloco',
            () => sb.from('dados_bloco').select('*').eq('local', localAtual()).order('id'),
            forcarAtualizacao ? 0 : 5 * 60 * 1000);
    }

    async function salvarDadoBloco(linha) {
        if (!navigator.onLine) throw new Error("Sem conexão. Alterar os dados dos blocos precisa de internet.");
        const { id, ...valores } = linha;
        const resp = id
            ? await sb.from('dados_bloco').update(valores).eq('id', id).select().maybeSingle()
            : await sb.from('dados_bloco').insert(Object.assign({ local: localAtual() }, valores)).select().maybeSingle();
        if (resp.error) throw erroSupabase(resp);
        if (!resp.data) throw new Error("Sem permissão para alterar os dados dos blocos.");
        localStorage.removeItem(K.cache('dados_bloco'));
        return resp.data;
    }

    async function excluirDadoBloco(id) {
        if (!navigator.onLine) throw new Error("Sem conexão. Alterar os dados dos blocos precisa de internet.");
        const resp = await sb.from('dados_bloco').delete().eq('id', id).select();
        if (resp.error) throw erroSupabase(resp);
        if (!resp.data || resp.data.length === 0) throw new Error("Sem permissão para excluir.");
        localStorage.removeItem(K.cache('dados_bloco'));
    }

    // Sistema atualizado com atraso: os registros do bloco desde "desde" passam a usar
    // o sistema atual (só gestor, precisa de internet). Devolve quantos registros mudaram.
    async function recalcularVolumeBloco(bloco, desde) {
        if (!navigator.onLine) throw new Error("Sem conexão. Corrigir o volume precisa de internet.");
        const resp = await sb.rpc('recalcular_volume_bloco', { p_local: localAtual(), p_bloco: limparNomeBloco(bloco), p_desde: desde });
        if (resp.error) {
            if (/recalcular_volume_bloco|could not find/i.test(resp.error.message)) {
                throw new Error("Rode o arquivo supabase/minutos_por_sistema.sql no SQL Editor do Supabase para ativar a correção.");
            }
            throw erroSupabase(resp);
        }
        // Gráficos e históricos buscam de novo com o volume corrigido
        Object.keys(localStorage).filter(k => /^irrigacao_cache_(registros_|dados_bloco_versoes_)/.test(k)).forEach(k => localStorage.removeItem(k));
        return Number(resp.data) || 0;
    }

    // Versões do sistema de um bloco (cópia gravada pelo banco a cada alteração), da mais antiga à mais nova.
    // A versão inicial (valido_desde null) é como o bloco estava quando o histórico começou.
    async function listarVersoesBloco(bloco) {
        const nome = limparNomeBloco(bloco);
        const lista = await buscarComCache(`dados_bloco_versoes_${nome}`,
            () => sb.from('dados_bloco_versoes').select('*').eq('local', localAtual()).eq('bloco', nome).limit(500), 0).catch(() => []);
        return lista.sort((a, b) => (a.valido_desde == null ? 0 : 1) - (b.valido_desde == null ? 0 : 1)
            || String(a.valido_desde || '').localeCompare(String(b.valido_desde || '')) || a.id - b.id);
    }

    // ------------------------------------------------------------
    // Cálculo de consumo (antigo calcularConsumo do Code.gs)
    // ------------------------------------------------------------
    async function calcularConsumo(registros, responsavel) {
        const dados = await listarDadosBlocos();
        const infoBlocos = {};

        // "yyyy-MM-dd" -> "dd/MM"
        function formatarData(iso) {
            if (!iso) return null;
            const [, m, d] = String(iso).split('-');
            return d + '/' + m;
        }

        let dataMaisRecente = null;
        let dataMaisRecenteIso = null;

        dados.forEach(linha => {
            const nomeBloco = limparNomeBloco(linha.bloco);
            if (!nomeBloco) return;

            const matchValvulas = String(linha.valvulas || "").match(/(\d+)/);
            let qtdValvulasLinha = matchValvulas ? parseInt(matchValvulas[1]) : 1;
            if (qtdValvulasLinha === 0) qtdValvulasLinha = 1;

            const tipoAspersor = String(linha.tipo_aspersor || "").trim();
            const matchVazao = tipoAspersor.match(/([\d.,]+)\s*L\/H/i);
            const vazaoLh = matchVazao ? parseFloat(matchVazao[1].replace(',', '.')) : 0;

            const qtdStringOriginal = String(linha.qtd_aspersores || "").trim();
            const qtdAspersoresLinha = parseFloat(qtdStringOriginal.replace(/\./g, '').replace(/,/g, '.')) || 0;

            const dataIso = linha.data_atualizacao;
            const dataFormatada = formatarData(dataIso);

            // Rastreia a data mais recente entre todos os blocos
            if (dataIso && (!dataMaisRecenteIso || dataIso > dataMaisRecenteIso)) {
                dataMaisRecenteIso = dataIso;
                dataMaisRecente = dataFormatada;
            }

            if (!infoBlocos[nomeBloco]) {
                infoBlocos[nomeBloco] = { vazaoTotalBlocoLh: 0, qtdTotalValvulasNoBloco: 0, qtdTotalAspersores: 0, detalhesAspersores: [], dataIso: null, dataAtualizacao: null, porSistema: {} };
            }
            const info = infoBlocos[nomeBloco];

            // Atualiza a data do bloco se esta linha for mais recente
            if (dataIso && (!info.dataIso || dataIso > info.dataIso)) {
                info.dataIso = dataIso;
                info.dataAtualizacao = dataFormatada;
            }

            info.vazaoTotalBlocoLh += qtdAspersoresLinha * vazaoLh;
            info.qtdTotalValvulasNoBloco += qtdValvulasLinha;
            // Por sistema (Fita Gotejo, MicroAspersor...): para os registros com minutos de cada sistema
            const tipo = tipoSistema(tipoAspersor);
            const sis = info.porSistema[tipo] = info.porSistema[tipo] || { vazaoLh: 0, valvulas: 0 };
            sis.vazaoLh += qtdAspersoresLinha * vazaoLh;
            sis.valvulas += qtdValvulasLinha;
            info.qtdTotalAspersores += qtdAspersoresLinha;

            const tipoFormatado = tipoAspersor
                .replace(/Microaspersor/gi, 'Aspersor')
                .replace(/Microaspesor/gi, 'Aspersor')
                .replace(/Micro/gi, '')
                .trim();

            if (tipoFormatado && qtdStringOriginal) {
                const qtdFormatada = qtdAspersoresLinha > 0
                    ? Math.round(qtdAspersoresLinha).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
                    : qtdStringOriginal;
                info.detalhesAspersores.push(tipoFormatado + " = " + qtdFormatada);
            }
        });

        const dataAtualizacaoFormatada = dataMaisRecente || "Não informada";

        // Vazão de uma válvula (L/h): soma das vazões / nº de válvulas
        const lhUmaValvula = x => x && x.valvulas > 0 ? x.vazaoLh / x.valvulas : 0;

        // Soma minutos e litros por bloco. Registro com minutos por válvula: cada parte usa a vazão
        // daquela válvula; por sistema: a do sistema; sem isso (ou não cadastrado), a vazão do bloco.
        const valvulas = valvulasDoBloco(dados);
        const tempoPorBloco = {};
        const litrosPorBloco = {};
        registros.forEach(rec => {
            const blocoApp = limparNomeBloco(rec.block);
            tempoPorBloco[blocoApp] = (tempoPorBloco[blocoApp] || 0) + (rec.minutes || 0);
            const infos = infoBlocos[blocoApp];
            if (!infos) return;
            const lhBloco = lhUmaValvula({ vazaoLh: infos.vazaoTotalBlocoLh, valvulas: infos.qtdTotalValvulasNoBloco });
            const sistemas = limparSistemas(rec.sistemas);
            const litros = sistemas
                ? sistemas.reduce((s, x) => {
                    const v = valvulaDoRegistro(valvulas[blocoApp], x);
                    const lh = v ? v.lh : infos.porSistema[x.tipo] ? lhUmaValvula(infos.porSistema[x.tipo]) : lhBloco;
                    return s + lh * x.minutos / 60;
                }, 0)
                : lhBloco * (rec.minutes || 0) / 60;
            litrosPorBloco[blocoApp] = (litrosPorBloco[blocoApp] || 0) + litros;
        });

        const textosResumo = [];
        let totalGeralLitros = 0;
        let totalBlocos = 0;
        let totalGeralMinutos = 0;
        const blocosEstruturado = {};

        for (const bloco in tempoPorBloco) {
            const minutos = tempoPorBloco[bloco];
            totalGeralMinutos += minutos;

            const hFormat = Math.floor(minutos / 60);
            const mFormat = minutos % 60;
            const tempoTexto = ((hFormat > 0 ? hFormat + "h " : "") + (mFormat > 0 || hFormat === 0 ? mFormat + "min" : "")).trim();

            const infos = infoBlocos[bloco];
            if (infos) {
                const litrosTotais = litrosPorBloco[bloco] || 0;
                totalGeralLitros += litrosTotais;
                totalBlocos++;

                const litrosMil = (litrosTotais / 1000).toFixed(3).replace('.', ',');

                const aspersoresTexto = infos.detalhesAspersores.map((detalhe, idx) => {
                    const txt = idx > 0 ? detalhe.replace(/Aspersor/gi, '').trim() : detalhe;
                    return "(" + txt + ")";
                }).join(" - ");

                blocosEstruturado[bloco] = {
                    litrosMil: litrosMil,
                    aspersoresTexto: aspersoresTexto,
                    totalAspersores: Math.round(infos.qtdTotalAspersores),
                    dataAtualizacao: infos.dataAtualizacao || dataAtualizacaoFormatada
                };

                textosResumo.push(
                    "• (Bloco " + bloco + ") - " + litrosMil + " mil litros (" + tempoTexto + ")\n\n" +
                    "   `" + aspersoresTexto + " - Atualizado: " + dataAtualizacaoFormatada + "`"
                );
            } else {
                blocosEstruturado[bloco] = null;
                textosResumo.push("• (Bloco " + bloco + ") - (Dados não encontrados na planilha)");
            }
        }

        const totalEmMilhares = (totalGeralLitros / 1000).toFixed(3).replace('.', ',');

        const hTotalFormat = Math.floor(totalGeralMinutos / 60);
        const mTotalFormat = totalGeralMinutos % 60;
        const tempoTotalTexto = ((hTotalFormat > 0 ? hTotalFormat + "h " : "") +
            (mTotalFormat > 0 || hTotalFormat === 0 ? mTotalFormat + "min" : "")).trim() +
            " - (" + totalGeralMinutos + " minutos)";

        // Fora da Oásis, o relatório diz de qual local é
        const doLocal = localAtual() === LOCAL_PADRAO ? "" : " - " + nomeLocal();
        let textoFinal = "`Relatório de Irrigação" + doLocal + " (" + hojeGmt3().br + ")`\n\n";
        textoFinal += textosResumo.join("\n\n");
        textoFinal += "\n\n\n *RESUMO GERAL*\n";
        textoFinal += "• Volume Total: " + totalEmMilhares + " mil Litros\n";
        textoFinal += "• Tempo Total: " + tempoTotalTexto + "\n";
        textoFinal += "• Blocos Irrigados: " + totalBlocos + "\n\n";
        textoFinal += "*Responsável:* " + responsavel;

        return {
            resumoTexto: textoFinal,
            blocos: blocosEstruturado,
            totalLitrosMil: totalEmMilhares,
            dataAtualizacao: dataAtualizacaoFormatada
        };
    }

    // ------------------------------------------------------------
    // Programação semanal
    // ------------------------------------------------------------
    function linhaProgramacao(item, responsavel) {
        return {
            id: String(item.id),
            data_envio: hojeGmt3().iso,
            dia: item.dia || "",
            bloco: limparNomeBloco(item.block),
            minutos: Number(item.minutes) || 0,
            turno: item.turno || "",
            observacao: item.observation || "",
            responsavel: responsavel,
            excluido_em: null
        };
    }

    // Grava os itens enviados no relatório, com os litros estimados rateados
    // proporcionalmente ao tempo de cada item dentro do bloco.
    function salvarProgramacao(itens, responsavel, blocosInfo) {
        const minutosPorBloco = {};
        itens.forEach(item => {
            const bloco = limparNomeBloco(item.block);
            minutosPorBloco[bloco] = (minutosPorBloco[bloco] || 0) + (Number(item.minutes) || 0);
        });

        itens.forEach(item => {
            const linha = linhaProgramacao(item, responsavel);
            const info = blocosInfo ? blocosInfo[linha.bloco] : null;

            linha.tipo_aspersor = info && info.aspersoresTexto ? info.aspersoresTexto : null;
            linha.qtd_aspersores = info && info.totalAspersores ? info.totalAspersores : null;
            linha.litros_estimados = null;
            if (info && info.litrosMil) {
                const litrosMilBloco = parseFloat(String(info.litrosMil).replace(",", "."));
                const totalBlocoMin = minutosPorBloco[linha.bloco] || 0;
                linha.litros_estimados = totalBlocoMin > 0
                    ? Number((litrosMilBloco * linha.minutos / totalBlocoMin).toFixed(3))
                    : litrosMilBloco;
            }
            enfileirar('programacoes', 'upsert', linha);
        });
    }

    // Grava na hora um item adicionado/editado na programação
    function salvarProgramacaoItem(item, responsavel) {
        enfileirar('programacoes', 'upsert', linhaProgramacao(item, responsavel));
    }

    // Exclusão lógica: some da programação atual, mas continua no histórico
    function excluirProgramacaoItem(id) {
        enfileirar('programacoes', 'update', { id: String(id), valores: { excluido_em: new Date().toISOString() } });
    }

    // Equivale ao doPost do Apps Script: calcula o consumo e, se vierem itens
    // de programação, grava-os (pela fila, funciona offline).
    async function enviar(payload) {
        try {
            const registros = payload.registros || [];
            const responsavel = payload.responsavel || "Não informado";

            const resultado = await calcularConsumo(registros, responsavel);

            if (payload.programacao && payload.programacao.length > 0) {
                salvarProgramacao(payload.programacao, responsavel, resultado.blocos);
            }

            return {
                sucesso: true,
                resumo: resultado.resumoTexto,
                blocos: resultado.blocos,
                totalLitrosMil: resultado.totalLitrosMil,
                dataAtualizacao: resultado.dataAtualizacao
            };
        } catch (erro) {
            return { sucesso: false, erro: erro.message };
        }
    }

    // Equivale ao doGet?action=historico (precisa de internet)
    async function historico() {
        try {
            if (!navigator.onLine) throw new Error("Sem conexão com a internet.");
            await sincronizar();
            const resp = await sb.from('programacoes').select('*').eq('local', localAtual()).order('created_at', { ascending: false }).limit(2000);
            if (resp.error) throw erroSupabase(resp);
            const dados = resp.data.reverse(); // ordem de inserção

            // Agrupa por dia de envio + responsável (vários lotes no mesmo dia viram um item só)
            const grupos = {};
            const ordem = [];
            dados.forEach(linha => {
                const dataEnvio = isoParaBr(linha.data_envio);
                if (!dataEnvio) return;

                const chave = dataEnvio + "|" + (linha.responsavel || "");
                if (!grupos[chave]) {
                    grupos[chave] = { dataEnvio: dataEnvio, responsavel: linha.responsavel || "", itens: [] };
                    ordem.push(chave);
                }
                grupos[chave].itens.push({
                    dia: linha.dia || "",
                    block: linha.bloco || "",
                    tipoAspersor: linha.tipo_aspersor || "",
                    qtdAspersores: linha.qtd_aspersores || "",
                    minutes: Number(linha.minutos) || 0,
                    turno: linha.turno || "",
                    litrosEstimados: linha.litros_estimados != null
                        ? Number(linha.litros_estimados).toFixed(3).replace('.', ',')
                        : "",
                    observation: linha.observacao || ""
                });
            });

            // Mais recentes primeiro, limitado aos últimos 20 envios
            const resultado = ordem.reverse().map(chave => grupos[chave]).slice(0, 20);
            return { sucesso: true, historico: resultado };
        } catch (erro) {
            return { sucesso: false, erro: erro.message };
        }
    }

    // Equivale ao doGet?action=programacaoAtual
    async function programacaoAtual() {
        try {
            await sincronizar();
            // Ignora excluídos e linhas antigas migradas da planilha sem ID ("legado-")
            const linhas = await buscarComCache('programacoes', () => sb.from('programacoes')
                .select('id,dia,bloco,minutos,turno,observacao,responsavel,excluido_em,created_at').eq('local', localAtual())
                .is('excluido_em', null)
                .not('id', 'like', 'legado-%')
                .order('created_at', { ascending: true }), 0);

            const programacao = mesclarPendentes('programacoes', linhas)
                .filter(linha => !linha.excluido_em)
                .map(linha => ({
                    id: /^\d+$/.test(linha.id) ? Number(linha.id) : linha.id,
                    dia: linha.dia || "",
                    block: linha.bloco || "",
                    minutes: Number(linha.minutos) || 0,
                    turno: linha.turno || "",
                    observation: linha.observacao || "",
                    responsavel: linha.responsavel || ""
                }));
            return { sucesso: true, programacao: programacao };
        } catch (erro) {
            return { sucesso: false, erro: erro.message };
        }
    }

    // ------------------------------------------------------------
    // Registros diários de irrigação
    // ------------------------------------------------------------
    // O id local (Date.now()) ganha o prefixo do usuário para nunca colidir
    // com registros de outro aparelho.
    function idRegistro(localId) {
        const u = usuarioAtual();
        return (u ? u.id.slice(0, 8) : 'anon') + '-' + localId;
    }

    function salvarRegistro(rec) {
        enfileirar('registros_irrigacao', 'upsert', {
            id: idRegistro(rec.id),
            data: rec.date,
            bloco: limparNomeBloco(rec.block),
            minutos: Number(rec.minutes) || 0,
            minutos_sistema: limparSistemas(rec.sistemas),
            turno: rec.turno || "",
            observacao: rec.observation || "",
            responsavel: nomeUsuario(),
            registrado_em: rec.registradoEm || new Date().toISOString()
        });
    }

    function excluirRegistro(localId) {
        enfileirar('registros_irrigacao', 'delete', { id: idRegistro(localId) });
    }

    // Gestor corrigindo o registro de outro irrigador (pelo id do banco).
    // O responsável continua sendo quem irrigou; o log guarda quem alterou.
    function atualizarRegistroEquipe(id, rec) {
        enfileirar('registros_irrigacao', 'update', { id: String(id), valores: {
            data: rec.date,
            bloco: limparNomeBloco(rec.block),
            minutos: Number(rec.minutes) || 0,
            minutos_sistema: limparSistemas(rec.sistemas),
            turno: rec.turno || "",
            observacao: rec.observation || ""
        } });
    }

    function excluirRegistroEquipe(id) {
        enfileirar('registros_irrigacao', 'delete', { id: String(id) });
    }

    function salvarMotor(data, ligado, desligado) {
        const u = usuarioAtual();
        if (!u || !data) return;
        enfileirar('motor_diario', 'upsert', {
            id: u.id + '_' + data + sufixoLocal().replace('@', '_'),
            data: data,
            responsavel: nomeUsuario(),
            motor_ligado: ligado || null,
            motor_desligado: desligado || null
        });
    }

    // Log de cada relatório enviado (tipo: 'irrigacao' | 'programacao')
    function registrarEnvio(envio) {
        enfileirar('envios_relatorio', 'upsert', Object.assign({
            id: novoId(),
            responsavel: nomeUsuario(),
            registrado_em: new Date().toISOString()
        }, envio));
    }

    // ------------------------------------------------------------
    // Poços e reservatórios
    // ------------------------------------------------------------
    function ordenarPorNumero(a, b) {
        return String(a.numero || a.nome || '').localeCompare(String(b.numero || b.nome || ''), undefined, { numeric: true });
    }

    async function listarPocos() {
        const lista = await buscarComCache('pocos', () => sb.from('pocos').select('*').eq('local', localAtual()), 0).catch(() => []);
        return mesclarPendentes('pocos', lista).sort(ordenarPorNumero);
    }

    function salvarPoco(poco) {
        const linha = Object.assign({ id: novoId(), ativo: true }, poco);
        enfileirar('pocos', 'upsert', linha);
        return linha;
    }

    async function listarLeiturasPocos() {
        const lista = await buscarComCache('leituras_poco', () => sb.from('leituras_poco')
            .select('*').eq('local', localAtual()).order('data_hora', { ascending: false }).limit(500), 0).catch(() => []);
        return mesclarPendentes('leituras_poco', lista).sort((a, b) => String(b.data_hora).localeCompare(String(a.data_hora)));
    }

    // Histórico completo de um poço (para o PDF da ficha), da leitura mais recente para a mais antiga
    async function listarLeiturasDoPoco(pocoId) {
        const lista = await buscarComCache(`leituras_poco_${pocoId}`, () => sb.from('leituras_poco')
            .select('*').eq('local', localAtual()).eq('poco_id', pocoId).order('data_hora', { ascending: false }).limit(5000), 0).catch(() => []);
        return mesclarPendentes('leituras_poco', lista).filter(l => l.poco_id === pocoId)
            .sort((a, b) => String(b.data_hora).localeCompare(String(a.data_hora)));
    }

    function salvarLeituraPoco(leitura) {
        enfileirar('leituras_poco', 'upsert', Object.assign({ id: novoId(), responsavel: nomeUsuario() }, leitura));
    }

    // Corrige uma leitura já registrada (o dono ou o gestor); quem registrou continua o mesmo
    function atualizarLeituraPoco(id, valores) {
        enfileirar('leituras_poco', 'update', { id: String(id), valores });
    }

    function excluirLeituraPoco(id) {
        enfileirar('leituras_poco', 'delete', { id });
    }

    async function listarReservatorios() {
        const lista = await buscarComCache('reservatorios', () => sb.from('reservatorios').select('*').eq('local', localAtual()), 0).catch(() => []);
        return mesclarPendentes('reservatorios', lista).sort(ordenarPorNumero);
    }

    function salvarReservatorio(reservatorio) {
        const linha = Object.assign({ id: novoId(), ativo: true }, reservatorio);
        enfileirar('reservatorios', 'upsert', linha);
        return linha;
    }

    // Manutenções dos poços (qualquer usuário registra; funciona offline)
    async function listarManutencoes() {
        const lista = await buscarComCache('manutencoes_poco', () => sb.from('manutencoes_poco')
            .select('*').eq('local', localAtual()).order('data', { ascending: false }).limit(1000), 0).catch(() => []);
        return mesclarPendentes('manutencoes_poco', lista)
            .sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
    }

    function salvarManutencao(manutencao) {
        enfileirar('manutencoes_poco', 'upsert', Object.assign({ id: novoId(), responsavel: nomeUsuario() }, manutencao));
    }

    function excluirManutencao(id) {
        enfileirar('manutencoes_poco', 'delete', { id });
    }

    // Exclui um poço ou reservatório (somente gestor, precisa de internet).
    // Se já tiver leituras, o banco recusa (erro 23503) para preservar o histórico.
    async function excluirCadastro(tabela, id) {
        if (!navigator.onLine) throw new Error("Sem conexão. Excluir cadastros precisa de internet.");
        await sincronizar(); // envia antes o que estiver na fila (ex.: o próprio cadastro recém-criado)
        const resp = await sb.from(tabela).delete().eq('id', id).select();
        if (resp.error) {
            const e = erroSupabase(resp);
            if (e.code === '23503') e.message = 'possui leituras registradas';
            throw e;
        }
        if (!resp.data || resp.data.length === 0) throw new Error("Sem permissão para excluir (ou já foi excluído).");
        localStorage.removeItem(K.cache(tabela));
    }

    async function listarLeiturasReservatorios() {
        const lista = await buscarComCache('leituras_reservatorio', () => sb.from('leituras_reservatorio')
            .select('*').eq('local', localAtual()).order('data_hora', { ascending: false }).limit(500), 0).catch(() => []);
        return mesclarPendentes('leituras_reservatorio', lista).sort((a, b) => String(b.data_hora).localeCompare(String(a.data_hora)));
    }

    // Leituras de reservatório no período (dias no horário local do aparelho)
    async function listarLeiturasReservPeriodo(de, ate) {
        const inicio = new Date(de + 'T00:00:00');
        const fim = new Date(new Date(ate + 'T00:00:00').getTime() + 24 * 3600 * 1000);
        const lista = await buscarComCache(`leituras_reserv_${de}_${ate}`, () => sb.from('leituras_reservatorio').select('*').eq('local', localAtual())
            .gte('data_hora', inicio.toISOString()).lt('data_hora', fim.toISOString()).limit(5000), 0).catch(() => []);
        return mesclarPendentes('leituras_reservatorio', lista)
            .filter(l => { const t = new Date(l.data_hora); return t >= inicio && t < fim; })
            .sort((a, b) => String(b.data_hora).localeCompare(String(a.data_hora)));
    }

    function salvarLeituraReservatorio(leitura) {
        enfileirar('leituras_reservatorio', 'upsert', Object.assign({ id: novoId(), responsavel: nomeUsuario() }, leitura));
    }

    // Corrige uma leitura já registrada (o dono ou o gestor); quem registrou continua o mesmo
    function atualizarLeituraReservatorio(id, valores) {
        enfileirar('leituras_reservatorio', 'update', { id: String(id), valores });
    }

    function excluirLeituraReservatorio(id) {
        enfileirar('leituras_reservatorio', 'delete', { id });
    }

    // ------------------------------------------------------------
    // Balanço de água: horas ligado, configurações e registros do dia
    // ------------------------------------------------------------
    async function lerConfiguracao(chave, padrao) {
        try {
            const lista = await buscarComCache('configuracoes', () => sb.from('configuracoes').select('chave,valor').eq('local', localAtual()), 10 * 60 * 1000);
            const item = (lista || []).find(c => c.chave === idComLocal(chave));
            return item ? item.valor : padrao;
        } catch (e) {
            return padrao;
        }
    }

    // Somente gestor, precisa de internet
    async function salvarConfiguracao(chave, valor) {
        if (!navigator.onLine) throw new Error("Sem conexão. Alterar configurações precisa de internet.");
        const resp = await sb.from('configuracoes').upsert({ chave: idComLocal(chave), valor, local: localAtual() }, { onConflict: 'chave' }).select().maybeSingle();
        if (resp.error) throw erroSupabase(resp);
        if (!resp.data) throw new Error("Sem permissão para alterar configurações.");
        localStorage.removeItem(K.cache('configuracoes'));
    }

    // Horas ligado por poço/dia no período (datas yyyy-MM-dd, inclusivas)
    async function listarHorasPocoPeriodo(de, ate) {
        const lista = await buscarComCache(`horas_poco_${de}_${ate}`,
            () => sb.from('horas_poco_dia').select('*').eq('local', localAtual()).gte('data', de).lte('data', ate), 0).catch(() => []);
        return mesclarPendentes('horas_poco_dia', lista).filter(h => h.data >= de && h.data <= ate);
    }

    // Leituras de poço no período (dias no horário local do aparelho)
    async function listarLeiturasPocoPeriodo(de, ate) {
        const inicio = new Date(de + 'T00:00:00');
        const fim = new Date(new Date(ate + 'T00:00:00').getTime() + 24 * 3600 * 1000);
        const lista = await buscarComCache(`leituras_poco_${de}_${ate}`, () => sb.from('leituras_poco').select('*').eq('local', localAtual())
            .gte('data_hora', inicio.toISOString()).lt('data_hora', fim.toISOString()).limit(5000), 0).catch(() => []);
        return mesclarPendentes('leituras_poco', lista)
            .filter(l => { const t = new Date(l.data_hora); return t >= inicio && t < fim; });
    }

    // Cultura e sub nome de cada bloco (legenda do gráfico de saída, nomes dos blocos)
    async function listarCulturas() {
        const lista = await buscarComCache('culturas_bloco', () => sb.from('culturas_bloco').select('*').eq('local', localAtual()), 10 * 60 * 1000).catch(() => []);
        return lista.map(c => Object.assign({}, c, { id: idSemLocal(c.id) }));
    }

    // Sub nome do bloco (ex.: Tâmaras). Somente gestor, precisa de internet
    async function salvarApelidoBloco(bloco, apelido) {
        if (!navigator.onLine) throw new Error("Sem conexão. Alterar o sub nome precisa de internet.");
        const resp = await sb.from('culturas_bloco').upsert({ id: idComLocal(bloco), apelido: apelido || null, local: localAtual() }, { onConflict: 'id' }).select().maybeSingle();
        if (resp.error) throw erroSupabase(resp);
        if (!resp.data) throw new Error("Sem permissão para alterar o sub nome.");
        localStorage.removeItem(K.cache('culturas_bloco'));
    }

    // Somente gestor, precisa de internet
    async function salvarCultura(bloco, cultura) {
        if (!navigator.onLine) throw new Error("Sem conexão. Alterar a cultura precisa de internet.");
        const resp = await sb.from('culturas_bloco').upsert({ id: idComLocal(bloco), cultura: cultura || null, local: localAtual() }, { onConflict: 'id' }).select().maybeSingle();
        if (resp.error) throw erroSupabase(resp);
        if (!resp.data) throw new Error("Sem permissão para alterar a cultura.");
        localStorage.removeItem(K.cache('culturas_bloco'));
    }

    function salvarHorasPoco(pocoId, data, horas) {
        enfileirar('horas_poco_dia', 'upsert', { id: pocoId + '_' + data, poco_id: pocoId, data, horas });
    }

    // Registros de irrigação do período, de todos os irrigadores (saída de água).
    // litros_por_min é a vazão do bloco no dia do registro (congelada no banco).
    // Turno, responsável e hora vão junto para o detalhe ao tocar na coluna do bloco.
    async function listarRegistrosPeriodo(de, ate) {
        const consulta = campos => sb.from('registros_irrigacao').select(campos).eq('local', localAtual()).gte('data', de).lte('data', ate).limit(10000);
        const campos = 'id,data,bloco,minutos,turno,observacao,responsavel,registrado_em';
        const lista = await buscarComCache(`registros_${de}_${ate}`, async () => {
            let resp = await consulta(campos + ',litros_por_min,minutos_sistema');
            // Banco ainda sem as colunas (minutos_por_sistema.sql / volume_historico.sql não rodados)
            if (resp.error) resp = await consulta(campos + ',litros_por_min');
            return resp.error ? consulta(campos) : resp;
        }, 0).catch(() => []);
        return mesclarPendentes('registros_irrigacao', lista).filter(r => r.data >= de && r.data <= ate);
    }

    // Registros de irrigação de um bloco só (histórico do bloco). Com período, todos os do
    // período; sem período, só os mais recentes (o suficiente para os últimos dias irrigados).
    async function listarRegistrosBloco(bloco, de, ate) {
        const nome = limparNomeBloco(bloco);
        // "6" e "06" são o mesmo bloco
        const nomes = [...new Set([nome, /^\d$/.test(nome) ? '0' + nome : nome])];
        const consulta = campos => {
            let q = sb.from('registros_irrigacao').select(campos).eq('local', localAtual()).in('bloco', nomes).order('data', { ascending: false });
            if (de) q = q.gte('data', de);
            if (ate) q = q.lte('data', ate);
            return q.limit(de ? 2000 : 60);
        };
        const lista = await buscarComCache(`registros_bloco_${nome}_${de || ''}_${ate || ''}`, async () => {
            const resp = await consulta('id,data,bloco,minutos,litros_por_min');
            // Banco ainda sem a coluna (volume_historico.sql não rodado)
            return resp.error ? consulta('id,data,bloco,minutos') : resp;
        }, 0).catch(() => []);
        return mesclarPendentes('registros_irrigacao', lista)
            .filter(r => limparNomeBloco(r.bloco) === nome && (!de || r.data >= de) && (!ate || r.data <= ate));
    }

    // ------------------------------------------------------------
    // Tempo real: registros de irrigação dos outros irrigadores
    // ------------------------------------------------------------
    const CAMPOS_REGISTRO_EQUIPE = 'id,data,bloco,minutos,turno,observacao,responsavel,registrado_em,criado_por';

    // Busca com os minutos de cada sistema; banco ainda sem a coluna: busca sem ela
    async function comMinutosSistema(consulta) {
        const resp = await consulta(CAMPOS_REGISTRO_EQUIPE + ',minutos_sistema');
        return resp.error ? consulta(CAMPOS_REGISTRO_EQUIPE) : resp;
    }

    // Registros do dia feitos por outros usuários (sem conexão, usa a última cópia salva)
    async function listarRegistrosEquipe(data) {
        const u = usuarioAtual();
        const prefixo = u ? u.id.slice(0, 8) + '-' : null;
        const lista = await buscarComCache(`registros_equipe_${data}`,
            () => comMinutosSistema(c => sb.from('registros_irrigacao').select(c).eq('local', localAtual()).eq('data', data).limit(2000)), 0).catch(() => []);
        // Aplica as correções do gestor ainda na fila; tira os do próprio usuário
        return mesclarPendentes('registros_irrigacao', lista)
            .filter(r => r.data === data && (!u || (r.criado_por !== u.id && !String(r.id).startsWith(prefixo))));
    }

    // Registros do dia lançados pelo próprio usuário (de qualquer aparelho), com o id usado
    // na lista do aparelho (idLocal). Servem para refazer a lista se o aparelho a perdeu.
    async function listarMeusRegistros(data) {
        const u = usuarioAtual();
        if (!u) return [];
        const prefixo = u.id.slice(0, 8) + '-';
        const lista = await buscarComCache(`registros_meus_${data}`,
            () => comMinutosSistema(c => sb.from('registros_irrigacao').select(c).eq('local', localAtual()).eq('data', data).like('id', prefixo + '%').limit(500)), 0).catch(() => []);
        // Aplica a fila: exclusões ainda não enviadas não voltam para a lista
        return mesclarPendentes('registros_irrigacao', lista)
            .filter(r => r.data === data && String(r.id).startsWith(prefixo) && /^\d+$/.test(String(r.id).slice(prefixo.length)))
            .map(r => Object.assign({}, r, { idLocal: Number(String(r.id).slice(prefixo.length)) }));
    }

    // Todos os registros de um dia (de todos os irrigadores, inclusive os do próprio
    // usuário), com as alterações ainda na fila já aplicadas. Usado ao consultar dias anteriores.
    async function listarRegistrosDia(data) {
        const lista = await buscarComCache(`registros_dia_${data}`,
            () => comMinutosSistema(c => sb.from('registros_irrigacao').select(c).eq('local', localAtual()).eq('data', data).limit(2000)), 0).catch(() => []);
        return mesclarPendentes('registros_irrigacao', lista).filter(r => r.data === data);
    }

    let canalRegistros = null;

    // Avisa a cada registro de irrigação criado, alterado ou excluído.
    // cb({ tipo: 'INSERT'|'UPDATE'|'DELETE', registro, id, proprio, idLocal })
    // "proprio" = registro do usuário logado (ex.: restaurado ou alterado pelo gestor);
    // nesse caso "idLocal" é o id usado na lista do aparelho.
    function assinarRegistros(cb) {
        if (canalRegistros) sb.removeChannel(canalRegistros);
        canalRegistros = sb.channel('registros-irrigacao')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'registros_irrigacao' }, payload => {
                const u = usuarioAtual();
                const registro = payload.new && payload.new.id ? payload.new : null;
                if (registro && (registro.local || LOCAL_PADRAO) !== localAtual()) return;
                const id = String((registro || payload.old || {}).id || '');
                const prefixo = u ? u.id.slice(0, 8) + '-' : null;
                const proprio = !!prefixo && id.startsWith(prefixo);
                // Eco de uma gravação deste aparelho ainda em andamento: ignora
                if (proprio && pendentesDe('registros_irrigacao').some(op => String(op.dados.id) === id)) return;
                const idLocal = proprio && /^\d+$/.test(id.slice(prefixo.length)) ? Number(id.slice(prefixo.length)) : null;
                cb({ tipo: payload.eventType, registro, id, proprio, idLocal });
            })
            .subscribe();
    }

    function cancelarAssinaturaRegistros() {
        if (canalRegistros) sb.removeChannel(canalRegistros);
        canalRegistros = null;
        cancelarAssinaturaAgua();
    }

    // Tempo real da aba Água: leituras de poço, níveis de reservatório e manutenções.
    // cb({ tabela, tipo: 'INSERT'|'UPDATE'|'DELETE', registro, proprio })
    let canalAgua = null;

    function assinarAgua(cb) {
        cancelarAssinaturaAgua();
        let canal = sb.channel('agua');
        ['leituras_poco', 'leituras_reservatorio', 'manutencoes_poco'].forEach(tabela => {
            canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: tabela }, payload => {
                const u = usuarioAtual();
                const registro = payload.new && payload.new.id ? payload.new : null;
                if (registro && (registro.local || LOCAL_PADRAO) !== localAtual()) return;
                cb({ tabela, tipo: payload.eventType, registro, proprio: !!(registro && u && registro.criado_por === u.id) });
            });
        });
        canalAgua = canal.subscribe();
    }

    function cancelarAssinaturaAgua() {
        if (canalAgua) sb.removeChannel(canalAgua);
        canalAgua = null;
    }

    // ------------------------------------------------------------
    // "Atualizar para todos" (supabase/forcar_atualizacao.sql)
    // ------------------------------------------------------------
    // Número da versão publicada pelo gestor (null = sem internet ou tabela ainda não criada)
    async function versaoForcada() {
        if (!navigator.onLine) return null;
        try {
            const resp = await sb.from('app_versao').select('versao,publicado_por_nome').eq('id', 1).maybeSingle();
            if (resp.error || !resp.data) return null;
            return { versao: Number(resp.data.versao), nome: resp.data.publicado_por_nome || '' };
        } catch (e) {
            return null;
        }
    }

    // Somente gestor: todos os aparelhos recarregam o app
    async function forcarAtualizacaoTodos() {
        if (!navigator.onLine) throw new Error("Sem conexão. Atualizar para todos precisa de internet.");
        const resp = await sb.rpc('forcar_atualizacao');
        if (resp.error) {
            const e = erroSupabase(resp);
            if (/forcar_atualizacao|app_versao|schema cache/i.test(e.message)) {
                e.message = "Rode o arquivo supabase/forcar_atualizacao.sql no Supabase para usar esta opção.";
            }
            throw e;
        }
        return Number(resp.data);
    }

    // cb(versao, nome de quem publicou) quando o gestor publica uma nova versão
    let canalVersao = null;
    function assinarVersaoApp(cb) {
        if (canalVersao) sb.removeChannel(canalVersao);
        canalVersao = sb.channel('app-versao')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'app_versao' }, payload => {
                if (payload.new && payload.new.versao != null) cb(Number(payload.new.versao), payload.new.publicado_por_nome || '');
            })
            .subscribe();
    }

    // ------------------------------------------------------------
    // Atualizar todos os aparelhos: vale em qualquer tela do Painel.
    // Roda só na janela principal (o Painel, ou o projeto aberto sozinho);
    // os projetos abertos dentro do Painel recarregam junto com ele.
    // ------------------------------------------------------------
    const CHAVE_VERSAO_FORCADA = 'irrigacao_versao_forcada';   // nome antigo mantido: os aparelhos já guardam este número
    let atualizandoApp = false;
    let avisoAtualizacao = null;

    function mostrarAvisoAtualizacao(texto) {
        if (!avisoAtualizacao) {
            avisoAtualizacao = document.createElement('div');
            avisoAtualizacao.setAttribute('role', 'alert');
            avisoAtualizacao.style.cssText = 'position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(15,23,42,.72);font-family:inherit;';
            avisoAtualizacao.innerHTML = '<style>@keyframes spgGira{to{transform:rotate(360deg)}}</style>' +
                '<div style="background:#fff;border-radius:20px;padding:28px 24px;max-width:340px;width:100%;text-align:center;box-shadow:0 25px 50px -12px rgba(0,0,0,.35)">' +
                '<div style="width:44px;height:44px;margin:0 auto 14px;border:4px solid #d1fae5;border-top-color:#059669;border-radius:50%;animation:spgGira .9s linear infinite"></div>' +
                '<p data-texto style="margin:0;font-size:15px;font-weight:700;color:#1e293b;white-space:pre-line;line-height:1.45"></p></div>';
            document.body.appendChild(avisoAtualizacao);
        }
        avisoAtualizacao.querySelector('[data-texto]').textContent = texto;
    }
    function esconderAvisoAtualizacao() { if (avisoAtualizacao) { avisoAtualizacao.remove(); avisoAtualizacao = null; } }
    function guardarVersaoVista(v) { try { localStorage.setItem(CHAVE_VERSAO_FORCADA, String(v)); } catch (e) { /* segue */ } }

    // Baixa a versão nova, envia o que está pendente, limpa o cache e recarrega.
    // Devolve false sem internet: nada é apagado.
    async function atualizarAplicativo(texto) {
        mostrarAvisoAtualizacao(texto || 'Atualizando o aplicativo...');
        const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration().catch(() => null) : null;
        try {
            if (reg) await reg.update(); else await fetch(location.href, { cache: 'no-store' });
        } catch (e) {
            esconderAvisoAtualizacao();
            return false;
        }
        await sincronizar(true).catch(() => {});
        try {
            if (window.caches) await Promise.all((await caches.keys()).map(k => caches.delete(k)));
            if (reg) await reg.unregister();
        } catch (e) { console.warn('Erro ao limpar o cache:', e); }
        location.reload();
        return true;
    }

    // Somente o administrador: publica a versão nova e já atualiza este aparelho
    async function atualizarTodosAparelhos() {
        const versao = await forcarAtualizacaoTodos();
        guardarVersaoVista(versao);   // este aparelho não recarrega duas vezes
        atualizandoApp = true;
        const recarregou = await atualizarAplicativo('Atualizando o aplicativo...');
        if (!recarregou) atualizandoApp = false;
        return { versao, recarregou };
    }

    // Recebeu um número de versão (ao abrir, em tempo real ou ao voltar para o app)
    function aplicarVersaoForcada(versao, quem) {
        if (versao == null || isNaN(versao) || atualizandoApp) return;
        let vista = null;
        try { vista = localStorage.getItem(CHAVE_VERSAO_FORCADA); } catch (e) { /* segue */ }
        // Primeira vez neste aparelho: já abriu na versão atual, só guarda o número
        if (vista === null || isNaN(Number(vista))) { guardarVersaoVista(versao); return; }
        if (versao <= Number(vista)) return;
        atualizandoApp = true;
        let segundos = 5;
        const contar = () => mostrarAvisoAtualizacao(`${quem || 'O administrador'} publicou uma nova versão do aplicativo.\nAtualizando em ${segundos}s...`);
        contar();
        const timer = setInterval(async () => {
            segundos--;
            if (segundos > 0) { contar(); return; }
            clearInterval(timer);
            guardarVersaoVista(versao);
            if (!(await atualizarAplicativo('Atualizando o aplicativo...'))) {
                // Sem internet agora: tenta de novo quando conectar
                guardarVersaoVista(vista);
                atualizandoApp = false;
            }
        }, 1000);
    }

    async function conferirVersaoForcada() {
        if (!usuarioAtual() || atualizandoApp) return;
        const v = await versaoForcada();
        if (v) aplicarVersaoForcada(v.versao, v.nome);
    }

    let janelaPrincipal = false;
    try { janelaPrincipal = window.top === window.self; } catch (e) { janelaPrincipal = false; }
    if (janelaPrincipal) {
        setTimeout(() => { assinarVersaoApp(aplicarVersaoForcada); conferirVersaoForcada(); }, 0);
        sb.auth.onAuthStateChange(evento => { if (evento === 'SIGNED_IN') setTimeout(conferirVersaoForcada, 0); });
        // Reserva do tempo real: confere ao voltar para o app, ao voltar a internet e a cada 5 minutos
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') conferirVersaoForcada(); });
        window.addEventListener('online', () => { if (usuarioAtual()) { assinarVersaoApp(aplicarVersaoForcada); conferirVersaoForcada(); } });
        setInterval(() => { if (document.visibilityState === 'visible') conferirVersaoForcada(); }, 5 * 60 * 1000);
    }

    // ------------------------------------------------------------
    // Log de auditoria (somente gestor, precisa de internet)
    // ------------------------------------------------------------
    async function listarAuditoria(limite) {
        if (!navigator.onLine) throw new Error("Sem conexão com a internet.");
        const resp = await sb.from('auditoria').select('*').or('local.is.null,local.eq.' + localAtual()).order('criado_em', { ascending: false }).limit(limite || 100);
        if (resp.error) throw erroSupabase(resp);
        return resp.data;
    }

    // Log de um período (ex.: um dia), mais novo primeiro. Somente gestor, precisa de internet.
    async function listarAuditoriaPeriodo(inicioIso, fimIso) {
        if (!navigator.onLine) throw new Error("Sem conexão com a internet.");
        const resp = await sb.from('auditoria').select('*').or('local.is.null,local.eq.' + localAtual()).gte('criado_em', inicioIso).lt('criado_em', fimIso)
            .order('criado_em', { ascending: false }).limit(2000);
        if (resp.error) throw erroSupabase(resp);
        return resp.data;
    }

    // Log de todos os projetos e locais num período (tela Log de atividades do Painel).
    // O banco só devolve o que a pessoa pode ver (locais a que tem acesso). Precisa de internet.
    async function listarAuditoriaGeral(inicioIso, fimIso) {
        if (!navigator.onLine) throw new Error("Sem conexão com a internet.");
        const resp = await sb.from('auditoria').select('*').gte('criado_em', inicioIso).lt('criado_em', fimIso)
            .order('criado_em', { ascending: false }).limit(3000);
        if (resp.error) throw erroSupabase(resp);
        return resp.data;
    }

    // Backup: volta o item ao valor que tinha antes da ação registrada no log
    // (ou desfaz um registro novo). Somente gestor, precisa de internet.
    async function restaurarAuditoria(idAuditoria) {
        if (!navigator.onLine) throw new Error("Sem conexão com a internet.");
        await sincronizar(); // envia antes o que estiver na fila, para não sobrescrever depois
        const resp = await sb.rpc('restaurar_auditoria', { p_id: idAuditoria });
        if (resp.error) {
            if (/function .*restaurar_auditoria|could not find/i.test(resp.error.message)) {
                throw new Error("Rode o arquivo supabase/backup.sql no SQL Editor do Supabase para ativar a restauração.");
            }
            throw erroSupabase(resp);
        }
        // Os dados mudaram no banco: descarta as cópias salvas no aparelho
        Object.keys(localStorage).filter(k => k.startsWith('irrigacao_cache_') && k !== 'irrigacao_cache_perfis')
            .forEach(k => localStorage.removeItem(k));
        return resp.data;
    }

    // ------------------------------------------------------------
    // Sessões: quem está online e o que fez em cada sessão
    // ------------------------------------------------------------
    let sessaoId = null;
    let sessaoAba = '';
    let timerSinal = null;

    function descreverDispositivo() {
        const ua = navigator.userAgent || '';
        const so = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iPhone/iPad'
                 : /Windows/i.test(ua) ? 'Windows' : /Macintosh|Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Outro';
        const nav = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/i.test(ua) ? 'Samsung Internet' : /Chrome\//.test(ua) ? 'Chrome'
                  : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
        const app = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches ? ' (app instalado)' : '';
        return `${so}${nav ? ' · ' + nav : ''}${app}`;
    }

    // Versão do app instalada neste aparelho (nome do cache do service worker, ex.: "v72")
    async function versaoAppInstalada() {
        try {
            const k = (await caches.keys()).find(c => c.startsWith('sistema-'));
            return k ? k.replace('sistema-', '') : null;
        } catch (e) { return null; }
    }

    // IP, provedor e cidade da conexão (serviços gratuitos de geolocalização por IP).
    // Guardado por 15 min para não consultar a cada sinal; trocar de rede atualiza depois disso.
    const K_REDE = 'irrigacao_rede_atual';
    const REDE_VALIDADE_MS = 15 * 60 * 1000;
    let consultandoRede = null;

    async function buscarJson(url) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        try {
            const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
            return r.ok ? await r.json() : null;
        } finally { clearTimeout(t); }
    }

    async function consultarRede() {
        try {
            const a = await buscarJson('https://ipwho.is/?fields=success,ip,city,region_code,region,country_code,connection');
            if (a && a.success !== false && a.ip) {
                const uf = a.country_code === 'BR' ? (a.region_code || a.region) : (a.region || a.country_code);
                return { ip: a.ip, provedor: (a.connection && (a.connection.isp || a.connection.org)) || null,
                         cidade: [a.city, uf].filter(Boolean).join(' - ') || null };
            }
        } catch (e) {}
        try {
            const b = await buscarJson('https://ipapi.co/json/');
            if (b && !b.error && b.ip) {
                const uf = b.country_code === 'BR' ? b.region_code : (b.region || b.country_code);
                return { ip: b.ip, provedor: (b.org || '').replace(/^AS\d+\s*/, '') || null,
                         cidade: [b.city, uf].filter(Boolean).join(' - ') || null };
            }
        } catch (e) {}
        return null;
    }

    async function redeAtual() {
        const salvo = ler(K_REDE, null);
        if (salvo && Date.now() - salvo.em < REDE_VALIDADE_MS) return salvo.dados;
        if (!consultandoRede) {
            consultandoRede = consultarRede().then(dados => {
                if (dados) gravar(K_REDE, { em: Date.now(), dados });
                return dados || (salvo && salvo.dados) || null;
            }).finally(() => { consultandoRede = null; });
        }
        return consultandoRede;
    }

    // Trocou de rede (Wi-Fi ↔ dados móveis): consulta de novo no próximo sinal
    window.addEventListener('online', () => localStorage.removeItem(K_REDE));
    try {
        const conexao = navigator.connection;
        if (conexao && conexao.addEventListener) conexao.addEventListener('change', () => localStorage.removeItem(K_REDE));
    } catch (e) {}

    let sessaoComRede = true;

    // Envia o "estou online". Sem internet ou sem sessão válida, simplesmente não envia.
    async function enviarSinal() {
        const u = usuarioAtual();
        if (!u || !sessaoId || !navigator.onLine || document.visibilityState === 'hidden') return;
        lembrarSessao();
        try {
            const { data } = await sb.auth.getSession();
            if (!data.session) return;
            const linha = {
                id: sessaoId, usuario_id: u.id, usuario_nome: nomeUsuario(u),
                ultimo_sinal: new Date().toISOString(), dispositivo: descreverDispositivo(), aba: sessaoAba, fim: null
            };
            if (sessaoComLocal) linha.local = localAtual();
            if (sessaoComRede) {
                const [versao, rede] = await Promise.all([versaoAppInstalada(), redeAtual().catch(() => null)]);
                if (versao) linha.versao_app = versao;
                if (rede) Object.assign(linha, { ip: rede.ip, provedor: rede.provedor, cidade: rede.cidade });
            }
            let resp = await sb.from('sessoes').upsert(linha, { onConflict: 'id' });
            // Banco ainda sem as colunas novas (sessoes_rede.sql não rodado): manda sem elas
            if (resp.error && sessaoComRede && /versao_app|provedor|cidade|\bip\b/i.test(resp.error.message || '')) {
                sessaoComRede = false;
                ['versao_app', 'ip', 'provedor', 'cidade'].forEach(c => delete linha[c]);
                resp = await sb.from('sessoes').upsert(linha, { onConflict: 'id' });
            }
            // Banco ainda sem a coluna "local" (schema.sql não rodado): continua mandando o sinal sem ela
            if (resp.error && sessaoComLocal && /local/i.test(resp.error.message || '')) {
                sessaoComLocal = false;
                delete linha.local;
                await sb.from('sessoes').upsert(linha, { onConflict: 'id' });
            }
        } catch (e) { /* sinal é opcional: nunca atrapalha o uso do app */ }
    }

    // Sessão guardada no aparelho: recarregar a página (ou reabrir o app logo em
    // seguida) continua a mesma sessão, em vez de aparecer como uma conexão nova
    const SESSAO_REUSO_MS = 5 * 60 * 1000;
    const K_SESSAO = 'irrigacao_sessao_atual';
    let sessaoComLocal = true;

    function lembrarSessao() {
        const u = usuarioAtual();
        if (u && sessaoId) gravar(K_SESSAO, { id: sessaoId, usuarioId: u.id, local: localAtual(), em: Date.now() });
    }

    // ---------- Em qual página a pessoa está ----------
    // A sessão é da janela principal (o Painel, ou o projeto aberto sozinho).
    // Os projetos abertos dentro do Painel só contam a ela onde a pessoa está.
    function janelaDeCima() {
        try { return window.top !== window.self && window.top.IrrigacaoAPI ? window.top.IrrigacaoAPI : null; } catch (e) { return null; }
    }
    let paginaProjeto = '';
    let paginaSecao = '';
    const NOMES_SECAO = { lancamentos: 'Lançar', campo: 'Campo', colheita: 'Colheita', pesagem: 'Pesagem', agua: 'Água', graficos: 'Gráficos', cadastros: 'Cadastros', registro: 'Registro', programacao: 'Programação' };

    function projetoDestaPagina() {
        const caminho = decodeURIComponent(location.pathname);
        return PROJETOS.find(p => caminho.includes('/' + p.caminho.replace(/index\.html$/, ''))) || null;
    }
    function rotuloSecao(projeto, id) {
        if (!id) return '';
        const recurso = projeto && projeto.areas.flatMap(a => a.recursos).find(r => r.id.split('.').pop() === id);
        return recurso ? recurso.nome : (NOMES_SECAO[id] || String(id).charAt(0).toUpperCase() + String(id).slice(1));
    }
    // projeto: nome do projeto ("" = Painel); secao: nome da aba aberta
    function informarPagina(projeto, secao) {
        const cima = janelaDeCima();
        if (cima && cima.informarPagina) { cima.informarPagina(projeto, secao); return; }
        paginaProjeto = projeto || '';
        paginaSecao = secao || '';
        const nova = [paginaProjeto || 'Início do Painel', paginaSecao].filter(Boolean).join(' › ');
        if (nova === sessaoAba) return;
        sessaoAba = nova;
        enviarSinal();
    }
    function informarSecao(id) {
        const p = projetoDestaPagina();
        informarPagina(p ? p.nome : '', rotuloSecao(p, id));
    }

    // Abre uma sessão (ao entrar no app ou fazer login), reaproveitando a anterior se ainda estiver valendo
    // (trocar de local abre uma sessão nova, para cada local ter o seu tempo de uso)
    function iniciarSessao(aba) {
        if (janelaDeCima()) { if (aba) informarSecao(aba); return; }   // dentro do Painel: a sessão é dele
        if (aba) { const p = projetoDestaPagina(); paginaProjeto = p ? p.nome : paginaProjeto; paginaSecao = rotuloSecao(p, aba); }
        const u = usuarioAtual();
        const anterior = ler(K_SESSAO, null);
        sessaoId = anterior && u && anterior.usuarioId === u.id && (anterior.local || LOCAL_PADRAO) === localAtual()
            && Date.now() - anterior.em < SESSAO_REUSO_MS
            ? anterior.id : novoId();
        lembrarSessao();
        sessaoAba = [paginaProjeto || 'Início do Painel', paginaSecao].filter(Boolean).join(' › ');
        clearInterval(timerSinal);
        timerSinal = setInterval(enviarSinal, 60 * 1000);
        enviarSinal();
    }

    function informarAbaSessao(aba) { informarSecao(aba); }

    async function encerrarSessao() {
        const cima = janelaDeCima();
        if (cima && cima.encerrarSessao) { await cima.encerrarSessao(); return; }
        clearInterval(timerSinal);
        if (sessaoId && navigator.onLine) {
            try { await sb.from('sessoes').update({ fim: new Date().toISOString() }).eq('id', sessaoId); } catch (e) {}
        }
        localStorage.removeItem(K_SESSAO);
        sessaoId = null;
    }

    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') enviarSinal(); });
    window.addEventListener('online', enviarSinal);
    window.addEventListener('pagehide', lembrarSessao);

    // Todo o Painel conta como online (antes só a Irrigação): a janela principal abre a sessão
    // ao carregar com alguém logado e a cada login
    if (janelaPrincipal) {
        if (usuarioAtual()) setTimeout(() => { if (!sessaoId && usuarioAtual()) iniciarSessao(); }, 0);
        sb.auth.onAuthStateChange(evento => { if (evento === 'SIGNED_IN') setTimeout(() => { if (!sessaoId && usuarioAtual()) iniciarSessao(); }, 0); });
        // Painel voltando ao início (#/): a pessoa saiu do projeto
        window.addEventListener('hashchange', () => { if (!projetoDestaPagina() && /^#?\/?$/.test(location.hash)) informarPagina('', ''); });
    }
    // Cada página conta onde está: o projeto ao abrir e a aba ao trocar
    // O nome do site dado em "Organizar menu" também vale na própria página: o título ao lado
    // da logo (o <h1> que mostra o nome padrão do site) e o título da aba do navegador.
    // Ex.: "Produção Oásis" renomeado para "Produção Brócolis" aparece assim no topo da página.
    function aplicarNomeNaPagina() {
        const p = projetoDestaPagina();
        if (!p) return;
        const padrao = (MENU_PADRAO.find(o => o.id === p.id) || {}).nome;
        if (!padrao) return;
        document.querySelectorAll('h1').forEach(h => {
            if (!h.dataset.nomeSite && h.textContent.trim() === padrao) h.dataset.nomeSite = padrao;
            if (h.dataset.nomeSite && h.textContent !== p.nome) h.textContent = p.nome;
        });
        const raiz = document.documentElement;
        if (raiz.dataset.tituloPadrao === undefined) raiz.dataset.tituloPadrao = document.title;
        const titulo = raiz.dataset.tituloPadrao;
        if (titulo.includes(padrao)) document.title = titulo.replace(padrao, p.nome);
    }
    // O Painel salvou uma organização nova: as páginas abertas (abas do Painel) já trocam o nome
    window.addEventListener('storage', e => {
        if (e.key !== K_MENU) return;
        aplicarMenu(ler(K_MENU, null));
        aplicarNomeNaPagina();
    });
    function acompanharPagina() {
        aplicarNomeNaPagina();
        // Página aberta direto (fora do Painel): confere se o nome mudou em outro aparelho
        if (janelaPrincipal && projetoDestaPagina()) carregarMenu().then(mudou => { if (mudou) aplicarNomeNaPagina(); });
        const p = projetoDestaPagina();
        if (p) informarPagina(p.nome, ''); else if (!janelaDeCima()) informarPagina('', '');
        ['switchTab', 'switchDashboardView', 'switchMainTab'].forEach(nome => {
            const original = window[nome];
            if (typeof original !== 'function' || original.__comSessao) return;
            const comSessao = function () {
                const r = original.apply(this, arguments);
                const aba = arguments[0];
                if (typeof aba === 'string') setTimeout(() => informarSecao(aba), 0);
                return r;
            };
            comSessao.__comSessao = true;
            window[nome] = comSessao;
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(acompanharPagina, 0));
    else setTimeout(acompanharPagina, 0);

    // Sessões com sinal a partir de "desde" e, se informado, iniciadas antes de "ate"
    // (somente gestor, precisa de internet)
    async function listarSessoes(desdeIso, ateIso) {
        if (!navigator.onLine) throw new Error("Sem conexão com a internet.");
        let consulta = sb.from('sessoes').select('*').gte('ultimo_sinal', desdeIso);
        if (ateIso) consulta = consulta.lt('inicio', ateIso);
        const resp = await consulta.order('ultimo_sinal', { ascending: false }).limit(500);
        if (resp.error) throw erroSupabase(resp);
        return resp.data;
    }

    // Quem registrou/alterou algo no período, com a quantidade: [{ id, nome, qtd }] (somente gestor)
    async function autoresAuditoriaPeriodo(inicioIso, fimIso) {
        if (!navigator.onLine) throw new Error("Sem conexão com a internet.");
        const resp = await sb.from('auditoria').select('usuario_id,usuario_nome').or('local.is.null,local.eq.' + localAtual())
            .gte('criado_em', inicioIso).lt('criado_em', fimIso).not('usuario_id', 'is', null).limit(5000);
        if (resp.error) throw erroSupabase(resp);
        const porUsuario = {};
        resp.data.forEach(l => {
            const a = porUsuario[l.usuario_id] = porUsuario[l.usuario_id] || { id: l.usuario_id, nome: l.usuario_nome || '', qtd: 0 };
            a.qtd++;
            if (!a.nome && l.usuario_nome) a.nome = l.usuario_nome;
        });
        return Object.values(porUsuario);
    }

    // Tudo o que o usuário registrou/alterou entre o início e o fim da sessão
    async function atividadesDaSessao(usuarioId, inicioIso, fimIso) {
        if (!navigator.onLine) throw new Error("Sem conexão com a internet.");
        const resp = await sb.from('auditoria').select('*').or('local.is.null,local.eq.' + localAtual()).eq('usuario_id', usuarioId)
            .gte('criado_em', inicioIso).lte('criado_em', fimIso)
            .order('criado_em', { ascending: false }).limit(300);
        if (resp.error) throw erroSupabase(resp);
        return resp.data;
    }

    function falhasSync() { return ler(K.falhas, []); }
    function limparFalhasSync() { gravar(K.falhas, []); emitir(); }

    // Devolve as gravações recusadas para o início da fila (são mais antigas que as pendentes)
    function reenviarFalhas() {
        const falhas = ler(K.falhas, []).map(f => Object.assign({}, f, { tentativas: 0 }));
        if (falhas.length === 0) return;
        if (!gravar(K.fila, falhas.concat(ler(K.fila, [])))) return;
        gravar(K.falhas, []);
        emitir();
        agendarSync();
    }

    // ------------------------------------------------------------
    // Resumo da Colheita. Mesmo formato de resposta do antigo Apps Script.
    // ------------------------------------------------------------
    async function rpcColheita(funcao, argumentos) {
        const resp = await sb.rpc(funcao, argumentos);
        if (resp.error) throw erroSupabase(resp);
        return resp.data;
    }
    const colheita = {
        historico: local => rpcColheita('colheita_historico', { p_local: local }),
        blocosPlantas: local => rpcColheita('colheita_blocos_plantas', { p_local: local }),
        pendentes: local => rpcColheita('colheita_pendentes', { p_local: local }),
        // Painel de produtividade; sem internet, mostra a última cópia guardada no aparelho
        painel: local => buscarComCache('painel_' + local, () => sb.rpc('colheita_painel', { p_local: local }), 0),
        syncSalvar: (local, chave, atualizadoEm, dados) => rpcColheita('colheita_sync_salvar',
            { p_local: local, p_chave: chave, p_atualizado_em: atualizadoEm, p_dados: dados }),
        async syncLer(local, chaves) {
            const resp = await sb.from('colheita_sync').select('chave,atualizado_em,atualizado_por,dados').eq('local', local).in('chave', chaves);
            if (resp.error) throw erroSupabase(resp);
            const saida = {};
            chaves.forEach(k => { saida[k] = null; });
            resp.data.forEach(l => { saida[l.chave] = { updatedAt: Number(l.atualizado_em), updatedBy: l.atualizado_por || '', data: l.dados }; });
            return saida;
        }
    };

    // ------------------------------------------------------------
    // Lançamentos de Colheita, Previsão e Descarte. Gravam na fila offline.
    // ------------------------------------------------------------
    const TIPOS_LANCAMENTO = {
        colheita: { tabela: 'colheita_entregas', data: 'data_entrega' },
        previsao: { tabela: 'colheita_previsao', data: 'inicio_colheita', aceitaSemData: true },
        descarte: { tabela: 'colheita_descartes', data: 'data_descarte' }
    };
    const lancamentos = {
        async listar(local, tipo, de, ate) {
            const t = TIPOS_LANCAMENTO[tipo];
            const dados = await buscarComCache('lanc_' + local + '_' + tipo + '_' + de + '_' + ate, () => {
                let q = sb.from(t.tabela).select('*').eq('local', local);
                q = t.aceitaSemData
                    ? q.or(`${t.data}.is.null,and(${t.data}.gte.${de},${t.data}.lte.${ate})`)
                    : q.gte(t.data, de).lte(t.data, ate);
                return q.order(t.data, { ascending: false, nullsFirst: false }).order('linha', { ascending: false }).limit(1000);
            }, 0);
            return mesclarPendentes(t.tabela, dados)
                .filter(r => r[t.data] ? (r[t.data] >= de && r[t.data] <= ate) : !!t.aceitaSemData)
                .sort((a, b) => String(b[t.data] || '').localeCompare(String(a[t.data] || '')) || (b._pendente ? 1 : 0) - (a._pendente ? 1 : 0) || (b.linha || 0) - (a.linha || 0));
        },
        opcoes: local => buscarComCache('lanc_opcoes_' + local, () => sb.rpc('colheita_opcoes', { p_local: local }), 0),
        salvar(local, tipo, registro) { enfileirar(TIPOS_LANCAMENTO[tipo].tabela, 'upsert', Object.assign({}, registro, { local })); },
        excluir(tipo, id) { enfileirar(TIPOS_LANCAMENTO[tipo].tabela, 'delete', { id }); }
    };

    window.IrrigacaoAPI = {
        // login
        login, logout, usuarioAtual, isGestor, isAdmin, nomeUsuario, atualizarPerfil, listarPerfis, aniversariosOrganograma, producaoEstufaPainel, sessaoValida,
        // cliente do banco e fila offline, para os projetos com backend próprio (respeitam as regras de acesso)
        cliente: sb, enfileirar,
        // projetos e módulos
        PROJETOS, MODULOS, modulosDoUsuario, temModulo, recursoLiberado, areaLiberada, projetosDoUsuario,
        // menu organizado (ordem, nome e guia de cada site)
        carregarMenu, salvarMenu, menuPadrao,
        // resumo da colheita
        colheita, lancamentos, novoId,
        // locais (fazendas)
        localAtual, nomeLocal, locaisPermitidos, locaisDoProjeto, salvarLocaisProjeto, todosLocais, trocarLocal, chaveLocal, carregarLocais, salvarLocal,
        // gestão de usuários
        criarUsuario, atualizarUsuario, redefinirSenha, listarEmailsUsuarios,
        // sincronização
        sincronizar, onStatus, status, falhasSync, limparFalhasSync, reenviarFalhas,
        // irrigação e programação
        enviar, historico, programacaoAtual, listarVersoesBloco, listarRegistrosBloco, salvarProgramacaoItem, excluirProgramacaoItem,
        salvarRegistro, excluirRegistro, atualizarRegistroEquipe, excluirRegistroEquipe, salvarMotor, registrarEnvio,
        // dados dos blocos
        limparNomeBloco, tipoSistema, ordemSistema, valvulasDoBloco, valvulaDoRegistro, listarDadosBlocos, salvarDadoBloco, excluirDadoBloco, recalcularVolumeBloco,
        // água
        listarPocos, salvarPoco, listarLeiturasPocos, listarLeiturasDoPoco, salvarLeituraPoco, atualizarLeituraPoco, excluirLeituraPoco,
        listarReservatorios, salvarReservatorio, listarLeiturasReservatorios, listarLeiturasReservPeriodo, salvarLeituraReservatorio, atualizarLeituraReservatorio, excluirLeituraReservatorio,
        excluirCadastro, listarManutencoes, salvarManutencao, excluirManutencao,
        // balanço de água
        lerConfiguracao, salvarConfiguracao, listarHorasPocoPeriodo, salvarHorasPoco, listarRegistrosPeriodo, listarLeiturasPocoPeriodo,
        listarCulturas, salvarCultura, salvarApelidoBloco,
        // tempo real (registros dos outros irrigadores)
        listarRegistrosEquipe, listarMeusRegistros, listarRegistrosDia, assinarRegistros, cancelarAssinaturaRegistros, assinarAgua,
        // atualizar o app de todos
        versaoForcada, forcarAtualizacaoTodos, assinarVersaoApp, atualizarAplicativo, atualizarTodosAparelhos, informarPagina, encerrarSessao,
        // auditoria e sessões
        listarAuditoria, listarAuditoriaPeriodo, listarAuditoriaGeral, restaurarAuditoria, iniciarSessao, informarAbaSessao, encerrarSessao, listarSessoes, atividadesDaSessao, autoresAuditoriaPeriodo
    };
})();
