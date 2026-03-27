#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const root = process.cwd();
const linksFile = process.env.MERCADO_LIVRE_LINKBUILDER_LINKS_FILE
  ? path.resolve(process.env.MERCADO_LIVRE_LINKBUILDER_LINKS_FILE)
  : path.join(root, 'mercadolivre-linkbuilder-links.txt');
const mapFile = process.env.MERCADO_LIVRE_LINKBUILDER_MAP_FILE
  ? path.resolve(process.env.MERCADO_LIVRE_LINKBUILDER_MAP_FILE)
  : path.join(root, 'mercadolivre-linkbuilder-map.txt');

function readLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'));
}

function isShortMlLink(raw = '') {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    return host === 'meli.la' || host.endsWith('.meli.la');
  } catch {
    return false;
  }
}

function normalizeMlProductUrl(raw = '') {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (!host.includes('mercadolivre.com.br')) return '';
    if (host.includes('click1.mercadolivre.com.br')) return '';
    if (host.includes('publicidade.mercadolivre.com.br')) return '';
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return '';
  }
}

async function resolveFinalProductUrl(shortUrl) {
  try {
    const response = await axios.get(shortUrl, {
      timeout: 20000,
      maxRedirects: 8,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept-Language': 'pt-BR,pt;q=0.9'
      }
    });

    const finalUrl = response?.request?.res?.responseUrl || '';
    return normalizeMlProductUrl(finalUrl);
  } catch {
    return '';
  }
}

async function main() {
  const allLinks = readLines(linksFile);
  const shortLinks = [...new Set(allLinks.filter(isShortMlLink))];

  if (shortLinks.length === 0) {
    const header = [
      `# Mapa resetado em ${new Date().toISOString()}`,
      '# formato: URL_DO_PRODUTO|https://meli.la/xxxx',
      '# sem links curtos encontrados no arquivo de pool'
    ];
    fs.writeFileSync(mapFile, `${header.join('\n')}\n`);
    console.log('MAP_TOTAL=0');
    console.log(`MAP_FILE=${mapFile}`);
    process.exit(0);
  }

  const pairs = new Map();
  for (const shortUrl of shortLinks) {
    const productUrl = await resolveFinalProductUrl(shortUrl);
    if (!productUrl) continue;
    pairs.set(productUrl, shortUrl);
  }

  const lines = [
    `# Mapa gerado em ${new Date().toISOString()}`,
    '# formato: URL_DO_PRODUTO|https://meli.la/xxxx',
    ...Array.from(pairs.entries()).map(([product, short]) => `${product}|${short}`)
  ];

  fs.writeFileSync(mapFile, `${lines.join('\n')}\n`);
  console.log(`MAP_TOTAL=${pairs.size}`);
  console.log(`MAP_FILE=${mapFile}`);
}

main().catch((err) => {
  console.error(`[MAP_BUILD_ERR] ${err.message}`);
  process.exit(1);
});
