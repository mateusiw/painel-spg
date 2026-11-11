// =============================================================================
// PRODUÇÃO DOS PARCEIROS -> SUPABASE
//
// Copia a aba "PRD Consolidado" (planilha "SPG Produção Diária") para a tabela
// producao_parceiros do Supabase. Assim o app "Descarte de Parceiros" consulta a
// produção no Supabase (instantâneo), em vez de esperar o Apps Script ler a planilha.
// Só LÊ a planilha: nada aqui altera ou apaga dados dela.
//
// Fica NO MESMO PROJETO do code_unificado.gs (usa acharAbaProducao_,
// lerLinhasPorCabecalho_ e normalizar de lá). Como instalar:
//  1. No Supabase, rode supabase/descarte_parceiros.sql e, à parte, o "insert" da
//     chave que está comentado no fim dele (com a sua senha).
//  2. No Apps Script: Configurações do projeto > Propriedades do script >
//     Adicionar propriedade: SUPABASE_CHAVE_PRODUCAO = a mesma senha.
//  3. Crie este arquivo no projeto (Arquivos > + > Script) e cole este código.
//  4. Selecione instalarSincronizacaoProducao e clique em Executar (autorize).
//     Ela envia todo o histórico uma vez e liga o envio automático a cada 5 minutos.
// =============================================================================
var PRODUCAO_SUPABASE_URL = 'https://zwdgrduytuqtfameupes.supabase.co/rest/v1/rpc/producao_parceiros_sincronizar';
var PRODUCAO_SUPABASE_APIKEY = 'sb_publishable_8qqwaUX3wdws_xDZYo5zSg_ymLEeZkf'; // chave pública, a mesma do app
var PRODUCAO_DIAS_AUTOMATICO = 60;   // o envio automático reenvia só os últimos 60 dias (rápido)
var PRODUCAO_TAMANHO_LOTE = 2000;

// Linhas da aba de produção no formato da tabela; repetidas (mesmo dia, cultura e parceiro): vale a primeira
function linhasProducaoParaSupabase_(desde) {
  var sheet = acharAbaProducao_();
  if (!sheet) throw new Error("Aba '" + ABA_PRODUCAO + "' não encontrada.");
  var fuso = sheet.getParent().getSpreadsheetTimeZone();
  var linhas = lerLinhasPorCabecalho_(sheet, 0).linhas;
  var vistos = {};
  var saida = [];
  linhas.forEach(function (r) {
    if (!(r.dia instanceof Date)) return;
    var data = Utilities.formatDate(r.dia, fuso, 'yyyy-MM-dd');
    if (desde && data < desde) return;
    var cultura = String(r.classe || '').trim();
    var parceiro = String(r.parceiro || '').trim();
    var culturaNorm = normalizar(cultura), parceiroNorm = normalizar(parceiro);
    if (!culturaNorm || !parceiroNorm) return;
    var chave = data + '|' + culturaNorm + '|' + parceiroNorm;
    if (vistos[chave]) return;
    vistos[chave] = true;
    var bruto = r['peso (kg)'];
    var kg = (bruto === '' || bruto === null || bruto === undefined) ? null : Number(String(bruto).replace(',', '.'));
    saida.push({ data: data, cultura_norm: culturaNorm, parceiro_norm: parceiroNorm, cultura: cultura, parceiro: parceiro, producao_kg: (kg === null || isNaN(kg)) ? null : kg });
  });
  return saida;
}

function enviarProducaoSupabase_(desde, linhas) {
  var chave = PropertiesService.getScriptProperties().getProperty('SUPABASE_CHAVE_PRODUCAO');
  if (!chave) throw new Error('Falta a propriedade SUPABASE_CHAVE_PRODUCAO (Configurações do projeto > Propriedades do script).');
  var total = 0;
  // Sempre ao menos um envio: com 0 linhas ele só limpa o período (a planilha ficou vazia nele)
  for (var i = 0; i === 0 || i < linhas.length; i += PRODUCAO_TAMANHO_LOTE) {
    var lote = linhas.slice(i, i + PRODUCAO_TAMANHO_LOTE);
    var resposta = UrlFetchApp.fetch(PRODUCAO_SUPABASE_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { apikey: PRODUCAO_SUPABASE_APIKEY },
      muteHttpExceptions: true,
      payload: JSON.stringify({ p_chave: chave, p_desde: desde, p_linhas: lote, p_limpar: i === 0 })
    });
    var codigo = resposta.getResponseCode();
    if (codigo < 200 || codigo >= 300) throw new Error('Supabase respondeu ' + codigo + ': ' + resposta.getContentText());
    total += Number(resposta.getContentText()) || 0;
  }
  return total;
}

// Gatilho automático (a cada 5 minutos): reenvia os últimos dias, onde a produção ainda muda
function sincronizarProducaoSupabase() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // uma execução anterior ainda está rodando
  try {
    var d = new Date();
    d.setDate(d.getDate() - PRODUCAO_DIAS_AUTOMATICO);
    var desde = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var total = enviarProducaoSupabase_(desde, linhasProducaoParaSupabase_(desde));
    console.log('Produção enviada ao Supabase: ' + total + ' linha(s) desde ' + desde + '.');
  } finally {
    lock.releaseLock();
  }
}

// Envia o histórico inteiro (rode quando quiser recopiar tudo)
function sincronizarProducaoSupabaseCompleta() {
  var total = enviarProducaoSupabase_(null, linhasProducaoParaSupabase_(null));
  console.log('Histórico completo enviado ao Supabase: ' + total + ' linha(s).');
}

// Rode UMA VEZ: manda o histórico e liga o envio automático a cada 5 minutos
function instalarSincronizacaoProducao() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sincronizarProducaoSupabase') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sincronizarProducaoSupabase').timeBased().everyMinutes(5).create();
  sincronizarProducaoSupabaseCompleta();
}
