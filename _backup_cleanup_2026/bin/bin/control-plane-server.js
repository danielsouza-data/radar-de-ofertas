#!/usr/bin/env node
/**
 * CONTROL PLANE - RADAR DE OFERTAS
 * Endpoints de acao operacional separados do dashboard de leitura.
 * Acesso: http://localhost:3001
 */

const express = require('express');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');
const { PATHS, ensureDirectories } = require('../src/config/paths');
require('dotenv').config();

ensureDirectories();

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.CONTROL_PLANE_PORT || 3001);
const CONTROL_TOKEN = String(process.env.CONTROL_PLANE_TOKEN || '').trim();

const SCHEDULER_STATUS_FILE = PATHS.SCHEDULER_STATUS;
const GLOBAL_LOCK_FILE = PATHS.GLOBAL_LOCK;
const REPROCESS_QUEUE_FILE = PATHS.FILA_REPROCESSAMENTO;
const SCHEDULER_SCRIPT = PATHS.AGENDADOR_SCRIPT;

function normalizeOrigin(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function buildAllowedOrigins() {
  const configured = String(process.env.CONTROL_PLANE_ALLOWED_ORIGINS || '').trim();
  if (!configured) {
    return new Set([
      'http://localhost:3000',
      'http://127.0.0.1:3000'
    ]);
  }

  return new Set(
    configured
      .split(',')
      .map((item) => normalizeOrigin(item))
      .filter(Boolean)
  );
}

const ALLOWED_ORIGINS = buildAllowedOrigins();

app.use(express.json());
app.use((req, res, next) => {
  const origin = normalizeOrigin(req.headers.origin);
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-control-token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
});

function readJsonOptional(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch {
    // noop
  }
  return fallback;
}

function writeJson(filePath, payload) {
  try {
    const dir = require('path').dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    return true;
  } catch {
    return false;
  }
}

function isPidAlive(pid) {
  const pidNum = Number(pid);
  if (!Number.isFinite(pidNum) || pidNum <= 0) return false;
  try {
    process.kill(pidNum, 0);
    return true;
  } catch {
    return false;
  }
}

function stopPid(pid) {
  const pidNum = Number(pid);
  if (!Number.isFinite(pidNum) || pidNum <= 0) return false;
  if (!isPidAlive(pidNum)) return false;

  try {
    process.kill(pidNum, 'SIGTERM');
    return true;
  } catch {
    try {
      process.kill(pidNum);
      return true;
    } catch {
      return false;
    }
  }
}

function startDetached(scriptPath, extraEnv = {}) {
  try {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: PATHS.ROOT,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, ...extraEnv }
    });

    child.unref();
    return { ok: true, pid: child.pid };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function actionReleaseLock() {
  const lockRaw = readJsonOptional(GLOBAL_LOCK_FILE, null);
  if (!lockRaw) {
    return { ok: true, action: 'release-lock', message: 'Lock ja estava livre.' };
  }

  const lockPid = Number(lockRaw?.pid || 0) || null;
  const ativo = lockPid ? isPidAlive(lockPid) : false;
  if (ativo) {
    return {
      ok: false,
      action: 'release-lock',
      message: `Lock ativo por PID ${lockPid}. Use stop-disparo antes de liberar.`
    };
  }

  try {
    fs.unlinkSync(GLOBAL_LOCK_FILE);
  } catch (e) {
    return { ok: false, action: 'release-lock', message: `Falha ao remover lock: ${e.message}` };
  }

  return { ok: true, action: 'release-lock', message: 'Lock liberado com sucesso.' };
}

function actionClearQueue() {
  const ok = writeJson(REPROCESS_QUEUE_FILE, []);
  if (!ok) {
    return { ok: false, action: 'clear-queue', message: 'Falha ao limpar fila de reprocessamento.' };
  }

  return { ok: true, action: 'clear-queue', message: 'Fila de reprocessamento limpa.' };
}

function actionStopDisparo() {
  const lockRaw = readJsonOptional(GLOBAL_LOCK_FILE, null);
  const lockPid = Number(lockRaw?.pid || 0) || null;

  if (!lockRaw || !lockPid) {
    return { ok: true, action: 'stop-disparo', message: 'Nenhum disparo ativo identificado.' };
  }

  const stopped = stopPid(lockPid);
  const lockRelease = actionReleaseLock();

  return {
    ok: stopped || lockRelease.ok,
    action: 'stop-disparo',
    message: stopped
      ? `Sinal de encerramento enviado para PID ${lockPid}.`
      : `PID ${lockPid} nao estava ativo. ${lockRelease.message}`
  };
}

function actionRestartScheduler() {
  const schedulerRaw = readJsonOptional(SCHEDULER_STATUS_FILE, null);
  const schedulerPid = Number(schedulerRaw?.pid || 0) || null;

  if (schedulerPid && isPidAlive(schedulerPid)) {
    stopPid(schedulerPid);
  }

  const start = startDetached(SCHEDULER_SCRIPT);
  if (!start.ok) {
    return {
      ok: false,
      action: 'restart-scheduler',
      message: `Falha ao reiniciar scheduler: ${start.error}`
    };
  }

  return {
    ok: true,
    action: 'restart-scheduler',
    message: `Scheduler reiniciado (PID ${start.pid}).`,
    pid: start.pid
  };
}

function actionRestartStack() {
  const stopDisparo = actionStopDisparo();
  const clearQueue = actionClearQueue();
  const restartScheduler = actionRestartScheduler();

  return {
    ok: stopDisparo.ok && clearQueue.ok && restartScheduler.ok,
    action: 'restart-stack',
    message: restartScheduler.ok
      ? 'Stack operacional reiniciada (disparo encerrado, fila limpa, scheduler reiniciado).'
      : 'Stack parcialmente reiniciada; verifique detalhes.',
    details: {
      stopDisparo,
      clearQueue,
      restartScheduler
    }
  };
}

function requireControlToken(req, res, next) {
  if (!CONTROL_TOKEN) return next();

  const provided = String(req.headers['x-control-token'] || '').trim();
  if (provided && provided === CONTROL_TOKEN) return next();

  res.status(401).json({
    ok: false,
    message: 'Token de controle invalido. Envie x-control-token.'
  });
}

app.get('/api/control/health', (req, res) => {
  res.json({
    ok: true,
    service: 'control-plane',
    timestamp: Date.now(),
    timestampISO: new Date().toISOString(),
    tokenRequired: Boolean(CONTROL_TOKEN),
    allowedOrigins: Array.from(ALLOWED_ORIGINS)
  });
});

app.post('/api/control/action', requireControlToken, (req, res) => {
  const action = String(req.body?.action || '').trim().toLowerCase();

  let result;
  switch (action) {
    case 'release-lock':
      result = actionReleaseLock();
      break;
    case 'clear-queue':
      result = actionClearQueue();
      break;
    case 'stop-disparo':
      result = actionStopDisparo();
      break;
    case 'restart-scheduler':
      result = actionRestartScheduler();
      break;
    case 'restart-stack':
      result = actionRestartStack();
      break;
    default:
      result = {
        ok: false,
        action,
        message: 'Acao invalida. Use: release-lock, clear-queue, stop-disparo, restart-scheduler, restart-stack.'
      };
  }

  res.status(result.ok ? 200 : 400).json(result);
});

server.listen(PORT, () => {
  console.log('\n' + '='.repeat(70));
  console.log('  CONTROL PLANE - RADAR DE OFERTAS');
  console.log(`  Acesso: http://localhost:${PORT}`);
  console.log('  Health: /api/control/health');
  console.log('  Action: POST /api/control/action');
  console.log('='.repeat(70) + '\n');
});

process.on('SIGINT', () => {
  process.exit(0);
});
