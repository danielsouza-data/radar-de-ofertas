// Script para gerar lote de produtos ML sem link curto para envio ao Link Builder
// Uso: node gerar-lote-linkbuilder.js [quantidade=25] [arquivo_saida.txt]

const fs = require('fs');
const path = require('path');
const { executar } = require('./src/processador-ofertas');

async function main() {
  const quantidade = Math.max(1, Number(process.argv[2] || 25));
  const outputFile = process.argv[3] || 'ml-lote-linkbuilder.txt';
  const ofertas = await executar();
  const semLinkCurto = (ofertas || [])
    .filter(o => (o.marketplace||'').toLowerCase().includes('mercado livre'))
    .filter(o => !o.link || !o.link.includes('meli.la'));

  if (semLinkCurto.length === 0) {
    console.log('[INFO] Nenhum produto ML sem link curto encontrado.');
    process.exit(0);
  }

  const lote = semLinkCurto.slice(0, quantidade).map(o => `${o.product_id}\t${o.source_link || o.link || ''}`);
  fs.writeFileSync(path.resolve(outputFile), lote.join('\n'), 'utf8');
  console.log(`[LOTE] ${lote.length} produtos ML sem link curto salvos em ${outputFile}`);
}

main();
