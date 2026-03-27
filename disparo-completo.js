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
const { createDeliveryService } = require('./src/services/delivery-service');
const { createCircuitBreaker, CircuitBreakerOpenError } = require('./src/resilience/circuit-breaker');
const { assertSessionDirectoryAccess } = require('./src/security/session-permissions');
const { createTrackedOfferLink } = require('./src/services/tracking-service');
require('dotenv').config();
patchConsole();

console.log('='.repeat(70));
console.log('  🚀 DISPARO FINAL - RADAR DE OFERTAS');
console.log('='.repeat(70));

function parseEnvInt(val, defaultVal) {
  const n = Number(val);
  return (Number.isFinite(n) && n >= 0) ? n : defaultVal;
}

function parseEnvBool(val, defaultVal = false) {
  if (val === undefined || val === null || val === '') return defaultVal;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(val).trim().toLowerCase());
}

const CHANNEL_ID = process.env.WHATSAPP_CHANNEL_ID;
const CHANNEL_NAME = String(process.env.WHATSAPP_CHANNEL_NAME || '').trim();
const ENVIRONMENT = String(process.env.ENVIRONMENT || '').trim().toLowerCase();
const PROD_CHANNEL_ID = String(process.env.WHATSAPP_PROD_CHANNEL_ID || '').trim();
const TEST_CHANNEL_ID = String(process.env.WHATSAPP_TEST_CHANNEL_ID || '').trim();
const TEST_CHANNEL_NAME = String(process.env.WHATSAPP_TEST_CHANNEL_NAME || '').trim();
const RADAR_TEST_MODE = parseEnvBool(process.env.RADAR_TEST_MODE, false);
const RADAR_DRY_RUN = parseEnvBool(process.env.RADAR_DRY_RUN, false);
const INTERVALO_MS = parseEnvInt(process.env.INTERVALO_MS, 300000); // 5 minutos entre ofertas
const OFFER_LIMIT = parseEnvInt(process.env.OFFER_LIMIT, 0);
const MAX_REPROCESS_POR_OFERTA = parseEnvInt(process.env.MAX_REPROCESS_POR_OFERTA, 1);
const LOCK_STALE_MS = parseEnvInt(process.env.SEND_LOCK_STALE_MS, DEFAULT_STALE_MS);
const ACK_TIMEOUT_MS = parseEnvInt(process.env.ACK_TIMEOUT_MS, 45000);
const ANTI_REPETICAO_JANELA_HORAS = parseEnvInt(process.env.ANTI_REPETICAO_JANELA_HORAS, 24);
const ML_REFRESH_PRICE_BEFORE_SEND = String(process.env.ML_REFRESH_PRICE_BEFORE_SEND || 'true').toLowerCase() !== 'false';
const PRIORITY_MARKETPLACE_RAW = String(process.env.RADAR_PRIORITY_MARKETPLACE || '').trim().toLowerCase();
const LOCK_FILE = PATHS.GLOBAL_LOCK;
const FAIL_LOG_FILE = PATHS.DISPAROS_FALHAS;
const FILA_REPROCESS_FILE = PATHS.FILA_REPROCESSAMENTO;
const WORKER_HEALTH_FILE = PATHS.DISPARO_WORKER_HEALTH;
const LOCK_OWNER = process.env.SCHEDULED_RUN === '1' ? 'scheduled_disparo' : 'manual_disparo';
const WHATSAPP_READY_HEARTBEAT_MS = Math.max(10000, parseEnvInt(process.env.WHATSAPP_READY_HEARTBEAT_MS, 60000));
const RADAR_PUBLIC_BASE_URL = String(
  process.env.RADAR_PUBLIC_BASE_URL || `http://localhost:${process.env.DASHBOARD_PORT || 3000}`
).trim().replace(/\/$/, '');
const RUN_ID = `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${process.pid}`;

const isTestContext =
  RADAR_TEST_MODE ||
  (TEST_CHANNEL_ID && CHANNEL_ID === TEST_CHANNEL_ID) ||
  (TEST_CHANNEL_NAME && CHANNEL_NAME && CHANNEL_NAME === TEST_CHANNEL_NAME) ||
  (CHANNEL_NAME && /\bteste\b/i.test(CHANNEL_NAME));

if (RADAR_TEST_MODE && (!TEST_CHANNEL_ID || !PROD_CHANNEL_ID)) {
  console.error('[SAFETY_BLOCK] RADAR_TEST_MODE exige WHATSAPP_TEST_CHANNEL_ID e WHATSAPP_PROD_CHANNEL_ID configurados.');
  process.exit(1);
}

if (isTestContext && PROD_CHANNEL_ID && CHANNEL_ID === PROD_CHANNEL_ID) {
  console.error('[SAFETY_BLOCK] Envio bloqueado: contexto de teste/homologacao detectado apontando para grupo de producao.');
  console.error(`[SAFETY_BLOCK] CHANNEL_NAME=${CHANNEL_NAME || 'n/a'} | CHANNEL_ID=${CHANNEL_ID || 'n/a'}`);
  console.error('[SAFETY_BLOCK] Ajuste WHATSAPP_CHANNEL_ID para WHATSAPP_TEST_CHANNEL_ID ou desative RADAR_TEST_MODE conscientemente.');
  process.exit(1);
}

// Session ID FIXO - reutiliza mesma autenticação (salva via autenticar-sessao.js)
const SESSION_ID = 'producao';
const AUTH_STORE_PATH = PATHS.WWEBJS_SESSIONS.replace(/[\\/]$/, '') + '/' + SESSION_ID;

console.log(`\n[SESSION] ID: ${SESSION_ID} (REUTILIZANDO)`);
console.log(`[IMPORTANTE] Execute autenticar-sessao.js primeiro!\n`);
console.log(`[RUN] ${RUN_ID}`);
console.log(`[TRACKING_BASE] ${RADAR_PUBLIC_BASE_URL}`);

// Formatar mensagem WhatsApp
function sanitizarTextoMensagem(valor, maxLen = 160) {
  const bruto = String(valor || '');

  // Remove caracteres de controle e compacta espacos/quebras.
  const limpo = bruto
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!limpo) return 'N/D';
  return limpo.length > maxLen ? `${limpo.slice(0, maxLen - 1)}…` : limpo;
}

function sanitizarLinkMensagem(link) {
  const raw = String(link || '').trim();
  if (!raw) return '';

  try {
    const u = new URL(raw);
    if (!['http:', 'https:'].includes(u.protocol)) return '';
    return u.toString();
  } catch {
    return '';
  }
}

function formatarMensagem(oferta, numero, total) {
  const rating = '⭐'.repeat(Math.min(Math.round(Number(oferta.rating || 0)), 5));
  const nomeProduto = sanitizarTextoMensagem(oferta.product_name, 180);
  const marketplace = sanitizarTextoMensagem(oferta.marketplace, 40);
  const linkSeguro = sanitizarLinkMensagem(oferta.tracking_link || oferta.link);
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

${nomeProduto}
🏪 ${marketplace}

${blocoPreco}

${rating}

🔗 ${linkSeguro || 'Link indisponivel no momento'}`;
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
let whatsappHeartbeatTimer = null;

function getOfferKey(oferta) {
  const marketplace = sanitizarTextoMensagem(oferta?.marketplace || 'n/d', 24);
  const productId = sanitizarTextoMensagem(oferta?.product_id || oferta?.product_name || 'n/d', 72);
  return `${marketplace}|${productId}`;
}

const deliveryService = createDeliveryService({
  client,
  MessageMedia,
  ackTimeoutMs: ACK_TIMEOUT_MS,
  logger: console
});

const mlPriceSyncBreaker = createCircuitBreaker({
  name: 'ml-price-sync',
  failureThreshold: 3,
  resetTimeoutMs: 30000,
  logger: console
});

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

// Arquivo de log de disparos
const LOG_DISPAROS = PATHS.DISPAROS_LOG;
const WHATSAPP_STATUS_FILE = PATHS.WHATSAPP_STATUS;

function atualizarStatusWhatsapp(status, extra = {}) {
  try {
    const payload = {
      runId: RUN_ID,
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

function atualizarHealthWorker(status, extra = {}) {
  try {
    const payload = {
      runId: RUN_ID,
      status,
      updatedAt: Date.now(),
      updatedAtISO: new Date().toISOString(),
      pid: process.pid,
      lockOwner: LOCK_OWNER,
      sessionId: SESSION_ID,
      offerIndex: index,
      offerTotal: ofertas.length,
      sentCount: enviadas,
      skippedNoImage: puladasSemImagem,
      queueSize: Array.isArray(filaReprocessamento) ? filaReprocessamento.length : 0,
      ...extra
    };

    fs.writeFileSync(WORKER_HEALTH_FILE, JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error('[WORKER_HEALTH_ERR]', err.message);
  }
}

function stopWhatsappHeartbeat() {
  if (!whatsappHeartbeatTimer) return;
  clearInterval(whatsappHeartbeatTimer);
  whatsappHeartbeatTimer = null;
}

function startWhatsappHeartbeat(status, detail) {
  stopWhatsappHeartbeat();
  whatsappHeartbeatTimer = setInterval(() => {
    atualizarStatusWhatsapp(status, { detail });
  }, WHATSAPP_READY_HEARTBEAT_MS);
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
      runId: RUN_ID,
      offerKey: getOfferKey(oferta),
      timestamp: Date.now(),
      data: new Date().toLocaleString('pt-BR'),
      numero,
      total,
      produto: oferta.product_name,
      productId: oferta.product_id || null,
      preco: oferta.price,
      marketplace: oferta.marketplace,
      link: oferta.link,
      sourceLink: oferta.source_link || oferta.raw_link || null,
      desconto: oferta.discount,
      comissaoPercentual: Number.isFinite(Number(oferta.commission_rate))
        ? Number(oferta.commission_rate)
        : null,
      tentativasEnvio: Number(metaEnvio.tentativas || 1),
      entregaRecuperada: Boolean(metaEnvio.houveRecuperacao || false),
      erroRecuperado: metaEnvio.ultimoErro || null,
      ackEnvio: Number(metaEnvio.ackFinal || 0),
      messageId: metaEnvio.messageId || null,
      trackingEnabled: Boolean(metaEnvio.trackingEnabled),
      trackingToken: metaEnvio.trackingToken || null,
      campaignId: metaEnvio.campaignId || null,
      category: metaEnvio.category || null
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
      runId: RUN_ID,
      offerKey: getOfferKey(oferta),
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

function obterMarketplacePrioritario() {
  if (PRIORITY_MARKETPLACE_RAW === 'ml' || PRIORITY_MARKETPLACE_RAW === 'mercado livre' || PRIORITY_MARKETPLACE_RAW === 'mercadolivre') {
    return 'Mercado Livre';
  }

  if (PRIORITY_MARKETPLACE_RAW === 'shopee') {
    return 'Shopee';
  }

  return '';
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
    const response = await mlPriceSyncBreaker.execute(
      () => axios.get(urlPreco, {
        timeout: 15000,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept-Language': 'pt-BR,pt;q=0.9'
        }
      }),
      'sincronizarPrecoMercadoLivre'
    );

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
    if (err instanceof CircuitBreakerOpenError) {
      console.warn(`[ML_PRICE_SYNC_WARN] Circuit breaker aberto: ${err.message}`);
      return;
    }
    console.warn(`[ML_PRICE_SYNC_WARN] ${err.message}`);
  }
}

function carregarHistoricoDisparos() {
  try {
    if (!fs.existsSync(LOG_DISPAROS)) {
      return { seenLinks: new Set(), seenProdutos: new Set(), seenProdutoIds: new Set(), seenSourceLinks: new Set() };
    }

    const conteudo = fs.readFileSync(LOG_DISPAROS, 'utf8');
    const log = JSON.parse(conteudo);
    const disparos = Array.isArray(log?.disparos) ? log.disparos : [];
    const janelaMs = ANTI_REPETICAO_JANELA_HORAS * 60 * 60 * 1000;
    const limiteTimestamp = Date.now() - janelaMs;

    const seenLinks = new Set();
    const seenProdutos = new Set();
    const seenProdutoIds = new Set();
    const seenSourceLinks = new Set();

    disparos.forEach((d) => {
      const ts = Number(d?.timestamp) || 0;
      if (ts < limiteTimestamp) return;

      const link = normalizarTexto(d?.link);
      const sourceLink = normalizarTexto(d?.sourceLink);
      const marketplace = normalizarTexto(d?.marketplace);
      const produto = normalizarTexto(d?.produto);
      const productId = normalizarTexto(d?.productId);

      if (link) seenLinks.add(link);
      if (sourceLink) seenSourceLinks.add(sourceLink);
      if (marketplace && produto) seenProdutos.add(`${marketplace}|${produto}`);
      if (marketplace && productId) seenProdutoIds.add(`${marketplace}|${productId}`);
    });

    return { seenLinks, seenProdutos, seenProdutoIds, seenSourceLinks };
  } catch (err) {
    console.error('[LOG_READ_ERR]', err.message);
    return { seenLinks: new Set(), seenProdutos: new Set(), seenProdutoIds: new Set(), seenSourceLinks: new Set() };
  }
}

function filtrarOfertasNaoEnviadas(ofertasLista) {
  const { seenLinks, seenProdutos, seenProdutoIds, seenSourceLinks } = carregarHistoricoDisparos();

  const filtradas = ofertasLista.filter((oferta) => {
    const ofertaLink = normalizarTexto(oferta?.link);
    const ofertaSourceLink = normalizarTexto(oferta?.source_link || oferta?.raw_link);
    const ofertaMarketplace = normalizarTexto(oferta?.marketplace);
    const ofertaProduto = normalizarTexto(oferta?.product_name);
    const ofertaProductId = normalizarTexto(oferta?.product_id);
    const produtoKey = `${ofertaMarketplace}|${ofertaProduto}`;
    const produtoIdKey = `${ofertaMarketplace}|${ofertaProductId}`;

    if (ofertaLink && seenLinks.has(ofertaLink)) return false;
    if (ofertaSourceLink && seenSourceLinks.has(ofertaSourceLink)) return false;
    if (ofertaMarketplace && ofertaProduto && seenProdutos.has(produtoKey)) {
      return false;
    }
    if (ofertaMarketplace && ofertaProductId && seenProdutoIds.has(produtoIdKey)) {
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
    const marketplacePrioritario = obterMarketplacePrioritario();
    const iniciarComMl = marketplacePrioritario === 'Mercado Livre';

    for (let i = 0; i < maxLen; i++) {
      if (iniciarComMl) {
        if (filaMercadoLivre[i]) alternadas.push(filaMercadoLivre[i]);
        if (filaShopee[i]) alternadas.push(filaShopee[i]);
      } else {
        if (filaShopee[i]) alternadas.push(filaShopee[i]);
        if (filaMercadoLivre[i]) alternadas.push(filaMercadoLivre[i]);
      }
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
    atualizarHealthWorker('cycle_completed', {
      sentCount: enviadas,
      skippedNoImage: puladasSemImagem,
      reprocessCycles: cicloReprocessamento
    });
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
  oferta.offerKey = getOfferKey(oferta);
  atualizarHealthWorker('sending', {
    currentOfferNumber: numero,
    currentOfferName: oferta?.product_name || null,
    currentOfferMarketplace: oferta?.marketplace || null,
    offerKey: oferta.offerKey
  });

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
    const media = await deliveryService.loadMedia(imageUrl);
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

    const tracking = createTrackedOfferLink({
      offer: oferta,
      runId: RUN_ID,
      publicBaseUrl: RADAR_PUBLIC_BASE_URL
    });
    oferta.tracking_link = tracking.trackingUrl;
    oferta.trackingToken = tracking.trackingToken;
    oferta.campaignId = tracking.metadata.campaignId;
    oferta.category = tracking.metadata.category;

    const msg = formatarMensagem(oferta, numero, ofertas.length);
    console.log(`[RUN ${RUN_ID}] [SEND ${oferta.offerKey}]`);
    console.log(msg);
    if (RADAR_DRY_RUN) {
      console.log('\n[DRY_RUN] Envio real ignorado (nenhuma mensagem foi enviada ao WhatsApp).');
      enviadas++;
      atualizarHealthWorker('dry_run_progress');
      index++;

      if (index < ofertas.length) {
        console.log(`[WAIT] ⏳ Aguardando ${INTERVALO_MS / 1000}s para próxima...`);
        setTimeout(enviarProxima, INTERVALO_MS);
      } else {
        enviarProxima();
      }
      return;
    }

    console.log('\n[STATUS] Transmitindo...');

    const metaEnvio = await deliveryService.sendWithRecovery(CHANNEL_ID, msg, media, {
      runId: RUN_ID,
      offerKey: oferta.offerKey
    });
    console.log(`[OK] ✅ Enviada! (ack=${metaEnvio.ackFinal}, id=${metaEnvio.messageId || 'n/a'})`);
    if (metaEnvio.houveRecuperacao) {
      console.log(`[RECOVERY] Envio recuperado apos ${metaEnvio.tentativas} tentativa(s).`);
    }

    metaEnvio.trackingEnabled = tracking.trackingEnabled;
    metaEnvio.trackingToken = tracking.trackingToken;
    metaEnvio.campaignId = tracking.metadata.campaignId;
    metaEnvio.category = tracking.metadata.category;

    // Registrar no log de disparos
    registrarDisparo(oferta, numero, ofertas.length, metaEnvio);
    console.log(`[LOG] Registrada no histórico de disparos`);

    enviadas++;
    atualizarHealthWorker('send_ok', {
      ackFinal: metaEnvio.ackFinal,
      messageId: metaEnvio.messageId || null
    });
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
    atualizarHealthWorker('send_error', {
      error: error.message,
      reprocessamentoAgendado
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
  atualizarHealthWorker('ready');
  startWhatsappHeartbeat('ready', 'Sessao conectada e pronta para envio');

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
      atualizarHealthWorker('no_offers');
      liberarLock();
      process.exit(1);
    }

    console.log(`\n[BEGINDO ENVIO] ${ofertas.length} ofertas para enviar\n`);
    atualizarHealthWorker('cycle_started', { offerTotal: ofertas.length });
    enviarProxima();

  } catch (error) {
    console.error(`\n[FATAL] ${error.message}\n`);
    atualizarHealthWorker('fatal_error', { error: error.message });
    client.destroy();
    liberarLock();
    process.exit(1);
  }
});

client.on('qr', (qr) => {
  stopWhatsappHeartbeat();
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
  stopWhatsappHeartbeat();
  atualizarStatusWhatsapp('error', { detail: error.message || 'Erro no client WhatsApp' });
  atualizarHealthWorker('client_error', { error: error.message || 'Erro no client WhatsApp' });
  console.error('\n[CLIENT_ERR]', error.message);
  client.destroy().catch(() => {});
  liberarLock();
  process.exit(1);
});

client.on('authenticated', () => {
  atualizarStatusWhatsapp('authenticated', { detail: 'Sessao autenticada' });
  atualizarHealthWorker('authenticated');
  startWhatsappHeartbeat('authenticated', 'Sessao autenticada');
});

client.on('auth_failure', (message) => {
  stopWhatsappHeartbeat();
  atualizarStatusWhatsapp('auth_failure', { detail: message || 'Falha na autenticacao' });
  atualizarHealthWorker('auth_failure', { error: message || 'Falha na autenticacao' });
});

client.on('disconnected', (reason) => {
  stopWhatsappHeartbeat();
  atualizarStatusWhatsapp('disconnected', { detail: String(reason || 'Desconectado') });
  atualizarHealthWorker('disconnected', { reason: String(reason || 'Desconectado') });
});

client.on('change_state', (state) => {
  atualizarStatusWhatsapp('state_change', { detail: String(state || 'Estado alterado') });
  atualizarHealthWorker('state_change', { state: String(state || 'Estado alterado') });

  const stateRaw = String(state || '').toUpperCase();
  if (stateRaw === 'CONNECTED') {
    startWhatsappHeartbeat('ready', 'Sessao conectada e pronta para envio');
  } else {
    stopWhatsappHeartbeat();
  }
});

// Tratar sinais de encerramento
process.on('SIGINT', () => {
  console.log('\n[SIGINT] Encerrando gracefully...');
  stopWhatsappHeartbeat();
  atualizarStatusWhatsapp('stopped', { detail: 'Processo encerrado por SIGINT' });
  atualizarHealthWorker('stopped', { signal: 'SIGINT' });
  salvarFilaReprocessamento();
  liberarLock();
  client.destroy().catch(() => {});
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[SIGTERM] Encerrando gracefully...');
  stopWhatsappHeartbeat();
  atualizarStatusWhatsapp('stopped', { detail: 'Processo encerrado por SIGTERM' });
  atualizarHealthWorker('stopped', { signal: 'SIGTERM' });
  salvarFilaReprocessamento();
  liberarLock();
  client.destroy().catch(() => {});
  process.exit(0);
});

process.on('exit', () => {
  salvarFilaReprocessamento();
  liberarLock();
});

ensureDirectories();
assertSessionDirectoryAccess(AUTH_STORE_PATH, console);
console.log('\n[INIT] Inicializando WhatsApp...\n');
atualizarHealthWorker('initializing');
const lockResult = acquireGlobalLock(LOCK_FILE, LOCK_OWNER, LOCK_STALE_MS);

if (!lockResult.acquired) {
  const owner = lockResult.lock?.owner || 'desconhecido';
  const pid = lockResult.lock?.pid || 'n/a';
  console.log(`[LOCK] Disparo nao iniciado. Outro processo ativo possui lock global (owner=${owner}, pid=${pid}).`);
  atualizarStatusWhatsapp('busy', { detail: `Lock global ativo por ${owner} (pid ${pid})` });
  atualizarHealthWorker('busy_lock', { lockOwner: owner, lockPid: pid });
  process.exit(0);
}

lockAcquired = true;
atualizarStatusWhatsapp('initializing', { detail: `Inicializando cliente WhatsApp (${LOCK_OWNER})` });
atualizarHealthWorker('lock_acquired');
client.initialize();
