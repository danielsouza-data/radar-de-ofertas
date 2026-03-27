#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const ROOT = process.cwd();
const POOL_FILE = process.env.MERCADO_LIVRE_LINKBUILDER_LINKS_FILE
  ? path.resolve(process.env.MERCADO_LIVRE_LINKBUILDER_LINKS_FILE)
  : path.resolve(ROOT, 'mercadolivre-linkbuilder-links.txt');
const STATE_FILE = process.env.ML_POOL_ALERT_STATE_FILE
  ? path.resolve(process.env.ML_POOL_ALERT_STATE_FILE)
  : path.resolve(ROOT, 'data', 'ml-pool-alert-state.json');

const MIN_RECOMENDADO = Math.max(1, Number(process.env.MERCADO_LIVRE_LINKBUILDER_POOL_WARN_MIN || 10));
const INICIO_HORA = Math.max(0, Math.min(23, Number(process.env.ML_JANELA_INICIO_HORA || 8)));
const FIM_HORA = Math.max(0, Math.min(23, Number(process.env.ML_JANELA_FIM_HORA || 22)));
const INTERVALO_MIN = Math.max(1, Number(process.env.ML_INTERVALO_MINUTOS || 5));
const REQUIRE_SHORT = String(process.env.MERCADO_LIVRE_LINKBUILDER_REQUIRE_SHORT || 'true').toLowerCase() !== 'false';
const EMAIL_TO = String(process.env.ML_ALERT_EMAIL_TO || process.env.ALERT_EMAIL_TO || '').trim();
const EMAIL_FROM = String(process.env.ML_ALERT_EMAIL_FROM || process.env.ALERT_EMAIL_FROM || process.env.MAIL_USER || '').trim();

function isShort(raw) {
  try {
    const u = new URL(String(raw || ''));
    const h = u.hostname.toLowerCase();
    return h === 'meli.la' || h.endsWith('.meli.la');
  } catch {
    return false;
  }
}

function readPool() {
  if (!fs.existsSync(POOL_FILE)) return [];
  const lines = fs.readFileSync(POOL_FILE, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  const uniq = [...new Set(lines)];
  return REQUIRE_SHORT ? uniq.filter(isShort) : uniq;
}

function calcCycles() {
  const hours = FIM_HORA > INICIO_HORA ? (FIM_HORA - INICIO_HORA) : ((24 - INICIO_HORA) + FIM_HORA);
  const mins = hours * 60;
  return mins > 0 ? Math.ceil(mins / INTERVALO_MIN) : 0;
}

function readState() {
  if (!fs.existsSync(STATE_FILE)) return { lastKey: '', lastSentAt: 0 };
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastKey: '', lastSentAt: 0 };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function sendEmail(subject, text) {
  if (!EMAIL_TO || !EMAIL_FROM) {
    console.log('[ML-ALERT] E-mail nao configurado (ML_ALERT_EMAIL_TO/ML_ALERT_EMAIL_FROM).');
    return false;
  }

  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    console.log('[ML-ALERT] nodemailer nao instalado. Rode: node-portable\\npm.cmd install nodemailer --save');
    return false;
  }

  const host = process.env.MAIL_HOST;
  const port = Number(process.env.MAIL_PORT || 587);
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;

  if (!host || !user || !pass) {
    console.log('[ML-ALERT] SMTP nao configurado (MAIL_HOST/MAIL_USER/MAIL_PASS).');
    return false;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  await transporter.sendMail({
    from: EMAIL_FROM,
    to: EMAIL_TO,
    subject,
    text
  });

  return true;
}

async function main() {
  const total = readPool().length;
  const cycles = calcCycles();
  const neededDaily = Math.ceil(cycles / 2);
  const lowMin = total < MIN_RECOMENDADO;
  const lowDaily = total < neededDaily;
  const status = lowDaily ? 'CRITICO' : (lowMin ? 'AVISO' : 'OK');

  const payload = {
    timestamp: new Date().toISOString(),
    totalLinks: total,
    minRecomendado: MIN_RECOMENDADO,
    linksNecessariosDiaAlternando: neededDaily,
    janela: `${INICIO_HORA}h-${FIM_HORA}h`,
    intervaloMin: INTERVALO_MIN,
    status
  };

  console.log('[ML-ALERT] ' + JSON.stringify(payload));

  const state = readState();
  const key = `${status}|${total}|${neededDaily}|${MIN_RECOMENDADO}`;
  const now = Date.now();
  const resendMs = 2 * 60 * 60 * 1000;

  if (status !== 'OK' && (state.lastKey !== key || (now - Number(state.lastSentAt || 0)) > resendMs)) {
    const subject = `[Radar] Alerta pool ML ${status} (${total})`;
    const text = [
      'Radar de Ofertas - Alerta de pool Mercado Livre',
      `Status: ${status}`,
      `Links disponiveis: ${total}`,
      `Minimo recomendado: ${MIN_RECOMENDADO}`,
      `Necessario por dia (alternando): ${neededDaily}`,
      `Janela: ${INICIO_HORA}h-${FIM_HORA}h`,
      `Intervalo: ${INTERVALO_MIN} min`,
      '',
      'Ajuste o Link Builder para ampliar o pool de links curtos (meli.la).'
    ].join('\n');

    try {
      const sent = await sendEmail(subject, text);
      if (sent) {
        state.lastKey = key;
        state.lastSentAt = now;
        writeState(state);
        console.log('[ML-ALERT] Email de alerta enviado.');
      }
    } catch (e) {
      console.log('[ML-ALERT] Falha no envio de email: ' + e.message);
    }
  }

  if (status === 'OK') {
    state.lastKey = key;
    state.lastSentAt = Number(state.lastSentAt || 0);
    writeState(state);
  }
}

main().catch((e) => {
  console.error('[ML-ALERT] Erro fatal:', e.message);
  process.exit(1);
});
