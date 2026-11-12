// Seletor de período padrão da Produção (o mesmo do Resumo): Dia | Mês | Ano | Intervalo, com
// setas ◀ ▶, atalhos e o período escrito por extenso ("Outubro de 2026").
//
// SeletorPeriodo.substituirCalendarios(opcoes): troca o visual dos calendários antigos (flatpickr,
// inputs .date-range-picker) de todas as abas por este seletor. Por baixo, continua gravando as
// datas no mesmo campo, então os filtros de cada aba funcionam como antes. Depois de mudar o período
// chama applyFilters<Aba>() (startMonthPrev -> applyFiltersPrev).
//   opcoes.anos()   -> anos que aparecem no seletor de ano
//   opcoes.ultima() -> 'AAAA-MM-DD' da última colheita (atalho "Última colheita")
(function () {
    'use strict';
    const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const MODOS = [['dia', 'Dia', 'calendar'], ['mes', 'Mês', 'calendar-range'], ['ano', 'Ano', 'calendar-days'], ['intervalo', 'Intervalo', 'calendar-search']];
    const CAMPO = 'w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-2 px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400 focus:bg-white';

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const isoDe = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const isoHoje = () => isoDe(new Date());
    const dataDe = iso => new Date(String(iso).slice(0, 10) + 'T12:00:00');
    const somarDias = (iso, n) => { const d = dataDe(iso); d.setDate(d.getDate() + n); return isoDe(d); };
    const dataBR = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '';
    const semana = iso => { const s = dataDe(iso).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''); return s.charAt(0).toUpperCase() + s.slice(1); };
    const diasEntre = (de, ate) => Math.round((dataDe(ate) - dataDe(de)) / 86400000);

    // ---------- Período ----------
    function intervalo(p) {
        switch (p.modo) {
            case 'tudo': return [null, null];
            case 'dia': return [p.dia, p.dia];
            case 'mes': return [isoDe(new Date(p.ano, p.mes, 1)), isoDe(new Date(p.ano, p.mes + 1, 0))];
            case 'ano': return [`${p.ano}-01-01`, `${p.ano}-12-31`];
            default: return p.de <= p.ate ? [p.de, p.ate] : [p.ate, p.de];
        }
    }
    function nome(p) {
        switch (p.modo) {
            case 'tudo': return 'Todo o período';
            case 'dia': return p.dia === isoHoje() ? `Hoje · ${dataBR(p.dia)}` : `${semana(p.dia)} ${dataBR(p.dia)}`;
            case 'mes': return `${MESES[p.mes]} de ${p.ano}`;
            case 'ano': return `Ano de ${p.ano}`;
            default: { const [de, ate] = intervalo(p); return de === ate ? dataBR(de) : `${dataBR(de)} a ${dataBR(ate)}`; }
        }
    }
    function mover(p, passo) {
        if (p.modo === 'dia') p.dia = somarDias(p.dia, passo);
        else if (p.modo === 'mes') { const d = new Date(p.ano, p.mes + passo, 1); p.mes = d.getMonth(); p.ano = d.getFullYear(); }
        else if (p.modo === 'ano') p.ano += passo;
        else if (p.modo === 'intervalo') { const [de, ate] = intervalo(p); const n = (diasEntre(de, ate) + 1) * passo; p.de = somarDias(de, n); p.ate = somarDias(ate, n); }
    }
    function trocarModo(p, modo) {
        const [de0] = intervalo(p);
        const de = de0 || isoHoje();
        const ref = dataDe(de);
        if (modo === 'dia') p.dia = p.modo === 'dia' ? p.dia : (de > isoHoje() ? isoHoje() : de);
        if (modo === 'mes') { p.mes = ref.getMonth(); p.ano = ref.getFullYear(); }
        if (modo === 'ano') p.ano = ref.getFullYear();
        if (modo === 'intervalo' && p.modo !== 'intervalo') { const [a, b] = intervalo(p); p.de = a || somarDias(isoHoje(), -29); p.ate = b || isoHoje(); }
        p.modo = modo;
    }
    function atalho(p, id, ultima) {
        const hoje = isoHoje(), d = new Date();
        switch (id) {
            case 'hoje': p.modo = 'dia'; p.dia = hoje; break;
            case 'ontem': p.modo = 'dia'; p.dia = somarDias(hoje, -1); break;
            case 'ultima': p.modo = 'dia'; p.dia = ultima || hoje; break;
            case 'esteMes': p.modo = 'mes'; p.mes = d.getMonth(); p.ano = d.getFullYear(); break;
            case 'mesPassado': { const m = new Date(d.getFullYear(), d.getMonth() - 1, 1); p.modo = 'mes'; p.mes = m.getMonth(); p.ano = m.getFullYear(); break; }
            case 'esteAno': p.modo = 'ano'; p.ano = d.getFullYear(); break;
            case 'anoPassado': p.modo = 'ano'; p.ano = d.getFullYear() - 1; break;
            case '7': p.modo = 'intervalo'; p.de = somarDias(hoje, -6); p.ate = hoje; break;
            case '30': p.modo = 'intervalo'; p.de = somarDias(hoje, -29); p.ate = hoje; break;
            case 'tudo': p.modo = 'tudo'; break;
        }
    }
    // Datas soltas -> o modo mais simples que as descreve (ano inteiro, mês inteiro, um dia...)
    function deDatas(de, ate) {
        const d = new Date();
        const base = { modo: 'tudo', dia: isoHoje(), mes: d.getMonth(), ano: d.getFullYear(), de: somarDias(isoHoje(), -29), ate: isoHoje() };
        if (!de || !ate) return base;
        const a = dataDe(de), b = dataDe(ate);
        if (de === ate) return { ...base, modo: 'dia', dia: de };
        if (de.slice(5) === '01-01' && ate.slice(5) === '12-31' && de.slice(0, 4) === ate.slice(0, 4)) return { ...base, modo: 'ano', ano: a.getFullYear() };
        if (a.getDate() === 1 && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear() && isoDe(new Date(b.getFullYear(), b.getMonth() + 1, 0)) === ate)
            return { ...base, modo: 'mes', mes: a.getMonth(), ano: a.getFullYear() };
        return { ...base, modo: 'intervalo', de, ate };
    }

    // ---------- Desenho ----------
    function html(p, opcoes) {
        const pilula = (ativo, attrs, conteudo) => `<button type="button" ${attrs} class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${ativo ? 'bg-white shadow-sm ring-1 ring-slate-200/80 text-emerald-700' : 'text-slate-500 hover:text-slate-700'}">${conteudo}</button>`;
        const chip = (id, texto, ativo) => `<button type="button" data-sp-atalho="${id}" class="px-2.5 py-1 rounded-full text-[11px] font-bold ${ativo ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'}">${texto}</button>`;
        const seta = (passo, rotulo) => `<button type="button" data-sp-passo="${passo}" aria-label="${rotulo}" title="${rotulo}" class="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"><i data-lucide="${passo < 0 ? 'chevron-left' : 'chevron-right'}" class="w-5 h-5"></i></button>`;
        let anos = (opcoes.anos && opcoes.anos()) || [];
        if (!anos.length) anos = [new Date().getFullYear()];
        if (!anos.includes(p.ano)) anos = [p.ano, ...anos];
        anos = [...new Set(anos)].sort((a, b) => b - a);
        const opcoesAno = anos.map(a => `<option value="${a}"${a === p.ano ? ' selected' : ''}>${a}</option>`).join('');
        let controles = '', chips;
        if (p.modo === 'dia') {
            controles = `${seta(-1, 'Dia anterior')}<input type="date" data-sp-campo="dia" value="${p.dia}" class="${CAMPO} text-center">${seta(1, 'Próximo dia')}`;
            chips = chip('hoje', 'Hoje') + chip('ontem', 'Ontem') + (opcoes.ultima ? chip('ultima', opcoes.rotuloUltima || 'Última colheita') : '');
        } else if (p.modo === 'mes') {
            controles = `${seta(-1, 'Mês anterior')}<select data-sp-campo="mes" class="${CAMPO}">${MESES.map((m, i) => `<option value="${i}"${i === p.mes ? ' selected' : ''}>${m}</option>`).join('')}</select>
                <select data-sp-campo="ano" class="${CAMPO} max-w-[100px]">${opcoesAno}</select>${seta(1, 'Próximo mês')}`;
            chips = chip('esteMes', 'Este mês') + chip('mesPassado', 'Mês passado');
        } else if (p.modo === 'ano') {
            controles = `${seta(-1, 'Ano anterior')}<select data-sp-campo="ano" class="${CAMPO}">${opcoesAno}</select>${seta(1, 'Próximo ano')}`;
            chips = chip('esteAno', 'Este ano') + chip('anoPassado', 'Ano passado');
        } else if (p.modo === 'intervalo') {
            controles = `<input type="date" data-sp-campo="de" value="${p.de}" aria-label="De" class="${CAMPO}"><span class="self-center text-xs font-bold text-slate-400">até</span><input type="date" data-sp-campo="ate" value="${p.ate}" aria-label="Até" class="${CAMPO}">`;
            chips = chip('7', 'Últimos 7 dias') + chip('30', 'Últimos 30 dias');
        } else {
            chips = '';
        }
        if (opcoes.tudo !== false) chips += chip('tudo', 'Tudo', p.modo === 'tudo');
        return `<div class="flex flex-col xl:flex-row xl:items-center gap-2.5">
                <div role="tablist" aria-label="Tipo de período" class="flex bg-slate-100/80 rounded-2xl ring-1 ring-slate-200/70 p-1 gap-1 shrink-0 self-start">
                    ${MODOS.map(([id, t, ic]) => pilula(p.modo === id, `role="tab" aria-selected="${p.modo === id}" data-sp-modo="${id}"`, `<i data-lucide="${ic}" class="w-3.5 h-3.5"></i>${t}`)).join('')}
                </div>
                ${controles ? `<div class="flex items-center gap-2 flex-1 min-w-0 xl:max-w-lg">${controles}</div>` : ''}
                <div class="flex flex-wrap gap-1.5">${chips}</div>
            </div>
            <p class="mt-2 flex items-center gap-1.5 text-sm font-black text-slate-800"><i data-lucide="calendar-check" class="w-4 h-4 text-emerald-600"></i><span data-sp-nome>${esc(nome(p))}</span></p>`;
    }

    // Monta um seletor dentro de "elemento". aoMudar(de, ate, periodo) é chamado a cada mudança.
    function montar(elemento, opcoes) {
        const estado = { p: opcoes.periodo || deDatas(null, null) };
        const desenhar = () => { elemento.innerHTML = html(estado.p, opcoes); if (window.lucide) lucide.createIcons(); };
        const mudou = () => { desenhar(); const [de, ate] = intervalo(estado.p); opcoes.aoMudar(de, ate, estado.p); };
        elemento.addEventListener('click', ev => {
            const m = ev.target.closest('[data-sp-modo]');
            if (m) { trocarModo(estado.p, m.dataset.spModo); return mudou(); }
            const s = ev.target.closest('[data-sp-passo]');
            if (s) { mover(estado.p, Number(s.dataset.spPasso)); return mudou(); }
            const a = ev.target.closest('[data-sp-atalho]');
            if (a) { atalho(estado.p, a.dataset.spAtalho, opcoes.ultima && opcoes.ultima()); return mudou(); }
        });
        elemento.addEventListener('change', ev => {
            const c = ev.target.closest('[data-sp-campo]');
            if (!c) return;
            const n = c.dataset.spCampo;
            if (n === 'mes' || n === 'ano') estado.p[n] = Number(c.value);
            else if (c.value) estado.p[n] = c.value;
            mudou();
        });
        desenhar();
        return {
            periodo: () => estado.p,
            // Atualiza sem chamar aoMudar (quando o período mudou por fora, ex.: "Limpar filtros" da aba)
            definirDatas(de, ate) { estado.p = deDatas(de, ate); desenhar(); },
            redesenhar: desenhar
        };
    }

    // Troca o visual de cada calendário flatpickr (.date-range-picker) por este seletor
    function substituirCalendarios(opcoes = {}) {
        document.querySelectorAll('.date-range-picker').forEach(input => {
            const fp = input._flatpickr;
            if (!fp || input.dataset.seletorPeriodo) return;
            input.dataset.seletorPeriodo = '1';
            const campoVisivel = fp.altInput || input;
            campoVisivel.style.display = 'none';
            // O campo "Período" passa a ocupar a linha inteira dos filtros
            const caixa = input.closest('div');
            if (caixa) { caixa.classList.remove('lg:max-w-[260px]', 'sm:w-auto', 'min-w-[200px]'); caixa.classList.add('w-full', 'basis-full'); }
            const alvo = document.createElement('div');
            campoVisivel.after(alvo);
            const aplicar = () => {
                const fn = window['applyFilters' + input.id.replace(/^startMonth/, '')];
                if (typeof fn === 'function') fn();
            };
            let mudandoPorAqui = false;
            const datasAtuais = () => fp.selectedDates.length === 2 ? [isoDe(fp.selectedDates[0]), isoDe(fp.selectedDates[1])] : [null, null];
            const [de0, ate0] = datasAtuais();
            const seletor = montar(alvo, {
                periodo: deDatas(de0, ate0),
                anos: opcoes.anos, ultima: opcoes.ultima, rotuloUltima: opcoes.rotuloUltima,
                aoMudar: (de, ate) => {
                    mudandoPorAqui = true;
                    if (de && ate) fp.setDate([de, ate], false); else fp.clear(false);
                    mudandoPorAqui = false;
                    aplicar();
                }
            });
            // Mudou por fora (Limpar filtros, período inicial...): o seletor acompanha
            const sincronizar = () => { if (!mudandoPorAqui) { const [de, ate] = datasAtuais(); seletor.definirDatas(de, ate); } };
            if (Array.isArray(fp.config.onChange)) fp.config.onChange.push(sincronizar);
            input.addEventListener('change', sincronizar);
            input._seletorPeriodo = seletor;
        });
    }

    // ---------- Par de campos De/Até (input type=date) ----------
    // Esconde os dois campos (e o "até" entre eles) e mostra o seletor no lugar. Ao escolher um
    // período, grava as datas nos MESMOS campos e dispara input/change neles, como se a pessoa
    // tivesse digitado: a lógica de cada tela continua a mesma. Se a tela muda as datas sozinha
    // (período inicial, atalhos próprios, "limpar"), o seletor acompanha.
    //   opcoes.aoMudar(de, ate)  -> chamado depois (ex.: telas com botão "Filtrar")
    //   opcoes.esconder          -> seletores CSS de outros elementos a esconder (atalhos antigos)
    //   opcoes.substituir        -> bloco inteiro a trocar pelo seletor (quando os campos vêm junto de ícone/botões)
    //   opcoes.tudo              -> mostra o atalho "Tudo" (padrão: não, os campos precisam de datas)
    const temControle = el => !!el.querySelector('input, select, textarea, button');
    function paraCampos(deRef, ateRef, opcoes = {}) {
        const de = typeof deRef === 'string' ? document.querySelector(deRef) : deRef;
        const ate = typeof ateRef === 'string' ? document.querySelector(ateRef) : ateRef;
        if (!de || !ate || de.dataset.seletorPeriodo) return null;
        de.dataset.seletorPeriodo = ate.dataset.seletorPeriodo = '1';

        // Onde fica o seletor: o bloco que tem só o período inteiro some; senão somem só os campos
        let comum = de.parentElement;
        while (comum && !comum.contains(ate)) comum = comum.parentElement;
        if (!comum) return null;
        const filhoCom = alvo => { let n = alvo; while (n.parentElement !== comum) n = n.parentElement; return n; };
        const wDe = filhoCom(de), wAte = filhoCom(ate);
        const outros = [...comum.querySelectorAll('input, select, textarea, button')].filter(c => c !== de && c !== ate);
        let ancora, esconder;
        const blocoInteiro = opcoes.substituir ? (typeof opcoes.substituir === 'string' ? document.querySelector(opcoes.substituir) : opcoes.substituir) : null;
        if (blocoInteiro) { ancora = blocoInteiro; esconder = [blocoInteiro]; }
        else if (!outros.length) { ancora = comum; esconder = [comum]; }
        else {
            ancora = wDe; esconder = [wDe, wAte];
            // o "até" (ou outro texto) entre os dois campos também sai
            for (let n = wDe.nextElementSibling; n && n !== wAte; n = n.nextElementSibling) if (!temControle(n)) esconder.push(n);
        }
        (opcoes.esconder || []).forEach(sel => document.querySelectorAll(sel).forEach(el => esconder.push(el)));
        esconder.forEach(el => { el.style.display = 'none'; });
        const caixa = document.createElement('div');
        caixa.className = 'seletor-periodo-caixa';
        caixa.style.flexBasis = '100%';
        caixa.style.gridColumn = '1 / -1';
        caixa.style.minWidth = '0';
        ancora.before(caixa);

        let gravando = false;
        const disparar = el => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
        const seletor = montar(caixa, {
            periodo: deDatas(de.value || null, ate.value || null),
            tudo: opcoes.tudo === true, anos: opcoes.anos, ultima: opcoes.ultima, rotuloUltima: opcoes.rotuloUltima,
            aoMudar: (novoDe, novoAte) => {
                const mudouDe = de.value !== (novoDe || ''), mudouAte = ate.value !== (novoAte || '');
                gravando = true; // o próprio aviso de mudança não redesenha o seletor
                try {
                    de.value = novoDe || ''; ate.value = novoAte || '';
                    if (mudouDe) disparar(de);
                    if (mudouAte || !mudouDe) disparar(ate);
                } finally { gravando = false; }
                if (opcoes.aoMudar) opcoes.aoMudar(novoDe, novoAte);
            }
        });
        // Datas mudadas pela própria tela (de.value = ...): o seletor acompanha
        let agendado = false;
        const sincronizar = () => {
            if (gravando || agendado) return;
            agendado = true;
            queueMicrotask(() => { agendado = false; seletor.definirDatas(de.value || null, ate.value || null); });
        };
        const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        [de, ate].forEach(campo => {
            Object.defineProperty(campo, 'value', { configurable: true, get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); sincronizar(); } });
            campo.addEventListener('change', sincronizar);
        });
        return seletor;
    }

    window.SeletorPeriodo = { montar, substituirCalendarios, paraCampos, intervalo, nome };
})();
