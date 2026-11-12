// Backend da Programação de Trabalho no Supabase.
// Atende as chamadas do index no mesmo formato que o antigo Apps Script ({ status, rows }).
// Qualquer falha é lançada como exceção: várias telas só percebem erro assim.
(function () {
    'use strict';

    const API = window.IrrigacaoAPI;
    const sb = API.cliente;
    const LIMITE = 1000;

    const texto = v => (v === null || v === undefined) ? '' : String(v);
    const ouVazio = v => texto(v || '');
    const dataBr = iso => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const inicioDia = d => `${d}T00:00:00-03:00`;
    const fimDia = d => `${d}T23:59:59.999-03:00`;
    const resposta = corpo => ({ ok: true, status: 200, json: async () => corpo, text: async () => JSON.stringify(corpo) });
    const sucesso = extra => resposta(Object.assign({ status: 'sucesso' }, extra));

    function conferir(res) {
        if (res.error) throw new Error(res.error.message || 'Erro ao falar com o servidor.');
        return res.data;
    }

    // O servidor devolve no máximo 1000 linhas por consulta
    async function buscarTudo(montar) {
        const saida = [];
        for (let de = 0; ; de += LIMITE) {
            const parte = conferir(await montar().range(de, de + LIMITE - 1));
            saida.push(...parte);
            if (parte.length < LIMITE) return saida;
        }
    }

    function porRegistro(tabela, inicio, fim) {
        return buscarTudo(() => {
            let q = sb.from(tabela).select('*');
            if (inicio) q = q.gte('registrado_em', inicioDia(inicio));
            if (fim) q = q.lte('registrado_em', fimDia(fim));
            return q.order('id');
        });
    }

    const horas = r => ({ horaInicio: r.hora_inicio, horaSaidaAlmoco: r.hora_saida_almoco, horaVoltaAlmoco: r.hora_volta_almoco, horaSaida: r.hora_saida });

    function paraProgramacao(r, setor) {
        const linha = Object.assign({
            rowNumber: r.id, dataRegistro: dataBr(r.registrado_em), semana: r.semana, local: r.setor, programador: r.programador,
            operador: r.operador, diaSemana: r.dia_semana, blocos: r.blocos, tempo: r.tempo, combustivel: r.combustivel, operacoes: r.operacoes,
            status: r.status || 'Em Andamento', realizado: r.realizado, estimativa: r.estimativa, quantidade: r.quantidade,
            meta: r.meta || '', percentual: r.percentual === undefined ? null : r.percentual
        }, horas(r));
        if (setor === 'Insumos') Object.assign(linha, { categoria: r.categoria, produto: r.produto, alvo: r.alvo });
        if (setor === 'SPG Packing') linha.processaCaixas = r.processa_caixas;
        return linha;
    }

    const avaliacao = r => ({ assiduidade: r.assiduidade, organizacao: r.organizacao, participacao: r.participacao, agilidade: r.agilidade, pontualidade: r.pontualidade });
    const baseRegistro = r => ({ rowNumber: r.id, dataRegistro: dataBr(r.registrado_em), data: r.data, semana: r.semana, local: r.setor, equipe: r.equipe });

    const LEITURAS = {
        'Controle Colaboradores': async (i, f) => (await porRegistro('programacao_controle_colaboradores', i, f))
            .map(r => Object.assign(baseRegistro(r), { colaborador: r.colaborador, caixas: r.caixas, oQueFez: r.o_que_fez }, horas(r))),
        'Avaliacao': async (i, f) => (await porRegistro('programacao_avaliacoes', i, f))
            .map(r => Object.assign(baseRegistro(r), { colaborador: r.colaborador, servico: r.servico || '' }, avaliacao(r))),
        // Produtividade geral: serviços de todos os setores de trabalho no período
        'Servicos Produtividade': async (i, f) => (await buscarTudo(() => {
            let q = sb.from('programacao_linhas').select('*').in('setor', ['Colaboradores', 'Trator', 'SPG Packing', 'SPG Estufa']);
            if (i) q = q.gte('registrado_em', inicioDia(i));
            if (f) q = q.lte('registrado_em', fimDia(f));
            return q.order('id');
        })).map(r => paraProgramacao(r, r.setor)),
        'Avaliacao Equipe': async (i, f) => (await porRegistro('programacao_avaliacoes_equipe', i, f))
            .map(r => Object.assign(baseRegistro(r), avaliacao(r))),
        'Limpeza': async (i, f) => (await buscarTudo(() => {
            let q = sb.from('programacao_limpeza').select('*');
            if (i) q = q.gte('data', i);
            if (f) q = q.lte('data', f);
            return q.order('id');
        })).map(r => ({ rowNumber: r.id, data: r.data.split('-').reverse().join('/'), semana: r.semana, area: r.area, status: r.status, localDetalhe: r.local_detalhe, quemFez: r.quem_fez, motivo: r.motivo }))
    };

    async function ler(url) {
        const p = new URLSearchParams(url.split('?')[1] || '');
        const inicio = p.get('startDate');
        const fim = p.get('endDate');
        const setor = p.get('local') || 'Trator';

        if (setor === 'Limpeza Rotina') {
            const linhas = await buscarTudo(() => sb.from('programacao_limpeza_rotina').select('*').order('dia').order('ordem'));
            return sucesso({ rotina: true, rows: linhas.map(r => ({ dia: r.dia, ordem: r.ordem, tarefa: r.tarefa, prioridade: r.prioridade })) });
        }
        if (LEITURAS[setor]) return sucesso({ rows: await LEITURAS[setor](inicio, fim) });

        const linhas = await buscarTudo(() => {
            let q = sb.from('programacao_linhas').select('*').eq('setor', setor);
            if (inicio) q = q.gte('registrado_em', inicioDia(inicio));
            if (fim) q = q.lte('registrado_em', fimDia(fim));
            return q.order('id');
        });
        return sucesso({ rows: linhas.map(r => paraProgramacao(r, setor)) });
    }

    const atualizar = async (id, valores) => conferir(await sb.from('programacao_linhas').update(valores).eq('id', id));
    const excluir = async id => conferir(await sb.from('programacao_linhas').delete().eq('id', id));
    const exigirLinha = d => { if (!d.rowNumber) throw new Error('Linha não encontrada.'); };
    const exigirLista = (lista, nome) => { if (!Array.isArray(lista)) throw new Error(nome + ' inválido.'); };

    function camposDaProgramacao(l) {
        const campos = {
            semana: texto(l.semana), programador: texto(l.programador), operador: texto(l.operador), dia_semana: texto(l.diaSemana),
            blocos: texto(l.blocos), tempo: texto(l.tempo), combustivel: texto(l.combustivel), operacoes: texto(l.operacoes),
            status: l.status || 'Em Andamento', estimativa: ouVazio(l.estimativa)
        };
        // Meta: só grava quando a tela mandou (o modo completo antigo não manda e não pode apagar a meta)
        if (l.meta !== undefined) campos.meta = ouVazio(l.meta);
        // % alcançado já na hora de programar ("Programar" com o resultado do serviço)
        if (l.percentual !== undefined) campos.percentual = pct(l.percentual);
        return campos;
    }
    const pct = v => (v === null || v === undefined || v === '') ? null : Math.max(0, Math.min(100, Math.round(Number(v)) || 0));

    const ACOES = {
        updateEstimativa: async d => { exigirLinha(d); await atualizar(d.rowNumber, { estimativa: ouVazio(d.estimativa) }); },
        updateStatus: async d => { exigirLinha(d); await atualizar(d.rowNumber, { status: d.status || 'Em Andamento' }); },
        updateTeam: async d => {
            exigirLinha(d);
            await atualizar(d.rowNumber, { programador: ouVazio(d.programador), operador: ouVazio(d.operador), blocos: ouVazio(d.blocos), operacoes: ouVazio(d.operacoes) });
        },
        deleteTeam: async d => { exigirLinha(d); await excluir(d.rowNumber); },
        deleteServico: async d => { exigirLinha(d); await excluir(d.rowNumber); },
        deleteProgramacaoRow: async d => { exigirLinha(d); await excluir(d.rowNumber); },

        // Fechamento rápido: foi concluído? chegou em quantos %? (e, se quiser, o que foi feito)
        fecharServicos: async d => {
            exigirLista(d.updates, 'updates');
            await Promise.all(d.updates.filter(i => i.rowNumber).map(i => {
                const v = { status: i.status || 'Em Andamento', percentual: pct(i.percentual) };
                if (i.realizado !== undefined) v.realizado = ouVazio(i.realizado);
                return atualizar(i.rowNumber, v);
            }));
        },

        updateRealizado: async d => {
            exigirLista(d.updates, 'updates');
            await Promise.all(d.updates.filter(i => i.rowNumber).map(i => {
                const v = { realizado: ouVazio(i.realizado) };
                if (i.status) v.status = i.status;
                if (i.quantidade !== undefined) v.quantidade = ouVazio(i.quantidade);
                if (i.horaInicio !== undefined || i.horaSaidaAlmoco !== undefined || i.horaVoltaAlmoco !== undefined || i.horaSaida !== undefined) {
                    Object.assign(v, { hora_inicio: ouVazio(i.horaInicio), hora_saida_almoco: ouVazio(i.horaSaidaAlmoco), hora_volta_almoco: ouVazio(i.horaVoltaAlmoco), hora_saida: ouVazio(i.horaSaida) });
                }
                return atualizar(i.rowNumber, v);
            }));
        },

        updateRows: async d => {
            exigirLista(d.updates, 'updates');
            await Promise.all(d.updates.filter(i => i.rowNumber).map(i => {
                const v = camposDaProgramacao(i);
                if (i.local === 'Insumos') Object.assign(v, { categoria: ouVazio(i.categoria), produto: ouVazio(i.produto), alvo: ouVazio(i.alvo) });
                if (i.local === 'SPG Packing' && i.processaCaixas !== undefined) v.processa_caixas = i.processaCaixas !== false;
                return atualizar(i.rowNumber, v);
            }));
        },

        saveControleColaboradores: async d => {
            exigirLista(d.registros, 'registros');
            // O mesmo colaborador repetido no envio: vale o último, como na planilha
            const porNome = new Map();
            d.registros.forEach(i => porNome.set(ouVazio(i.colaborador), i));
            const agora = new Date().toISOString();
            const linhas = [...porNome.entries()].map(([colaborador, i]) => ({
                registrado_em: agora, data: ouVazio(d.data), semana: ouVazio(d.semana), setor: ouVazio(d.local), equipe: ouVazio(i.equipe), colaborador,
                caixas: ouVazio(i.caixas), o_que_fez: ouVazio(i.oQueFez), hora_inicio: ouVazio(d.horaInicio), hora_saida_almoco: ouVazio(d.horaSaidaAlmoco),
                hora_volta_almoco: ouVazio(d.horaVoltaAlmoco), hora_saida: ouVazio(d.horaSaida)
            }));
            if (linhas.length) conferir(await sb.from('programacao_controle_colaboradores').upsert(linhas, { onConflict: 'data,setor,colaborador' }));
        },

        saveAvaliacao: async d => {
            exigirLista(d.registros, 'registros');
            if (!d.registros.length) return;
            // Avaliação por serviço (Programar): grava também o serviço. Se o banco ainda não tem a
            // coluna (falta rodar supabase/programacao_avaliacao_servico.sql), grava sem ela.
            const comServico = d.registros.some(i => i.servico);
            const linhas = semServico => d.registros.map(i => notas(d, i, Object.assign({ colaborador: ouVazio(i.colaborador) }, comServico && !semServico ? { servico: ouVazio(i.servico) } : {})));
            const res = await sb.from('programacao_avaliacoes').insert(linhas(false));
            if (res.error && comServico && /servico/i.test(res.error.message || '')) conferir(await sb.from('programacao_avaliacoes').insert(linhas(true)));
            else conferir(res);
        },

        // Produtividade: corrigir as notas de avaliações já salvas (uma linha por avaliação)
        updateAvaliacao: async d => {
            exigirLista(d.updates, 'updates');
            const CRITERIOS = ['assiduidade', 'organizacao', 'participacao', 'agilidade', 'pontualidade'];
            await Promise.all(d.updates.filter(i => i.rowNumber).map(async i => {
                const v = {};
                CRITERIOS.forEach(c => { if (i[c] !== undefined) v[c] = ouVazio(i[c]); });
                conferir(await sb.from('programacao_avaliacoes').update(v).eq('id', i.rowNumber));
            }));
        },
        // Produtividade: apagar avaliações enviadas por engano
        deleteAvaliacoes: async d => {
            exigirLista(d.ids, 'ids');
            const ids = d.ids.map(Number).filter(Boolean);
            if (ids.length) conferir(await sb.from('programacao_avaliacoes').delete().in('id', ids));
        },

        saveAvaliacaoEquipe: async d => {
            exigirLista(d.registros, 'registros');
            if (d.registros.length) conferir(await sb.from('programacao_avaliacoes_equipe').insert(d.registros.map(i => notas(d, i, {}))));
        },

        saveLimpeza: async d => {
            exigirLista(d.registros, 'registros');
            conferir(await sb.rpc('programacao_salvar_limpeza', { p_data: d.data, p_semana: ouVazio(d.semana), p_registros: d.registros }));
        },

        saveLimpezaRotina: async d => {
            if (!d.rotina || typeof d.rotina !== 'object') throw new Error('Rotina inválida.');
            conferir(await sb.rpc('programacao_salvar_rotina', { p_rotina: d.rotina }));
        }
    };

    function notas(d, i, extra) {
        return Object.assign({
            data: ouVazio(d.data), semana: ouVazio(d.semana), setor: ouVazio(d.local), equipe: ouVazio(i.equipe), assiduidade: ouVazio(i.assiduidade),
            organizacao: ouVazio(i.organizacao), participacao: ouVazio(i.participacao), agilidade: ouVazio(i.agilidade), pontualidade: ouVazio(i.pontualidade)
        }, extra);
    }

    async function inserir(dados) {
        if (!dados.length) return sucesso({ rows: [] });
        const setor = dados[0].local ? String(dados[0].local) : 'Trator';
        const linhas = dados.map(l => {
            const v = Object.assign({ setor }, camposDaProgramacao(l));
            if (setor === 'Insumos') Object.assign(v, { categoria: ouVazio(l.categoria), produto: ouVazio(l.produto), alvo: ouVazio(l.alvo) });
            if (setor === 'SPG Packing') v.processa_caixas = l.processaCaixas !== false;
            return v;
        });
        const criadas = conferir(await sb.from('programacao_linhas').insert(linhas).select('id').order('id'));
        return sucesso({ rows: criadas.map(c => ({ rowNumber: c.id })) });
    }

    async function gravar(corpo) {
        const dados = JSON.parse(corpo);
        if (Array.isArray(dados)) return inserir(dados);
        const acao = ACOES[dados.action];
        if (!acao) throw new Error('Ação não reconhecida: ' + dados.action);
        await acao(dados);
        return sucesso();
    }

    window.programacaoBackend = function (url, opcoes) {
        return opcoes && opcoes.method === 'POST' ? gravar(opcoes.body) : ler(String(url));
    };
})();
