// Script utilitário para rodar o ciclo de automação e exportar ofertas válidas para arquivo JSON
// Uso: node exportar-ofertas.js [arquivo_saida.json]

const fs = require('fs');
const path = require('path');
const { executar } = require('./src/processador-ofertas');

async function main() {
  const outputFile = process.argv[2] || 'ofertas-exportadas.json';
  console.log(`[EXPORTAÇÃO] Iniciando ciclo de automação...`);
  const ofertas = await executar();
  if (!ofertas || !Array.isArray(ofertas) || ofertas.length === 0) {
    console.log('[EXPORTAÇÃO] Nenhuma oferta válida encontrada.');
    process.exit(0);
  }
  fs.writeFileSync(path.resolve(outputFile), JSON.stringify(ofertas, null, 2), 'utf8');
  console.log(`[EXPORTAÇÃO] ${ofertas.length} ofertas salvas em ${outputFile}`);
}

main();
