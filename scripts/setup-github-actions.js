#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const args = process.argv.slice(2);
const projectRoot = path.join(__dirname, '..');

function log(...msg) { console.log(...msg); }
function err(...msg) { console.error('❌', ...msg); }
function ok(...msg) { console.log('✅', ...msg); }
function warn(...msg) { console.log('⚠️ ', ...msg); }

async function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

async function main() {
  log('=========================================');
  log('  📦 SETUP - GitHub Actions Docker Build');
  log('=========================================');
  log('');

  log('[GIT] Verificando git...');
  try {
    const gitVersion = execSync('git --version', { encoding: 'utf8' });
    ok('Git disponível:', gitVersion.trim());
  }
  catch (e) {
    err('Git não encontrado. Instale: https://git-scm.com/');
    process.exit(1);
  }

  log('');
  log('[SETUP] Verificando arquivos de workflow...');

  const workflowFile = path.join(projectRoot, '.github', 'workflows', 'docker-build-push.yml');
  if (fs.existsSync(workflowFile)) {
    ok('Workflow encontrado:', workflowFile);
  }
  else {
    warn('Workflow não encontrado em:', workflowFile);
  }

  log('');
  log('=========================================');
  log('  ⚙️  PRÓXIMAS ETAPAS');
  log('=========================================');
  log('');
  log('1️⃣  Configure os Secrets no GitHub:');
  log('   https://github.com/seu-usuario/radar-de-ofertas/settings/secrets/actions');
  log('');
  log('   Adicione dois secrets:');
  log('   - DOCKER_USERNAME = danielsouzadata');
  log('   - DOCKER_PASSWORD = seu_token_docker_hub');
  log('');
  log('2️⃣  Faça push dos arquivos:');
  log('');

  const response = await ask('Deseja fazer push agora? (s/n): ');
  
  if (response.toLowerCase() === 's') {
    try {
      log('[GIT] Adicionando arquivos...');
      execSync('git add .', { cwd: projectRoot, stdio: 'inherit' });

      log('[GIT] Commitando...');
      execSync('git commit -m "ci: Adicionar GitHub Actions build Docker"', { cwd: projectRoot, stdio: 'inherit' });

      log('[GIT] Push...');
      execSync('git push', { cwd: projectRoot, stdio: 'inherit' });

      ok('Push concluído!');
    }
    catch (e) {
      err('Erro durante push:', e.message);
      process.exit(1);
    }
  }
  else {
    log('  cd ' + projectRoot);
    log('  git add .');
    log('  git commit -m "ci: Adicionar GitHub Actions build Docker"');
    log('  git push');
  }

  log('');
  log('3️⃣  Verifique a imagem Docker:');
  log('   https://hub.docker.com/r/danielsouzadata/radar-de-ofertas');
  log('');
  log('=========================================');
  ok('Setup concluído!');
  log('=========================================');
}

main().catch(e => {
  err('Erro fatal:', e.message);
  process.exit(1);
});
