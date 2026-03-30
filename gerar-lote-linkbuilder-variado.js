// Script para gerar lote maior de produtos ML sem link curto, variando palavras-chave
// Uso: node gerar-lote-linkbuilder-variado.js [quantidade=100] [arquivo_saida.txt]

const fs = require('fs');
const path = require('path');
const { buscarOfertasMercadoLivreIneditas } = require('./src/processador-ofertas');

async function main() {
  const quantidade = Math.max(1, Number(process.argv[2] || 100));
  const outputFile = process.argv[3] || 'ml-lote-linkbuilder-variado.txt';
  const historico = { offers: [] };
  const palavrasChave = [
    'eletrônicos','celular','fone','câmera','moda','acessórios','casa','games','livros','esporte','beleza','cozinha','tv','notebook','tablet','brinquedo','ferramenta','roupa','sapato','relógio','automotivo','pet','bebê','fitness','decoração','promoção','oferta'
  ];
  const ofertas = await buscarOfertasMercadoLivreIneditas({ quantidade, palavrasChave, tentativas: palavrasChave.length, historicoOfertas: historico.offers });
  const semLinkCurto = (ofertas || [])
    .filter(o => (o.marketplace||'').toLowerCase().includes('mercado livre'))
    .filter(o => !o.link || !o.link.includes('meli.la'));

  if (semLinkCurto.length === 0) {
    console.log('[INFO] Nenhum produto ML sem link curto encontrado.');
    process.exit(0);
  }

  const lote = semLinkCurto.map(o => `${o.product_id}\t${o.source_link || o.link || ''}`);
  fs.writeFileSync(path.resolve(outputFile), lote.join('\n'), 'utf8');
  console.log(`[LOTE] ${lote.length} produtos ML sem link curto salvos em ${outputFile}`);
}

main();
