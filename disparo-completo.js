#!/usr/bin/env node
/**
 * DISPARO FINAL - INTEGRA TUDO
 * Usa src/processador-ofertas.js + WhatsApp Web.js
 */

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const {
  executar: processarOfertas,
  intercalarOfertasPorMarketplace
} = require('./src/processador-ofertas');
const {
  DEFAULT_STALE_MS,
  acquireGlobalLock,
  releaseGlobalLock
} = require('./src/global-lock');
const { patchConsole } = require('./src/log-mask');
const { PATHS, ensureDirectories } = require('./src/config/paths');
require('dotenv').config();
patchConsole();

console.log('='.repeat(70));
console.log('  🚀 DISPARO FINAL - RADAR DE OFERTAS');
console.log('='.repeat(70));

function parseEnvInt(val, defaultVal) {
  const n = Number(val);
  return (Number.isFinite(n) && n >= 0) ? n : defaultVal;
}

const CHANNEL_ID = process.env.WHATSAPP_CHANNEL_ID;
const INTERVALO_MS = parseEnvInt(process.env.INTERVALO_MS, 300000); // 5 minutos entre ofertas
const OFFER_LIMIT = parseEnvInt(process.env.OFFER_LIMIT, 0);
const MAX_REPROCESS_POR_OFERTA = parseEnvInt(process.env.MAX_REPROCESS_POR_OFERTA, 1);
const LOCK_STALE_MS = parseEnvInt(process.env.SEND_LOCK_STALE_MS, DEFAULT_STALE_MS);
const ACK_TIMEOUT_MS = parseEnvInt(process.env.ACK_TIMEOUT_MS, 45000);
const ANTI_REPETICAO_JANELA_HORAS = parseEnvInt(process.env.ANTI_REPETICAO_JANELA_HORAS, 24);
const ML_REFRESH_PRICE_BEFORE_SEND = String(process.env.ML_REFRESH_PRICE_BEFORE_SEND || 'true').toLowerCase() !== 'false';
const LOCK_FILE = PATHS.GLOBAL_LOCK;
const FAIL_LOG_FILE = PATHS.DISPAROS_FALHAS;
const FILA_REPROCESS_FILE = PATHS.FILA_REPROCESSAMENTO;
const LOCK_OWNER = process.env.SCHEDULED_RUN === '1' ? 'scheduled_disparo' : 'manual_disparo';

// Session ID FIXO - reutiliza mesma autenticação (salva via autenticar-sessao.js)
const SESSION_ID = 'producao';
const AUTH_STORE_PATH = PATHS.WWEBJS_SESSIONS.replace(/[\\/]$/, '') + '/' + SESSION_ID;

console.log(`\n[SESSION] ID: ${SESSION_ID} (REUTILIZANDO)`);
console.log(`[IMPORTANTE] Execute autenticar-sessao.js primeiro!\n`);

// Formatar mensagem WhatsApp
function formatarMensagem(oferta, numero, total) {
  const rating = '⭐'.repeat(Math.min(Math.round(oferta.rating), 5));
  const precoAtual = oferta.price.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const precoOriginal = Number(oferta.original_price || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const precoAtualNumero = Number(oferta.price || 0);
  const precoOriginalNumero = Number(oferta.original_price || 0);
  const descontoNumero = Number(oferta.discount || 0);
  const temDescontoValido = descontoNumero > 0 && precoOriginalNumero > precoAtualNumero;
  const blocoPreco = temDescontoValido
    ? `🔥 ${descontoNumero}% OFF\nDe: ~~R$ ${precoOriginal}~~\nPor: 💰 *R$ ${precoAtual}*`
    : `Por: 💰 *R$ ${precoAtual}*`;

  return `🛒 *Radar de Ofertas*

${oferta.product_name}
🏪 ${oferta.marketplace}

${blocoPreco}

${rating}

🔗 ${oferta.link}`;
}

// Cliente WhatsApp - com store customizado
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: AUTH_STORE_PATH
  }),
  puppeteer: {
    headless: true, // ✅ Sem interface gráfica - economiza Chrome
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate'
    ],
    timeout: 60000
  }
});

let ofertas = [];
let index = 0;
let enviadas = 0;
let puladasSemImagem = 0;
let lockAcquired = false;
let cicloIniciado = false;
let cicloReprocessamento = 0;
let filaReprocessamento = carregarFilaReprocessamento();
const tentativasPorOferta = new Map();
let encerrandoIntencionalmente = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function salvarFilaReprocessamento() {
  try {
    fs.writeFileSync(FILA_REPROCESS_FILE, JSON.stringify(filaReprocessamento, null, 2));
  } catch (e) {
    console.error('[FILA_SAVE_ERR]', e.message);
  }
}

function carregarFilaReprocessamento() {
  try {
    if (!fs.existsSync(FILA_REPROCESS_FILE)) return [];
    const conteudo = fs.readFileSync(FILA_REPROCESS_FILE, 'utf8');
    return JSON.parse(conteudo) || [];
  } catch {
    return [];
  }
}

function isErroRecuperavelEnvio(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    msg.includes('detached frame') ||
    msg.includes('execution context was destroyed') ||
    msg.includes('cannot find context')
  );
}

async function carregarImagemMedia(imageUrl) {
  try {
    const media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
    return media;
  } catch (err) {
    console.warn(`[MEDIA_LOAD_ERR] Nao foi possivel carregar imagem: ${err.message}`);
    return null;
  }
}

async function enviarComRecuperacao(chatId, msg, media = null) {
  const maxTentativas = 3;
  let houveRecuperacao = false;
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      const sent = media
        ? await client.sendMessage(chatId, media, { caption: msg })
        : await client.sendMessage(chatId, msg);
      const ack = await aguardarAckMensagem(sent?.id?._serialized, ACK_TIMEOUT_MS);

      if (ack < 1) {
        throw new Error(`ACK nao confirmado (ack=${ack})`);
      }

      return {
        tentativas: tentativa,
        houveRecuperacao,
        ultimoErro: ultimoErro ? String(ultimoErro.message || ultimoErro) : null,
        ackFinal: ack,
        messageId: sent?.id?._serialized || null
      };
    } catch (error) {
      ultimoErro = error;
      const recuperavel = isErroRecuperavelEnvio(error);
      const ultimaTentativa = tentativa === maxTentativas;

      if (!recuperavel || ultimaTentativa) {
        throw error;
      }

      console.warn(`[RECOVERY] Erro recuperavel no envio (${error.message}). Tentando recuperar sessao...`);
      houveRecuperacao = true;

      try {
        if (client.pupPage && !client.pupPage.isClosed()) {
          await client.pupPage.reload({ waitUntil: 'networkidle0', timeout: 60000 });
        }
      } catch (reloadError) {
        console.warn(`[RECOVERY] Falha ao recarregar pagina do WhatsApp: ${reloadError.message}`);
      }

      const backoffMs = tentativa * 5000;
      console.warn(`[RECOVERY] Aguardando ${backoffMs / 1000}s antes da nova tentativa...`);
      await sleep(backoffMs);
    }
  }
}

async function aguardarAckMensagem(messageId, timeoutMs) {
  if (!messageId) return 0;

  const inicio = Date.now();
  let ultimoAck = 0;
  let lastPollError = null;

  while (Date.now() - inicio < timeoutMs) {
    try {
      const msgObj = await client.getMessageById(messageId);
      const ack = Number(msgObj?.ack ?? 0);
      ultimoAck = ack;

      // >=1 significa que o servidor recebeu a mensagem.
      if (ack >= 1) {
        return ack;
      }

      // -1 indica erro no envio.
      if (ack === -1) {
        return ack;
      }
    } catch (err) {
      if (!lastPollError || lastPollError !== err.message) {
        console.warn(`[ACK_POLL_WARN] Erro no poll de ACK: ${err.message}`);
        lastPollError = err.message;
      }
    }

    await sleep(2000);
  }

  return ultimoAck;
}

// Arquivo de log de disparos
const LOG_DISPAROS = PATHS.DISPAROS_LOG;
const WHATSAPP_STATUS_FILE = PATHS.WHATSAPP_STATUS;

function atualizarStatusWhatsapp(status, extra = {}) {
  try {
    const payload = {
      status,
      updatedAt: Date.now(),
      updatedAtISO: new Date().toISOString(),
      sessionId: SESSION_ID,
      ...extra
    };

    fs.writeFileSync(WHATSAPP_STATUS_FILE, JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error('[WA_STATUS_ERR]', err.message);
  }
}

function liberarLock() {
  if (!lockAcquired) return;

  releaseGlobalLock(LOCK_FILE);
  lockAcquired = false;
}

function registrarDisparo(oferta, numero, total, metaEnvio = {}) {
  try {
    let log = { disparos: [] };
    if (fs.existsSync(LOG_DISPAROS)) {
      const conteudo = fs.readFileSync(LOG_DISPAROS, 'utf8');
      log = JSON.parse(conteudo);
    }

    log.disparos.push({
      timestamp: Date.now(),
      data: new Date().toLocaleString('pt-BR'),
      numero,
      total,
      produto: oferta.product_name,
      preco: oferta.price,
      marketplace: oferta.marketplace,
      link: oferta.link,
      desconto: oferta.discount,
      comissaoPercentual: Number.isFinite(Number(oferta.commission_rate))
        ? Number(oferta.commission_rate)
        : null,
      tentativasEnvio: Number(metaEnvio.tentativas || 1),
      entregaRecuperada: Boolean(metaEnvio.houveRecuperacao || false),
      erroRecuperado: metaEnvio.ultimoErro || null,
      ackEnvio: Number(metaEnvio.ackFinal || 0),
      messageId: metaEnvio.messageId || null
    });

    // Manter apenas últimos 100 disparos
    if (log.disparos.length > 100) {
      log.disparos = log.disparos.slice(-100);
    }

    log.totalEnviados = log.disparos.length;
    log.ultimoEnvio = Date.now();

    fs.writeFileSync(LOG_DISPAROS, JSON.stringify(log, null, 2));
  } catch (err) {
    console.error('[LOG_ERR]', err.message);
  }
}

function registrarFalhaDisparo(oferta, numero, total, metaFalha = {}) {
  try {
    let log = { falhas: [] };
    if (fs.existsSync(FAIL_LOG_FILE)) {
      const conteudo = fs.readFileSync(FAIL_LOG_FILE, 'utf8');
      log = JSON.parse(conteudo);
    }

    log.falhas.push({
      timestamp: Date.now(),
      data: new Date().toLocaleString('pt-BR'),
      numero,
      total,
      produto: oferta?.product_name || null,
      marketplace: oferta?.marketplace || null,
      link: oferta?.link || null,
      desconto: oferta?.discount ?? null,
      tentativasFalha: Number(metaFalha.tentativasFalha || 1),
      reprocessamentoAgendado: Boolean(metaFalha.reprocessamentoAgendado),
      erro: metaFalha.erro || 'Falha desconhecida'
    });

    if (log.falhas.length > 200) {
      log.falhas = log.falhas.slice(-200);
    }

    log.totalFalhas = log.falhas.length;
    log.ultimaFalha = Date.now();

    fs.writeFileSync(FAIL_LOG_FILE, JSON.stringify(log, null, 2));
  } catch (err) {
    console.error('[FAIL_LOG_ERR]', err.message);
  }
}

function ofertaTemImagem(oferta) {
  const image = oferta?.imageUrl || oferta?.image_url || oferta?.image || oferta?.imagem || '';
  return typeof image === 'string' && image.trim().length > 0;
}

function normalizarTexto(valor) {
  return String(valor || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function ehMarketplaceMercadoLivre(marketplace) {
  const m = normalizarTexto(marketplace);
  return m.includes('mercado livre') || m === 'ml';
}

function ehMarketplaceShopee(marketplace) {
  return normalizarTexto(marketplace).includes('shopee');
}

function normalizarNumeroPreco(valor) {
  const raw = String(valor || '').trim();
  if (!raw) return null;

  const semMoeda = raw.replace(/\s|R\$/gi, '');
  const semMilhar = semMoeda.replace(/\.(?=\d{3}(\D|$))/g, '');
  const decimalComPonto = semMilhar.replace(',', '.');
  const num = Number(decimalComPonto);

  return Number.isFinite(num) && num > 0 ? num : null;
}

function extrairPrecoHtmlMercadoLivre(html = '') {
  if (!html) return { precoAtual: null, precoOriginal: null };

  const $ = cheerio.load(html);

  const metaPrice =
    normalizarNumeroPreco($('meta[itemprop="price"]').attr('content')) ||
    normalizarNumeroPreco($('meta[property="product:price:amount"]').attr('content'));

  const fracAtual = $('main .andes-money-amount:not(.andes-money-amount--previous) .andes-money-amount__fraction').first().text().trim() ||
    $('main .andes-money-amount__fraction').first().text().trim();
  const centsAtual = $('main .andes-money-amount:not(.andes-money-amount--previous) .andes-money-amount__cents').first().text().trim() ||
    $('main .andes-money-amount__cents').first().text().trim();
  const blocoAtual = `${fracAtual}${centsAtual ? `,${centsAtual}` : ''}`;
  let precoAtual = metaPrice || normalizarNumeroPreco(blocoAtual);

  const fracOrig =
    $('.ui-pdp-price__original-value .andes-money-amount__fraction').first().text().trim() ||
    $('.andes-money-amount--previous .andes-money-amount__fraction').first().text().trim();
  const centsOrig =
    $('.ui-pdp-price__original-value .andes-money-amount__cents').first().text().trim() ||
    $('.andes-money-amount--previous .andes-money-amount__cents').first().text().trim();
  const blocoOrig = `${fracOrig}${centsOrig ? `,${centsOrig}` : ''}`;
  let precoOriginalExtraido = normalizarNumeroPreco(blocoOrig);

  // Quando a página expõe valores invertidos por estrutura dinâmica, corrigimos de forma defensiva.
  if (precoAtual && precoOriginalExtraido && precoOriginalExtraido < precoAtual) {
    const tmp = precoAtual;
    precoAtual = precoOriginalExtraido;
    precoOriginalExtraido = tmp;
  }

  const precoOriginal = precoOriginalExtraido && precoAtual && precoOriginalExtraido > precoAtual
    ? precoOriginalExtraido
    : precoAtual;

  return { precoAtual, precoOriginal };
}

function calcularDescontoSeguro(precoAtual, precoOriginal) {
  const atual = Number(precoAtual || 0);
  const original = Number(precoOriginal || 0);

  if (!Number.isFinite(atual) || atual <= 0) return 0;
  if (!Number.isFinite(original) || original <= atual) return 0;

  return Math.max(0, Math.round(((original - atual) / original) * 100));
}

function extrairIdMercadoLivreDeLink(link = '') {
  const raw = String(link || '');
  if (!raw) return '';

  const regexes = [
    /\/p\/(MLB\d+)/i,
    /\/(MLB-\d+)-/i,
    /[?&]item_id=(MLB\d+)/i
  ];

  for (const re of regexes) {
    const match = raw.match(re);
    if (match && match[1]) {
      return String(match[1]).toUpperCase().replace('-', '');
    }
  }

  return '';
}

async function sincronizarPrecoMercadoLivre(oferta) {
  if (!ML_REFRESH_PRICE_BEFORE_SEND) return;
  if (!ehMarketplaceMercadoLivre(oferta?.marketplace)) return;
  const urlPreco = oferta?.source_link || oferta?.raw_link || oferta?.link;
  if (!urlPreco) return;

  try {
    const response = await axios.get(urlPreco, {
      timeout: 15000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept-Language': 'pt-BR,pt;q=0.9'
      }
    });

    const idEsperado = extrairIdMercadoLivreDeLink(urlPreco) || String(oferta.product_id || '');
    const finalUrl = response?.request?.res?.responseUrl || oferta.link;
    const idObtido = extrairIdMercadoLivreDeLink(finalUrl);

    if (idEsperado && (!idObtido || idEsperado !== idObtido)) {
      console.warn(`[ML_PRICE_SYNC_WARN] Mismatch/ausencia de produto no sync de preco: esperado=${idEsperado} obtido=${idObtido || 'NA'}.`);
      return;
    }

    const { precoAtual, precoOriginal } = extrairPrecoHtmlMercadoLivre(response.data);
    if (!precoAtual) return;

    const precoAnterior = Number(oferta.price || 0);
    oferta.price = precoAtual;
    oferta.original_price = precoOriginal || precoAtual;
    oferta.discount = calcularDescontoSeguro(oferta.price, oferta.original_price);

    if (Math.abs(precoAnterior - precoAtual) >= 0.01) {
      console.log(`[ML_PRICE_SYNC] ${oferta.product_name}: ${precoAnterior.toFixed(2)} -> ${precoAtual.toFixed(2)}`);
    }
  } catch (err) {
    console.warn(`[ML_PRICE_SYNC_WARN] ${err.message}`);
  }
}

function carregarHistoricoDisparos() {
  try {
    if (!fs.existsSync(LOG_DISPAROS)) {
      return { seenLinks: new Set(), seenProdutos: new Set() };
    }

    const conteudo = fs.readFileSync(LOG_DISPAROS, 'utf8');
    const log = JSON.parse(conteudo);
    const disparos = Array.isArray(log?.disparos) ? log.disparos : [];
    const janelaMs = ANTI_REPETICAO_JANELA_HORAS * 60 * 60 * 1000;
    const limiteTimestamp = Date.now() - janelaMs;

    const seenLinks = new Set();
    const seenProdutos = new Set();

    disparos.forEach((d) => {
      const ts = Number(d?.timestamp) || 0;
      if (ts < limiteTimestamp) return;

      const link = normalizarTexto(d?.link);
      const marketplace = normalizarTexto(d?.marketplace);
      const produto = normalizarTexto(d?.produto);

      if (link) seenLinks.add(link);
      if (marketplace && produto) seenProdutos.add(`${marketplace}|${produto}`);
    });

    return { seenLinks, seenProdutos };
  } catch (err) {
    console.error('[LOG_READ_ERR]', err.message);
    return { seenLinks: new Set(), seenProdutos: new Set() };
  }
}

function filtrarOfertasNaoEnviadas(ofertasLista) {
  const { seenLinks, seenProdutos } = carregarHistoricoDisparos();

  const filtradas = ofertasLista.filter((oferta) => {
    const ofertaLink = normalizarTexto(oferta?.link);
    const ofertaMarketplace = normalizarTexto(oferta?.marketplace);
    const ofertaProduto = normalizarTexto(oferta?.product_name);
    const produtoKey = `${ofertaMarketplace}|${ofertaProduto}`;

    if (ofertaLink && seenLinks.has(ofertaLink)) return false;
    if (ofertaMarketplace && ofertaProduto && seenProdutos.has(produtoKey)) {
      return false;
    }

    return true;
  });

  const removidas = ofertasLista.length - filtradas.length;
  if (removidas > 0) {
    console.log(`[ANTI-REPETICAO] ${removidas} oferta(s) removida(s) por ja terem sido enviadas`);
  } else {
    console.log('[ANTI-REPETICAO] Nenhuma oferta repetida encontrada no log de disparos');
  }

  const filaShopee = [];
  const filaMercadoLivre = [];
  const filaOutros = [];

  filtradas.forEach((oferta) => {
    if (ehMarketplaceShopee(oferta?.marketplace)) {
      filaShopee.push(oferta);
      return;
    }

    if (ehMarketplaceMercadoLivre(oferta?.marketplace)) {
      filaMercadoLivre.push(oferta);
      return;
    }

    filaOutros.push(oferta);
  });

  // Alternância estrita Shopee -> ML quando os dois marketplaces estão disponíveis.
  if (filaShopee.length > 0 && filaMercadoLivre.length > 0) {
    const alternadas = [];
    const maxLen = Math.max(filaShopee.length, filaMercadoLivre.length);

    for (let i = 0; i < maxLen; i++) {
      if (filaShopee[i]) alternadas.push(filaShopee[i]);
      if (filaMercadoLivre[i]) alternadas.push(filaMercadoLivre[i]);
    }

    if (filaOutros.length > 0) {
      alternadas.push(...intercalarOfertasPorMarketplace(filaOutros));
    }

    return alternadas;
  }

  return intercalarOfertasPorMarketplace(filtradas);
}

function getOfertaKey(oferta) {
  const link = normalizarTexto(oferta?.link);
  if (link) return `link:${link}`;

  const marketplace = normalizarTexto(oferta?.marketplace);
  const produto = normalizarTexto(oferta?.product_name);
  return `mp:${marketplace}|prod:${produto}`;
}

async function enviarProxima() {
  if (index >= ofertas.length) {
    if (filaReprocessamento.length > 0) {
      cicloReprocessamento++;
      ofertas = filaReprocessamento.splice(0, filaReprocessamento.length);
      salvarFilaReprocessamento();
      index = 0;

      console.log('\n' + '='.repeat(70));
      console.log(`[REPROCESSAMENTO] Iniciando ciclo ${cicloReprocessamento} com ${ofertas.length} oferta(s) que falharam anteriormente`);
      console.log('='.repeat(70));

      setTimeout(enviarProxima, 2000);
      return;
    }

    console.log('\n' + '='.repeat(70));
    console.log(`✅ CICLO COMPLETO! ${enviadas} ofertas enviadas nesta rodada`);
    if (puladasSemImagem > 0) {
      console.log(`⚠️ ${puladasSemImagem} oferta(s) pulada(s) por falta de imagem`);
    }
    console.log('='.repeat(70));
    console.log('\n[ENCERRAMENTO] Encerrando processo gracefully - Cron reiniciará em 5 minutos\n');
    encerrandoIntencionalmente = true;

    try {
      await client.destroy();
    } catch (e) {
      console.log('[CLEANUP] Erro ao destruir client:', e.message);
    }
    liberarLock();
    process.exit(0);
  }

  const oferta = ofertas[index];
  const numero = index + 1;

  try {
    if (!ofertaTemImagem(oferta)) {
      console.log(`\n[SKIP] Oferta sem imagem (${numero}/${ofertas.length}): ${oferta?.product_name || 'sem nome'}`);
      puladasSemImagem++;
      index++;
      if (index < ofertas.length) {
        setTimeout(enviarProxima, 1000);
      } else {
        enviarProxima();
      }
      return;
    }

    const imageUrl = oferta?.imageUrl || oferta?.image_url || '';
    const media = await carregarImagemMedia(imageUrl);
    if (!media) {
      console.log(`\n[SKIP_SEM_IMAGEM] Imagem inacessivel (${numero}/${ofertas.length}): ${oferta?.product_name || 'sem nome'}`);
      puladasSemImagem++;
      index++;
      if (index < ofertas.length) {
        setTimeout(enviarProxima, 1000);
      } else {
        enviarProxima();
      }
      return;
    }

    console.log(`\n[${'='.repeat(20)}]`);
    console.log(`[${numero}/${ofertas.length}] Enviando...`);
    console.log(`[${'='.repeat(20)}]\n`);

    await sincronizarPrecoMercadoLivre(oferta);

    const msg = formatarMensagem(oferta, numero, ofertas.length);
    console.log(msg);
    console.log('\n[STATUS] Transmitindo...');

    const metaEnvio = await enviarComRecuperacao(CHANNEL_ID, msg, media);
    console.log(`[OK] ✅ Enviada! (ack=${metaEnvio.ackFinal}, id=${metaEnvio.messageId || 'n/a'})`);
    if (metaEnvio.houveRecuperacao) {
      console.log(`[RECOVERY] Envio recuperado apos ${metaEnvio.tentativas} tentativa(s).`);
    }

    // Registrar no log de disparos
    registrarDisparo(oferta, numero, ofertas.length, metaEnvio);
    console.log(`[LOG] Registrada no histórico de disparos`);

    enviadas++;
    index++;

    if (index < ofertas.length) {
      console.log(`[WAIT] ⏳ Aguardando ${INTERVALO_MS / 1000}s para próxima...`);
      setTimeout(enviarProxima, INTERVALO_MS);
    } else {
      enviarProxima();
    }

  } catch (error) {
    console.error(`[ERR] ${error.message}`);
    const ofertaKey = getOfertaKey(oferta);
    const tentativasFalha = (tentativasPorOferta.get(ofertaKey) || 0) + 1;
    tentativasPorOferta.set(ofertaKey, tentativasFalha);

    const reprocessamentoAgendado = tentativasFalha <= MAX_REPROCESS_POR_OFERTA;
    if (reprocessamentoAgendado) {
      filaReprocessamento.push(oferta);
      salvarFilaReprocessamento();
      console.log(`[REPROCESSAMENTO] Oferta agendada para nova tentativa (${tentativasFalha}/${MAX_REPROCESS_POR_OFERTA})`);
    } else {
      console.log(`[FALHA_FINAL] Oferta excedeu o limite de reprocessamento (${MAX_REPROCESS_POR_OFERTA})`);
    }

    registrarFalhaDisparo(oferta, numero, ofertas.length, {
      tentativasFalha,
      reprocessamentoAgendado,
      erro: error.message
    });

    index++;

    if (index < ofertas.length) {
      console.log('[CONTINUE] Avancando para a proxima oferta...');
      setTimeout(enviarProxima, 1000);
    } else {
      enviarProxima();
    }
  }
}

client.on('ready', async () => {
  if (cicloIniciado) {
    console.warn('[WARN] Client "ready" disparado novamente — ignorando reentrada');
    return;
  }
  cicloIniciado = true;
  console.log('\n[OK] WhatsApp pronto!\n');
  atualizarStatusWhatsapp('ready', { detail: 'Sessao conectada e pronta para envio' });

  try {
    // Processar ofertas
    console.log('[PROCESSANDO] Buscando e rankando ofertas...\n');
    ofertas = await processarOfertas();
    ofertas = filtrarOfertasNaoEnviadas(ofertas);

    if (OFFER_LIMIT > 0) {
      ofertas = ofertas.slice(0, OFFER_LIMIT);
      console.log(`[LIMITE] Processando apenas ${ofertas.length} oferta(s) por configuracao OFFER_LIMIT`);
    }

    if (ofertas.length === 0) {
      console.error('\n❌ Nenhuma oferta para enviar\n');
      client.destroy();
      liberarLock();
      process.exit(1);
    }

    console.log(`\n[BEGINDO ENVIO] ${ofertas.length} ofertas para enviar\n`);
    enviarProxima();

  } catch (error) {
    console.error(`\n[FATAL] ${error.message}\n`);
    client.destroy();
    liberarLock();
    process.exit(1);
  }
});

client.on('qr', (qr) => {
  atualizarStatusWhatsapp('qr_required', { detail: 'QR Code gerado, aguardando autenticacao' });
  console.log('\n' + '='.repeat(70));
  console.log('  📱 QR CODE GERADO - ESCANEIE COM WHATSAPP');
  console.log('='.repeat(70));
  console.log(qr);
  console.log('='.repeat(70) + '\n');

  // Salvar como arquivo de texto também
  fs.writeFileSync(PATHS.QR_CODE_TXT, qr);
  console.log('✅ QR Code salvo em: qr-code.txt\n');
});

client.on('error', (error) => {
  if (encerrandoIntencionalmente) {
    return;
  }
  atualizarStatusWhatsapp('error', { detail: error.message || 'Erro no client WhatsApp' });
  console.error('\n[CLIENT_ERR]', error.message);
  client.destroy().catch(() => {});
  liberarLock();
  process.exit(1);
});

client.on('authenticated', () => {
  atualizarStatusWhatsapp('authenticated', { detail: 'Sessao autenticada' });
});

client.on('auth_failure', (message) => {
  atualizarStatusWhatsapp('auth_failure', { detail: message || 'Falha na autenticacao' });
});

client.on('disconnected', (reason) => {
  atualizarStatusWhatsapp('disconnected', { detail: String(reason || 'Desconectado') });
});

client.on('change_state', (state) => {
  atualizarStatusWhatsapp('state_change', { detail: String(state || 'Estado alterado') });
});

// Tratar sinais de encerramento
process.on('SIGINT', () => {
  console.log('\n[SIGINT] Encerrando gracefully...');
  atualizarStatusWhatsapp('stopped', { detail: 'Processo encerrado por SIGINT' });
  liberarLock();
  client.destroy().catch(() => {});
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[SIGTERM] Encerrando gracefully...');
  atualizarStatusWhatsapp('stopped', { detail: 'Processo encerrado por SIGTERM' });
  liberarLock();
  client.destroy().catch(() => {});
  process.exit(0);
});

process.on('exit', () => {
  liberarLock();
});

ensureDirectories();
console.log('\n[INIT] Inicializando WhatsApp...\n');
const lockResult = acquireGlobalLock(LOCK_FILE, LOCK_OWNER, LOCK_STALE_MS);

if (!lockResult.acquired) {
  const owner = lockResult.lock?.owner || 'desconhecido';
  const pid = lockResult.lock?.pid || 'n/a';
  console.log(`[LOCK] Disparo nao iniciado. Outro processo ativo possui lock global (owner=${owner}, pid=${pid}).`);
  atualizarStatusWhatsapp('busy', { detail: `Lock global ativo por ${owner} (pid ${pid})` });
  process.exit(0);
}

lockAcquired = true;
atualizarStatusWhatsapp('initializing', { detail: `Inicializando cliente WhatsApp (${LOCK_OWNER})` });
client.initialize();
