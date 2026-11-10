// Dados dos check-lists Geral e POP no Supabase. Usa o login da Programação de Trabalho.
(function () {
    'use strict';

    const API = window.parent !== window ? window.parent.IrrigacaoAPI : null;
    if (!API) { location.replace('../index.html'); return; }

    const sb = API.cliente;
    const LIMITE = 1000;

    function conferir(res) {
        if (!res.error) return res.data;
        if (!res.status) throw new Error('Sem conexão com o servidor.');
        throw Object.assign(new Error(res.error.message || 'Erro ao falar com o servidor.'), { recusado: true });
    }

    // Check-list Geral: entra na mesma fila offline da irrigação e é enviado quando houver sinal
    window.SPG_VEICULOS = {
        salvar: registro => API.enfileirar('checklist_veiculos', 'upsert', registro)
    };

    const paraLinha = r => [r.pop, r.titulo, r.data, r.responsavel, r.setor, r.aprovado_por, r.assinatura, r.grupo, r.questao_id,
        r.questao_texto, r.resposta, r.observacao, r.id, r.status, r.registrado_em, r.envio_id, r.data_resolucao, r.obs_resolucao, r.enviado_por];

    // Devolve { success, error } nos erros recusados pelo servidor; sem conexão, lança exceção
    async function comResultado(fazer) {
        try {
            await fazer();
            return { success: true };
        } catch (e) {
            if (e.recusado) return { success: false, error: e.message };
            throw e;
        }
    }

    window.SPG_POP = {
        podeVerDashboard: () => API.temModulo('pop_dashboard'),

        async listar() {
            const linhas = [];
            for (let de = 0; ; de += LIMITE) {
                const parte = conferir(await sb.from('checklist_pop_respostas').select('*').order('seq').range(de, de + LIMITE - 1));
                linhas.push(...parte);
                if (parte.length < LIMITE) return linhas.map(paraLinha);
            }
        },

        salvar: (rows, envioId) => comResultado(async () => {
            const enviadoPor = API.nomeUsuario() || '';
            const linhas = rows.map(r => ({
                pop: r[0], titulo: r[1], data: r[2], responsavel: r[3], setor: r[4], aprovado_por: r[5], assinatura: r[6], grupo: r[7],
                questao_id: r[8], questao_texto: r[9], resposta: r[10], observacao: r[11], id: r[12], status: r[13], envio_id: envioId,
                enviado_por: enviadoPor
            }));
            let res = await sb.from('checklist_pop_respostas').insert(linhas);
            // Banco ainda sem a coluna (pop_enviado_por.sql não rodado): grava sem o nome, o envio não para
            if (res.error && /enviado_por/.test(res.error.message || '')) {
                res = await sb.from('checklist_pop_respostas').insert(linhas.map(({ enviado_por, ...resto }) => resto));
            }
            conferir(res);
        }),

        atualizarNC: (id, status, dataResolucao, obsResolucao) => comResultado(async () => {
            const valores = { status };
            if (status === 'RESOLVIDO') Object.assign(valores, { data_resolucao: dataResolucao || '', obs_resolucao: obsResolucao || '' });
            const linhas = conferir(await sb.from('checklist_pop_respostas').update(valores).eq('id', id).select('id'));
            if (!linhas.length) throw Object.assign(new Error('Registro não encontrado.'), { recusado: true });
        }),

        async lerConfig() {
            return conferir(await sb.from('checklist_pop_config').select('empresa,cnpj,endereco,responsavel,cargo').eq('id', 1).maybeSingle());
        },

        async salvarConfig(cfg) {
            conferir(await sb.from('checklist_pop_config').upsert(Object.assign({ id: 1, atualizado_em: new Date().toISOString() }, cfg), { onConflict: 'id' }));
        }
    };
})();
