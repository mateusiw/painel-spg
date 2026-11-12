// Cadastro de culturas e variedades do Resumo da Colheita (Oásis e Estufa).
// Abastece as listas da aba Lançar e dá ao administrador a tela para cadastrar, renomear,
// desativar e unificar nomes duplicados (a unificação também corrige os lançamentos já feitos).
//
// const catalogo = CatalogoColheita.criar({ local, cliente, ehAdmin, nomeLocal });
// await catalogo.carregar()            -> lê o cadastro (sem internet, usa a última cópia)
// catalogo.pronto                      -> false: cadastro indisponível, o formulário segue livre
// catalogo.culturas() / .variedades(c) -> nomes ativos
// catalogo.oficial(campo, nome, cult)  -> grafia cadastrada do nome, ou null
// catalogo.adicionar(cultura, var)     -> só administrador
// catalogo.desenhar(elemento, avisos)  -> tela de gerenciamento
(function () {
    'use strict';
    if (window.CatalogoColheita) return;

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const comparar = (a, b) => a.localeCompare(b, 'pt-BR', { numeric: true });
    const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const igualavel = s => semAcento(s).trim().replace(/\s+/g, ' ');
    const chaveParecida = s => semAcento(s).replace(/[^a-z0-9]/g, '');
    const parecidos = (a, b) => {
        const x = chaveParecida(a), y = chaveParecida(b);
        if (!x || !y) return false;
        if (x === y) return true;
        const menor = x.length < y.length ? x : y, maior = x.length < y.length ? y : x;
        return menor.length >= 4 && maior.startsWith(menor);
    };
    const qtdTexto = n => `${n.toLocaleString('pt-BR')} ${n === 1 ? 'lançamento' : 'lançamentos'}`;

    function criar({ local, cliente, ehAdmin, nomeLocal }) {
        const K_CACHE = 'spg_catalogo_colheita_' + local;
        let linhas = [];   // { cultura, variedade, ativo }; variedade '' = linha da própria cultura
        let uso = [];      // { cultura, variedade, qtd }
        let alvo = null, callbacks = {}, busca = '', janela = null;
        const api = { pronto: false };

        async function carregar() {
            let { data, error } = await cliente.from('colheita_catalogo').select('cultura,variedade,ativo,contagem').eq('local', local).limit(5000);
            // Banco sem a coluna "contagem" (falta rodar supabase/pesagem_unica.sql): lê sem ela
            if (error && /contagem/i.test(error.message || '')) ({ data, error } = await cliente.from('colheita_catalogo').select('cultura,variedade,ativo').eq('local', local).limit(5000));
            if (!error && data) {
                linhas = data;
                api.pronto = true;
                try { localStorage.setItem(K_CACHE, JSON.stringify(data)); } catch (e) { /* só não guarda a cópia */ }
                return;
            }
            try {
                const copia = JSON.parse(localStorage.getItem(K_CACHE));
                if (Array.isArray(copia) && copia.length) { linhas = copia; api.pronto = true; }
            } catch (e) { /* segue sem cadastro */ }
        }

        api.carregar = carregar;

        // Como a cultura informa as unidades na Pesagem: 'media' (média por caixa), 'total' (total de
        // unidades) ou 'peso' (só kg). Sem regra cadastrada: pepino = total, tomate = peso, outras = média.
        api.CONTAGENS = { media: 'Média de unidades por caixa', total: 'Total de unidades', peso: 'Só peso (kg)' };
        api.contagem = cultura => {
            const procurada = igualavel(cultura);
            const linha = linhas.find(l => l.variedade === '' && l.cultura !== '' && igualavel(l.cultura) === procurada);
            if (linha && api.CONTAGENS[linha.contagem]) return linha.contagem;
            return /pepino/.test(procurada) ? 'total' : /tomate/.test(procurada) ? 'peso' : 'media';
        };
        async function definirContagem(cultura, contagem) {
            const { error } = await cliente.from('colheita_catalogo').update({ contagem }).eq('local', local).eq('cultura', cultura).eq('variedade', '');
            if (error) throw new Error(/contagem/i.test(error.message || '') ? 'Rode o arquivo supabase/pesagem_unica.sql no Supabase primeiro.' : error.message);
            linhas.forEach(l => { if (l.cultura === cultura && l.variedade === '') l.contagem = contagem; });
            try { localStorage.setItem(K_CACHE, JSON.stringify(linhas)); } catch (e) { /* só não guarda a cópia */ }
        }
        api.definirContagem = definirContagem;

        const culturaAtiva = nome => linhas.some(l => l.cultura === nome && l.variedade === '' && l.ativo);
        api.culturas = () => linhas.filter(l => l.variedade === '' && l.cultura !== '' && l.ativo).map(l => l.cultura).sort(comparar);
        // Cultura cadastrada que tem esta variedade (para quando só a variedade foi escolhida)
        api.culturaDe = variedade => {
            const procurada = igualavel(variedade);
            const linha = linhas.find(l => l.variedade !== '' && l.cultura !== '' && l.ativo && igualavel(l.variedade) === procurada);
            return linha ? linha.cultura : '';
        };

        // Enquanto houver grafias duplicadas da cultura, as variedades de todas aparecem juntas
        api.variedades = cultura => {
            const procurada = igualavel(cultura);
            return [...new Set(linhas.filter(l => l.variedade !== '' && l.ativo
                && (procurada ? igualavel(l.cultura) === procurada : (l.cultura === '' || culturaAtiva(l.cultura))))
                .map(l => l.variedade))].sort(comparar);
        };
        // Vale o nome exato; se não houver, a grafia com acento; depois qualquer uma igual
        api.oficial = (campo, nome, cultura) => {
            const digitado = String(nome || '').trim(), procurado = igualavel(digitado);
            const iguais = (campo === 'cultura' ? api.culturas() : api.variedades(cultura)).filter(n => igualavel(n) === procurado);
            return iguais.find(n => n === digitado) || iguais.find(n => n !== n.normalize('NFD')) || iguais[0] || null;
        };

        async function adicionar(cultura, variedade) {
            const c = String(cultura || '').trim(), v = String(variedade || '').trim();
            const novas = [];
            if (c) novas.push({ local, cultura: c, variedade: '', ativo: true });
            if (v) novas.push({ local, cultura: c, variedade: v, ativo: true });
            const { error } = await cliente.from('colheita_catalogo').upsert(novas, { onConflict: 'local,cultura,variedade' });
            if (error) throw new Error(error.message);
            await carregar();
        }
        api.adicionar = adicionar;

        // ----- Tela de gerenciamento -----
        async function carregarUso() {
            const { data, error } = await cliente.rpc('colheita_catalogo_uso', { p_local: local });
            if (error) throw new Error(error.message);
            uso = data || [];
        }

        // Junta cadastro e nomes em uso: nome usado em lançamento e fora do cadastro também aparece
        function montarArvore() {
            const culturas = new Map();
            const cultura = nome => {
                if (!culturas.has(nome)) culturas.set(nome, { nome, ativo: true, cadastrada: false, qtd: 0, semVariedade: 0, variedades: new Map() });
                return culturas.get(nome);
            };
            const variedade = (c, nome) => {
                if (!c.variedades.has(nome)) c.variedades.set(nome, { nome, ativo: true, cadastrada: false, qtd: 0 });
                return c.variedades.get(nome);
            };
            linhas.forEach(l => {
                const c = cultura(l.cultura);
                if (l.variedade === '') { c.ativo = l.ativo; c.cadastrada = true; }
                else { const v = variedade(c, l.variedade); v.ativo = l.ativo; v.cadastrada = true; }
            });
            // Descarte não informa a cultura: conta na cultura que já tem aquela variedade
            [...uso].sort((a, b) => (a.cultura === '' ? 1 : 0) - (b.cultura === '' ? 1 : 0)).forEach(u => {
                const dona = u.cultura === '' && u.variedade !== '' ? [...culturas.values()].find(x => x.nome && x.variedades.has(u.variedade)) : null;
                const c = dona || cultura(u.cultura);
                c.qtd += Number(u.qtd);
                if (u.variedade !== '') variedade(c, u.variedade).qtd += Number(u.qtd);
                else c.semVariedade += Number(u.qtd);
            });
            const todas = [...culturas.values()];
            todas.forEach(c => {
                c.lista = [...c.variedades.values()].sort((a, b) => comparar(a.nome, b.nome));
                c.parecidas = c.nome ? todas.filter(o => o !== c && o.nome && parecidos(c.nome, o.nome)).map(o => o.nome) : [];
            });
            todas.forEach(c => c.lista.forEach(v => {
                const irmas = todas.filter(o => o === c || !o.nome || !c.nome).flatMap(o => o.lista.filter(x => x !== v && parecidos(v.nome, x.nome)));
                v.parecidas = [...new Set(irmas.map(x => x.nome))];
            }));
            return todas.sort((a, b) => (a.nome === '' ? 1 : 0) - (b.nome === '' ? 1 : 0) || comparar(a.nome, b.nome));
        }

        const botaoIcone = (acao, icone, titulo, dados, extra = '') => `<button type="button" data-cat="${acao}" ${dados} title="${titulo}" aria-label="${titulo}" class="p-2 rounded-lg text-slate-400 hover:bg-slate-100 ${extra}"><i data-lucide="${icone}" class="w-4 h-4"></i></button>`;
        const dadosDe = (c, v) => `data-c="${esc(c)}" data-v="${esc(v)}"`;

        const culturaDoMesmoNome = nome => { const l = linhas.find(x => x.variedade === '' && x.cultura !== '' && igualavel(x.cultura) === igualavel(nome)); return l ? l.cultura : ''; };

        function acoes(c, v, item) {
            const d = dadosDe(c, v);
            let html = '';
            if (c === '' && v && culturaDoMesmoNome(v)) html += `<button type="button" data-cat="e-cultura" ${d} class="px-2 py-1 mr-1 rounded-lg bg-orange-50 text-orange-700 text-[11px] font-bold whitespace-nowrap">Corrigir: é cultura</button>`;
            if (!item.cadastrada) html += `<button type="button" data-cat="cadastrar" ${d} class="px-2 py-1 mr-1 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold">Cadastrar</button>`;
            html += botaoIcone('renomear', 'pencil', 'Renomear', d, 'hover:text-amber-600');
            html += botaoIcone('unificar', 'merge', 'Unificar com outro nome', d, 'hover:text-sky-600');
            if (item.cadastrada) html += botaoIcone('ativar', item.ativo ? 'eye-off' : 'eye', item.ativo ? 'Desativar' : 'Ativar', d, 'hover:text-slate-700');
            if (item.qtd === 0) html += botaoIcone('excluir', 'trash-2', 'Excluir', d, 'hover:text-red-600');
            return html;
        }
        const etiquetas = (item, parecidas) => `
            ${!item.cadastrada ? '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">Fora do cadastro</span>' : ''}
            ${!item.ativo ? '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">Inativa</span>' : ''}
            ${parecidas.length ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-700">Parecida com ${esc(parecidas.slice(0, 2).join(', '))}</span>` : ''}`;

        function desenharLista() {
            const arvore = montarArvore();
            const termo = igualavel(busca);
            const passa = (c, v) => !termo || igualavel(c).includes(termo) || igualavel(v).includes(termo);
            const totalParecidos = arvore.filter(c => c.parecidas.length).length + arvore.reduce((s, c) => s + c.lista.filter(v => v.parecidas.length).length, 0);
            alvo.querySelector('[data-cat-parecidos]').innerHTML = totalParecidos
                ? `<div class="flex items-start gap-2 bg-orange-50 border border-orange-200 text-orange-800 rounded-xl px-3 py-2.5 text-xs font-semibold"><i data-lucide="copy" class="w-4 h-4 shrink-0 mt-px"></i><span>${totalParecidos} ${totalParecidos === 1 ? 'nome parecido' : 'nomes parecidos'} com outro. Use <b>Unificar</b> para juntar os duplicados e corrigir os lançamentos.</span></div>`
                : '';
            const secoes = arvore.map(c => {
                const variedades = c.lista.filter(v => passa(c.nome, v.nome));
                if (termo && !igualavel(c.nome).includes(termo) && !variedades.length) return '';
                return `<section class="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <header class="flex items-center justify-between gap-2 pl-4 pr-2 py-2 bg-emerald-50/70 border-b border-emerald-100">
                        <div class="min-w-0"><p class="text-sm font-black text-slate-800 ${c.ativo ? '' : 'opacity-50'}">${esc(c.nome || 'Sem cultura')}</p>
                            <p class="flex flex-wrap items-center gap-1 text-[11px] font-semibold text-slate-500">${qtdTexto(c.qtd)} ${c.nome ? etiquetas(c, c.parecidas) : ''}</p>
                            ${c.nome && c.cadastrada ? `<label class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-slate-500">Na Pesagem:
                                <select data-cat-contagem data-c="${esc(c.nome)}" aria-label="Como ${esc(c.nome)} informa as unidades na Pesagem" class="bg-white border-2 border-emerald-200 rounded-lg py-1 pl-2 pr-7 text-[11px] font-bold text-emerald-800 outline-none focus:border-emerald-500">
                                    ${Object.entries(api.CONTAGENS).map(([v, t]) => `<option value="${v}"${api.contagem(c.nome) === v ? ' selected' : ''}>${t}</option>`).join('')}
                                </select></label>` : ''}</div>
                        <div class="flex items-center shrink-0">${c.nome ? `<button type="button" data-cat="nova-variedade" data-c="${esc(c.nome)}" class="px-2 py-1 mr-1 rounded-lg bg-white border border-emerald-200 text-emerald-700 text-[11px] font-bold whitespace-nowrap">+ Variedade</button>${acoes(c.nome, '', c)}` : ''}</div>
                    </header>
                    <div class="divide-y divide-slate-100">${c.nome && c.semVariedade && !termo ? `<div class="pl-4 pr-2 py-2"><p class="text-sm font-semibold italic text-slate-500">Sem variedade</p><p class="text-[11px] text-slate-400">${qtdTexto(c.semVariedade)}</p></div>` : ''}${variedades.map(v => `<div class="flex items-center justify-between gap-2 pl-4 pr-2 py-1.5">
                        <div class="min-w-0"><p class="text-sm font-semibold text-slate-700 ${v.ativo ? '' : 'opacity-50'}">${esc(v.nome)}</p>
                            <p class="flex flex-wrap items-center gap-1 text-[11px] text-slate-400">${qtdTexto(v.qtd)} ${etiquetas(v, v.parecidas)}</p></div>
                        <div class="flex items-center shrink-0">${acoes(c.nome, v.nome, v)}</div>
                    </div>`).join('') || (c.semVariedade ? '' : '<p class="px-4 py-3 text-xs text-slate-400">Nenhuma variedade cadastrada.</p>')}</div>
                </section>`;
            }).join('');
            alvo.querySelector('[data-cat-lista]').innerHTML = secoes || '<p class="py-10 text-center text-sm text-slate-400">Nada encontrado.</p>';
            if (window.lucide) lucide.createIcons();
        }

        async function recarregarTela() {
            await Promise.all([carregar(), carregarUso()]);
            desenharLista();
            if (callbacks.aoAlterar) callbacks.aoAlterar();
        }

        function fecharJanela() { if (janela) { janela.remove(); janela = null; } }
        function abrirJanela({ titulo, texto, corpo, confirmar, perigo, aoConfirmar, aoMudar }) {
            fecharJanela();
            janela = document.createElement('div');
            janela.className = 'fixed inset-0 z-[80] bg-slate-900/50 flex items-center justify-center p-4';
            janela.innerHTML = `<form role="dialog" aria-modal="true" class="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-5">
                <h3 class="text-base font-black text-slate-800">${esc(titulo)}</h3>
                ${texto ? `<p class="text-xs text-slate-500 mt-1">${texto}</p>` : ''}
                <div class="mt-3 space-y-2">${corpo || ''}</div>
                <p data-aviso class="hidden mt-2 text-xs font-semibold text-amber-700"></p>
                <p data-erro role="alert" class="hidden mt-2 text-xs font-bold text-red-600"></p>
                <div class="flex justify-end gap-2 mt-4">
                    <button type="button" data-fechar class="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100">Cancelar</button>
                    <button type="submit" class="px-4 py-2.5 rounded-xl text-sm font-bold text-white ${perigo ? 'bg-red-600' : 'bg-emerald-600'} disabled:opacity-60">${esc(confirmar)}</button>
                </div>
            </form>`;
            document.body.appendChild(janela);
            const form = janela.firstElementChild;
            janela.addEventListener('click', e => { if (e.target === janela || e.target.closest('[data-fechar]')) fecharJanela(); });
            if (aoMudar) { form.addEventListener('input', () => aoMudar(form)); form.addEventListener('change', () => aoMudar(form)); aoMudar(form); }
            form.addEventListener('submit', async e => {
                e.preventDefault();
                const botao = form.querySelector('[type=submit]'), erro = form.querySelector('[data-erro]');
                botao.disabled = true; erro.classList.add('hidden');
                try {
                    const msg = await aoConfirmar(form);
                    fecharJanela();
                    await recarregarTela();
                    if (msg && callbacks.avisar) callbacks.avisar(msg);
                } catch (err) {
                    erro.textContent = err.message; erro.classList.remove('hidden');
                    botao.disabled = false;
                }
            });
            const primeiro = form.querySelector('input,select');
            if (primeiro) { primeiro.focus(); if (primeiro.select) primeiro.select(); }
        }

        const CLASSE_CAMPO = 'w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-2.5 px-3 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500 focus:bg-white';
        const campoTexto = (nome, valor, rotulo) => `<label class="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">${rotulo}<input name="${nome}" value="${esc(valor)}" maxlength="80" required autocomplete="off" class="mt-1 normal-case tracking-normal ${CLASSE_CAMPO}"></label>`;

        async function alterarNoBanco(c, v, novaC, novaV) {
            const { data, error } = await cliente.rpc('colheita_catalogo_alterar', { p_local: local, p_cultura: c, p_variedade: v, p_nova_cultura: novaC, p_nova_variedade: novaV });
            if (error) throw new Error(error.message);
            return Number(data) || 0;
        }
        const resultado = n => n ? `Pronto. ${qtdTexto(n)} ${n === 1 ? 'atualizado' : 'atualizados'}.` : 'Pronto.';

        function qtdDe(c, v) {
            const no = montarArvore().find(x => x.nome === c);
            if (!no) return 0;
            if (!v) return no.qtd;
            const item = no.lista.find(x => x.nome === v);
            return item ? item.qtd : 0;
        }

        function abrirRenomear(c, v) {
            const atual = v || c, qtd = qtdDe(c, v);
            const existentes = v ? montarArvore().find(x => x.nome === c).lista.map(x => x.nome) : montarArvore().map(x => x.nome).filter(Boolean);
            abrirJanela({
                titulo: `Renomear ${v ? 'variedade' : 'cultura'}`,
                texto: qtd ? `${qtdTexto(qtd)} ${qtd === 1 ? 'será atualizado' : 'serão atualizados'} com o novo nome.` : '',
                corpo: campoTexto('nome', atual, 'Novo nome'),
                confirmar: 'Salvar',
                aoMudar: form => {
                    const novo = form.nome.value.trim(), aviso = form.querySelector('[data-aviso]');
                    const repetido = existentes.find(n => n !== atual && igualavel(n) === igualavel(novo));
                    aviso.textContent = repetido ? `"${repetido}" já existe. Os dois serão unificados.` : '';
                    aviso.classList.toggle('hidden', !repetido);
                },
                aoConfirmar: async form => {
                    const digitado = form.nome.value.trim();
                    if (!digitado) throw new Error('Informe o nome.');
                    const novo = existentes.find(n => n !== atual && igualavel(n) === igualavel(digitado)) || digitado;
                    if (novo === atual) return '';
                    return resultado(await alterarNoBanco(c, v, v ? c : novo, v ? novo : ''));
                }
            });
        }

        function abrirUnificar(c, v) {
            const arvore = montarArvore(), qtd = qtdDe(c, v), origem = v || c;
            const opcoes = v
                ? arvore.flatMap(x => x.lista.filter(y => !(x.nome === c && y.nome === v)).map(y => ({ c: x.nome, v: y.nome, rotulo: x.nome ? `${y.nome} (${x.nome})` : y.nome, parecida: parecidos(v, y.nome) })))
                : arvore.filter(x => x.nome && x.nome !== c).map(x => ({ c: x.nome, v: '', rotulo: x.nome, parecida: parecidos(c, x.nome) }));
            if (!opcoes.length) { if (callbacks.avisar) callbacks.avisar('Não há outro nome para unificar.'); return; }
            opcoes.sort((a, b) => (b.parecida - a.parecida) || comparar(a.rotulo, b.rotulo));
            abrirJanela({
                titulo: 'Unificar nomes',
                texto: `<b>${esc(origem)}</b> deixa de existir e ${qtdTexto(qtd)} ${qtd === 1 ? 'passa' : 'passam'} para o nome escolhido. Não dá para desfazer automaticamente.`,
                corpo: `<label class="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Manter o nome<select name="destino" class="mt-1 normal-case tracking-normal ${CLASSE_CAMPO}">${opcoes.map((o, i) => `<option value="${i}">${esc(o.rotulo)}</option>`).join('')}</select></label>`,
                confirmar: 'Unificar',
                perigo: true,
                aoConfirmar: async form => {
                    const d = opcoes[Number(form.destino.value)];
                    return resultado(await alterarNoBanco(c, v, d.c, d.v));
                }
            });
        }

        function abrirNovo(cultura) {
            abrirJanela({
                titulo: cultura === null ? 'Nova cultura' : `Nova variedade de ${cultura}`,
                corpo: campoTexto('nome', '', 'Nome'),
                confirmar: 'Cadastrar',
                aoConfirmar: async form => {
                    const nome = form.nome.value.trim();
                    if (!nome) throw new Error('Informe o nome.');
                    const repetido = cultura === null
                        ? montarArvore().find(x => x.nome && igualavel(x.nome) === igualavel(nome))
                        : montarArvore().find(x => x.nome === cultura).lista.find(x => igualavel(x.nome) === igualavel(nome));
                    if (repetido) throw new Error(`"${repetido.nome}" já está cadastrada.`);
                    if (cultura === null) await adicionar(nome, ''); else await adicionar(cultura, nome);
                    return 'Cadastrado.';
                }
            });
        }

        async function alternarAtivo(c, v) {
            const atual = linhas.find(l => l.cultura === c && l.variedade === v);
            if (!atual) return;
            const { error } = await cliente.from('colheita_catalogo').update({ ativo: !atual.ativo }).eq('local', local).eq('cultura', c).eq('variedade', v);
            if (error) throw new Error(error.message);
            await recarregarTela();
        }

        function abrirCorrigirCultura(v) {
            const cultura = culturaDoMesmoNome(v), qtd = qtdDe('', v);
            abrirJanela({
                titulo: 'Corrigir para cultura',
                texto: `${qtdTexto(qtd)} com <b>${esc(v)}</b> no campo de variedade ${qtd === 1 ? 'passa' : 'passam'} para a cultura <b>${esc(cultura)}</b>, sem variedade.`,
                confirmar: 'Corrigir',
                aoConfirmar: async () => {
                    const { data, error } = await cliente.rpc('colheita_catalogo_corrigir_cultura', { p_local: local, p_nome: v, p_cultura: cultura });
                    if (error) throw new Error(error.message);
                    return resultado(Number(data) || 0);
                }
            });
        }

        function abrirExcluir(c, v) {
            abrirJanela({
                titulo: `Excluir ${v ? 'variedade' : 'cultura'}?`,
                texto: `<b>${esc(v || c)}</b> sai do cadastro. Não há lançamentos com este nome.`,
                confirmar: 'Excluir',
                perigo: true,
                aoConfirmar: async () => {
                    let q = cliente.from('colheita_catalogo').delete().eq('local', local).eq('cultura', c);
                    if (v) q = q.eq('variedade', v);
                    const { error } = await q;
                    if (error) throw new Error(error.message);
                    return 'Excluído.';
                }
            });
        }

        async function aoClicar(e) {
            const b = e.target.closest('[data-cat]');
            if (!b) return;
            const { cat, c = '', v = '' } = b.dataset;
            try {
                if (cat === 'nova-cultura') abrirNovo(null);
                else if (cat === 'nova-variedade') abrirNovo(c);
                else if (cat === 'renomear') abrirRenomear(c, v);
                else if (cat === 'unificar') abrirUnificar(c, v);
                else if (cat === 'excluir') abrirExcluir(c, v);
                else if (cat === 'e-cultura') abrirCorrigirCultura(v);
                else if (cat === 'ativar') await alternarAtivo(c, v);
                else if (cat === 'cadastrar') { await adicionar(c, v); await recarregarTela(); }
            } catch (err) { if (callbacks.avisar) callbacks.avisar(err.message); }
        }

        api.desenhar = async function (elemento, cb) {
            callbacks = cb || {};
            if (!ehAdmin) { elemento.innerHTML = ''; return; }
            alvo = elemento;
            if (!alvo.dataset.ligado) {
                alvo.dataset.ligado = '1';
                alvo.addEventListener('click', aoClicar);
                alvo.addEventListener('input', e => { if (e.target.matches('[data-cat-busca]')) { busca = e.target.value; desenharLista(); } });
                // "Na Pesagem": como a cultura informa as unidades (média por caixa / total / só peso)
                alvo.addEventListener('change', async e => {
                    const sel = e.target.closest('[data-cat-contagem]');
                    if (!sel) return;
                    sel.disabled = true;
                    try {
                        await definirContagem(sel.dataset.c, sel.value);
                        if (callbacks.avisar) callbacks.avisar(`${sel.dataset.c}: ${api.CONTAGENS[sel.value].toLowerCase()} na Pesagem.`);
                    } catch (err) {
                        if (callbacks.avisar) callbacks.avisar(err.message);
                        desenharLista();
                    } finally { sel.disabled = false; }
                });
            }
            alvo.innerHTML = `<div class="max-w-3xl mx-auto space-y-3">
                <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <div class="bg-gradient-to-r from-emerald-600 to-emerald-700 px-5 py-4 flex items-center justify-between gap-3">
                        <div class="min-w-0"><h2 class="text-base font-bold text-white">Culturas e variedades</h2><p class="text-xs text-white/80">${esc(nomeLocal || local)}</p></div>
                        <button type="button" data-cat="nova-cultura" class="shrink-0 text-xs font-bold text-white bg-white/20 hover:bg-white/30 px-3 py-2 rounded-lg">+ Nova cultura</button>
                    </div>
                    <div class="p-3"><input type="search" data-cat-busca value="${esc(busca)}" placeholder="Buscar cultura ou variedade..." aria-label="Buscar" class="${CLASSE_CAMPO}"></div>
                </div>
                <div data-cat-parecidos></div>
                <div data-cat-lista class="space-y-3"><p class="py-10 text-center text-sm text-slate-400">Carregando…</p></div>
            </div>`;
            try {
                await Promise.all([carregar(), carregarUso()]);
                if (!api.pronto) throw new Error('sem cadastro');
                desenharLista();
            } catch (err) {
                alvo.querySelector('[data-cat-lista]').innerHTML = '<p class="bg-amber-50 text-amber-900 rounded-2xl p-4 text-sm font-semibold">Rode o arquivo supabase/colheita_catalogo.sql no Supabase para ativar o cadastro.</p>';
            }
        };

        return api;
    }

    window.CatalogoColheita = { criar };
})();
