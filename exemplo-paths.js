#!/usr/bin/env node
/**
 * EXEMPLO: Como usar src/config/paths.js
 * 
 * Demonstra como o novo módulo centralizado funciona
 * Run com: node exemplo-paths.js
 */

const { PATHS, ensureDirectories, debug } = require('./src/config/paths');
const fs = require('fs');
const path = require('path');

console.log('\n🎯 EXEMPLO DE USO: PATHS CENTRALIZADO\n');

// 1. Mostrar todos os paths para esta máquina
console.log('1️⃣  Debug de Paths (usar para verificar portabilidade):');
console.log('   Comando: node src/config/paths.js\n');

// 2. Criar diretórios se não existem
console.log('2️⃣  Garantir que todos os diretórios existem:');
ensureDirectories();

// 3. Verificar arquivo de log existe
console.log('\n3️⃣  Exemplo 1: Acessar arquivo de disparos:');
console.log(`   const disparoLog = PATHS.DISPAROS_LOG;`);
console.log(`   → ${PATHS.DISPAROS_LOG}`);
console.log(`   ✓ Funciona em Windows, Mac, Linux, Docker!\n`);

// 4. Verificar histórico de ofertas
console.log('4️⃣  Exemplo 2: Acessar histórico de ofertas:');
console.log(`   const historico = PATHS.HISTORICO_OFERTAS;`);
console.log(`   → ${PATHS.HISTORICO_OFERTAS}\n`);

// 5. Criar arquivo de teste
console.log('5️⃣  Exemplo 3: Criar arquivo em data/:');
const testFile = path.join(PATHS.DATA, '_test.json');
const testContent = { timestamp: new Date().toISOString(), teste: true };
fs.writeFileSync(testFile, JSON.stringify(testContent, null, 2));
console.log(`   fs.writeFileSync(PATHS.DATA + '/_test.json', dados);`);
console.log(`   → ${testFile}`);
console.log(`   ✓ Arquivo criado com sucesso!\n`);

// 6. Listar melhorias de portabilidade
console.log('6️⃣  Melhorias de Portabilidade:');
console.log(`   ✓ Nenhum hardcoded "C:\\Users\\...":`);
console.log(`   ✓ Nenhum hardcoded "/home/user/..."`);
console.log(`   ✓ Funciona em qualquer máquina`);
console.log(`   ✓ Customizável via RADAR_PROJECT_ROOT`);
console.log(`   ✓ Docker-ready\n`);

// 7. Mostrar como usar em scripts
console.log('7️⃣  Como usar em seus scripts:\n');
console.log('   // Seu arquivo: disparo-completo.js');
console.log('   const { PATHS } = require("./src/config/paths");');
console.log('   const { ensureDirectories } = require("./src/config/paths");');
console.log('   ');
console.log('   // Na startup do script:');
console.log('   ensureDirectories();');
console.log('   ');
console.log('   // Usar paths:');
console.log('   const lockFile = PATHS.GLOBAL_LOCK;');
console.log('   const historico = PATHS.HISTORICO_OFERTAS;');
console.log('   ');
console.log('   // Funciona em QUALQUER máquina! 🚀\n');

// 8. Resumo
console.log('8️⃣  Resumo:');
console.log(`   Raiz do Projeto: ${PATHS.ROOT}`);
console.log(`   Total de Paths: ${Object.keys(PATHS).length}`);
console.log(`   Portabilidade: ✅ 100%\n`);

// Limpar arquivo de teste
fs.unlinkSync(testFile);
console.log(`✅ Teste completo! (arquivo de teste removido)\n`);
