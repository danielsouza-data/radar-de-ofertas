#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const maxLevel = String(process.env.SECURITY_AUDIT_MAX_LEVEL || 'moderate').toLowerCase();
const levels = ['low', 'moderate', 'high', 'critical'];
const maxIdx = levels.indexOf(maxLevel) >= 0 ? levels.indexOf(maxLevel) : 1;

function resolveNpmInvocation() {
  const npmCliPortable = path.resolve(__dirname, '..', 'node-portable', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const npmCliLocal = path.resolve(__dirname, '..', 'node_local', 'node_modules', 'npm', 'bin', 'npm-cli.js');

  if (fs.existsSync(npmCliPortable)) {
    return {
      command: path.resolve(__dirname, '..', 'node-portable', 'node.exe'),
      args: [npmCliPortable, 'audit', '--json'],
      label: 'node-portable/npm-cli.js'
    };
  }

  if (fs.existsSync(npmCliLocal)) {
    return {
      command: path.resolve(__dirname, '..', 'node_local', 'node.exe'),
      args: [npmCliLocal, 'audit', '--json'],
      label: 'node_local/npm-cli.js'
    };
  }

  // Fallback para ambientes com npm no PATH.
  return {
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['audit', '--json'],
    label: 'npm (PATH)'
  };
}

const invocation = resolveNpmInvocation();
const result = spawnSync(invocation.command, invocation.args, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe']
});

if (result.error) {
  console.error(`[AUDIT] Falha ao executar '${invocation.label}': ${result.error.message}`);
  process.exit(2);
}

const out = String(result.stdout || '').trim();
const err = String(result.stderr || '').trim();

if (!out) {
  console.error('[AUDIT] Sem retorno do npm audit.');
  if (err) console.error(err);
  process.exit(2);
}

let data;
try {
  data = JSON.parse(out);
} catch {
  console.error('[AUDIT] Falha ao parsear JSON do npm audit.');
  console.error(out.slice(0, 1000));
  process.exit(2);
}

const vuln = data?.metadata?.vulnerabilities || {};
const counts = {
  low: Number(vuln.low || 0),
  moderate: Number(vuln.moderate || 0),
  high: Number(vuln.high || 0),
  critical: Number(vuln.critical || 0)
};

console.log('[AUDIT] Vulnerabilidades detectadas:');
for (const level of levels) {
  console.log(`- ${level}: ${counts[level]}`);
}

let hasViolation = false;
for (let i = maxIdx; i < levels.length; i++) {
  if (counts[levels[i]] > 0) {
    hasViolation = true;
    break;
  }
}

if (hasViolation) {
  console.error(`[AUDIT] Reprovado: encontrou vulnerabilidades >= ${maxLevel}.`);
  process.exit(1);
}

console.log(`[AUDIT] Aprovado: nenhuma vulnerabilidade >= ${maxLevel}.`);
