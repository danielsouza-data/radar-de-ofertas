#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const DEFAULT_KEYWORDS = [
  'alta',
  'ofertas',
  'promocao',
  'desconto',
  'eletronicos',
  'casa',
  'ferramentas',
  'moda',
  'cozinha',
  'smartphone',
  'headset',
  'notebook',
  'tv',
  'audio',
  'gamer'
];

const MAX_URLS = Math.max(10, Number(process.env.ML_SEED_MAX_URLS || 160));
const OUT_FILE = process.env.ML_SEED_OUT_FILE || path.join('data', 'ml-seed-urls.txt');

function normalizarUrlMercadoLivre(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (!host.includes('mercadolivre.com.br')) return null;
    if (host.includes('click1.mercadolivre.com.br')) return null;
    if (host.includes('publicidade.mercadolivre.com.br')) return null;
    u.hash = '';
    u.search = '';
    return u.toString();
  } catch {
    return null;
  }
}

async function extrairUrlsPorKeyword(keyword, limiteRestante) {
  const termo = encodeURIComponent(keyword);
  const url = `https://lista.mercadolivre.com.br/${termo}`;

  const response = await axios.get(url, {
    timeout: 20000,
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept-Language': 'pt-BR,pt;q=0.9'
    }
  });

  const $ = cheerio.load(response.data);
  const urls = [];

  $('li.ui-search-layout__item a').each((_, a) => {
    if (urls.length >= limiteRestante) return false;
    const raw = $(a).attr('href');
    const clean = normalizarUrlMercadoLivre(raw);
    if (clean) urls.push(clean);
    return undefined;
  });

  return urls;
}

async function main() {
  const keywords = process.argv.slice(2).filter(Boolean);
  const termos = keywords.length > 0 ? keywords : DEFAULT_KEYWORDS;
  const seen = new Set();
  const all = [];

  for (const kw of termos) {
    if (all.length >= MAX_URLS) break;
    const restante = MAX_URLS - all.length;

    try {
      const urls = await extrairUrlsPorKeyword(kw, restante * 2);
      for (const u of urls) {
        if (all.length >= MAX_URLS) break;
        if (seen.has(u)) continue;
        seen.add(u);
        all.push(u);
      }
      console.log(`[ML-SEED] ${kw}: +${urls.length} candidatos`);
    } catch (error) {
      console.log(`[ML-SEED] ${kw}: falhou (${error.message})`);
    }
  }

  const outPath = path.resolve(OUT_FILE);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, all.join('\n'));

  console.log(`[ML-SEED] URLs unicas gravadas: ${all.length}`);
  console.log(`[ML-SEED] Arquivo: ${outPath}`);
}

main().catch((err) => {
  console.error('[ML-SEED] FALHA', err.message);
  process.exit(1);
});
