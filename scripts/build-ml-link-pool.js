#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const root = process.cwd();
const poolFile = path.join(root, 'mercadolivre-linkbuilder-links.txt');
const seedFile = path.join(root, 'data', 'ml-seed-urls.txt');

const tool = process.env.MERCADO_LIVRE_TOOL_ID || '';
const matt = process.env.MERCADO_LIVRE_MATT_WORD || 'canalwpp';
const force = String(process.env.MERCADO_LIVRE_FORCE_IN_APP || 'true').toLowerCase() !== 'false';
const maxSeed = Math.max(20, Number(process.env.ML_POOL_MAX_SEED || 120));
const allowFullLinks = String(process.env.ML_POOL_ALLOW_FULL_LINKS || 'false').toLowerCase() === 'true';

function readLinks(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'));
}

function buildAffiliateLink(raw) {
  try {
    const u = new URL(raw);
    if (tool && !u.searchParams.get('matt_tool')) u.searchParams.set('matt_tool', tool);
    if (!u.searchParams.get('matt_word')) u.searchParams.set('matt_word', matt);
    if (force && !u.searchParams.get('forceInApp')) u.searchParams.set('forceInApp', 'true');
    if (!u.searchParams.get('utm_source')) u.searchParams.set('utm_source', 'radar');
    if (!u.searchParams.get('utm_campaign')) u.searchParams.set('utm_campaign', 'affiliate');
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

function isShortLink(raw) {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    return host === 'meli.la' || host.endsWith('.meli.la');
  } catch {
    return false;
  }
}

const existingRaw = readLinks(poolFile);
const existing = existingRaw.filter((l) => allowFullLinks || isShortLink(l));
const seeds = readLinks(seedFile);
const generated = seeds
  .slice(0, maxSeed)
  .map(buildAffiliateLink)
  .filter(Boolean);

const unique = allowFullLinks
  ? [...new Set([...existing, ...generated])]
  : [...new Set(existing)];
const lines = [
  '# Um link por linha. Padrao: apenas links curtos oficiais do Link Builder (meli.la).',
  '# Para permitir links completos de afiliado, use ML_POOL_ALLOW_FULL_LINKS=true.',
  ...unique
];

fs.writeFileSync(poolFile, `${lines.join('\n')}\n`);
console.log(`POOL_TOTAL=${unique.length}`);
console.log(`POOL_FILE=${poolFile}`);
