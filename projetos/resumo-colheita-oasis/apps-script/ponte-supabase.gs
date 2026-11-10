// =============================================================================
// PONTE PLANILHA -> SUPABASE (Resumo da Colheita Oásis)
//
// Copia as abas "Colheita", "Previsão Colheita", "Descarte" e "Sync" para o Supabase.
// O que foi lançado no sistema nunca é apagado ou alterado por esta cópia.
// Só lê a planilha. Nada do Code.gs atual precisa mudar, e a Produção Fazenda
// Oásis continua usando o mesmo Apps Script.
//
// Como instalar (uma vez só):
//  1. No Supabase, rode supabase/resumo_colheita.sql e depois:
//       select public.colheita_nova_chave_ponte('oasis');
//  2. No projeto do Apps Script da planilha, crie um arquivo com este conteúdo.
//  3. Em Configurações do projeto > Propriedades do script, adicione
//       SUPABASE_CHAVE_PONTE = (a chave gerada no passo 1)
//  4. Execute instalarPonteSupabase uma vez e autorize. Ela copia os dados
//     agora e agenda a cópia a cada 10 minutos.
// =============================================================================
var PONTE_URL = 'https://zwdgrduytuqtfameupes.supabase.co/rest/v1/rpc/colheita_importar';
var PONTE_APIKEY = 'sb_publishable_8qqwaUX3wdws_xDZYo5zSg_ymLEeZkf'; // chave pública, a mesma do app
var PONTE_LOCAL = 'oasis';

function ponteData_(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return Utilities.formatDate(valor, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var partes = valor.toString().split(' ')[0].split('/');
  if (partes.length === 3) return partes[2] + '-' + ('0' + partes[1]).slice(-2) + '-' + ('0' + partes[0]).slice(-2);
  return /^\d{4}-\d{2}-\d{2}/.test(valor.toString()) ? valor.toString().substring(0, 10) : null;
}

// Célula vazia vira null; texto no formato brasileiro vira número (como no Code.gs)
function ponteNumero_(valor) {
  if (valor === '' || valor === null || valor === undefined) return null;
  if (typeof valor === 'number') return valor;
  return parseFloat(valor.toString().replace(/\./g, '').replace(',', '.')) || 0;
}

function ponteTexto_(valor) {
  return valor ? valor.toString().trim() : '';
}

function ponteAba_(nome) {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
  if (!aba) throw new Error("Aba '" + nome + "' não encontrada.");
  return aba.getDataRange().getValues();
}

function ponteEntregas_() {
  var dados = ponteAba_('Colheita'), saida = [];
  for (var i = 1; i < dados.length; i++) {
    var l = dados[i];
    if (!l[3]) continue;
    saida.push({
      linha: i + 1,
      data_entrega: ponteData_(l[0]),
      total_plantas_campo: ponteNumero_(l[2]),
      bloco: l[3].toString().replace(/Talhão\s*|Bloco\s*/i, '').trim(),
      ciclo: ponteTexto_(l[6]),
      cultura: ponteTexto_(l[7]),
      variedade: ponteTexto_(l[8]),
      entregue_unidades: ponteNumero_(l[10]),
      entregue_kg: ponteNumero_(l[11]),
      caixas: ponteNumero_(l[13])
    });
  }
  return saida;
}

function pontePrevisao_() {
  var dados = ponteAba_('Previsão Colheita'), saida = [];
  for (var i = 1; i < dados.length; i++) {
    var l = dados[i];
    if (!l[1]) continue;
    saida.push({
      linha: i + 1,
      data_plantio: ponteData_(l[0]),
      bloco: l[1].toString().replace(/Bloco\s*/i, '').trim(),
      cultura: ponteTexto_(l[3]),
      ciclo: ponteTexto_(l[4]),
      variedade: ponteTexto_(l[5]),
      status: ponteTexto_(l[6]),
      inicio_colheita: ponteData_(l[7]),
      total_plantas: ponteNumero_(l[9])
    });
  }
  return saida;
}

// Colunas: Data - Descarte | Ano | Semana | Variedade | Causa - Perda | Local - Perda |
// Média Cabeça Brócolis (gr) | Total Descartado (kg) | Total Descartado (u.n)
// São localizadas pelo título. Sem a aba ou sem a coluna de data, não envia nada.
function ponteDescartes_() {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Descarte');
  if (!aba) return null;
  var dados = aba.getDataRange().getValues();
  if (!dados.length) return null;
  var titulos = dados[0].map(function (t) { return t.toString().toLowerCase().trim(); });
  var coluna = function (titulo) { return titulos.indexOf(titulo); };
  var celula = function (linha, c) { return c === -1 ? '' : linha[c]; };

  var cData = coluna('data - descarte');
  if (cData === -1) { Logger.log('Aba Descarte sem a coluna "Data - Descarte": não foi copiada.'); return null; }
  var cAno = coluna('ano'), cSemana = coluna('semana'), cVariedade = coluna('variedade'), cCausa = coluna('causa - perda');
  var cLocal = coluna('local - perda'), cMedia = coluna('média cabeça brócolis (gr)'), cKg = coluna('total descartado (kg)'), cUn = coluna('total descartado (u.n)');

  var saida = [];
  for (var i = 1; i < dados.length; i++) {
    var l = dados[i];
    var temConteudo = l.some(function (v) { return v !== '' && v !== null; });
    if (!temConteudo) continue;
    saida.push({
      linha: i + 1,
      data_descarte: ponteData_(l[cData]),
      ano: ponteTexto_(celula(l, cAno)),
      semana: ponteTexto_(celula(l, cSemana)),
      variedade: ponteTexto_(celula(l, cVariedade)),
      motivo: ponteTexto_(celula(l, cCausa)),
      local_perda: ponteTexto_(celula(l, cLocal)),
      media_gr: ponteNumero_(celula(l, cMedia)),
      peso_kg: ponteNumero_(celula(l, cKg)),
      unidades: ponteNumero_(celula(l, cUn))
    });
  }
  return saida;
}

// Usa as funções da aba "Sync" que já existem no Code.gs
function ponteSync_() {
  var aba = getSyncSheet_(), saida = {};
  Object.keys(SYNC_ALLOWED_KEYS).forEach(function (chave) {
    var linha = readSyncRow_(aba, chave);
    var dados = linha ? parseSyncJson_(linha.json) : null;
    if (linha && linha.updatedAt && dados !== null) saida[chave] = { updatedAt: linha.updatedAt, updatedBy: linha.updatedBy, data: dados };
  });
  return saida;
}

function sincronizarSupabase() {
  var chave = PropertiesService.getScriptProperties().getProperty('SUPABASE_CHAVE_PONTE');
  if (!chave) throw new Error('Configure a propriedade SUPABASE_CHAVE_PONTE do script.');

  var resposta = UrlFetchApp.fetch(PONTE_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: PONTE_APIKEY },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      p_local: PONTE_LOCAL,
      p_chave: chave,
      p_entregas: ponteEntregas_(),
      p_previsao: pontePrevisao_(),
      p_sync: ponteSync_(),
      p_descartes: ponteDescartes_()
    })
  });

  var codigo = resposta.getResponseCode();
  if (codigo < 200 || codigo >= 300) throw new Error('Supabase respondeu ' + codigo + ': ' + resposta.getContentText());
  Logger.log('Copiado para o Supabase: ' + resposta.getContentText());
}

// Depois de encerrar a planilha no Supabase: execute uma vez para parar as cópias
function desligarPonteSupabase() {
  ScriptApp.getProjectTriggers().forEach(function (gatilho) {
    if (gatilho.getHandlerFunction() === 'sincronizarSupabase') ScriptApp.deleteTrigger(gatilho);
  });
}

function instalarPonteSupabase() {
  sincronizarSupabase();
  ScriptApp.getProjectTriggers().forEach(function (gatilho) {
    if (gatilho.getHandlerFunction() === 'sincronizarSupabase') ScriptApp.deleteTrigger(gatilho);
  });
  ScriptApp.newTrigger('sincronizarSupabase').timeBased().everyMinutes(10).create();
}
