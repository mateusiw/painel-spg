function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var registros = payload.registros;
    var responsavel = payload.responsavel || "Não informado";

    var resultado = calcularConsumo(registros, responsavel);

    if (payload.programacao && payload.programacao.length > 0) {
      salvarProgramacao(payload.programacao, responsavel, resultado.blocos);
    }

    return ContentService.createTextOutput(JSON.stringify({
      sucesso: true,
      resumo: resultado.resumoTexto,
      blocos: resultado.blocos,
      totalLitrosMil: resultado.totalLitrosMil,
      dataAtualizacao: resultado.dataAtualizacao
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (erro) {
    return ContentService.createTextOutput(JSON.stringify({
      sucesso: false,
      erro: erro.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var action = e.parameter.action;

    if (action === "historico") {
      return ContentService.createTextOutput(JSON.stringify({
        sucesso: true,
        historico: obterHistoricoProgramacoes()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "programacaoAtual") {
      return ContentService.createTextOutput(JSON.stringify({
        sucesso: true,
        programacao: obterProgramacaoAtual()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      sucesso: false,
      erro: "Ação inválida."
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (erro) {
    return ContentService.createTextOutput(JSON.stringify({
      sucesso: false,
      erro: erro.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Normaliza o valor da coluna "Data de Envio" para o formato dd/MM/yyyy,
// aceitando tanto texto ("dd/MM/yyyy" ou o antigo "dd/MM/yyyy HH:mm") quanto
// um objeto Date (caso o Sheets tenha convertido o texto automaticamente).
function formatarDataEnvio(raw) {
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return Utilities.formatDate(raw, "GMT-3", "dd/MM/yyyy");
  }
  var str = String(raw || "").trim();
  if (!str) return "";
  return str.split(" ")[0];
}

function obterHistoricoProgramacoes() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var aba = planilha.getSheetByName("Programações");
  if (!aba) return [];

  var dados = aba.getDataRange().getValues();
  if (dados.length <= 1) return [];

  // Agrupa as linhas por dia de envio + responsável: assim, mesmo que a
  // programação tenha sido enviada em vários lotes no mesmo dia, tudo
  // aparece consolidado em um único item no histórico.
  var grupos = {};
  var ordem = [];

  for (var i = 1; i < dados.length; i++) {
    var linha = dados[i];
    var dataEnvio = formatarDataEnvio(linha[0]);
    if (!dataEnvio) continue;

    var chave = dataEnvio + "|" + String(linha[9] || "");
    if (!grupos[chave]) {
      grupos[chave] = {
        dataEnvio: dataEnvio,
        responsavel: linha[9] || "",
        itens: []
      };
      ordem.push(chave);
    }

    grupos[chave].itens.push({
      dia: linha[1] || "",
      block: linha[2] || "",
      tipoAspersor: linha[3] || "",
      qtdAspersores: linha[4] || "",
      minutes: Number(linha[5]) || 0,
      turno: linha[6] || "",
      litrosEstimados: linha[7] || "",
      observation: linha[8] || ""
    });
  }

  // Mais recentes primeiro, limitado aos últimos 20 dias de envio para não sobrecarregar o app
  var resultado = ordem.reverse().map(function(chave) { return grupos[chave]; });
  return resultado.slice(0, 20);
}

// Reconstrói a programação atual a partir da planilha "Programações", usada
// para sincronizar o app com o que está oficialmente na planilha (a fonte
// da verdade), com base na coluna "ID" que identifica cada pulso de forma única.
function obterProgramacaoAtual() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var aba = planilha.getSheetByName("Programações");
  if (!aba) return [];

  var dados = aba.getDataRange().getValues();
  if (dados.length <= 1) return [];

  var cabecalho = dados[0];
  var colDia = cabecalho.indexOf("Dia da Semana");
  var colBloco = cabecalho.indexOf("Bloco");
  var colMinutos = cabecalho.indexOf("Tempo (min)");
  var colTurno = cabecalho.indexOf("Turno");
  var colObs = cabecalho.indexOf("Observação");
  var colId = cabecalho.indexOf("ID");

  if (colId === -1) return [];

  var porId = {};
  var ordem = [];

  for (var i = 1; i < dados.length; i++) {
    var linha = dados[i];
    var idBruto = String(linha[colId] || "").trim();
    if (!idBruto) continue; // ignora linhas antigas gravadas antes de existir a coluna ID

    if (!porId[idBruto]) ordem.push(idBruto);
    porId[idBruto] = {
      id: /^\d+$/.test(idBruto) ? Number(idBruto) : idBruto,
      dia: linha[colDia] || "",
      block: linha[colBloco] || "",
      minutes: Number(linha[colMinutos]) || 0,
      turno: linha[colTurno] || "",
      observation: linha[colObs] || ""
    };
  }

  return ordem.map(function(id) { return porId[id]; });
}

function salvarProgramacao(itens, responsavel, blocosInfo) {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var aba = planilha.getSheetByName("Programações");

  if (!aba) {
    aba = planilha.insertSheet("Programações");
    aba.appendRow(["Data de Envio", "Dia da Semana", "Bloco", "Tipo de Aspersor", "Qtd. Aspersores", "Tempo (min)", "Turno", "Litros Estimados (mil L)", "Observação", "Responsável", "ID"]);
    aba.setFrozenRows(1);
  }

  // Garante que a coluna "ID" exista mesmo em planilhas criadas antes dela existir,
  // usada para identificar um pulso já enviado e atualizar a linha em vez de duplicar.
  var ultimaColuna = Math.max(aba.getLastColumn(), 1);
  var cabecalho = aba.getRange(1, 1, 1, ultimaColuna).getValues()[0];
  var colId = cabecalho.indexOf("ID") + 1;
  if (colId === 0) {
    colId = ultimaColuna + 1;
    aba.getRange(1, colId).setValue("ID");
  }

  var dataEnvio = Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy");

  function limparNomeBlocoProg(nome) {
    return String(nome || "").toUpperCase().replace("BLOCO", "").trim();
  }

  // Soma os minutos totais por bloco entre os itens deste envio, para
  // ratear o total de litros do bloco proporcionalmente ao tempo de cada item.
  var minutosPorBloco = {};
  itens.forEach(function(item) {
    var bloco = limparNomeBlocoProg(item.block);
    minutosPorBloco[bloco] = (minutosPorBloco[bloco] || 0) + (Number(item.minutes) || 0);
  });

  // Mapeia ID -> número da linha já existente na planilha, para atualizar
  // o pulso editado em vez de criar uma linha nova duplicada.
  var idParaLinha = {};
  var totalLinhas = aba.getLastRow();
  if (totalLinhas > 1) {
    var idsExistentes = aba.getRange(2, colId, totalLinhas - 1, 1).getValues();
    for (var r = 0; r < idsExistentes.length; r++) {
      var idExistente = String(idsExistentes[r][0] || "").trim();
      if (idExistente) idParaLinha[idExistente] = r + 2;
    }
  }

  var linhasNovas = [];

  itens.forEach(function(item) {
    var bloco = limparNomeBlocoProg(item.block);
    var info = blocosInfo ? blocosInfo[bloco] : null;
    var tipoAspersor = info && info.aspersoresTexto ? info.aspersoresTexto : "";
    var qtdAspersores = info && info.totalAspersores ? info.totalAspersores : "";

    var litrosEstimados = "";
    if (info && info.litrosMil) {
      var totalBlocoMin = minutosPorBloco[bloco] || 0;
      var litrosTotalBloco = parseFloat(String(info.litrosMil).replace(",", ".")) * 1000;
      if (totalBlocoMin > 0) {
        var litrosItem = (litrosTotalBloco * (Number(item.minutes) || 0)) / totalBlocoMin;
        litrosEstimados = (litrosItem / 1000).toFixed(3).replace(".", ",");
      } else {
        litrosEstimados = info.litrosMil;
      }
    }

    var idItem = String(item.id || "").trim();
    var linha = [
      dataEnvio,
      item.dia || "",
      bloco,
      tipoAspersor,
      qtdAspersores,
      item.minutes || 0,
      item.turno || "",
      litrosEstimados,
      item.observation || "",
      responsavel
    ];
    while (linha.length < colId - 1) linha.push("");
    linha[colId - 1] = idItem;

    var linhaExistente = idItem && idParaLinha[idItem];
    if (linhaExistente) {
      aba.getRange(linhaExistente, 1, 1, linha.length).setValues([linha]);
      aba.getRange(linhaExistente, 1).setNumberFormat("@");
    } else {
      linhasNovas.push(linha);
    }
  });

  if (linhasNovas.length > 0) {
    var linhaInicial = aba.getLastRow() + 1;
    var intervalo = aba.getRange(linhaInicial, 1, linhasNovas.length, linhasNovas[0].length);
    // Força a coluna de data como texto simples, evitando que o Sheets
    // converta "dd/MM/yyyy" automaticamente em um valor de data/hora.
    intervalo.offset(0, 0, linhasNovas.length, 1).setNumberFormat("@");
    intervalo.setValues(linhasNovas);
  }
}

// ============================================================
// MIGRAÇÃO PARA O SUPABASE (rodar uma única vez pelo editor)
// Antes, em Configurações do projeto > Propriedades do script, crie:
//   SUPABASE_URL          = https://SEU-PROJETO.supabase.co
//   SUPABASE_SERVICE_KEY  = chave service_role / secret (apague depois!)
// Pode ser rodada de novo: "Dados do Bloco" é recriada do zero e
// "Programações" é atualizada pelo ID.
// ============================================================
function migrarParaSupabase() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty("SUPABASE_URL");
  var chave = props.getProperty("SUPABASE_SERVICE_KEY");
  if (!url || !chave) throw new Error("Defina SUPABASE_URL e SUPABASE_SERVICE_KEY nas Propriedades do script.");

  function chamar(metodo, caminho, corpo, prefer) {
    var headers = { apikey: chave };
    if (chave.indexOf("eyJ") === 0) headers.Authorization = "Bearer " + chave;
    if (prefer) headers.Prefer = prefer;
    var resp = UrlFetchApp.fetch(url + "/rest/v1/" + caminho, {
      method: metodo,
      contentType: "application/json",
      headers: headers,
      payload: corpo ? JSON.stringify(corpo) : undefined,
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() >= 300) {
      throw new Error(metodo + " " + caminho + " -> " + resp.getResponseCode() + ": " + resp.getContentText());
    }
  }

  function paraIso(raw) {
    if (raw instanceof Date && !isNaN(raw.getTime())) return Utilities.formatDate(raw, "GMT-3", "yyyy-MM-dd");
    var m = String(raw || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2) : null;
  }

  function paraNumero(raw) {
    if (typeof raw === "number") return raw;
    var n = parseFloat(String(raw || "").replace(",", "."));
    return isNaN(n) ? null : n;
  }

  function emLotes(lista, tamanho, fn) {
    for (var i = 0; i < lista.length; i += tamanho) fn(lista.slice(i, i + tamanho));
  }

  var planilha = SpreadsheetApp.getActiveSpreadsheet();

  // --- Dados do Bloco ---
  var abaBlocos = planilha.getSheetByName("Dados do Bloco");
  var linhasBlocos = [];
  if (abaBlocos) {
    var dadosBlocos = abaBlocos.getDataRange().getValues();
    for (var i = 1; i < dadosBlocos.length; i++) {
      var l = dadosBlocos[i];
      if (!String(l[0] || "").trim()) continue;
      linhasBlocos.push({
        bloco: String(l[0]).trim(),
        valvulas: String(l[1] || ""),
        tipo_aspersor: String(l[2] || ""),
        qtd_aspersores: String(l[3] || ""),
        data_atualizacao: paraIso(l[4])
      });
    }
  }
  chamar("delete", "dados_bloco?id=gte.0");
  emLotes(linhasBlocos, 500, function(lote) { chamar("post", "dados_bloco", lote, "return=minimal"); });

  // --- Programações ---
  var abaProg = planilha.getSheetByName("Programações");
  var porId = {};
  var ordem = [];
  if (abaProg) {
    var dadosProg = abaProg.getDataRange().getValues();
    var colId = dadosProg[0].indexOf("ID");
    var base = Date.now() - dadosProg.length * 1000; // preserva a ordem das linhas em created_at
    for (var r = 1; r < dadosProg.length; r++) {
      var p = dadosProg[r];
      var dataEnvio = paraIso(p[0]);
      if (!dataEnvio) continue;
      // Linhas antigas sem ID recebem um ID "legado-" (ficam só no histórico)
      var id = colId >= 0 ? String(p[colId] || "").trim() : "";
      if (!id) id = "legado-" + (r + 1);
      if (!porId[id]) ordem.push(id);
      porId[id] = {
        id: id,
        data_envio: dataEnvio,
        dia: String(p[1] || ""),
        bloco: String(p[2] || ""),
        tipo_aspersor: String(p[3] || "") || null,
        qtd_aspersores: paraNumero(p[4]) !== null ? Math.round(paraNumero(p[4])) : null,
        minutos: Number(p[5]) || 0,
        turno: String(p[6] || ""),
        litros_estimados: paraNumero(p[7]),
        observacao: String(p[8] || ""),
        responsavel: String(p[9] || ""),
        created_at: porId[id] ? porId[id].created_at : new Date(base + r * 1000).toISOString()
      };
    }
  }
  var linhasProg = ordem.map(function(id) { return porId[id]; });
  emLotes(linhasProg, 500, function(lote) {
    chamar("post", "programacoes?on_conflict=id", lote, "resolution=merge-duplicates,return=minimal");
  });

  Logger.log("Migração concluída: " + linhasBlocos.length + " linhas de blocos, " + linhasProg.length + " programações.");
}

function calcularConsumo(registros, responsavel) {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var aba = planilha.getSheetByName("Dados do Bloco");

  if (!aba) throw new Error("Aba 'Dados do Bloco' não encontrada.");

  var dados = aba.getDataRange().getValues();
  var infoBlocos = {};

  function limparNomeBloco(nome) {
    return String(nome).toUpperCase().replace("BLOCO", "").trim();
  }

  function formatarData(raw) {
    if (!raw) return null;
    if (raw instanceof Date && !isNaN(raw.getTime())) {
      return Utilities.formatDate(raw, "GMT-3", "dd/MM");
    }
    var str = String(raw).trim();
    var parts = str.split('/');
    return parts.length >= 2 ? parts[0] + '/' + parts[1] : (str || null);
  }

  // Lê dados dos blocos da planilha — data de atualização por linha (coluna E)
  var dataMaisRecente = null;
  var dataMaisRecenteObj = null;

  for (var i = 1; i < dados.length; i++) {
    var nomeBloco = limparNomeBloco(dados[i][0]);
    if (!nomeBloco) continue;

    var textoValvulas = String(dados[i][1]);
    var matchValvulas = textoValvulas.match(/(\d+)/);
    var qtdValvulasLinha = matchValvulas ? parseInt(matchValvulas[1]) : 1;
    if (qtdValvulasLinha === 0) qtdValvulasLinha = 1;

    var tipoAspersor = String(dados[i][2]).trim();
    var matchVazao = tipoAspersor.match(/([\d.,]+)\s*L\/H/i);
    var vazaoLh = matchVazao ? parseFloat(matchVazao[1].replace(',', '.')) : 0;

    var qtdStringOriginal = String(dados[i][3]).trim();
    var qtdAspersoresLinha = parseFloat(qtdStringOriginal.replace(/\./g, '').replace(/,/g, '.')) || 0;

    // Lê data da coluna E desta linha
    var dataLinhaRaw = dados[i][4];
    var dataLinhaFormatada = formatarData(dataLinhaRaw);

    // Rastreia a data mais recente entre todos os blocos
    if (dataLinhaRaw instanceof Date && !isNaN(dataLinhaRaw.getTime())) {
      if (!dataMaisRecenteObj || dataLinhaRaw > dataMaisRecenteObj) {
        dataMaisRecenteObj = dataLinhaRaw;
        dataMaisRecente = dataLinhaFormatada;
      }
    } else if (dataLinhaFormatada && !dataMaisRecenteObj) {
      dataMaisRecente = dataLinhaFormatada;
    }

    if (!infoBlocos[nomeBloco]) {
      infoBlocos[nomeBloco] = { vazaoTotalBlocoLh: 0, qtdTotalValvulasNoBloco: 0, qtdTotalAspersores: 0, detalhesAspersores: [], dataAtualizacao: null };
    }

    // Atualiza a data do bloco se esta linha for mais recente
    if (dataLinhaRaw instanceof Date && !isNaN(dataLinhaRaw.getTime())) {
      if (!infoBlocos[nomeBloco].dataRaw || dataLinhaRaw > infoBlocos[nomeBloco].dataRaw) {
        infoBlocos[nomeBloco].dataRaw = dataLinhaRaw;
        infoBlocos[nomeBloco].dataAtualizacao = dataLinhaFormatada;
      }
    } else if (dataLinhaFormatada && !infoBlocos[nomeBloco].dataAtualizacao) {
      infoBlocos[nomeBloco].dataAtualizacao = dataLinhaFormatada;
    }

    infoBlocos[nomeBloco].vazaoTotalBlocoLh += qtdAspersoresLinha * vazaoLh;
    infoBlocos[nomeBloco].qtdTotalValvulasNoBloco += qtdValvulasLinha;
    infoBlocos[nomeBloco].qtdTotalAspersores += qtdAspersoresLinha;

    var tipoFormatado = tipoAspersor
      .replace(/Microaspersor/gi, 'Aspersor')
      .replace(/Microaspesor/gi, 'Aspersor')
      .replace(/Micro/gi, '')
      .trim();

    if (tipoFormatado && qtdStringOriginal) {
      var qtdFormatada = qtdAspersoresLinha > 0
        ? Math.round(qtdAspersoresLinha).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
        : qtdStringOriginal;
      infoBlocos[nomeBloco].detalhesAspersores.push(tipoFormatado + " = " + qtdFormatada);
    }
  }

  var dataAtualizacaoFormatada = dataMaisRecente || "Não informada";

  // Soma minutos por bloco usando rec.minutes diretamente
  var tempoPorBloco = {};
  registros.forEach(function(rec) {
    var blocoApp = limparNomeBloco(rec.block);
    if (!tempoPorBloco[blocoApp]) tempoPorBloco[blocoApp] = 0;
    tempoPorBloco[blocoApp] += rec.minutes || 0;
  });

  var textosResumo = [];
  var totalGeralLitros = 0;
  var totalBlocos = 0;
  var totalGeralMinutos = 0;
  var blocosEstruturado = {};

  for (var bloco in tempoPorBloco) {
    var minutos = tempoPorBloco[bloco];
    totalGeralMinutos += minutos;

    var horasDecimal = minutos / 60;
    var hFormat = Math.floor(minutos / 60);
    var mFormat = minutos % 60;
    var tempoTexto = (hFormat > 0 ? hFormat + "h " : "") + (mFormat > 0 || hFormat === 0 ? mFormat + "min" : "");
    tempoTexto = tempoTexto.trim();

    if (infoBlocos[bloco]) {
      var infos = infoBlocos[bloco];
      var vazaoMediaUmaValvula = infos.qtdTotalValvulasNoBloco > 0
        ? infos.vazaoTotalBlocoLh / infos.qtdTotalValvulasNoBloco
        : 0;
      var litrosTotais = vazaoMediaUmaValvula * horasDecimal;
      totalGeralLitros += litrosTotais;
      totalBlocos++;

      var litrosMil = (litrosTotais / 1000).toFixed(3).replace('.', ',');

      var processedAspersores = infos.detalhesAspersores.map(function(detalhe, idx) {
        var txt = idx > 0 ? detalhe.replace(/Aspersor/gi, '').trim() : detalhe;
        return "(" + txt + ")";
      });
      var aspersoresTexto = processedAspersores.join(" - ");

      blocosEstruturado[bloco] = {
        litrosMil: litrosMil,
        aspersoresTexto: aspersoresTexto,
        totalAspersores: Math.round(infos.qtdTotalAspersores),
        dataAtualizacao: (infoBlocos[bloco] && infoBlocos[bloco].dataAtualizacao) ? infoBlocos[bloco].dataAtualizacao : dataAtualizacaoFormatada
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

  var totalEmMilhares = (totalGeralLitros / 1000).toFixed(3).replace('.', ',');

  var hTotalFormat = Math.floor(totalGeralMinutos / 60);
  var mTotalFormat = totalGeralMinutos % 60;
  var tempoTotalTexto = (hTotalFormat > 0 ? hTotalFormat + "h " : "") +
    (mTotalFormat > 0 || hTotalFormat === 0 ? mTotalFormat + "min" : "");
  tempoTotalTexto = tempoTotalTexto.trim() + " - (" + totalGeralMinutos + " minutos)";

  var dataHoje = Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy");

  var textoFinal = "`Relatório de Irrigação (" + dataHoje + ")`\n\n";
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
