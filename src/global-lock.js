const fs = require('fs');
const path = require('path');

const DEFAULT_STALE_MS = 2 * 60 * 60 * 1000;

function ensureParentDir(filePath) {
  const parent = path.dirname(filePath);
  fs.mkdirSync(parent, { recursive: true });
}

function readLock(lockFilePath) {
  try {
    if (!fs.existsSync(lockFilePath)) return null;
    const raw = fs.readFileSync(lockFilePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isLockActive(lockData, staleMs = DEFAULT_STALE_MS) {
  if (!lockData) return false;

  const createdAt = Number(lockData.createdAt || 0);
  const ageMs = createdAt > 0 ? Date.now() - createdAt : Number.MAX_SAFE_INTEGER;
  const stale = ageMs > staleMs;

  if (stale) return false;

  return isPidAlive(Number(lockData.pid));
}

function acquireGlobalLock(lockFilePath, owner, staleMs = DEFAULT_STALE_MS) {
  ensureParentDir(lockFilePath);

  // Tenta criar o lock de forma atomica. Se ja existir, valida se está ativo ou stale.
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const lockData = {
      pid: process.pid,
      owner: owner || 'unknown',
      createdAt: Date.now(),
      createdAtISO: new Date().toISOString(),
      hostname: process.env.COMPUTERNAME || null
    };

    try {
      const fd = fs.openSync(lockFilePath, 'wx');
      try {
        fs.writeFileSync(fd, JSON.stringify(lockData, null, 2));
      } finally {
        fs.closeSync(fd);
      }

      return {
        acquired: true,
        lock: lockData
      };
    } catch (err) {
      if (!err || err.code !== 'EEXIST') {
        return {
          acquired: false,
          reason: 'lock_create_error',
          error: err?.message || String(err),
          lock: readLock(lockFilePath)
        };
      }

      const current = readLock(lockFilePath);
      if (isLockActive(current, staleMs)) {
        return {
          acquired: false,
          reason: 'active_lock',
          lock: current
        };
      }

      // Lock stale/invalido: tenta remover e repetir uma unica vez.
      try {
        if (fs.existsSync(lockFilePath)) {
          fs.unlinkSync(lockFilePath);
        }
      } catch {
        // Se nao conseguiu remover, retorna lock ativo para evitar corrida destrutiva.
        return {
          acquired: false,
          reason: 'stale_lock_remove_error',
          lock: current
        };
      }
    }
  }

  return {
    acquired: false,
    reason: 'unknown_lock_state',
    lock: readLock(lockFilePath)
  };
}

function releaseGlobalLock(lockFilePath) {
  const current = readLock(lockFilePath);

  if (!current) return false;
  if (Number(current.pid) !== process.pid) return false;

  try {
    fs.unlinkSync(lockFilePath);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  DEFAULT_STALE_MS,
  readLock,
  isPidAlive,
  isLockActive,
  acquireGlobalLock,
  releaseGlobalLock
};