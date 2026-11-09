// =============================================================================
// MIGRAÇÃO COMPLETA DA PLANILHA -> SUPABASE
//
// Só lê a planilha: nada aqui altera ou apaga dados dela.
// Senhas não são copiadas (colunas "senha" e a coluna B das abas de usuários).
//
// Como usar:
//  1. No Supabase, rode supabase/planilha_arquivo.sql.
//  2. Crie este arquivo no Apps Script da planilha, ao lado do ponte-supabase.gs.
//     Ele usa a propriedade SUPABASE_CHAVE_PONTE que já foi configurada.
//  3. Execute diagnosticarPlanilha e copie o resultado do Registro de execução.
//  4. Execute migrarPlanilhaCompleta. Se o registro disser para executar de novo
//     (limite de tempo do Google), execute até aparecer "MIGRAÇÃO CONCLUÍDA".
//
// Pode rodar quantas vezes precisar: cada execução completa substitui a cópia.
// =============================================================================
var MIGRACAO_URL = 'https://zwdgrduytuqtfameupes.supabase.co/rest/v1/rpc/planilha_migrar_lote';
var MIGRACAO_APIKEY = 'sb_publishable_8qqwaUX3wdws_xDZYo5zSg_ymLEeZkf'; // chave pública, a mesma do app
var MIGRACAO_LOCAL = 'oasis';
var MIGRACAO_PROGRESSO = 'PLANILHA_MIGRACAO_PROGRESSO';
var MIGRACAO_LIMITE_MS = 5 * 60 * 1000;   // o Google encerra a execução em 6 minutos
var MIGRACAO_MAX_LINHAS = 500;
var MIGRACAO_MAX_CARACTERES = 4000000;

function migracaoLetra_(indice) {
  var s = '';
  for (var n = indice + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}

function migracaoColunasSenha_(nomeAba, cabecalho) {
  var omitir = {};
  cabecalho.forEach(function (titulo, i) {
    if (/senha|password|\bpass\b/i.test(String(titulo))) omitir[i] = true;
  });
  // Nas abas de usuários a senha fica na coluna B, mesmo se o título mudar
  if (/^usu[aá]rios/i.test(nomeAba)) omitir[1] = true;
  return omitir;
}

function migracaoCelula_(valor) {
  if (valor instanceof Date) return Utilities.formatDate(valor, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
  return valor;
}

function migracaoFormulas_(aba, cabecalho) {
  var formulas = aba.getDataRange().getFormulas(), colunas = {};
  for (var l = 1; l < formulas.length; l++) {
    for (var c = 0; c < formulas[l].length; c++) {
      if (!formulas[l][c]) continue;
      if (!colunas[c]) colunas[c] = { coluna: migracaoLetra_(c), titulo: String(cabecalho[c] || ''), quantidade: 0, exemplo: formulas[l][c].substring(0, 200) };
      colunas[c].quantidade++;
    }
  }
  return Object.keys(colunas).map(function (c) { return colunas[c]; });
}

// Cabeçalho, linhas com conteúdo e informações da aba
function migracaoLerAba_(aba, ordem) {
  var valores = aba.getDataRange().getValues();
  var nome = aba.getName();
  var cabecalho = (valores[0] || []).map(migracaoCelula_);
  var omitir = migracaoColunasSenha_(nome, cabecalho);
  var linhas = [];
  for (var i = 1; i < valores.length; i++) {
    var temConteudo = valores[i].some(function (v) { return v !== '' && v !== null; });
    if (!temConteudo) continue;
    linhas.push({ linha: i + 1, valores: valores[i].map(function (v, c) { return omitir[c] ? null : migracaoCelula_(v); }) });
  }
  return {
    linhas: linhas,
    info: {
      aba: nome,
      ordem: ordem,
      cabecalho: cabecalho,
      total_linhas: linhas.length,
      colunas_formula: migracaoFormulas_(aba, cabecalho),
      colunas_omitidas: Object.keys(omitir).map(function (c) { return migracaoLetra_(Number(c)); })
    }
  };
}

function migracaoEnviar_(chave, planilha, info, lote, recomecar) {
  var resposta = UrlFetchApp.fetch(MIGRACAO_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: MIGRACAO_APIKEY },
    muteHttpExceptions: true,
    payload: JSON.stringify({ p_local: MIGRACAO_LOCAL, p_chave: chave, p_planilha: planilha, p_aba: info, p_linhas: lote, p_recomecar: recomecar })
  });
  var codigo = resposta.getResponseCode();
  if (codigo < 200 || codigo >= 300) throw new Error('Supabase respondeu ' + codigo + ' na aba "' + info.aba + '": ' + resposta.getContentText());
  return JSON.parse(resposta.getContentText());
}

function migrarPlanilhaCompleta() {
  var inicio = new Date().getTime();
  var props = PropertiesService.getScriptProperties();
  var chave = props.getProperty('SUPABASE_CHAVE_PONTE');
  if (!chave) throw new Error('Configure a propriedade SUPABASE_CHAVE_PONTE do script.');

  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var abas = planilha.getSheets();
  var progresso = JSON.parse(props.getProperty(MIGRACAO_PROGRESSO) || '{"aba":0,"indice":0}');
  var acabouTempo = function () { return new Date().getTime() - inicio > MIGRACAO_LIMITE_MS; };

  for (var a = progresso.aba; a < abas.length; a++) {
    var dados = migracaoLerAba_(abas[a], a);
    var i = a === progresso.aba ? progresso.indice : 0;
    var recomecar = i === 0;
    var resposta;
    do {
      var lote = [], tamanho = 0;
      while (i < dados.linhas.length && lote.length < MIGRACAO_MAX_LINHAS && (tamanho < MIGRACAO_MAX_CARACTERES || !lote.length)) {
        tamanho += JSON.stringify(dados.linhas[i]).length;
        lote.push(dados.linhas[i++]);
      }
      resposta = migracaoEnviar_(chave, planilha.getId(), dados.info, lote, recomecar);
      recomecar = false;
      if (i < dados.linhas.length && acabouTempo()) {
        props.setProperty(MIGRACAO_PROGRESSO, JSON.stringify({ aba: a, indice: i }));
        Logger.log('Limite de tempo: aba "' + dados.info.aba + '" em ' + i + ' de ' + dados.linhas.length + ' linhas. EXECUTE DE NOVO para continuar.');
        return;
      }
    } while (i < dados.linhas.length);

    if (resposta.no_banco !== dados.linhas.length) {
      props.deleteProperty(MIGRACAO_PROGRESSO);
      throw new Error('Conferência falhou na aba "' + dados.info.aba + '": ' + dados.linhas.length + ' linhas na planilha e ' + resposta.no_banco + ' no banco. Execute de novo.');
    }
    Logger.log('OK  ' + dados.info.aba + ': ' + resposta.no_banco + ' de ' + dados.linhas.length + ' linhas conferidas');

    if (a + 1 < abas.length && acabouTempo()) {
      props.setProperty(MIGRACAO_PROGRESSO, JSON.stringify({ aba: a + 1, indice: 0 }));
      Logger.log('Limite de tempo entre abas. EXECUTE DE NOVO para continuar.');
      return;
    }
  }
  props.deleteProperty(MIGRACAO_PROGRESSO);
  Logger.log('MIGRAÇÃO CONCLUÍDA: ' + abas.length + ' abas copiadas.');
}

// Mostra o que a planilha tem e o que depende dela. Não copia nada.
function diagnosticarPlanilha() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var saida = ['PLANILHA: ' + planilha.getName(), 'ID: ' + planilha.getId(), ''];

  planilha.getSheets().forEach(function (aba, ordem) {
    var dados = migracaoLerAba_(aba, ordem);
    var formulario = aba.getFormUrl();
    saida.push('ABA "' + dados.info.aba + '" | ' + dados.info.total_linhas + ' linhas' + (aba.isSheetHidden() ? ' | OCULTA' : '') + (formulario ? ' | FORMULÁRIO: ' + formulario : ''));
    saida.push('  Colunas: ' + dados.info.cabecalho.join(' | '));
    if (dados.info.colunas_omitidas.length) saida.push('  Não será copiado (senha): coluna ' + dados.info.colunas_omitidas.join(', '));
    dados.info.colunas_formula.forEach(function (c) {
      saida.push('  Fórmula em ' + c.coluna + ' (' + c.titulo + ', ' + c.quantidade + ' células): ' + c.exemplo);
    });
    saida.push('');
  });

  saida.push('GATILHOS DESTE SCRIPT:');
  ScriptApp.getProjectTriggers().forEach(function (g) { saida.push('  ' + g.getHandlerFunction() + ' (' + g.getEventType() + ')'); });
  Logger.log(saida.join('\n'));
}
