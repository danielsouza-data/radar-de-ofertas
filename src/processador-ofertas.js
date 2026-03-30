// Busca Mercado Livre realmente inéditas (não enviadas)
async function buscarOfertasMercadoLivreIneditas({ quantidade = 20, palavrasChave = [], tentativas = 5, historicoOfertas = [] }) {
  const { buscarMercadoLivre } = module.exports;
  const ofertasIneditas = [];
  const usados = new Set(historicoOfertas.map(o => `${o.marketplace}|${o.product_id || o.link}`));
  const palavras = palavrasChave.length > 0 ? palavrasChave : [ML_KEYWORD, 'promoção', 'oferta', 'eletrônicos', 'casa', 'moda', 'acessórios', 'beleza', 'games', 'livros'];

  for (let i = 0; i < tentativas && ofertasIneditas.length < quantidade; i++) {
    const palavra = palavras[i % palavras.length];
    const novas = await buscarMercadoLivre(palavra, quantidade);
    for (const oferta of novas) {
      const key = `${oferta.marketplace}|${oferta.product_id || oferta.link}`;
      if (!usados.has(key)) {
        ofertasIneditas.push(oferta);
        usados.add(key);
        if (ofertasIneditas.length >= quantidade) break;
      }
    }
  }
  return ofertasIneditas;
}
// LOG: Quantidade de ofertas ML no bucket inicial
function logQuantidadeML(etapa, lista) {
  const total = Array.isArray(lista) ? lista.filter(o => String(o.marketplace).toLowerCase().includes('ml') || String(o.marketplace).toLowerCase().includes('mercado livre')).length : 0;
  console.log(`[DEBUG ML] ${etapa}: ${total} ofertas ML`);
}
// logQuantidadeML('Bucket inicial', listaDeOfertasML);
/**
 * RADAR DE OFERTAS - Versão Node.js
 * Baseado na automação N8N
 *
 * Fluxo:
 * 1. Busca produtos (Shopee + Mercado Livre)
 * 2. Normaliza dados
 * 3. Insere links de afiliado
 * 4. Ranking inteligente
 * 5. Anti-spam
 * 6. Envia WhatsApp
 */

const axios = require('axios');
const crypto = require('crypto');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Importar dados curados
const OFERTAS_CURADAS = require('./ofertas-curadas.js');

// Importar API Shopee Affiliate (com autenticação corrigida)
const ShopeeAffiliateAPI = require('./shopee-api-real.js');
const { carregarLinksMercadoLivreArquivo, deduplicarLinks, ehLinkMercadoLivreCurto, calcularCiclosPorJanela } = require('./utils-link');
const { createCircuitBreaker, CircuitBreakerOpenError } = require('./resilience/circuit-breaker');

console.log('='.repeat(70));
console.log('  🎯 RADAR DE OFERTAS - SISTEMA COMPLETO');
console.log('='.repeat(70));

// ============ CONFIG ============

const SHOPEE_PARTNER_ID = process.env.SHOPEE_PARTNER_ID;
const SHOPEE_PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY;
const ML_CLIENT_ID = process.env.MERCADO_LIVRE_CLIENT_ID;
const ML_CLIENT_SECRET = process.env.MERCADO_LIVRE_CLIENT_SECRET;
const ML_TOOL_ID = process.env.MERCADO_LIVRE_TOOL_ID;
const ML_KEYWORD = process.env.MERCADO_LIVRE_KEYWORD || 'eletrônicos';
const ML_MATT_WORD = process.env.MERCADO_LIVRE_MATT_WORD || 'canalwpp';
const ML_FORCE_IN_APP = String(process.env.MERCADO_LIVRE_FORCE_IN_APP || 'true').toLowerCase() !== 'false';
const ML_LINKBUILDER_LINKS_ENV = String(process.env.MERCADO_LIVRE_LINKBUILDER_LINKS || '')
  .split(/[\n,;]/)
  .map((s) => s.trim())
  .filter(Boolean);
const ML_LINKBUILDER_LINKS_FILE = process.env.MERCADO_LIVRE_LINKBUILDER_LINKS_FILE
  ? path.resolve(process.env.MERCADO_LIVRE_LINKBUILDER_LINKS_FILE)
  : path.resolve(__dirname, '..', 'mercadolivre-linkbuilder-links.txt');
const ML_LINKBUILDER_MAP_FILE = process.env.MERCADO_LIVRE_LINKBUILDER_MAP_FILE
  ? path.resolve(process.env.MERCADO_LIVRE_LINKBUILDER_MAP_FILE)
  : path.resolve(__dirname, '..', 'mercadolivre-linkbuilder-map.txt');
const ML_LINKBUILDER_STATE_FILE = process.env.MERCADO_LIVRE_LINKBUILDER_STATE_FILE
  ? path.resolve(process.env.MERCADO_LIVRE_LINKBUILDER_STATE_FILE)
  : path.resolve(__dirname, '..', 'data', 'mercadolivre-linkbuilder-state.json');
const ML_LINKBUILDER_POOL_WARN_MIN = Math.max(1, Number(process.env.MERCADO_LIVRE_LINKBUILDER_POOL_WARN_MIN || 10));
const ML_LINKBUILDER_REQUIRE_SHORT = String(process.env.MERCADO_LIVRE_LINKBUILDER_REQUIRE_SHORT || 'true').toLowerCase() !== 'false';
const ML_LINKBUILDER_STRICT_MATCH = String(
  process.env.MERCADO_LIVRE_LINKBUILDER_STRICT_MATCH || (ML_LINKBUILDER_REQUIRE_SHORT ? 'true' : 'false')
).toLowerCase() === 'true';
const ML_JANELA_INICIO_HORA = Math.max(0, Math.min(23, Number(process.env.ML_JANELA_INICIO_HORA || 8)));
const ML_JANELA_FIM_HORA = Math.max(0, Math.min(23, Number(process.env.ML_JANELA_FIM_HORA || 22)));
const ML_INTERVALO_MINUTOS = Math.max(1, Number(process.env.ML_INTERVALO_MINUTOS || 5));
const CURADORIA_MIN_RATING = Math.max(0, Number(process.env.CURADORIA_MIN_RATING || 0.1));
const CURADORIA_MIN_SALES = Math.max(0, Number(process.env.CURADORIA_MIN_SALES || 1));
const CURADORIA_MIN_RATING_ML = Math.max(0, Number(process.env.CURADORIA_MIN_RATING_ML || 0));
const CURADORIA_MIN_SALES_ML = Math.max(0, Number(process.env.CURADORIA_MIN_SALES_ML || 0));
const PRIORITY_MARKETPLACE_RAW = String(process.env.RADAR_PRIORITY_MARKETPLACE || '').trim().toLowerCase();
const PRIORITY_MARKETPLACE = PRIORITY_MARKETPLACE_RAW === 'ml' || PRIORITY_MARKETPLACE_RAW === 'mercado livre' || PRIORITY_MARKETPLACE_RAW === 'mercadolivre'
  ? 'Mercado Livre'
  : (PRIORITY_MARKETPLACE_RAW === 'shopee' ? 'Shopee' : '');

const MERCADO_LIVRE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
};

console.log('\n[CREDENCIAIS CARREGADAS]');
console.log(`  ✓ Shopee Partner ID: ${SHOPEE_PARTNER_ID ? '[OK]' : '[AUSENTE]'}`);
console.log(`  ✓ Shopee Partner Key: ${SHOPEE_PARTNER_KEY ? '[OK]' : '[AUSENTE]'}`);
console.log(`  ✓ ML Client ID: ${ML_CLIENT_ID ? '[OK]' : '[AUSENTE]'}`);
console.log(`  ✓ ML Tool ID: ${ML_TOOL_ID ? '[OK]' : '[AUSENTE]'}\n`);
if (ML_LINKBUILDER_LINKS_ENV.length > 0) {
  console.log(`[ML] Links oficiais via ENV: ${ML_LINKBUILDER_LINKS_ENV.length}`);
}

const FILE_HISTORICO = path.join(__dirname, 'historico-ofertas.json');

const shopeeApiBreaker = createCircuitBreaker({
  name: 'shopee-api',
  failureThreshold: 3,
  resetTimeoutMs: 30000,
  logger: console
});

const mlOAuthBreaker = createCircuitBreaker({
  name: 'ml-oauth',
  failureThreshold: 3,
  resetTimeoutMs: 30000,
  logger: console
});

const mlPublicBreaker = createCircuitBreaker({
  name: 'ml-public',
  failureThreshold: 3,
  resetTimeoutMs: 30000,
  logger: console
});

const mlScrapingBreaker = createCircuitBreaker({
  name: 'ml-scraping',
  failureThreshold: 2,
  resetTimeoutMs: 45000,
  logger: console
});

// ============ FUNÇÕES AUXILIARES ============

// Carregar histórico
function carregarHistorico() {
  if (!fs.existsSync(FILE_HISTORICO)) {
    return { offers: [], lastUpdate: null };
  }
  try {
    return JSON.parse(fs.readFileSync(FILE_HISTORICO, 'utf8'));
  } catch {
    return { offers: [], lastUpdate: null };
  }
}

// Salvar histórico
function salvarHistorico(historico) {
  fs.writeFileSync(FILE_HISTORICO, JSON.stringify(historico, null, 2));
}

function normalizarUrlMercadoLivre(raw = '') {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    u.hash = '';
    u.search = '';
    return u.toString();
  } catch {
    return '';
  }
}

function carregarMapaLinkbuilderMercadoLivre(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return new Map();
  }

  const mapa = new Map();

  try {
    const linhas = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    linhas.forEach((linha) => {
      const l = String(linha || '').trim();
      if (!l || l.startsWith('#')) return;

      const separador = l.includes('|') ? '|' : (l.includes(';') ? ';' : ',');
      const [produtoRaw, curtoRaw] = l.split(separador).map((v) => String(v || '').trim());
      const produto = normalizarUrlMercadoLivre(produtoRaw);
      const curto = normalizarUrlMercadoLivre(curtoRaw);

      if (!produto || !curto || !ehLinkMercadoLivreCurto(curto)) return;
      mapa.set(produto, curto);
    });
  } catch (error) {
    console.warn(`[ML] Nao foi possivel carregar mapa Link Builder: ${error.message}`);
  }

  return mapa;
}

const ML_LINKBUILDER_MAP = carregarMapaLinkbuilderMercadoLivre(ML_LINKBUILDER_MAP_FILE);

function obterLinkCurtoMercadoLivreMapeado(item = {}) {
  const candidatos = [];
  const raw = normalizarUrlMercadoLivre(item.raw_link || '');
  if (raw) candidatos.push(raw);

  if (item.slug && item.product_id) {
    candidatos.push(normalizarUrlMercadoLivre(`https://www.mercadolivre.com.br/${item.slug}/p/${item.product_id}`));
  }

  for (const candidato of candidatos) {
    if (ML_LINKBUILDER_MAP.has(candidato)) {
      return ML_LINKBUILDER_MAP.get(candidato);
    }
  }

  return '';
}

function obterProductIdMercadoLivreDaUrl(raw = '') {
  if (!raw) return '';

  const match = String(raw).match(/\/p\/(MLB\w+)/i);
  return match ? String(match[1] || '').toUpperCase() : '';
}

function carregarEstadoPoolLinks(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { cursor: 0, updatedAt: null };
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      cursor: Number.isFinite(Number(data.cursor)) ? Number(data.cursor) : 0,
      updatedAt: data.updatedAt || null
    };
  } catch {
    return { cursor: 0, updatedAt: null };
  }
}

function salvarEstadoPoolLinks(filePath, state) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(
      filePath,
      JSON.stringify({
        cursor: Number(state?.cursor || 0),
        updatedAt: new Date().toISOString()
      }, null, 2)
    );
  } catch (error) {
    console.warn(`[ML] Nao foi possivel salvar estado do pool: ${error.message}`);
  }
}

function selecionarLinksPoolRoundRobin(links = [], quantidade = 0, cursorInicial = 0) {
  const pool = deduplicarLinks(links);
  if (pool.length === 0 || quantidade <= 0) {
    return { selected: [], nextCursor: 0, total: pool.length };
  }

  const qtd = Math.min(Number(quantidade) || 0, pool.length);
  const inicio = ((Number(cursorInicial) || 0) % pool.length + pool.length) % pool.length;
  const selected = [];

  for (let i = 0; i < qtd; i++) {
    selected.push(pool[(inicio + i) % pool.length]);
  }

  return {
    selected,
    nextCursor: (inicio + qtd) % pool.length,
    total: pool.length
  };
}

function obterLinksMercadoLivreOficiais(quantidadeNecessaria = 0) {
  const linksArquivo = carregarLinksMercadoLivreArquivo(ML_LINKBUILDER_LINKS_FILE);
  const linksBrutos = deduplicarLinks([...ML_LINKBUILDER_LINKS_ENV, ...linksArquivo]);
  const linksDisponiveis = ML_LINKBUILDER_REQUIRE_SHORT
    ? linksBrutos.filter(ehLinkMercadoLivreCurto)
    : linksBrutos;

  if (ML_LINKBUILDER_REQUIRE_SHORT) {
    const descartados = linksBrutos.length - linksDisponiveis.length;
    if (descartados > 0) {
      console.warn(`[ML] ${descartados} link(s) fora do padrao Link Builder curto (meli.la) foram ignorados.`);
    }
  }

  if (linksDisponiveis.length === 0) {
    return [];
  }

  if (linksDisponiveis.length < ML_LINKBUILDER_POOL_WARN_MIN) {
    console.warn(
      `[ML] Pool de links oficiais baixo (${linksDisponiveis.length}). Recomendado >= ${ML_LINKBUILDER_POOL_WARN_MIN}.`
    );
  }

  const saudePool = avaliarSaudePoolLinks(linksDisponiveis.length);
  if (!saudePool.cobreDiaAlternando) {
    console.warn(
      `[ML] Capacidade diaria insuficiente para alternancia: ${saudePool.linksNecessariosDiaAlternando} links recomendados, atual ${saudePool.totalLinks}.`
    );
  }

  const estado = carregarEstadoPoolLinks(ML_LINKBUILDER_STATE_FILE);
  const { selected, nextCursor, total } = selecionarLinksPoolRoundRobin(
    linksDisponiveis,
    quantidadeNecessaria,
    estado.cursor
  );

  salvarEstadoPoolLinks(ML_LINKBUILDER_STATE_FILE, { cursor: nextCursor });

  if (selected.length > 0) {
    console.log(`[ML] Pool oficial ativo: ${selected.length}/${total} links neste ciclo`);
  }

  return selected;
}

function avaliarSaudePoolLinks(totalLinks) {
  const total = Math.max(0, Number(totalLinks) || 0);
  const ciclosDia = calcularCiclosPorJanela(ML_JANELA_INICIO_HORA, ML_JANELA_FIM_HORA, ML_INTERVALO_MINUTOS);
  const linksNecessariosDiaAlternando = Math.ceil(ciclosDia / 2);

  return {
    totalLinks: total,
    minRecomendado: ML_LINKBUILDER_POOL_WARN_MIN,
    janelaInicioHora: ML_JANELA_INICIO_HORA,
    janelaFimHora: ML_JANELA_FIM_HORA,
    intervaloMinutos: ML_INTERVALO_MINUTOS,
    ciclosDia,
    linksNecessariosDiaAlternando,
    atendeMinimo: total >= ML_LINKBUILDER_POOL_WARN_MIN,
    cobreDiaAlternando: total >= linksNecessariosDiaAlternando
  };
}

// Gerar hash único para oferta
function gerarHashOferta(oferta) {
  const productId = oferta.product_id;
  const price = oferta.price;

  // Sem dados essenciais não geramos hash para evitar colisões
  if (!productId || price == null) return null;

  const str = `${oferta.marketplace || 'unknown'}-${productId}-${Math.floor(price)}`;
  return crypto.createHash('md5').update(str).digest('hex');
}

// Verificar duplicação (últimos 7 dias)
function verificarDuplicacao(oferta, historico) {
  const hash = gerarHashOferta(oferta);
  if (!hash) return false; // sem hash válido → não bloquear

  const agora = Date.now();
  const seteDias = 7 * 24 * 60 * 60 * 1000;

  return historico.offers.some(o => {
    const tempoDecorrido = agora - o.timestamp;
    return o.hash === hash && tempoDecorrido < seteDias;
  });
}

// Gerar link Shopee com afiliação
function gerarLinkShopee(seller_id, product_id, product_name = '') {
  const randomString = (length) => Math.random().toString(36).substring(2, 2 + length);
  const ulsTrackid = `558gc${randomString(7)}00qc`;
  const campaignId = `id_${randomString(9)}`;
  const term = `enp${randomString(10)}`;

  return `https://shopee.com.br/product/${seller_id}/${product_id}?mmp_pid=an_${SHOPEE_PARTNER_ID}&uls_trackid=${ulsTrackid}&utm_campaign=${campaignId}&utm_source=an_${SHOPEE_PARTNER_ID}&utm_medium=affiliates&utm_term=${term}`;
}

// Gerar link Mercado Livre com afiliação
function gerarLinkMercadoLivre(product_id, product_slug, rawLink = '') {
  const slug = (product_slug && String(product_slug).trim()) || 'produto';
  let base = rawLink || `https://www.mercadolivre.com.br/${slug}/p/${product_id}`;

  try {
    const parsed = new URL(base);
    // Remove fragmentos longos de tracking da página de busca.
    parsed.hash = '';
    base = parsed.toString();
  } catch {
    base = `https://www.mercadolivre.com.br/${slug}/p/${product_id}`;
  }

  // Se não houver tool_id configurado, mantém o link cru para não quebrar navegação.
  if (!ML_TOOL_ID) {
    return base;
  }

  const separador = base.includes('?') ? '&' : '?';
  const query = [
    `matt_word=${encodeURIComponent(ML_MATT_WORD)}`,
    `matt_tool=${encodeURIComponent(ML_TOOL_ID)}`,
    `utm_source=radar`,
    `utm_campaign=affiliate`
  ];

  if (ML_FORCE_IN_APP) {
    query.push('forceInApp=true');
  }

  return `${base}${separador}${query.join('&')}`;
}

function ehLinkMercadoLivreUtil(raw = '') {
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const href = parsed.toString().toLowerCase();

    if (host.includes('click1.mercadolivre.com.br')) return false;
    if (host.includes('publicidade.mercadolivre.com.br')) return false;
    if (!host.includes('mercadolivre.com.br')) return false;
    if (href.includes('/publicidade')) return false;

    return true;
  } catch {
    return false;
  }
}

function mapearResultadosMercadoLivre(results = []) {
  return results
    .filter(item => item.id && item.title && item.price)
    .map(item => {
      let slug = 'produto';
      try {
        if (item.permalink) {
          const pathname = new URL(item.permalink).pathname;
          const partes = pathname.split('/').filter(Boolean);
          if (partes.length > 0) slug = partes[0];
        }
      } catch {
        slug = 'produto';
      }

      const precoAtual = Number(item.price || 0);
      const precoOriginalApi = Number(item.original_price || 0);
      const precoOriginal = precoOriginalApi > precoAtual ? precoOriginalApi : precoAtual;

      return {
        marketplace: 'Mercado Livre',
        product_id: item.id,
        product_name: String(item.title || '').substring(0, 70),
        slug,
        price: precoAtual,
        original_price: precoOriginal,
        rating: Number(item?.seller_address ? 4.6 : 4.4),
        sales: Number(item?.sold_quantity || 0),
        raw_link: item.permalink || '' ,
        image_url: item.thumbnail || ''
      };
    });
}

function normalizarPrecoMercadoLivre(fracao = '', centavos = '') {
  const f = String(fracao || '').replace(/\./g, '').replace(/[^\d]/g, '');
  const c = String(centavos || '').replace(/[^\d]/g, '');
  const base = Number(f || 0);
  const dec = Number(c || 0) / 100;
  return base + dec;
}

function extrairVendasTextoMercadoLivre(texto = '') {
  const t = String(texto || '').toLowerCase().trim();
  if (!t) return 0;

  const match = t.match(/(\d+[\d\.]*)\s*(mil)?\s+vendid/);
  if (!match) return 0;

  const base = Number(String(match[1]).replace(/\./g, ''));
  if (!Number.isFinite(base) || base <= 0) return 0;
  return match[2] ? base * 1000 : base;
}

function extrairSlugDeLink(url) {
  try {
    const parsed = new URL(url);
    const partes = parsed.pathname.split('/').filter(Boolean);
    return partes.length > 0 ? partes[0] : 'produto';
  } catch {
    return 'produto';
  }
}

function extrairProductIdMercadoLivre(link = '') {
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

async function buscarMercadoLivreScraping(keyword = 'eletrônicos', limite = 10) {
  try {
    console.log('[MERCADO LIVRE WEB] Tentando scraping de listagem...');

    const termo = encodeURIComponent(keyword);
    const url = `https://lista.mercadolivre.com.br/${termo}`;
    const response = await mlScrapingBreaker.execute(
      () => axios.get(url, {
        timeout: 15000,
        headers: MERCADO_LIVRE_HEADERS
      }),
      'buscarMercadoLivreScraping'
    );

    const $ = cheerio.load(response.data);
    const itens = [];

    $('li.ui-search-layout__item').each((index, el) => {
      if (itens.length >= limite) return;

      const node = $(el);
      const titulo = node.find('h3, h2').first().text().trim();
      if (!titulo) return;

      const links = node.find('a').map((i, a) => $(a).attr('href')).get().filter(Boolean);
      const linkDireto = links.find((l) => ehLinkMercadoLivreUtil(l));
      const rawLink = linkDireto || '';
      if (!rawLink) return;

      const fracao = node.find('.andes-money-amount__fraction').first().text().trim();
      const centavos = node.find('.andes-money-amount__cents').first().text().trim();
      const preco = normalizarPrecoMercadoLivre(fracao, centavos);
      if (!Number.isFinite(preco) || preco <= 0) return;

      const fracaoOriginal = node.find('.ui-search-price__original-value .andes-money-amount__fraction').first().text().trim();
      const centavosOriginal = node.find('.ui-search-price__original-value .andes-money-amount__cents').first().text().trim();
      const precoOriginalExtraido = normalizarPrecoMercadoLivre(fracaoOriginal, centavosOriginal);
      const precoOriginal = Number.isFinite(precoOriginalExtraido) && precoOriginalExtraido > preco
        ? precoOriginalExtraido
        : preco;

      const imagem =
        node.find('img').first().attr('data-src') ||
        node.find('img').first().attr('src') ||
        '';

      const slug = extrairSlugDeLink(rawLink);
      const productId = extrairProductIdMercadoLivre(rawLink);
      if (!productId) return;
      const vendasTexto = node.find('.ui-search-item__group__element--sales').first().text().trim();
      const sales = extrairVendasTextoMercadoLivre(vendasTexto);

      itens.push({
        marketplace: 'Mercado Livre',
        product_id: productId,
        product_name: titulo.substring(0, 70),
        slug,
        price: preco,
        original_price: precoOriginal,
        rating: 4.4,
        sales,
        raw_link: rawLink,
        image_url: imagem
      });
    });

    if (itens.length > 0) {
      console.log(`[OK] ${itens.length} produtos encontrados (web scraping)`);
      return itens;
    }

    console.warn('[MERCADO LIVRE WEB] Nenhum produto extraído da listagem');
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      console.warn(`[MERCADO LIVRE WEB] Circuit breaker aberto: ${error.message}`);
      return [];
    }
    console.warn(`[MERCADO LIVRE WEB] Erro: ${error.message}`);
  }

  return [];
}

// ============ BUSCA DE PRODUTOS ============

// Buscar Shopee via API de Afiliados GraphQL
async function buscarShopeeGraphQL(limite = 10) {
  try {
    console.log('\n[SHOPEE AFFILIATE API] Inicializando conexão...');

    const api = new ShopeeAffiliateAPI();

    let todasOfertas = [];

    // Buscar produtos com preço real (productOfferV2)
    console.log('[SHOPEE] Buscando produtos com comissão...');
    const produtos = await shopeeApiBreaker.execute(
      () => api.buscarProdutos(Math.max(limite, 20)),
      'buscarShopeeGraphQL'
    );

    if (produtos.length > 0) {
      console.log(`[SHOPEE] ✓ ${produtos.length} produtos obtidos`);
      todasOfertas = produtos.map(p => ({
        marketplace: 'Shopee',
        product_id: p.itemId,
        product_name: p.productName,
        price: parseFloat(p.price || 0),
        original_price: parseFloat(p.price || 0) / Math.max(0.5, 1 - ((parseFloat(p.priceDiscountRate || 0)) / 100)),
        rating: parseFloat(p.ratingStar || 4.0),
        seller_id: p.shopId,
        affiliate_link: p.offerLink || p.productLink,
        commission_rate: parseFloat(p.commissionRate || 0) * 100,
        image_url: p.imageUrl || '',
        sales: p.sales || 0,
        discount_rate: parseFloat(p.priceDiscountRate || 0)
      }));
    }

    if (todasOfertas.length > 0) {
      console.log(`[SHOPEE AFFILIATE API] ✓ Total ${todasOfertas.length} produtos obtidos!`);
      return todasOfertas.slice(0, limite);
    }

    console.warn('[SHOPEE AFFILIATE API] Nenhum produto retornado');
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      console.warn(`[SHOPEE AFFILIATE API] Circuit breaker aberto: ${error.message}`);
    }
    console.warn(`[SHOPEE AFFILIATE API] Erro: ${error.message}`);
  }

  // FALLBACK - Usar dados curados
  console.warn('[SHOPEE] Usando fallback de dados curados...');
  return OFERTAS_CURADAS.shopee.map(oferta => ({
    ...oferta,
    commission_rate: 3.5,
    rating: oferta.rating || 4.5,
    affiliate_link: `https://shopee.com.br/product/${oferta.seller_id}/${oferta.product_id}?mmp_pid=an_${SHOPEE_PARTNER_ID}`,
    image_url: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22%3E%3C/svg%3E'
  }));
}

// Buscar Mercado Livre com autenticação OAuth
async function buscarMercadoLivre(keyword = 'eletrônicos', limite = 10) {
  const queryParams = {
    q: keyword,
    limit: limite,
    offset: Math.floor(Math.random() * 100)
  };

  try {
    if (ML_CLIENT_ID && ML_CLIENT_SECRET) {
      console.log('\n[MERCADO LIVRE OAuth] Gerando token de acesso...');

      // Gerar token via Client Credentials
      const tokenResponse = await axios.post(
        'https://api.mercadolibre.com/oauth/token',
        {
          grant_type: 'client_credentials',
          client_id: ML_CLIENT_ID,
          client_secret: ML_CLIENT_SECRET
        },
        { timeout: 10000 }
      );

      const token = tokenResponse.data.access_token;
      console.log('[OK] Token de acesso gerado');

      // Buscar com token
      const response = await mlOAuthBreaker.execute(
        () => axios.get(
          'https://api.mercadolibre.com/sites/MLB/search',
          {
            params: queryParams,
            headers: {
              ...MERCADO_LIVRE_HEADERS,
              'Authorization': `Bearer ${token}`
            },
            timeout: 15000
          }
        ),
        'buscarMercadoLivreOAuth'
      );

      if (response.data?.results && response.data.results.length > 0) {
        console.log(`[OK] ${response.data.results.length} produtos encontrados (OAuth)`);
        return mapearResultadosMercadoLivre(response.data.results);
      }

      console.warn('[MERCADO LIVRE OAuth] API retornou vazio');
    } else {
      console.warn('[MERCADO LIVRE OAuth] Credenciais ausentes, tentando busca pública');
    }
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      console.warn(`[MERCADO LIVRE OAuth] Circuit breaker aberto: ${error.message}`);
    }
    console.warn(`[MERCADO LIVRE OAuth] Erro: ${error.response?.data?.message || error.message}`);
  }

  // Fallback 1 - Busca pública sem OAuth
  try {
    console.log('[MERCADO LIVRE PUBLIC] Tentando busca sem token...');
    const response = await mlPublicBreaker.execute(
      () => axios.get(
        'https://api.mercadolibre.com/sites/MLB/search',
        {
          params: queryParams,
          headers: MERCADO_LIVRE_HEADERS,
          timeout: 15000
        }
      ),
      'buscarMercadoLivrePublic'
    );

    if (response.data?.results && response.data.results.length > 0) {
      console.log(`[OK] ${response.data.results.length} produtos encontrados (public)`);
      return mapearResultadosMercadoLivre(response.data.results);
    }

    console.warn('[MERCADO LIVRE PUBLIC] API retornou vazio');
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      console.warn(`[MERCADO LIVRE PUBLIC] Circuit breaker aberto: ${error.message}`);
    }
    console.warn(`[MERCADO LIVRE PUBLIC] Erro: ${error.response?.data?.message || error.message}`);
  }

  // Fallback 2 - Scraping web
  const viaWeb = await buscarMercadoLivreScraping(keyword, limite);
  if (viaWeb.length > 0) {
    return viaWeb;
  }

  // Fallback 3 - dados curados
  console.warn('[MERCADO LIVRE] Usando fallback de dados curados...');
  return OFERTAS_CURADAS.mercadolivre;
}

// ============ NORMALIZAÇÃO ============

function normalizarOfertas(shopee = [], mercadolivre = [], options = {}) {
  const calcularDescontoSeguro = (precoAtual, precoOriginal) => {
    const atual = Number(precoAtual || 0);
    const original = Number(precoOriginal || 0);

    if (!Number.isFinite(atual) || atual <= 0) return 0;
    if (!Number.isFinite(original) || original <= atual) return 0;

    return Math.max(0, Math.round(((original - atual) / original) * 100));
  };

  const ofertas = [];
  const linksOficiaisMl = Array.isArray(options?.mlLinkBuilderLinks) ? options.mlLinkBuilderLinks : [];
  const requireShortMl = options?.requireMlShortLink !== false;
  const strictMlMatch = requireShortMl ? options?.strictMlShortMatch !== false : options?.strictMlShortMatch === true;
  const totalLinksCurtosOficiais = linksOficiaisMl.filter(ehLinkMercadoLivreCurto).length;
  let cursorLinkCurtoPool = 0;

  // Normalizar Shopee
  shopee.forEach(item => {
    const comissaoRaw = item.commission_rate ?? item.commissionRate;
    const comissaoPercentual = Number.isFinite(Number(comissaoRaw)) ? Number(comissaoRaw) : null;

    ofertas.push({
      marketplace: item.marketplace,
      product_id: item.product_id,
      product_name: item.product_name,
      price: item.price,
      original_price: item.original_price,
      discount: calcularDescontoSeguro(item.price, item.original_price),
      rating: item.rating,
      sales: Number(item.sales || 0),
      imageUrl: item.image_url || '',
      // Usar affiliate_link se vem da API, senão gerar manualmente
      link: item.affiliate_link || gerarLinkShopee(item.seller_id, item.product_id, item.product_name),
      tracking_id: item.tracking_id,
      commission_rate: comissaoPercentual
    });
  });

  // Normalizar Mercado Livre
  mercadolivre.forEach((item) => {
    const linkOficialMapeado = obterLinkCurtoMercadoLivreMapeado(item);
    const poolFallbackPermitido = !strictMlMatch;
    const linkCurtoPool = poolFallbackPermitido && ehLinkMercadoLivreCurto(linksOficiaisMl[cursorLinkCurtoPool] || '')
      ? linksOficiaisMl[cursorLinkCurtoPool]
      : '';
    if (linkCurtoPool) {
      cursorLinkCurtoPool += 1;
    }

    // Regra de integridade principal: prioriza link curto mapeado para o proprio item.
    // Fallback controlado: quando o mapa estiver vazio/incompleto, utiliza link curto do pool para manter saida sempre encurtada.
    const linkOficial = ehLinkMercadoLivreCurto(linkOficialMapeado) ? linkOficialMapeado : '';
    const linkFallback = gerarLinkMercadoLivre(item.product_id, item.slug, item.raw_link);
    const linkFinal = linkOficial || linkCurtoPool || ((requireShortMl || strictMlMatch) ? '' : linkFallback);
    const sourceLink = normalizarUrlMercadoLivre(item.raw_link || `https://www.mercadolivre.com.br/${item.slug || 'produto'}/p/${item.product_id}`);
    const productIdMapeado = obterProductIdMercadoLivreDaUrl(sourceLink);
    const productIdItem = String(item.product_id || '').toUpperCase();

    if (!linkFinal) {
      if (requireShortMl || strictMlMatch) {
        console.warn(`[ML] Produto sem link curto mapeado de forma exata no Link Builder: ${item.product_name} (id=${item.product_id})`);
      }
      return;
    }

    if (strictMlMatch && productIdMapeado && productIdItem && productIdMapeado !== productIdItem) {
      console.warn(`[ML] Produto descartado por divergencia entre item e source_link: ${item.product_name} (item=${productIdItem}, source=${productIdMapeado})`);
      return;
    }

    ofertas.push({
      marketplace: item.marketplace,
      product_id: item.product_id,
      product_name: item.product_name,
      price: item.price,
      original_price: item.original_price,
      discount: calcularDescontoSeguro(item.price, item.original_price),
      rating: item.rating,
      sales: Number(item.sales || 0),
      imageUrl: item.image_url || '',
      link: linkFinal,
      source_link: sourceLink,
      commission_rate: null
    });
  });

  if ((requireShortMl || strictMlMatch) && mercadolivre.length > 0) {
    console.log(`[ML] Integridade de links curtos: ${ofertas.filter((o) => o.marketplace === 'Mercado Livre').length}/${mercadolivre.length} oferta(s) ML aprovadas (${totalLinksCurtosOficiais} links curtos oficiais disponiveis no ciclo).`);
  }

  return ofertas;
}

// ============ RANKING INTELIGENTE ============

function calcularScore(oferta) {
  let score = 0;

  // Preço (quanto mais barato, mais score)
  if (oferta.price < 50) score += 25;
  else if (oferta.price < 100) score += 15;
  else if (oferta.price < 500) score += 10;
  else score += 5;

  // Desconto
  if (oferta.discount >= 50) score += 30;
  else if (oferta.discount >= 40) score += 25;
  else if (oferta.discount >= 30) score += 20;
  else if (oferta.discount >= 20) score += 10;

  // Rating
  score += oferta.rating * 2;

  return score;
}

function rankearOfertas(ofertas) {
  return ofertas
    .map(o => ({
      ...o,
      score: calcularScore(o)
    }))
    .sort((a, b) => b.score - a.score);
}

function priorizarMarketplaceNaOrdem(ordem = []) {
  if (!PRIORITY_MARKETPLACE || !Array.isArray(ordem) || ordem.length <= 1) {
    return Array.isArray(ordem) ? [...ordem] : [];
  }

  const prioridade = [];
  const restantes = [];

  ordem.forEach((marketplace) => {
    if (marketplace === PRIORITY_MARKETPLACE) {
      prioridade.push(marketplace);
      return;
    }
    restantes.push(marketplace);
  });

  return [...prioridade, ...restantes];
}

function intercalarOfertasPorMarketplace(ofertasLista = []) {
  if (!Array.isArray(ofertasLista) || ofertasLista.length <= 1) {
    return Array.isArray(ofertasLista) ? [...ofertasLista] : [];
  }

  const filas = new Map();
  const ordemMarketplaces = [];

  ofertasLista.forEach((oferta) => {
    const marketplace = String(oferta?.marketplace || 'desconhecido');
    if (!filas.has(marketplace)) {
      filas.set(marketplace, []);
      ordemMarketplaces.push(marketplace);
    }
    filas.get(marketplace).push(oferta);
  });

  const ordemMarketplacesPriorizada = priorizarMarketplaceNaOrdem(ordemMarketplaces);

  if (ordemMarketplacesPriorizada.length <= 1) {
    return [...ofertasLista];
  }

  const intercaladas = [];
  let cursorRoundRobin = 0;
  let ultimoMarketplace = '';

  while (intercaladas.length < ofertasLista.length) {
    // Tenta o round-robin primeiro para garantir distribuição justa
    let tentativas = 0;
    let proximoMarketplace = null;

    while (tentativas < ordemMarketplacesPriorizada.length && !proximoMarketplace) {
      const idx = (cursorRoundRobin + tentativas) % ordemMarketplacesPriorizada.length;
      const marketplace = ordemMarketplacesPriorizada[idx];

      // Prefere um marketplace diferente do último
      if (marketplace !== ultimoMarketplace && (filas.get(marketplace)?.length || 0) > 0) {
        proximoMarketplace = marketplace;
        cursorRoundRobin = (idx + 1) % ordemMarketplaces.length;
        break;
      }

      tentativas++;
    }

    // Fallback: se não encontrou diferente, pega o próximo do round-robin que tiver ofertas
    if (!proximoMarketplace) {
      tentativas = 0;
      while (tentativas < ordemMarketplacesPriorizada.length) {
        const idx = cursorRoundRobin % ordemMarketplacesPriorizada.length;
        const marketplace = ordemMarketplacesPriorizada[idx];
        if ((filas.get(marketplace)?.length || 0) > 0) {
          proximoMarketplace = marketplace;
          cursorRoundRobin = (idx + 1) % ordemMarketplacesPriorizada.length;
          break;
        }
        cursorRoundRobin++;
        tentativas++;
      }
    }

    // NOVO: Se não há mais ML, mas ainda há Shopee, continue preenchendo com Shopee (mesmo repetido)
    if (!proximoMarketplace) {
      // Procura Shopee
      const shopeeKey = ordemMarketplacesPriorizada.find(m => m.toLowerCase().includes('shopee'));
      if (shopeeKey && (filas.get(shopeeKey)?.length || 0) > 0) {
        proximoMarketplace = shopeeKey;
      }
    }

    if (!proximoMarketplace) {
      break;
    }

    intercaladas.push(filas.get(proximoMarketplace).shift());
    ultimoMarketplace = proximoMarketplace;
  }

  // Se ainda não atingiu o tamanho original, repete Shopee até completar
  while (intercaladas.length < ofertasLista.length) {
    const shopeeKey = ordemMarketplacesPriorizada.find(m => m.toLowerCase().includes('shopee'));
    if (shopeeKey) {
      // Procura uma oferta Shopee já usada para repetir
      const ofertaShopee = ofertasLista.find(o => String(o.marketplace).toLowerCase().includes('shopee'));
      if (ofertaShopee) {
        intercaladas.push(ofertaShopee);
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return intercaladas;
}

function selecionarOfertasBalanceadas(ofertasRankeadas, totalDesejado = 6) {
  if (!Array.isArray(ofertasRankeadas) || ofertasRankeadas.length === 0) return [];

  const total = Math.max(2, Number(totalDesejado) || 6);
  const porMarketplace = new Map();

  ofertasRankeadas.forEach((oferta) => {
    const mercado = String(oferta?.marketplace || 'desconhecido');
    if (!porMarketplace.has(mercado)) porMarketplace.set(mercado, []);
    porMarketplace.get(mercado).push(oferta);
  });

  const marketplaces = [...porMarketplace.keys()]
    .filter((m) => porMarketplace.get(m).length > 0)
    .sort((a, b) => (porMarketplace.get(b)[0]?.score || 0) - (porMarketplace.get(a)[0]?.score || 0));

  const marketplacesPriorizados = priorizarMarketplaceNaOrdem(marketplaces);

  if (marketplacesPriorizados.length <= 1) {
    return ofertasRankeadas.slice(0, total);
  }

  const quotaBase = Math.floor(total / marketplacesPriorizados.length);
  let resto = total - (quotaBase * marketplacesPriorizados.length);
  const quotas = new Map(marketplacesPriorizados.map((m) => [m, quotaBase]));

  for (const mercado of marketplacesPriorizados) {
    if (resto <= 0) break;
    quotas.set(mercado, quotas.get(mercado) + 1);
    resto -= 1;
  }

  const escolhidasPorMarketplace = new Map(marketplacesPriorizados.map((m) => [m, []]));
  const chavesSelecionadas = new Set();

  for (const mercado of marketplacesPriorizados) {
    const lista = porMarketplace.get(mercado);
    const quota = quotas.get(mercado);

    for (let i = 0; i < quota && i < lista.length; i++) {
      const oferta = lista[i];
      const chave = `${oferta.marketplace}|${oferta.product_id}|${oferta.link}`;
      if (chavesSelecionadas.has(chave)) continue;
      escolhidasPorMarketplace.get(mercado).push(oferta);
      chavesSelecionadas.add(chave);
    }
  }

  let balanceadas = intercalarOfertasPorMarketplace(
    marketplacesPriorizados.flatMap((mercado) => escolhidasPorMarketplace.get(mercado))
  );

  if (balanceadas.length < total) {
    for (const oferta of ofertasRankeadas) {
      const chave = `${oferta.marketplace}|${oferta.product_id}|${oferta.link}`;
      if (chavesSelecionadas.has(chave)) continue;
      balanceadas.push(oferta);
      chavesSelecionadas.add(chave);
      if (balanceadas.length >= total) break;
    }
  }

  return intercalarOfertasPorMarketplace(balanceadas).slice(0, total);
}

function aplicarCuradoriaQualidade(ofertasLista = []) {
  logQuantidadeML('Antes da curadoria', ofertasLista);
  const rejeitadas = [];
  const aprovadas = [];

  ofertasLista.forEach((oferta) => {
    const rating = Number(oferta?.rating || 0);
    const sales = Number(oferta?.sales || 0);
    const marketplace = String(oferta?.marketplace || '').trim().toLowerCase();
    const isMl = marketplace === 'mercado livre' || marketplace === 'ml';
    const minRating = isMl ? CURADORIA_MIN_RATING_ML : CURADORIA_MIN_RATING;
    const minSales = isMl ? CURADORIA_MIN_SALES_ML : CURADORIA_MIN_SALES;

    if (!Number.isFinite(rating) || rating < minRating) {
      rejeitadas.push({ oferta, motivo: `rating<${minRating}` });
      return;
    }

    if (!Number.isFinite(sales) || sales < minSales) {
      rejeitadas.push({ oferta, motivo: `sales<${minSales}` });
      return;
    }

    aprovadas.push(oferta);
  });

  logQuantidadeML('Após curadoria', aprovadas);

  if (rejeitadas.length > 0) {
    const porMotivo = rejeitadas.reduce((acc, r) => {
      acc[r.motivo] = (acc[r.motivo] || 0) + 1;
      return acc;
    }, {});
    const resumo = Object.entries(porMotivo).map(([k, v]) => `${k}: ${v}`).join(' | ');
    console.log(`[CURADORIA] ${rejeitadas.length} oferta(s) descartada(s) por qualidade (${resumo})`);
  } else {
    console.log('[CURADORIA] Nenhuma oferta descartada por qualidade');
  }

  return aprovadas;
}

// LOG: Após anti-spam (exemplo, ajuste conforme o local real do filtro anti-spam)
// logQuantidadeML('Após anti-spam', listaAposAntiSpam);
// ============ MAIN ============

async function executar() {
  try {
    console.log('\n[INICIANDO] Ciclo de busca e envio de ofertas\n');
    const dryRunMode = ['1', 'true', 'yes', 'sim'].includes(String(process.env.RADAR_DRY_RUN || '').toLowerCase());
    const bypassAntiSpam = dryRunMode && ['1', 'true', 'yes', 'sim'].includes(String(process.env.RADAR_BYPASS_ANTISPAM || '').toLowerCase());
    const totalDisparos = Math.max(2, Number(process.env.RADAR_TOP_N || 6));
    const onlyMarketplaceRaw = String(process.env.RADAR_ONLY_MARKETPLACE || '').trim().toLowerCase();
    const onlyMarketplace = onlyMarketplaceRaw === 'ml' || onlyMarketplaceRaw === 'mercado livre' || onlyMarketplaceRaw === 'mercadolivre'
      ? 'Mercado Livre'
      : (onlyMarketplaceRaw === 'shopee' ? 'Shopee' : '');

    if (dryRunMode) {
      console.log('[MODO] Dry-run habilitado');
    }

    if (bypassAntiSpam) {
      console.log('[MODO] Bypass anti-spam habilitado apenas para homologacao');
    }

    // 1. Carregar histórico
    const historico = carregarHistorico();
    console.log(`[HISTÓRICO] ${historico.offers.length} ofertas registradas`);

    // 2. Buscar produtos (Shopee + Mercado Livre)
    const produtosShopee = await buscarShopeeGraphQL(15);
    const produtosML = await buscarMercadoLivre(ML_KEYWORD, 15);

    console.log(`[SHOPEE] ${produtosShopee.length} ofertas encontradas`);
    console.log(`[MERCADO LIVRE] ${produtosML.length} produtos encontrados`);

    // 3. Normalizar
    const linksOficiaisMl = obterLinksMercadoLivreOficiais(produtosML.length);
    let ofertas = normalizarOfertas(produtosShopee, produtosML, {
      mlLinkBuilderLinks: linksOficiaisMl,
      requireMlShortLink: ML_LINKBUILDER_REQUIRE_SHORT,
      strictMlShortMatch: ML_LINKBUILDER_STRICT_MATCH
    });

    if (onlyMarketplace) {
      ofertas = ofertas.filter((o) => o.marketplace === onlyMarketplace);
      console.log(`[FILTRO] RADAR_ONLY_MARKETPLACE=${onlyMarketplace} aplicado`);
    }

    ofertas = aplicarCuradoriaQualidade(ofertas);

    console.log(`[NORMALIZADO] ${ofertas.length} ofertas`);

    // 4. Filtrar duplicatas (anti-spam)
    const ofertasNovas = bypassAntiSpam
      ? ofertas
      : ofertas.filter(o => !verificarDuplicacao(o, historico));

    if (bypassAntiSpam) {
      console.log(`[ANTI-SPAM] bypass ativo em dry-run: ${ofertasNovas.length} ofertas consideradas`);
    } else {
      console.log(`[ANTI-SPAM] ${ofertasNovas.length} ofertas novas (${ofertas.length - ofertasNovas.length} duplicadas)`);
    }

    if (ofertasNovas.length === 0) {
      console.log('\n⚠️ Nenhuma oferta nova encontrada. Encerrando.\n');
      process.exit(0);
    }

    // 5. Ranking
    const ofertasRankeadas = rankearOfertas(ofertasNovas);

    // 6. Selecionar ofertas balanceadas entre marketplaces
    const selecionadas = selecionarOfertasBalanceadas(ofertasRankeadas, totalDisparos);
    const distribuicao = selecionadas.reduce((acc, o) => {
      acc[o.marketplace] = (acc[o.marketplace] || 0) + 1;
      return acc;
    }, {});

    console.log(`\n[TOP ${selecionadas.length} BALANCEADAS]\n`);
    console.log(`[DISTRIBUICAO] ${Object.entries(distribuicao).map(([k, v]) => `${k}: ${v}`).join(' | ')}`);

    selecionadas.forEach((o, i) => {
      console.log(`[${i + 1}] ${o.product_name} (${o.marketplace})`);
      console.log(`    Preço: R$ ${o.price.toFixed(2)} | Desconto: ${o.discount}%`);
      console.log(`    Score: ${o.score.toFixed(1)}\n`);
    });

    // 7. Atualizar histórico (somente fora de dry-run)
    if (!dryRunMode) {
      selecionadas.forEach(o => {
        historico.offers.push({
          hash: gerarHashOferta(o),
          product_name: o.product_name,
          marketplace: o.marketplace,
          price: o.price,
          timestamp: Date.now()
        });
      });

      historico.lastUpdate = new Date().toISOString();
      salvarHistorico(historico);
    } else {
      console.log('[DRY-RUN] Historico nao foi alterado');
    }

    // 8. Exibir resultado
    console.log('='.repeat(70));
    console.log(`✅ PRONTO PARA ENVIAR: ${selecionadas.length} ofertas\n`);

    // Retornar para uso externo
    return selecionadas;

  } catch (error) {
    console.error(`\n[FATAL] ${error.message}\n`);
    process.exit(1);
  }
}

// ============ EXPORT ============

module.exports = {
    buscarOfertasMercadoLivreIneditas,
  executar,
  rankearOfertas,
  calcularScore,
  selecionarOfertasBalanceadas,
  normalizarOfertas,
  buscarShopeeGraphQL,
  buscarMercadoLivre,
  gerarHashOferta,
  intercalarOfertasPorMarketplace,
  verificarDuplicacao,
  selecionarLinksPoolRoundRobin,
  obterLinksMercadoLivreOficiais,
  avaliarSaudePoolLinks,
  calcularCiclosPorJanela
};

// Se executado diretamente
if (require.main === module) {
  executar().then(ofertas => {
    console.log('Ofertas processadas. Salve em arquivo ou envie via WhatsApp.\n');
    process.exit(0);
  });
}
