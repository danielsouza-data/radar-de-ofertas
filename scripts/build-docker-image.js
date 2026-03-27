#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const args = process.argv.slice(2);

function readArg(name, fallback = '') {
  const idx = args.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && args[idx + 1]) return String(args[idx + 1]).trim();
  return fallback;
}

const tag = readArg('tag', process.env.DOCKER_TAG || 'latest');
const registry = readArg('registry', process.env.DOCKER_REGISTRY || 'danielsouzadata');
const repository = readArg('repository', process.env.DOCKER_REPOSITORY || 'radar-de-ofertas');
const push = args.includes('--push');
const noBuildCache = args.includes('--no-cache');

const imageName = `${registry}/${repository}`;
const fullTag = `${imageName}:${tag}`;

console.log('========================================');
console.log('  🐳 DOCKER BUILD & PUSH (Node.js)');
console.log('========================================');
console.log(`Projeto: ${ROOT}`);
console.log(`Imagem: ${fullTag}`);
console.log('');

try {
  // Verificar docker
  console.log('[BUILD] Verificando Docker...');
  execSync('docker --version', { stdio: 'pipe' });
  console.log('✅ Docker disponível');

  // Build
  console.log('[BUILD] Executando build...');
  const buildCmd = [
    'docker', 'build',
    '-t', fullTag,
    '-f', path.join(ROOT, 'Dockerfile'),
    noBuildCache ? '--no-cache' : '',
    ROOT
  ].filter(Boolean).join(' ');

  console.log(`  Comando: ${buildCmd}`);
  console.log('');

  execSync(buildCmd, { stdio: 'inherit', cwd: ROOT });

  console.log('');
  console.log('✅ Build concluído com sucesso!');
  console.log(`   Imagem: ${fullTag}`);

  // Listar imagem
  console.log('');
  execSync(`docker images | grep ${repository}`, { stdio: 'inherit' });

  // Push (se solicitado)
  if (push) {
    console.log('');
    console.log('[PUSH] Enviando imagem...');
    console.log(`  Registry: ${registry}`);
    console.log(`  Repository: ${repository}`);
    console.log(`  Tag: ${tag}`);
    console.log('');

    execSync(`docker push ${fullTag}`, { stdio: 'inherit', cwd: ROOT });

    console.log('');
    console.log('✅ Push concluído com sucesso!');
    console.log(`   Docker Hub: https://hub.docker.com/r/${imageName}`);
  }
  else {
    console.log('');
    console.log('[INFO] Para fazer push, execute:');
    console.log(`  node scripts/build-docker-image.js --tag ${tag} --push`);
    console.log(`  ou: docker push ${fullTag}`);
  }

  console.log('');
  console.log('========================================');
  console.log('✅ Operação concluída!');
  console.log('========================================');
  console.log('');
}
catch (e) {
  console.error('');
  console.error('❌ Erro durante execução:');
  console.error(e.message);
  process.exit(1);
}
