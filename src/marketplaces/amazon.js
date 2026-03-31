// Amazon driver

async function buscarOfertasAmazon() {
  // TODO: Implementar scraping real da Amazon ou ler de arquivo
  return [];
}


function gerarLinkAfiliadoAmazon(urlProduto, tagAfiliado) {
  // Preserva a URL original, apenas adicionando/substituindo o parâmetro 'tag'
  try {
    const url = new URL(urlProduto);
    // Só adiciona tag se a URL for de produto (contém /dp/ASIN ou /gp/product/ASIN)
    if (/\/dp\//.test(url.pathname) || /\/gp\/product\//.test(url.pathname)) {
      url.searchParams.set('tag', tagAfiliado);
      return url.toString();
    } else {
      // Não retorna link de afiliado para home/categorias
      return null;
    }
  } catch (e) {
    return null;
  }
}

module.exports = { buscarOfertasAmazon, gerarLinkAfiliadoAmazon };
