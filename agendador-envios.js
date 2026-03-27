#!/usr/bin/env node
/**
 * AGENDADOR OFICIAL DE ENVIOS
 * Janela: 09:00 ate 22:00 (America/Sao_Paulo)
 * Frequencia: a cada 5 minutos
 *
 * Observacao:
 * - Disparo pontual continua sendo feito por disparo-completo.js
 * - Este processo deve ficar rodando continuamente
 */

const cron = require('node-cron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const {
  DEFAULT_STALE_MS,
  readLock,
  isLockActive
} = require('./src/global-lock');

const TIMEZONE = process.env.SCHED_TZ || 'America/Sao_Paulo';
const DISPARO_SCRIPT = path.join(__dirname, 'disparo-completo.js');
const STATUS_FILE = path.join(__dirname, 'data', 'scheduler-status.json');
const LOCK_FILE = path.join(__dirname, 'data', 'disparo-global.lock');
const LOCK_STALE_MS = Number(process.env.SEND_LOCK_STALE_MS || DEFAULT_STALE_MS);

const CRON_REGULAR = '*/5 9-21 * * *';
const CRON_2200 = '0 22 * * *';

let isRunning = false;
let currentChild = null;

function nowPtBr() {
  return new Date().toLocaleString('pt-BR', { timeZone: TIMEZONE });
}

function salvarStatus(extra = {}) {
  const payload = {
    scheduler: 'running',
    pid: process.pid,
    timezone: TIMEZONE,
    cronRegular: CRON_REGULAR,
    cron2200: CRON_2200,
    updatedAt: Date.now(),
    updatedAtISO: new Date().toISOString(),
    isRunning,
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
  if (isRunning) {
    log(`Ignorado (${trigger}): disparo anterior ainda em execucao.`);
    salvarStatus({ lastSkipReason: 'run_in_progress', lastTrigger: trigger });
    return;
  }

  const existingLock = readLock(LOCK_FILE);
  if (isLockActive(existingLock, LOCK_STALE_MS)) {
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
  log('Agendador iniciado.');
  log(`Janela ativa: 09:00-22:00 (${TIMEZONE}), frequencia de 5 em 5 minutos.`);
  log(`Cron regular: ${CRON_REGULAR}`);
  log(`Cron 22:00: ${CRON_2200}`);

  salvarStatus({ startedAt: Date.now(), detail: 'Agendador iniciado com sucesso' });

  cron.schedule(
    CRON_REGULAR,
    () => executarDisparo('regular_5min'),
    { timezone: TIMEZONE }
  );

  cron.schedule(
    CRON_2200,
    () => executarDisparo('closing_2200'),
    { timezone: TIMEZONE }
  );
}

process.on('SIGINT', () => {
  log('Recebido SIGINT. Encerrando agendador...');
  salvarStatus({ scheduler: 'stopped', detail: 'Encerrado por SIGINT', stoppedAt: Date.now() });

  if (currentChild && !currentChild.killed) {
    currentChild.kill('SIGINT');
  }

  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Recebido SIGTERM. Encerrando agendador...');
  salvarStatus({ scheduler: 'stopped', detail: 'Encerrado por SIGTERM', stoppedAt: Date.now() });

  if (currentChild && !currentChild.killed) {
    currentChild.kill('SIGTERM');
  }

  process.exit(0);
});

iniciarAgendamentos();
