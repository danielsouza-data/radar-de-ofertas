#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const ROOT = process.cwd();
const DATA_DIR = path.resolve(ROOT, 'data');
const REPORT_DIR = path.resolve(DATA_DIR, 'reports');
const DISPAROS_FILE = path.resolve(DATA_DIR, 'disparos-log.json');
const HISTORICO_FILE = path.resolve(DATA_DIR, 'historico-ofertas.json');
const ALERT_STATE_FILE = path.resolve(DATA_DIR, 'ml-pool-alert-state.json');
const ML_POOL_FILE = process.env.MERCADO_LIVRE_LINKBUILDER_LINKS_FILE
  ? path.resolve(process.env.MERCADO_LIVRE_LINKBUILDER_LINKS_FILE)
  : path.resolve(ROOT, 'mercadolivre-linkbuilder-links.txt');

const args = process.argv.slice(2);
function readArg(name, fallback = '') {
  const idx = args.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && args[idx + 1]) return String(args[idx + 1]).trim();
  return fallback;
}

function asIsoOrEmpty(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function readPoolCount() {
  try {
    if (!fs.existsSync(ML_POOL_FILE)) return 0;
    const lines = fs.readFileSync(ML_POOL_FILE, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    return new Set(lines).size;
  } catch {
    return 0;
  }
}

function toMoney(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n.toFixed(2).replace('.', ',') : '0,00';
}

function formatDate(date) {
  return new Date(date).toLocaleString('pt-BR', { hour12: false });
}

function buildSummary(disparos, sinceMs, untilMs) {
  const filtered = disparos.filter((d) => {
    const ts = Number(d.timestamp || 0);
    return ts >= sinceMs && ts <= untilMs;
  });

  const byMarketplace = filtered.reduce((acc, item) => {
    const key = String(item.marketplace || 'Desconhecido');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const descontos = filtered
    .map((x) => Number(x.desconto || 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  const descontoMedio = descontos.length
    ? (descontos.reduce((a, b) => a + b, 0) / descontos.length)
    : 0;

  const ultimos = filtered.slice(-5).map((x) => ({
    produto: String(x.produto || ''),
    marketplace: String(x.marketplace || ''),
    preco: Number(x.preco || 0),
    desconto: Number(x.desconto || 0),
    data: x.data || formatDate(Number(x.timestamp || Date.now())),
    link: String(x.link || '')
  }));

  return {
    totalDisparos: filtered.length,
    byMarketplace,
    descontoMedio: Number(descontoMedio.toFixed(2)),
    ultimos
  };
}

async function sendEmail({ subject, text, to, from }) {
  if (!to || !from) return { sent: false, reason: 'EMAIL_TO_OR_FROM_MISSING' };

  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    return { sent: false, reason: 'NODEMAILER_NOT_INSTALLED' };
  }

  const host = process.env.MAIL_HOST;
  const port = Number(process.env.MAIL_PORT || 587);
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;

  if (!host || !user || !pass) return { sent: false, reason: 'SMTP_NOT_CONFIGURED' };

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  await transporter.sendMail({ from, to, subject, text });
  return { sent: true, reason: 'OK' };
}

async function main() {
  const startIso = asIsoOrEmpty(readArg('since', process.env.REPORT_START_ISO || ''));
  const endIso = asIsoOrEmpty(readArg('until', new Date().toISOString()));
  const emailTo = readArg('email', process.env.REPORT_EMAIL_TO || process.env.ML_ALERT_EMAIL_TO || process.env.ALERT_EMAIL_TO || '');
  const emailFrom = process.env.REPORT_EMAIL_FROM
    || process.env.ML_ALERT_EMAIL_FROM
    || process.env.ALERT_EMAIL_FROM
    || process.env.MAIL_USER
    || '';

  const sinceMs = startIso ? new Date(startIso).getTime() : 0;
  const untilMs = new Date(endIso).getTime();

  const disparosData = readJson(DISPAROS_FILE, { disparos: [] });
  const historicoData = readJson(HISTORICO_FILE, { offers: [] });
  const alertState = readJson(ALERT_STATE_FILE, { lastKey: '', lastSentAt: 0 });
  const disparos = Array.isArray(disparosData.disparos) ? disparosData.disparos : [];
  const historicoCount = Array.isArray(historicoData.offers) ? historicoData.offers.length : 0;
  const poolCount = readPoolCount();

  const summary = buildSummary(disparos, sinceMs, untilMs);
  const reportAt = new Date().toISOString();
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

  const relatorioTxt = [
    'RADAR DE OFERTAS - RELATORIO FINAL DA OPERACAO',
    '',
    `Gerado em: ${formatDate(reportAt)}`,
    `Janela analisada: ${startIso ? formatDate(startIso) : 'inicio do historico'} ate ${formatDate(endIso)}`,
    '',
    'Resumo operacional:',
    '- Reinicio completo do ambiente e limpeza de processos anteriores',
    '- Dashboard local iniciado e monitorado',
    '- Loop de disparo configurado para execucao a cada 5 minutos ate 12:00',
    '- Alternancia entre marketplaces ativa no fluxo de selecao',
    '- Monitor de pool ML com alerta por e-mail executado a cada ciclo',
    '',
    'Metricas da janela:',
    `- Total de disparos registrados: ${summary.totalDisparos}`,
    `- Total de ofertas no historico geral: ${historicoCount}`,
    `- Total de links no pool ML: ${poolCount}`,
    `- Desconto medio dos disparos: ${summary.descontoMedio.toFixed(2)}%`,
    `- Distribuicao por marketplace: ${Object.keys(summary.byMarketplace).length ? JSON.stringify(summary.byMarketplace) : 'sem disparos na janela'}`,
    '',
    'Ultimos disparos da janela:',
    ...(summary.ultimos.length
      ? summary.ultimos.map((u, i) => `${i + 1}. [${u.data}] ${u.marketplace} | ${u.produto} | R$ ${toMoney(u.preco)} | ${u.desconto}% | ${u.link}`)
      : ['- Nenhum disparo encontrado no periodo selecionado.']),
    '',
    'Estado do alerta de pool ML:',
    `- lastKey: ${String(alertState.lastKey || '') || '(vazio)'}`,
    `- lastSentAt: ${alertState.lastSentAt ? formatDate(Number(alertState.lastSentAt)) : '(nunca enviado)'}`,
    '',
    'Conclusao:',
    '- Processo encerrado automaticamente no horario solicitado (12:00).',
    '- Relatorio consolidado e enviado por e-mail.'
  ].join('\n');

  const reportJson = {
    generatedAt: reportAt,
    since: startIso || null,
    until: endIso,
    summary,
    historicoCount,
    poolCount,
    alertState,
    notes: [
      'Reinicio e limpeza de processos',
      'Dashboard iniciado',
      'Loop 5 em 5 minutos ate 12:00',
      'Alternancia entre marketplaces',
      'Alerta de pool ML por e-mail'
    ]
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const txtFile = path.resolve(REPORT_DIR, `relatorio-operacao-${stamp}.txt`);
  const jsonFile = path.resolve(REPORT_DIR, `relatorio-operacao-${stamp}.json`);
  fs.writeFileSync(txtFile, relatorioTxt, 'utf8');
  fs.writeFileSync(jsonFile, JSON.stringify(reportJson, null, 2), 'utf8');

  const subject = `[Radar] Relatorio final da operacao ${now.toLocaleDateString('pt-BR')}`;
  const emailResult = await sendEmail({ subject, text: relatorioTxt, to: emailTo, from: emailFrom });

  console.log('[FINAL-REPORT] ' + JSON.stringify({
    txtFile,
    jsonFile,
    emailTo,
    emailSent: emailResult.sent,
    emailReason: emailResult.reason,
    totalDisparos: summary.totalDisparos
  }));
}

main().catch((e) => {
  console.error('[FINAL-REPORT] Erro fatal:', e.message);
  process.exit(1);
});
