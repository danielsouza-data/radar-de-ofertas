#!/usr/bin/env node
/**
 * AGENDADOR OFICIAL DE ENVIOS
 * Janela padrao: 09:00 ate 17:00 (America/Sao_Paulo)
 * Suporte a override diario por data (SCHEDULE_OVERRIDE_DATE)
 * Frequencia: a cada 5 minutos
 *
 * Observacao:
 * - Disparo pontual continua sendo feito por disparo-completo.js
 * - Este processo deve ficar rodando continuamente
 */

const cron = require('node-cron');
const { spawn } = require('child_process');
const fs = require('fs');
const {
  DEFAULT_STALE_MS,
  readLock,
} = require('./src/global-lock');
const { PATHS, ensureDirectories } = require('./src/config/paths');
const { getDispatchSkipReason } = require('./src/scheduler-core');

const TIMEZONE = process.env.SCHED_TZ || 'America/Sao_Paulo';
const DISPARO_SCRIPT = PATHS.DISPARO_COMPLETO;
const STATUS_FILE = PATHS.SCHEDULER_STATUS;
const LOCK_FILE = PATHS.GLOBAL_LOCK;
const LOCK_STALE_MS = Number(process.env.SEND_LOCK_STALE_MS || DEFAULT_STALE_MS);
const BASE_START_HOUR = Math.max(0, Math.min(23, Number(process.env.SCHEDULE_START_HOUR || 9)));
const BASE_END_HOUR = Math.max(0, Math.min(23, Number(process.env.SCHEDULE_END_HOUR || 17)));
const SCHEDULE_OVERRIDE_DATE = String(process.env.SCHEDULE_OVERRIDE_DATE || '').trim(); // YYYY-MM-DD
const SCHEDULE_OVERRIDE_START_HOUR = Number(process.env.SCHEDULE_OVERRIDE_START_HOUR);
const SCHEDULE_OVERRIDE_END_HOUR = Number(process.env.SCHEDULE_OVERRIDE_END_HOUR);
const STATUS_HEARTBEAT_MS = Math.max(10000, Number(process.env.SCHEDULER_STATUS_HEARTBEAT_MS || 60000));

let isRunning = false;
let currentChild = null;
let heartbeatTimer = null;

function obterDataNoTimezone(timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function isHourValida(valor) {
  return Number.isFinite(valor) && valor >= 0 && valor <= 23;
}

const hojeNoTimezone = obterDataNoTimezone(TIMEZONE);
const usarOverrideHoje = (
  SCHEDULE_OVERRIDE_DATE === hojeNoTimezone
  && isHourValida(SCHEDULE_OVERRIDE_START_HOUR)
  && isHourValida(SCHEDULE_OVERRIDE_END_HOUR)
  && SCHEDULE_OVERRIDE_END_HOUR > SCHEDULE_OVERRIDE_START_HOUR
);

const START_HOUR = usarOverrideHoje ? SCHEDULE_OVERRIDE_START_HOUR : BASE_START_HOUR;
const END_HOUR = usarOverrideHoje ? SCHEDULE_OVERRIDE_END_HOUR : BASE_END_HOUR;
const EFFECTIVE_LAST_DISPATCH_HOUR = Math.max(START_HOUR, END_HOUR - 1);
const EFFECTIVE_CRON_REGULAR = `*/5 ${START_HOUR}-${EFFECTIVE_LAST_DISPATCH_HOUR} * * *`;

function nowPtBr() {
  return new Date().toLocaleString('pt-BR', { timeZone: TIMEZONE });
}

function salvarStatus(extra = {}) {
  const payload = {
    scheduler: 'running',
    pid: process.pid,
    timezone: TIMEZONE,
    cronRegular: EFFECTIVE_CRON_REGULAR,
    operatingWindow: `${String(START_HOUR).padStart(2, '0')}:00-${String(END_HOUR).padStart(2, '0')}:00`,
    scheduleOverrideDate: SCHEDULE_OVERRIDE_DATE || null,
    scheduleOverrideApplied: usarOverrideHoje,
    updatedAt: Date.now(),
    updatedAtISO: new Date().toISOString(),
    isRunning: true,
    dispatchInProgress: isRunning,
    ...extra
  };

  try {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error('[SCHED_STATUS_ERR]', err.message);
  }
}

function log(msg) {
  console.log(`[SCHED ${nowPtBr()}] ${msg}`);
}

function executarDisparo(trigger) {
  const existingLock = readLock(LOCK_FILE);
  const skipReason = getDispatchSkipReason({
    isRunning,
    existingLock,
    lockStaleMs: LOCK_STALE_MS
  });

  if (skipReason === 'run_in_progress') {
    log(`Ignorado (${trigger}): disparo anterior ainda em execucao.`);
    salvarStatus({ lastSkipReason: 'run_in_progress', lastTrigger: trigger });
    return;
  }

  if (skipReason === 'global_lock_active') {
    log(`Ignorado (${trigger}): lock global ativo por ${existingLock.owner || 'desconhecido'} (pid ${existingLock.pid || 'n/a'}).`);
    salvarStatus({
      lastSkipReason: 'global_lock_active',
      lastTrigger: trigger,
      lockOwner: existingLock.owner || null,
      lockPid: Number(existingLock.pid || 0) || null
    });
    return;
  }

  isRunning = true;
  log(`Iniciando disparo (${trigger})...`);
  salvarStatus({ lastTrigger: trigger, lastStartAt: Date.now() });

  currentChild = spawn(process.execPath, [DISPARO_SCRIPT], {
    cwd: __dirname,
    env: {
      ...process.env,
      SCHEDULED_RUN: '1'
    },
    stdio: 'inherit'
  });

  currentChild.on('error', (err) => {
    log(`Erro ao iniciar disparo: ${err.message}`);
    isRunning = false;
    currentChild = null;
    salvarStatus({ lastResult: 'spawn_error', lastError: err.message, lastEndAt: Date.now() });
  });

  currentChild.on('exit', (code, signal) => {
    const result = signal ? `signal:${signal}` : `exit:${code}`;
    log(`Disparo finalizado (${trigger}) com ${result}`);
    isRunning = false;
    currentChild = null;
    salvarStatus({ lastResult: result, lastEndAt: Date.now() });
  });
}

function iniciarAgendamentos() {
  ensureDirectories();
  log('Agendador iniciado.');
  log(`Janela ativa: ${String(START_HOUR).padStart(2, '0')}:00-${String(END_HOUR).padStart(2, '0')}:00 (${TIMEZONE}), frequencia de 5 em 5 minutos.`);
  log(`Cron regular: ${EFFECTIVE_CRON_REGULAR}`);
  if (usarOverrideHoje) {
    log(`Override diario aplicado para hoje (${SCHEDULE_OVERRIDE_DATE}): ${String(SCHEDULE_OVERRIDE_START_HOUR).padStart(2, '0')}:00-${String(SCHEDULE_OVERRIDE_END_HOUR).padStart(2, '0')}:00.`);
  }

  salvarStatus({ startedAt: Date.now(), detail: 'Agendador iniciado com sucesso' });

  cron.schedule(
    EFFECTIVE_CRON_REGULAR,
    () => executarDisparo('regular_5min'),
    { timezone: TIMEZONE }
  );

  heartbeatTimer = setInterval(() => {
    salvarStatus({ detail: isRunning ? 'Disparo em execucao' : 'Agendador em espera' });
  }, STATUS_HEARTBEAT_MS);
}

process.on('SIGINT', () => {
  log('Recebido SIGINT. Encerrando agendador...');
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  salvarStatus({ scheduler: 'stopped', isRunning: false, dispatchInProgress: false, detail: 'Encerrado por SIGINT', stoppedAt: Date.now() });

  if (currentChild && !currentChild.killed) {
    currentChild.kill('SIGINT');
  }

  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Recebido SIGTERM. Encerrando agendador...');
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  salvarStatus({ scheduler: 'stopped', isRunning: false, dispatchInProgress: false, detail: 'Encerrado por SIGTERM', stoppedAt: Date.now() });

  if (currentChild && !currentChild.killed) {
    currentChild.kill('SIGTERM');
  }

  process.exit(0);
});

iniciarAgendamentos();
