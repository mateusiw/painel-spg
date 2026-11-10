// Dados das Aplicações Fitossanitárias no Supabase.
// Usado pelo index e pelo dashboard (que roda dentro do index e usa o login dele).
// As contas do dashboard são as mesmas de quando os dados vinham da planilha.
(function () {
  'use strict';
  var TABELA = 'aplicacoes_registros';
  var COLUNAS = 'id,tipo,data,local,solicitante,aplicador,hora_inicio,hora_fim,duracao,cultura,ciclo,bloco,plantas,alvo,produtos,volume_calda,ph,observacoes,produto_final,litros,dias_aeracao,metodo,adubacao_inicio,adubacao_fim,adubacao_duracao';

  function api() { return window.IrrigacaoAPI || window.parent.IrrigacaoAPI; }

  function isoDe(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function dataBr(d) {
    return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
  }

  // ---------- Gravação ----------
  function linhaDoItem(item) {
    var API = api();
    var local = API.todosLocais().find(function (l) { return l.nome === item.partner; });
    if (!local) throw new Error('Local "' + item.partner + '" não encontrado. Escolha o local novamente.');
    return {
      id: item.id, tipo: item.recordType || 'Fito', data: item.date, local: local.id,
      solicitante: item.requestor || '', aplicador: item.applicator || '',
      hora_inicio: item.startTime || '', hora_fim: item.endTime || '', duracao: item.duration || '',
      cultura: item.crop || '', ciclo: item.cycle || '', bloco: item.block || '', plantas: item.plants || '', alvo: item.target || '',
      produtos: (item.products || []).map(function (p) { return { name: p.name || '', type: p.type || '', dose: p.dose || '', unit: p.unit || '' }; }),
      volume_calda: item.volume || '', ph: item.ph || '', observacoes: item.notes || '',
      produto_final: item.finalProduct || '', litros: item.multiLiters || '', dias_aeracao: item.reactorDays || '',
      metodo: item.adubacaoMethod || '', adubacao_inicio: item.adubacaoStart || '', adubacao_fim: item.adubacaoEnd || '', adubacao_duracao: item.adubacaoDuration || ''
    };
  }

  // Sem internet ou servidor fora do ar: guarda no aparelho e envia sozinho depois.
  // Recusa do servidor (ex.: sem permissão) lança erro: o registro NÃO foi salvo.
  async function salvar(itens) {
    var API = api();
    var linhas = itens.map(linhaDoItem);
    var resp;
    try { resp = await API.cliente.from(TABELA).upsert(linhas, { onConflict: 'id' }); }
    catch (e) { resp = { error: e, status: 0 }; }
    if (!resp.error) return { pendente: false };
    var passageiro = !navigator.onLine || !resp.status || resp.status === 408 || resp.status === 429 || resp.status >= 500;
    if (!passageiro) throw new Error(resp.error.message || 'O servidor recusou o registro.');
    linhas.forEach(function (l) { API.enfileirar(TABELA, 'upsert', l); });
    return { pendente: true };
  }

  // ---------- Leitura ----------
  async function lerLinhas(inicio, fim) {
    var API = api();
    var tudo = [];
    for (var de = 0; ; de += 1000) {
      var q = API.cliente.from(TABELA).select(COLUNAS);
      if (inicio) q = q.gte('data', inicio);
      if (fim) q = q.lte('data', fim);
      var resp = await q.order('registrado_em', { ascending: true }).order('id', { ascending: true }).range(de, de + 999);
      if (resp.error) throw new Error(resp.error.message || 'Não foi possível ler os registros.');
      tudo = tudo.concat(resp.data || []);
      if (!resp.data || resp.data.length < 1000) return tudo;
    }
  }

  // Monta as linhas no formato das antigas abas (uma linha por produto).
  // A 1ª coluna identifica o registro, para os produtos ficarem juntos.
  function comVirgula(v) { return String(v || '').replace('.', ','); }
  function soDigitos(v) { return String(v || '').replace(/\D/g, ''); }

  function linhasDe(l, tipo) {
    var API = api();
    var produtos = l.produtos && l.produtos.length ? l.produtos : [{}];
    var local = API.nomeLocal(l.local);
    return l.tipo !== tipo ? [] : produtos.map(function (p, i) {
      var primeira = i === 0;
      var so = function (v) { return primeira ? v : ''; };
      if (tipo === 'Fito') return [l.id, l.data, local, l.solicitante, l.aplicador, so(l.hora_inicio), so(l.hora_fim), so(l.duracao), l.cultura, l.ciclo, l.bloco, so(soDigitos(l.plantas)), l.alvo, p.name || '', p.type || '', p.dose || '', p.unit || '', so(comVirgula(l.volume_calda)), so(l.ph), so(l.observacoes)];
      if (tipo === 'Multiplicacao') return [l.id, l.data, local, l.solicitante, l.aplicador, l.produto_final, l.litros, l.dias_aeracao, p.name || '', p.dose || '', p.unit || '', so(l.observacoes)];
      return [l.id, l.data, local, l.solicitante, l.aplicador, l.cultura, l.ciclo, l.bloco, so(soDigitos(l.plantas)), l.metodo, so(l.adubacao_inicio), so(l.adubacao_fim), so(l.adubacao_duracao), p.name || '', p.type || '', p.dose || '', p.unit || '', so(l.observacoes)];
    });
  }
  function abas(linhas, tipo) { return linhas.reduce(function (t, l) { return t.concat(linhasDe(l, tipo)); }, []); }

  function toNumero(valor) {
    if (typeof valor === 'number') return valor;
    var texto = toTexto(valor);
    if (texto.indexOf(',') >= 0) texto = texto.replace(/\./g, '').replace(',', '.');
    var num = Number(texto);
    return isNaN(num) ? 0 : num;
  }
  function formatDateShort(valor) {
    var d = parseDataFlex(valor);
    return d ? dataBr(d) : toTexto(valor);
  }

  function nomesDeProdutos(linhas, tipo) {
    var vistos = {};
    var nomes = [];
    linhas.forEach(function (l) {
      if (l.tipo !== tipo) return;
      (l.produtos || []).forEach(function (p) {
        var nome = toTexto(p.name);
        if (!nome || nome === '-' || vistos[nome.toLowerCase()]) return;
        vistos[nome.toLowerCase()] = true;
        nomes.push(nome);
      });
    });
    return nomes.sort();
  }

  async function responder(url) {
    var p = new URLSearchParams(url.split('?')[1] || '');
    var acao = p.get('action');
    if (acao === 'suggest') {
      var linhas = await lerLinhas();
      var s = sugerirPorAlvo(toTexto(p.get('target')), toTexto(p.get('culture')), toTexto(p.get('cycle')), toTexto(p.get('sector')), abas(linhas, 'Fito'));
      return { status: 'success', target: toTexto(p.get('target')), suggestions: s.suggestions, context: s.context };
    }
    if (acao === 'products') {
      var todas = await lerLinhas();
      return { status: 'success', products: { Fito: nomesDeProdutos(todas, 'Fito'), Adubacao: nomesDeProdutos(todas, 'Adubacao'), Multiplicacao: nomesDeProdutos(todas, 'Multiplicacao') } };
    }
    var intervalo = extrairIntervalo({ parameter: { start: p.get('start') || '', end: p.get('end') || '' } });
    var doPeriodo = await lerLinhas(isoDe(intervalo.start), isoDe(intervalo.end));
    var registros = [].concat(lerDefensivos(abas(doPeriodo, 'Fito')), lerLaboratorio(abas(doPeriodo, 'Multiplicacao')), lerAdubacao(abas(doPeriodo, 'Adubacao')));
    return { status: 'success', days: intervalo.days, periodStart: dataBr(intervalo.start), periodEnd: dataBr(intervalo.end), analytics: gerarAnalitico(registros, intervalo.days) };
  }

  // Responde como o antigo endereço do Apps Script; qualquer falha vira exceção
  window.aplicacoesBackend = async function (url) {
    var dados = await responder(url);
    return { ok: true, status: 200, json: async function () { return dados; } };
  };
  window.aplicacoesSalvar = salvar;

  // ---------- Contas do dashboard (as mesmas do Apps Script) ----------
  function extrairIntervalo(e) {
    var start = null;
    var end = null;
    if (e && e.parameter) {
      start = parseDataFlex(e.parameter.start || "");
      end = parseDataFlex(e.parameter.end || "");
    }

    if (start && end) {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      var daysCustom = Math.max(1, Math.ceil((end.getTime() - start.getTime() + 1) / 86400000));
      return { start: start, end: end, days: daysCustom };
    }

    var now = new Date();
    var historicoStart = new Date(2000, 0, 1, 0, 0, 0, 0);
    var historicoEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    var daysAuto = Math.max(1, Math.ceil((historicoEnd.getTime() - historicoStart.getTime() + 1) / 86400000));
    return { start: historicoStart, end: historicoEnd, days: daysAuto };
  }

  function sugerirPorAlvo(target, culture, cycle, sector, rows) {
    if (!target) return { suggestions: [], context: {} };
    var alvoBusca = target.toLowerCase();
    var culturaBusca = toTexto(culture).toLowerCase();
    var cicloBusca = toTexto(cycle).toLowerCase();
    var setorBusca = toTexto(sector).toLowerCase();
    var map = {};
    var volumeTotal = 0;
    var plantasTotal = 0;
    var usosComVolume = 0;
    var usosComPlantas = 0;
    var usosComVolumeEPlantas = 0;

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var alvo = toTexto(row[12]).toLowerCase();
      if (!alvo || alvo.indexOf(alvoBusca) === -1) continue;
      if (culturaBusca && toTexto(row[8]).toLowerCase() !== culturaBusca) continue;
      if (cicloBusca && toTexto(row[9]).toLowerCase() !== cicloBusca) continue;
      if (setorBusca && toTexto(row[10]).toLowerCase() !== setorBusca) continue;

      var produto = toTexto(row[13]) || "Não informado";
      var tipo = toTexto(row[14]) || "Não informado";
      var dose = toNumero(row[15]);
      var unidade = toTexto(row[16]) || "-";
      var volumeCalda = toNumero(row[17]);
      var plantas = toNumero(row[11]);
      var key = produto + "||" + tipo + "||" + unidade;

      if (!map[key]) {
        map[key] = {
          produto: produto,
          tipo: tipo,
          unidade: unidade,
          usos: 0,
          doseTotal: 0
        };
      }
      map[key].usos += 1;
      map[key].doseTotal += dose;
      if (volumeCalda > 0) {
        volumeTotal += volumeCalda;
        usosComVolume++;
      }
      if (plantas > 0) {
        plantasTotal += plantas;
        usosComPlantas++;
      }
      if (volumeCalda > 0 && plantas > 0) usosComVolumeEPlantas++;
    }

    var suggestions = Object.keys(map)
      .map(function(k) {
        var item = map[k];
        item.doseMedia = item.usos ? arred(item.doseTotal / item.usos, 2) : 0;
        return item;
      })
      .sort(function(a, b) { return b.usos - a.usos; })
      .slice(0, 8);

    var volumeMedio = usosComVolume ? arred(volumeTotal / usosComVolume, 2) : 0;
    var plantasMedias = usosComPlantas ? arred(plantasTotal / usosComPlantas, 0) : 0;
    var litrosPor100Plantas = (volumeTotal > 0 && plantasTotal > 0)
      ? arred((volumeTotal / plantasTotal) * 100, 2)
      : 0;

    return {
      suggestions: suggestions,
      context: {
        usosComVolume: usosComVolume,
        usosComPlantas: usosComPlantas,
        usosComVolumeEPlantas: usosComVolumeEPlantas,
        volumeCaldaMedio: volumeMedio,
        plantasMedias: plantasMedias,
        litrosPor100Plantas: litrosPor100Plantas
      }
    };
  }

  function lerDefensivos(rows) {
    var headers = ["Carimbo de Envio", "Data da Aplicação", "Local", "Solicitante", "Aplicador", "Horário Início", "Horário Fim", "Duração", "Cultura", "Ciclo", "Bloco/Setor", "Plantas", "Alvo", "Produto", "Tipo do Produto", "Dose", "Unidade", "Volume Calda (L)", "P.H.", "Observações"];
    var map = {};

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var key = [r[0], r[1], r[2], r[10], r[12]].join("|");
      if (!map[key]) {
        map[key] = {
          type: "Defensivos",
          when: parseDataHora(r[1], r[0]),
          data: formatDateShort(r[1]),
          local: toTexto(r[2]),
          solicitante: toTexto(r[3]),
          aplicador: toTexto(r[4]),
          responsavel: toTexto(r[4] || r[3]),
          setor: toTexto(r[10]),
          ciclo: toTexto(r[9]),
          metodo: "",
          produtoFinal: "",
          litrosMultiplicados: 0,
          duracaoMin: calcularDuracaoMin(r[5], r[6], r[7]),
          volumeCalda: toNumero(r[17]),
          produtos: [],
          tipos: [],
          alvos: [],
          doses: [],
          rawRows: []
        };
      }
      if (toTexto(r[13])) map[key].produtos.push(toTexto(r[13]));
      if (toTexto(r[14])) map[key].tipos.push(toTexto(r[14]));
      if (!map[key].aplicador && toTexto(r[4])) map[key].aplicador = toTexto(r[4]);
      if (!map[key].responsavel && toTexto(r[4] || r[3])) map[key].responsavel = toTexto(r[4] || r[3]);
      var alvoBruto = toTexto(r[12]);
      if (alvoBruto) map[key].alvos.push(alvoBruto);
      var doseDef = toNumero(r[15]);
      var unidadeDef = normalizarUnidade(r[16]);
      if (doseDef > 0) map[key].doses.push({ quantidade: doseDef, unidade: unidadeDef });
      map[key].rawRows.push(rowToObject(headers, r));
    }

    return Object.keys(map).map(function(k) {
      map[k].produtos = unicos(map[k].produtos);
      map[k].tipos = unicos(map[k].tipos);
      map[k].alvos = unicos(map[k].alvos);
      return map[k];
    });
  }

  function lerLaboratorio(rows) {
    var headers = ["Carimbo de Envio", "Data", "Local", "Solicitante", "Responsável", "Produto Final", "Litros Produzidos", "Dias Aeração", "Produto Base", "Dose", "Unidade", "Observações"];
    var map = {};

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var key = [r[0], r[1], r[2], r[5]].join("|");
      if (!map[key]) {
        map[key] = {
          type: "Laboratório",
          when: parseDataHora(r[1], r[0]),
          data: formatDateShort(r[1]),
          local: toTexto(r[2]),
          solicitante: toTexto(r[3]),
          aplicador: toTexto(r[4]),
          responsavel: toTexto(r[4] || r[3]),
          setor: "",
          ciclo: "",
          metodo: "",
          produtoFinal: toTexto(r[5]),
          litrosMultiplicados: toNumero(r[6]),
          duracaoMin: 0,
          volumeCalda: 0,
          produtos: [],
          tipos: [],
          alvos: [],
          doses: [],
          rawRows: []
        };
      }
      if (toTexto(r[8])) map[key].produtos.push(toTexto(r[8]));
      if (!map[key].aplicador && toTexto(r[4])) map[key].aplicador = toTexto(r[4]);
      if (!map[key].responsavel && toTexto(r[4] || r[3])) map[key].responsavel = toTexto(r[4] || r[3]);
      var doseLab = toNumero(r[9]);
      var unidadeLab = normalizarUnidade(r[10]);
      if (doseLab > 0) map[key].doses.push({ quantidade: doseLab, unidade: unidadeLab });
      map[key].rawRows.push(rowToObject(headers, r));
    }

    return Object.keys(map).map(function(k) {
      map[k].produtos = unicos(map[k].produtos);
      return map[k];
    });
  }

  function lerAdubacao(rows) {
    var headers = ["Carimbo de Envio", "Data", "Local", "Solicitante", "Aplicador", "Cultura", "Ciclo", "Bloco/Setor", "Plantas", "Método", "Horário Início", "Horário Fim", "Duração", "Adubo", "Tipo de Adubo", "Dose", "Unidade", "Observações"];
    var map = {};

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var key = [r[0], r[1], r[2], r[7], r[9]].join("|");
      if (!map[key]) {
        map[key] = {
          type: "Adubação",
          when: parseDataHora(r[1], r[0]),
          data: formatDateShort(r[1]),
          local: toTexto(r[2]),
          solicitante: toTexto(r[3]),
          aplicador: toTexto(r[4]),
          responsavel: toTexto(r[4] || r[3]),
          setor: toTexto(r[7]),
          ciclo: toTexto(r[6]),
          metodo: toTexto(r[9]),
          produtoFinal: "",
          litrosMultiplicados: 0,
          duracaoMin: calcularDuracaoMin(r[10], r[11], r[12]),
          volumeCalda: 0,
          produtos: [],
          tipos: [],
          alvos: [],
          doses: [],
          rawRows: []
        };
      }
      if (toTexto(r[13])) map[key].produtos.push(toTexto(r[13]));
      if (toTexto(r[14])) map[key].tipos.push(toTexto(r[14]));
      if (!map[key].aplicador && toTexto(r[4])) map[key].aplicador = toTexto(r[4]);
      if (!map[key].responsavel && toTexto(r[4] || r[3])) map[key].responsavel = toTexto(r[4] || r[3]);
      var doseAdu = toNumero(r[15]);
      var unidadeAdu = normalizarUnidade(r[16]);
      if (doseAdu > 0) map[key].doses.push({ quantidade: doseAdu, unidade: unidadeAdu });
      map[key].rawRows.push(rowToObject(headers, r));
    }

    return Object.keys(map).map(function(k) {
      map[k].produtos = unicos(map[k].produtos);
      map[k].tipos = unicos(map[k].tipos);
      return map[k];
    });
  }

  function gerarAnalitico(records, days) {
    var totals = { total: records.length, fito: 0, laboratorio: 0, adubacao: 0 };
    var setoresMap = {};
    var produtosMap = {};
    var tiposDefMap = {};
    var labMap = {};
    var metodosMap = {};
    var semanaMap = {};
    var ciclosMap = {};
    var solicitantesMap = {};
    var aplicadoresMap = {};
    var alvosMap = {};
    var unidadesMap = {};
    var mlTotal = 0;
    var totalLitros = 0;
    var totalDuracaoMin = 0;
    var totalComDuracao = 0;

    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      if (rec.type === "Defensivos") totals.fito++;
      if (rec.type === "Laboratório") totals.laboratorio++;
      if (rec.type === "Adubação") totals.adubacao++;

      if (rec.setor) {
        if (!setoresMap[rec.setor]) setoresMap[rec.setor] = { setor: rec.setor, total: 0, fito: 0, adubacao: 0 };
        setoresMap[rec.setor].total++;
        if (rec.type === "Defensivos") setoresMap[rec.setor].fito++;
        if (rec.type === "Adubação") setoresMap[rec.setor].adubacao++;
      }

      for (var p = 0; p < rec.produtos.length; p++) {
        var prod = rec.produtos[p];
        if (!produtosMap[prod]) produtosMap[prod] = { produto: prod, total: 0 };
        produtosMap[prod].total++;
      }

      if (rec.type === "Defensivos") {
        for (var t = 0; t < rec.tipos.length; t++) {
          var tipo = rec.tipos[t];
          if (!tiposDefMap[tipo]) tiposDefMap[tipo] = { tipo: tipo, total: 0 };
          tiposDefMap[tipo].total++;
        }
      }

      if (rec.type === "Laboratório") {
        var final = rec.produtoFinal || "Não informado";
        if (!labMap[final]) labMap[final] = { produto: final, total: 0, litros: 0 };
        labMap[final].total++;
        labMap[final].litros += rec.litrosMultiplicados || 0;
        totalLitros += rec.litrosMultiplicados || 0;
      }

      if (rec.type === "Adubação") {
        var metodo = rec.metodo || "Não informado";
        if (!metodosMap[metodo]) metodosMap[metodo] = { metodo: metodo, total: 0 };
        metodosMap[metodo].total++;
      }

      if (rec.ciclo) {
        if (!ciclosMap[rec.ciclo]) ciclosMap[rec.ciclo] = { ciclo: rec.ciclo, total: 0 };
        ciclosMap[rec.ciclo].total++;
      }

      if (rec.solicitante) {
        if (!solicitantesMap[rec.solicitante]) solicitantesMap[rec.solicitante] = { nome: rec.solicitante, total: 0 };
        solicitantesMap[rec.solicitante].total++;
      }

      if (rec.aplicador) {
        if (!aplicadoresMap[rec.aplicador]) aplicadoresMap[rec.aplicador] = { nome: rec.aplicador, total: 0 };
        aplicadoresMap[rec.aplicador].total++;
      }

      for (var av = 0; av < rec.alvos.length; av++) {
        var alvoItem = rec.alvos[av];
        if (!alvosMap[alvoItem]) alvosMap[alvoItem] = { alvo: alvoItem, total: 0 };
        alvosMap[alvoItem].total++;
      }

      for (var d = 0; d < rec.doses.length; d++) {
        var doseItem = rec.doses[d];
        var un = doseItem.unidade || "outros";
        if (!unidadesMap[un]) unidadesMap[un] = { unidade: un, totalLancamentos: 0, quantidadeTotal: 0 };
        unidadesMap[un].totalLancamentos++;
        unidadesMap[un].quantidadeTotal += doseItem.quantidade || 0;
        if (un === "ml") mlTotal += doseItem.quantidade || 0;
      }

      if (rec.duracaoMin > 0) {
        totalDuracaoMin += rec.duracaoMin;
        totalComDuracao++;
      }

      var chaveSem = chaveSemana(rec.when);
      if (chaveSem) {
        if (!semanaMap[chaveSem]) semanaMap[chaveSem] = { semana: chaveSem, total: 0, fito: 0, laboratorio: 0, adubacao: 0 };
        semanaMap[chaveSem].total++;
        if (rec.type === "Defensivos") semanaMap[chaveSem].fito++;
        if (rec.type === "Laboratório") semanaMap[chaveSem].laboratorio++;
        if (rec.type === "Adubação") semanaMap[chaveSem].adubacao++;
      }
    }

    return {
      days: days,
      totals: totals,
      kpis: {
        setoresAtivos: Object.keys(setoresMap).length,
        produtosUnicos: Object.keys(produtosMap).length,
        litrosMultiplicados: arred(totalLitros, 1),
        tempoMedioAplicacaoMin: totalComDuracao ? arred(totalDuracaoMin / totalComDuracao, 1) : 0,
        totalMl: arred(mlTotal, 1)
      },
      topSetores: ordenarTop(setoresMap, "total", 8),
      topProdutos: ordenarTop(produtosMap, "total", 10),
      defensivosTipos: ordenarTop(tiposDefMap, "total", 8),
      laboratorioProdutos: ordenarTop(labMap, "litros", 8),
      adubacaoMetodos: ordenarTop(metodosMap, "total", 8),
      porCiclo: ordenarTop(ciclosMap, "total", 10),
      porSolicitante: ordenarTop(solicitantesMap, "total", 10),
      porAplicador: ordenarTop(aplicadoresMap, "total", 10),
      porAlvo: ordenarTop(alvosMap, "total", 12),
      porUnidade: ordenarTop(unidadesMap, "totalLancamentos", 10),
      porSemana: ordenarSemanas(semanaMap),
      recent: montarRecentes(records, 12),
      allRecords: montarRegistrosCompletos(records)
    };
  }

  function ordenarTop(mapObj, campo, limite) {
    return Object.keys(mapObj)
      .map(function(k) { return mapObj[k]; })
      .sort(function(a, b) { return (b[campo] || 0) - (a[campo] || 0); })
      .slice(0, limite);
  }

  function ordenarSemanas(semanaMap) {
    return Object.keys(semanaMap)
      .map(function(k) { return semanaMap[k]; })
      .sort(function(a, b) { return a.semana.localeCompare(b.semana); });
  }

  function montarRecentes(records, limite) {
    return records
      .slice()
      .sort(function(a, b) { return (b.when ? b.when.getTime() : 0) - (a.when ? a.when.getTime() : 0); })
      .slice(0, limite)
      .map(function(r) {
        return {
          data: r.data || "",
          tipo: r.type || "",
          local: r.local || "",
          responsavel: r.responsavel || "",
          setor: r.setor || "-"
        };
      });
  }

  function parseDataHora(dataValor, timestampValor) {
    var data = parseDataFlex(dataValor);
    var stamp = parseDataFlex(timestampValor);
    return data || stamp;
  }

  function parseDataFlex(valor) {
    if (Object.prototype.toString.call(valor) === "[object Date]") return valor;
    var texto = String(valor || "").trim();
    if (!texto) return null;

    var br = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), Number(br[4] || 0), Number(br[5] || 0), Number(br[6] || 0));

    var iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), Number(iso[4] || 0), Number(iso[5] || 0), Number(iso[6] || 0));

    return null;
  }

  function chaveSemana(data) {
    if (!data) return "";
    var d = new Date(data.getTime());
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    var yearStart = new Date(d.getFullYear(), 0, 1);
    var week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return d.getFullYear() + "-S" + (week < 10 ? "0" + week : week);
  }

  function duracaoEmMinutos(valor) {
    var texto = toTexto(valor);
    if (!texto) return 0;
    var hhmm = texto.match(/^(\d{1,2}):(\d{2})$/);
    if (hhmm) return Number(hhmm[1]) * 60 + Number(hhmm[2]);
    var hmin = texto.match(/^(\d{1,2})h(?:\s*(\d{1,2})min)?$/i);
    if (hmin) return (Number(hmin[1]) * 60) + Number(hmin[2] || 0);
    var min = texto.match(/^(\d{1,4})min$/i);
    if (min) return Number(min[1]);
    return 0;
  }

  function minutosEntreHorarios(inicio, fim) {
    var ini = toTexto(inicio);
    var end = toTexto(fim);
    var mi = ini.match(/^(\d{1,2}):(\d{2})$/);
    var me = end.match(/^(\d{1,2}):(\d{2})$/);
    if (!mi || !me) return 0;
    var iniMin = Number(mi[1]) * 60 + Number(mi[2]);
    var fimMin = Number(me[1]) * 60 + Number(me[2]);
    var delta = fimMin - iniMin;
    if (delta < 0) delta += 24 * 60;
    return delta > 0 ? delta : 0;
  }

  function calcularDuracaoMin(horarioInicio, horarioFim, duracaoTexto) {
    var porHorario = minutosEntreHorarios(horarioInicio, horarioFim);
    if (porHorario > 0) return porHorario;
    return duracaoEmMinutos(duracaoTexto);
  }

  function normalizarUnidade(valor) {
    var u = toTexto(valor).toLowerCase();
    if (!u) return "outros";
    if (u === "ml" || u === "mL".toLowerCase()) return "ml";
    if (u === "kg" || u === "quilo" || u === "quilos") return "kg";
    if (u === "l" || u === "lt" || u === "litro" || u === "litros") return "l";
    return "outros";
  }

  function rowToObject(headers, row) {
    var out = {};
    for (var i = 0; i < headers.length; i++) {
      out[headers[i]] = row[i];
    }
    return out;
  }

  function montarRegistrosCompletos(records) {
    return records.map(function(r) {
      return {
        tipo: r.type || "",
        data: r.data || "",
        local: r.local || "",
        solicitante: r.solicitante || "",
        aplicador: r.aplicador || "",
        setor: r.setor || "",
        ciclo: r.ciclo || "",
        responsavel: r.responsavel || "",
        produtos: r.produtos || [],
        tipos: r.tipos || [],
        alvos: r.alvos || [],
        doses: r.doses || [],
        metodo: r.metodo || "",
        produtoFinal: r.produtoFinal || "",
        litrosMultiplicados: r.litrosMultiplicados || 0,
        volumeCalda: r.volumeCalda || 0,
        duracaoMin: r.duracaoMin || 0,
        rawRows: r.rawRows || []
      };
    });
  }

  function toTexto(valor) {
    return String(valor || "").trim();
  }

  function unicos(arr) {
    var map = {};
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var item = arr[i];
      if (!item || map[item]) continue;
      map[item] = true;
      out.push(item);
    }
    return out;
  }

  function arred(valor, casas) {
    var f = Math.pow(10, casas || 0);
    return Math.round((valor || 0) * f) / f;
  }
})();
