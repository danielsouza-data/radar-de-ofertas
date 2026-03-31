// teste-dryrun-marketplaces.js
// Dry run: simula a captura e geração de links para ML, Amazon e Shopee, sem acessar APIs reais

const exemplos = {
  mercadolivre: {
    oferta: {
      titulo: 'Smartphone Samsung Galaxy S23',
      preco: 3499.99,
      url: 'https://produto.mercadolivre.com.br/MLB-123456789-smartphone-samsung-galaxy-s23',
    },
    linkAfiliado: 'https://www.mercadolivre.com.br/afiliados/link?url=https%3A%2F%2Fproduto.mercadolivre.com.br%2FMLB-123456789-smartphone-samsung-galaxy-s23&tag=myshoplist',
  },
  amazon: {
    oferta: {
      titulo: 'Echo Dot 5ª Geração',
      preco: 349.00,
      url: 'https://www.amazon.com.br/dp/B09WQY65HN',
    },
    linkAfiliado: 'https://www.amazon.com.br/dp/B09WQY65HN?tag=seutag-20',
  },
  shopee: {
    oferta: {
      titulo: 'Tênis Esportivo Masculino',
      preco: 129.90,
      url: 'https://shopee.com.br/Tenis-Esportivo-Masculino-i.123456.789012',
    },
    linkAfiliado: 'https://shope.ee/affiliate-link-exemplo',
  },
};

console.log('--- Dry Run: Exemplos de cada marketplace ---');
for (const [marketplace, dados] of Object.entries(exemplos)) {
  console.log(`\nMarketplace: ${marketplace}`);
  console.log('Oferta:', dados.oferta);
  console.log('Link de afiliado:', dados.linkAfiliado);
}
