const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function parseEnvBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(value).trim().toLowerCase());
}

function parseWindowsAclOutput(output = '') {
  const linhas = String(output || '').split(/\r?\n/).map((linha) => linha.trim()).filter(Boolean);
  const entries = [];

  linhas.forEach((linha) => {
    const match = linha.match(/^([^:]+):(.+)$/);
    if (!match) return;

    entries.push({
      identity: match[1].trim(),
      permissions: match[2].trim()
    });
  });

  return entries;
}

function findInsecureWindowsAclEntries(entries = []) {
  const gruposSensiveis = [
    'everyone',
    'todos',
    'builtin\\users',
    'authenticated users',
    'nt authority\\authenticated users'
  ];

  return entries.filter((entry) => {
    const identity = String(entry.identity || '').toLowerCase();
    const permissions = String(entry.permissions || '').toUpperCase();
    const grupoSensivel = gruposSensiveis.some((grupo) => identity.includes(grupo));
    const permissaoEscrita = /(\(F\)|\(M\)|\(W\)|\(D\))/i.test(permissions);
    return grupoSensivel && permissaoEscrita;
  });
}

function validateWindowsSessionAcl(sessionPath) {
  const output = execFileSync('icacls', [sessionPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const entries = parseWindowsAclOutput(output);
  const insecureEntries = findInsecureWindowsAclEntries(entries);

  return {
    ok: insecureEntries.length === 0,
    platform: 'win32',
    entries,
    insecureEntries,
    recommendation: `icacls "${sessionPath}" /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F"`
  };
}

function validatePosixSessionPermissions(sessionPath) {
  const stat = fs.statSync(sessionPath);
  const mode = stat.mode & 0o777;
  const worldWritable = Boolean(mode & 0o002);
  const groupWritable = Boolean(mode & 0o020);

  return {
    ok: !worldWritable && !groupWritable,
    platform: os.platform(),
    mode,
    insecureEntries: !worldWritable && !groupWritable ? [] : [{ identity: 'group/world', permissions: mode.toString(8) }],
    recommendation: `chmod 700 "${sessionPath}"`
  };
}

function validateSessionDirectoryAccess(sessionPath) {
  if (!sessionPath) {
    return {
      ok: false,
      platform: os.platform(),
      insecureEntries: [{ identity: 'sessionPath', permissions: 'missing' }],
      recommendation: 'Defina um diretório de sessão válido.'
    };
  }

  if (!fs.existsSync(sessionPath)) {
    return {
      ok: true,
      platform: os.platform(),
      insecureEntries: [],
      recommendation: null,
      detail: 'Diretório de sessão ainda não existe; será validado após criação.'
    };
  }

  return process.platform === 'win32'
    ? validateWindowsSessionAcl(sessionPath)
    : validatePosixSessionPermissions(sessionPath);
}

function assertSessionDirectoryAccess(sessionPath, logger = console) {
  const result = validateSessionDirectoryAccess(sessionPath);
  const strict = parseEnvBool(process.env.WHATSAPP_SESSION_PERMISSIONS_STRICT, false);

  if (result.ok) {
    if (result.detail) {
      logger.log(`[SESSION_PERMISSIONS] ${result.detail}`);
    }
    return result;
  }

  const mensagem = `[SESSION_PERMISSIONS] Diretório de sessão potencialmente inseguro: ${path.resolve(sessionPath)} | recomendação: ${result.recommendation}`;
  if (strict) {
    throw new Error(mensagem);
  }

  logger.warn(mensagem);
  return result;
}

module.exports = {
  assertSessionDirectoryAccess,
  validateSessionDirectoryAccess,
  parseWindowsAclOutput,
  findInsecureWindowsAclEntries
};