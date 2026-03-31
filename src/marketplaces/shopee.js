// Shopee driver

async function buscarOfertasShopee() {
  // TODO: Implementar scraping real da Shopee ou ler de arquivo
  return [];
}

function gerarLinkAfiliadoShopee(urlProduto, tagAfiliado) {
  // Exemplo: adiciona tag de afiliado na URL
  const url = new URL(urlProduto);
  url.searchParams.set('aff_sub', tagAfiliado);
  return url.toString();
}

module.exports = { buscarOfertasShopee, gerarLinkAfiliadoShopee };
