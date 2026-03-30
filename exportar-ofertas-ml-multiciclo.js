// Script para rodar múltiplos ciclos até preencher ofertas ML válidas usando o mapa e pool
// Uso: node exportar-ofertas-ml-multiciclo.js [minimo=10] [arquivo_saida.json]

const fs = require('fs');
const path = require('path');
const { executar } = require('./src/processador-ofertas');

async function main() {
  const minimo = Math.max(1, Number(process.argv[2] || 10));
  const outputFile = process.argv[3] || 'ofertas-ml-multiciclo.json';
  const maxTentativas = 10;
  let ofertasML = [];
  let tentativas = 0;
  let totalShopee = 0;

  while (ofertasML.length < minimo && tentativas < maxTentativas) {
    console.log(`\n[CICLO ${tentativas + 1}] Buscando ofertas...`);
    const ofertas = await executar();
    const ml = (ofertas || []).filter(o => (o.marketplace||'').toLowerCase().includes('mercado livre') && o.link && o.link.includes('meli.la'));
    ofertasML = ofertasML.concat(ml.filter(o => !ofertasML.some(x => x.product_id === o.product_id)));
    totalShopee += (ofertas || []).filter(o => (o.marketplace||'').toLowerCase().includes('shopee')).length;
    tentativas++;
    if (ofertasML.length < minimo) {
      console.log(`[INFO] Apenas ${ofertasML.length} ofertas ML válidas até agora. Novo ciclo...`);
    }
  }

  if (ofertasML.length === 0) {
    console.log('[ERRO] Nenhuma oferta ML válida encontrada após múltiplos ciclos.');
    process.exit(1);
  }

  fs.writeFileSync(path.resolve(outputFile), JSON.stringify(ofertasML, null, 2), 'utf8');
  console.log(`\n[FINALIZADO] ${ofertasML.length} ofertas ML válidas salvas em ${outputFile}`);
  if (totalShopee > 0) {
    console.log(`[INFO] ${totalShopee} ofertas Shopee foram ignoradas neste processo.`);
  }
}

main();
