// Administração: culturas e variedades de cada local que tem Resumo da Colheita, e os parceiros
// (o mesmo cadastro da Pesagem e da Produtividade Packing).
// As listas e as regras ficam em catalogo-colheita.js, o mesmo usado pela aba Lançar.
(function () {
    'use strict';
    const API = window.IrrigacaoAPI;
    if (!API.isAdmin()) { location.replace('../../index.html'); return; }

    const K_LOCAL = 'spg_culturas_local';
    const el = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // Um novo Resumo da Colheita em outro local entra aqui sozinho
    const locais = API.PROJETOS.filter(p => p.id.startsWith('resumo-colheita-') && p.local).map(p => p.local);
    const catalogos = new Map();
    let atual = [...locais, '__parceiros'].includes(localStorage.getItem(K_LOCAL)) ? localStorage.getItem(K_LOCAL) : locais[0];
    let timerAviso = null;

    function avisar(texto) {
        const a = el('aviso');
        a.textContent = texto;
        a.classList.remove('hidden');
        clearTimeout(timerAviso);
        timerAviso = setTimeout(() => a.classList.add('hidden'), 3500);
    }

    // ---------- Parceiros (o mesmo cadastro da Pesagem e da Produtividade Packing) ----------
    // packing_cadastros, tipo 'produtores'. A Pesagem (Oásis e Estufa) lista estes nomes e a entrega
    // de cada parceiro vai direto para o Packing. Renomear também corrige as entregas e baixas do Packing.
    const PARCEIROS = '__parceiros';
    const PROPRIOS = ['SPG Oásis', 'SPG Estufa', 'Fazenda Oásis'];   // o próprio local, não é parceiro
    const CAMPO = 'w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-2.5 px-3 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500 focus:bg-white';
    let parceiros = [], todosParceiros = [], buscaParceiro = '';
    const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const normalizar = s => String(s || '').replace(/\s+/g, ' ').trim();

    async function carregarParceiros() {
        let { data, error } = await API.cliente.from('packing_cadastros').select('valor, na_pesagem').eq('tipo', 'produtores').order('valor');
        if (error && /na_pesagem/.test(error.message || '')) ({ data, error } = await API.cliente.from('packing_cadastros').select('valor').eq('tipo', 'produtores').order('valor'));
        if (error) throw new Error(/packing_cadastros/.test(error.message || '') ? 'Rode o arquivo supabase/produtividade_packing.sql no Supabase primeiro.' : error.message);
        // Aqui ficam só os parceiros da Pesagem; os que são só do Packing são cuidados na Produtividade Packing
        todosParceiros = (data || []).map(x => x.valor);
        parceiros = (data || []).filter(x => x.na_pesagem !== false).map(x => x.valor).filter(n => !PROPRIOS.includes(n)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }

    function desenharListaParceiros(painel) {
        const termo = semAcento(buscaParceiro);
        const lista = parceiros.filter(n => !termo || semAcento(n).includes(termo));
        painel.querySelector('[data-par-lista]').innerHTML = lista.length ? lista.map(n => `<div class="flex items-center justify-between gap-2 pl-4 pr-2 py-1.5">
                <p class="min-w-0 text-sm font-semibold text-slate-700 truncate">${esc(n)}</p>
                <div class="flex items-center shrink-0">
                    <button type="button" data-par="renomear" data-nome="${esc(n)}" title="Renomear" aria-label="Renomear ${esc(n)}" class="w-10 h-10 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-amber-600"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                    <button type="button" data-par="excluir" data-nome="${esc(n)}" title="Excluir" aria-label="Excluir ${esc(n)}" class="w-10 h-10 flex items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
            </div>`).join('') : `<p class="px-4 py-8 text-center text-sm text-slate-400">${parceiros.length ? 'Nada encontrado.' : 'Nenhum parceiro cadastrado.'}</p>`;
        painel.querySelector('[data-par-total]').textContent = `${parceiros.length} ${parceiros.length === 1 ? 'parceiro' : 'parceiros'}`;
        if (window.lucide) lucide.createIcons();
    }

    // Janela de nome (novo / renomear), no padrão do sistema
    function janelaNome({ titulo, texto, valor, botao, aoSalvar }) {
        const fundo = document.createElement('div');
        fundo.className = 'fixed inset-0 z-[80] bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-4';
        fundo.innerHTML = `<form role="dialog" aria-modal="true" class="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm shadow-2xl p-5" style="padding-bottom:max(1.25rem,env(safe-area-inset-bottom))">
            <h3 class="text-base font-black text-slate-800">${esc(titulo)}</h3>
            ${texto ? `<p class="text-xs text-slate-500 mt-1">${texto}</p>` : ''}
            <label class="block mt-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Nome do parceiro
                <input name="nome" value="${esc(valor || '')}" maxlength="80" required autocomplete="off" placeholder="Ex.: Sítio Boa Vista" class="mt-1 normal-case tracking-normal ${CAMPO}"></label>
            <p data-erro role="alert" class="hidden mt-2 text-xs font-bold text-red-600"></p>
            <div class="flex gap-2 mt-4">
                <button type="button" data-fechar class="flex-1 min-h-[44px] rounded-xl text-sm font-bold text-slate-600 bg-white ring-1 ring-slate-200 hover:bg-slate-50">Cancelar</button>
                <button type="submit" class="flex-1 min-h-[44px] rounded-xl text-sm font-bold text-white bg-gradient-to-b from-emerald-500 to-emerald-600 shadow-md shadow-emerald-600/25 disabled:opacity-60">${esc(botao)}</button>
            </div>
        </form>`;
        document.body.appendChild(fundo);
        const form = fundo.firstElementChild, campo = form.elements.nome;
        const fechar = () => fundo.remove();
        fundo.addEventListener('click', e => { if (e.target === fundo || e.target.closest('[data-fechar]')) fechar(); });
        fundo.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(); });
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const b = form.querySelector('[type=submit]'), erro = form.querySelector('[data-erro]');
            b.disabled = true; erro.classList.add('hidden');
            try { await aoSalvar(normalizar(campo.value)); fechar(); }
            catch (err) { erro.textContent = err.message || 'Não foi possível salvar.'; erro.classList.remove('hidden'); b.disabled = false; }
        });
        setTimeout(() => { campo.focus(); campo.select(); }, 50);
    }

    const jaExiste = (nome, ignorar) => todosParceiros.concat(PROPRIOS).find(n => n !== ignorar && semAcento(n) === semAcento(nome));

    async function novoParceiro(painel) {
        janelaNome({
            titulo: 'Novo parceiro', botao: 'Cadastrar', texto: 'Aparece na Pesagem (SPG Oásis e SPG Estufa) e na Produtividade Packing.',
            aoSalvar: async nome => {
                if (!nome) throw new Error('Informe o nome do parceiro.');
                const igual = jaExiste(nome);
                if (igual) throw new Error(`"${igual}" já está cadastrado.`);
                const { error } = await API.cliente.from('packing_cadastros').insert({ tipo: 'produtores', valor: nome });
                if (error) throw new Error(error.message);
                await carregarParceiros(); desenharListaParceiros(painel);
                avisar(`${nome} cadastrado.`);
            }
        });
    }

    async function renomearParceiro(painel, antigo) {
        janelaNome({
            titulo: 'Renomear parceiro', botao: 'Salvar', valor: antigo,
            texto: 'As entregas e baixas que já existem com este nome na Produtividade Packing também são corrigidas.',
            aoSalvar: async nome => {
                if (!nome) throw new Error('Informe o nome do parceiro.');
                if (nome === antigo) return;
                const igual = jaExiste(nome, antigo);
                if (igual) throw new Error(`"${igual}" já está cadastrado.`);
                const passos = [
                    API.cliente.from('packing_cadastros').update({ valor: nome }).eq('tipo', 'produtores').eq('valor', antigo),
                    API.cliente.from('packing_entregas').update({ produtor: nome }).eq('produtor', antigo),
                    API.cliente.from('packing_estoque_saidas').update({ produtor: nome }).eq('produtor', antigo)
                ];
                for (const p of passos) { const { error } = await p; if (error) throw new Error(error.message); }
                await carregarParceiros(); desenharListaParceiros(painel);
                avisar(`${antigo} agora é ${nome}.`);
            }
        });
    }

    async function excluirParceiro(painel, nome) {
        const ok = await Dialogo.confirmar(`${nome} sai da lista da Pesagem e do Packing. As entregas que já existem continuam com este nome.`,
            { titulo: 'Excluir parceiro?', botao: 'Excluir', perigo: true });
        if (!ok) return;
        const { error } = await API.cliente.from('packing_cadastros').delete().eq('tipo', 'produtores').eq('valor', nome);
        if (error) { Dialogo.avisar(error.message, { tipo: 'erro', titulo: 'Não foi possível excluir' }); return; }
        await carregarParceiros(); desenharListaParceiros(painel);
        avisar(`${nome} excluído.`);
    }

    async function desenharParceiros(painel) {
        painel.innerHTML = `<div class="max-w-3xl mx-auto space-y-3">
            <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div class="bg-gradient-to-r from-emerald-600 to-emerald-700 px-5 py-4 flex items-center justify-between gap-3">
                    <div class="min-w-0"><h2 class="text-base font-bold text-white">Parceiros</h2><p class="text-xs text-white/80">Pesagem (SPG Oásis e SPG Estufa) e Produtividade Packing · <span data-par-total>…</span></p></div>
                    <button type="button" data-par="novo" class="shrink-0 min-h-[40px] text-xs font-bold text-white bg-white/20 hover:bg-white/30 px-3 rounded-lg">+ Novo parceiro</button>
                </div>
                <div class="p-3"><input type="search" data-par-busca placeholder="Buscar parceiro..." aria-label="Buscar parceiro" class="${CAMPO}"></div>
            </div>
            <div data-par-lista class="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100"><p class="py-10 text-center text-sm text-slate-400">Carregando…</p></div>
        </div>`;
        painel.addEventListener('input', e => { if (e.target.matches('[data-par-busca]')) { buscaParceiro = e.target.value; desenharListaParceiros(painel); } });
        painel.addEventListener('click', e => {
            const b = e.target.closest('[data-par]');
            if (!b) return;
            if (b.dataset.par === 'novo') novoParceiro(painel);
            else if (b.dataset.par === 'renomear') renomearParceiro(painel, b.dataset.nome);
            else if (b.dataset.par === 'excluir') excluirParceiro(painel, b.dataset.nome);
        });
        try { await carregarParceiros(); desenharListaParceiros(painel); }
        catch (err) { painel.querySelector('[data-par-lista]').innerHTML = `<p class="bg-amber-50 text-amber-900 rounded-2xl p-4 text-sm font-semibold">${esc(err.message)}</p>`; }
    }

    function desenharLocais() {
        el('locais').innerHTML = [...locais, PARCEIROS].map(id => `<button type="button" role="tab" aria-selected="${id === atual}" data-local="${esc(id)}"
            class="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${id === atual ? 'bg-white shadow-sm ring-1 ring-slate-200/80 text-emerald-700' : 'text-slate-500'}">${id === PARCEIROS ? 'Parceiros' : esc(API.nomeLocal(id))}</button>`).join('');
    }

    // Cada local tem o próprio painel: trocar de local não perde a busca do outro
    function abrir(id) {
        atual = id;
        try { localStorage.setItem(K_LOCAL, id); } catch (e) { /* só não lembra o local */ }
        desenharLocais();
        document.querySelectorAll('#paineis > [data-painel]').forEach(p => p.classList.toggle('hidden', p.dataset.painel !== id));
        if (catalogos.has(id)) return;
        const painel = document.createElement('div');
        painel.dataset.painel = id;
        el('paineis').appendChild(painel);
        if (id === PARCEIROS) { catalogos.set(id, null); desenharParceiros(painel); return; }
        const catalogo = window.CatalogoColheita.criar({ local: id, cliente: API.cliente, ehAdmin: true, nomeLocal: API.nomeLocal(id) });
        catalogos.set(id, catalogo);
        catalogo.desenhar(painel, { avisar });
    }

    el('locais').addEventListener('click', e => {
        const b = e.target.closest('[data-local]');
        if (b && b.dataset.local !== atual) abrir(b.dataset.local);
    });
    abrir(atual);
})();
