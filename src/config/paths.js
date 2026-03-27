/**
 * 📁 CONFIGURAÇÃO CENTRALIZADA DE PATHS
 * 
 * Todos os caminhos do projeto são definidos uma única vez aqui.
 * Isso garante portabilidade entre máquinas e fácil migração.
 * 
 * ✅ Usar: const { PATHS } = require('./config/paths');
 * ✅ Acessar: PATHS.DATA_DIR, PATHS.HISTORICO_OFERTAS, etc
 */

const path = require('path');

/**
 * ROOT é o diretório raiz do projeto
 * Em desenvolvimento: /projeto-root
 * Em produção: /opt/radar-de-ofertas (se containerizado)
 * Funciona em qualquer máquina! 🚀
 */
const ROOT = process.env.RADAR_PROJECT_ROOT || path.resolve(__dirname, '..', '..');

// Diretórios principais
const DIRS = {
  ROOT,
  BIN: path.join(ROOT, 'bin'),
  SRC: path.join(ROOT, 'src'),
  DATA: path.join(ROOT, 'data'),
  PUBLIC: path.join(ROOT, 'public'),
  SCRIPTS: path.join(ROOT, 'scripts'),
  LOGS: path.join(ROOT, 'logs'),
  SKILLS: path.join(ROOT, 'skills')
};

// Arquivos de dados
const DATA_FILES = {
  DISPAROS_LOG: path.join(DIRS.DATA, 'disparos-log.json'),
  HISTORICO_OFERTAS: path.join(DIRS.SRC, 'historico-ofertas.json'),
  WHATSAPP_STATUS: path.join(DIRS.DATA, 'whatsapp-status.json'),
  DISPAROS_FALHAS: path.join(DIRS.DATA, 'disparos-falhas.json'),
  SCHEDULER_STATUS: path.join(DIRS.DATA, 'scheduler-status.json'),
  GLOBAL_LOCK: path.join(DIRS.DATA, 'disparo-global.lock'),
  FILA_REPROCESSAMENTO: path.join(DIRS.DATA, 'fila-reprocessamento.json'),
  ML_POOL_LINKS: process.env.MERCADO_LIVRE_LINKBUILDER_LINKS_FILE
    ? path.resolve(process.env.MERCADO_LIVRE_LINKBUILDER_LINKS_FILE)
    : path.join(DIRS.ROOT, 'mercadolivre-linkbuilder-links.txt'),
  ML_POOL_ALERT_STATE: path.join(DIRS.DATA, 'ml-pool-alert-state.json')
};

// Arquivos de autenticação
const AUTH_FILES = {
  WWEBJS_SESSIONS: path.join(DIRS.ROOT, '.wwebjs_sessions'),
  WWEBJS_CACHE: path.join(DIRS.ROOT, '.wwebjs_cache')
};

// Arquivos de script/aplicação
const APP_FILES = {
  AGENDADOR_SCRIPT: path.join(DIRS.ROOT, 'agendador-envios.js'),
  DISPARO_COMPLETO: path.join(DIRS.ROOT, 'disparo-completo.js'),
  DASHBOARD_HTML: path.join(DIRS.PUBLIC, 'dashboard.html'),
  QR_CODE_TXT: path.join(DIRS.ROOT, 'qr-code.txt'),
  REPORT_DIR: path.join(DIRS.DATA, 'reports')
};

// Alias para facilitar
const PATHS = {
  ...DIRS,
  ...DATA_FILES,
  ...AUTH_FILES,
  ...APP_FILES
};

/**
 * Função auxiliar para criar diretórios se não existirem
 * (útil após migração para nova máquina)
 */
function ensureDirectories() {
  const fs = require('fs');
  const dirsToCreate = [
    DIRS.DATA,
    DIRS.LOGS,
    DIRS.SRC,
    AUTH_FILES.WWEBJS_SESSIONS,
    AUTH_FILES.WWEBJS_CACHE,
    APP_FILES.REPORT_DIR
  ];

  dirsToCreate.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`[PATHS] Diretório criado: ${dir}`);
    }
  });
}

/**
 * Debug: Mostrar todos os paths configurados
 */
function debug() {
  console.log('\n' + '='.repeat(70));
  console.log('📁 CONFIGURAÇÃO DE PATHS - RADAR DE OFERTAS');
  console.log('='.repeat(70));
  console.log(`\nRAIZ DO PROJETO: ${DIRS.ROOT}\n`);

  console.log('📂 DIRETÓRIOS PRINCIPAIS:');
  Object.entries(DIRS).forEach(([key, val]) => {
    if (key !== 'ROOT') console.log(`   ${key.padEnd(15)} → ${val}`);
  });

  console.log('\n📄 ARQUIVOS DE DADOS:');
  Object.entries(DATA_FILES).forEach(([key, val]) => {
    console.log(`   ${key.padEnd(25)} → ${val}`);
  });

  console.log('\n🔐 AUTENTICAÇÃO:');
  Object.entries(AUTH_FILES).forEach(([key, val]) => {
    console.log(`   ${key.padEnd(25)} → ${val}`);
  });

  console.log('\n⚙️  APLICAÇÃO:');
  Object.entries(APP_FILES).forEach(([key, val]) => {
    console.log(`   ${key.padEnd(25)} → ${val}`);
  });

  console.log('\n' + '='.repeat(70) + '\n');
}

module.exports = {
  PATHS,
  ensureDirectories,
  debug,
  ROOT,
  DIRS,
  DATA_FILES,
  AUTH_FILES,
  APP_FILES
};

// Se executado direto: node src/config/paths.js
if (require.main === module) {
  debug();
  ensureDirectories();
}
