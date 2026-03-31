// ml-linkbuilder.js
// Gera links de afiliado Mercado Livre usando a API oficial, cookies de sessão e CSRF token
// Uso: const { gerarLinkAfiliado } = require('./ml-linkbuilder');

const axios = require('axios');

/**
 * Gera link de afiliado Mercado Livre
 * @param {string} urlProduto - URL do produto
 * @param {string} cookies - String de cookies de sessão (ex: "cookie1=val1; cookie2=val2")
 * @param {string} csrfToken - Valor do x-csrf-token
 * @param {string} tag - Tag de afiliado (opcional)
 * @returns {Promise<string>} - Link de afiliado
 */
async function gerarLinkAfiliado(urlProduto, cookies, csrfToken, tag = 'myshoplist') {
  const endpoint = 'https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink';
  const headers = {
    'accept': 'application/json, text/plain, */*',
    'referer': 'https://www.mercadolivre.com.br/afiliados/linkbuilder',
    'x-csrf-token': csrfToken,
    'cookie': cookies,
    'content-type': 'application/json',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };
  const body = {
    urls: [urlProduto],
    tag
  };
  const resp = await axios.post(endpoint, body, { headers });
  if (resp.data && resp.data.links && resp.data.links.length > 0) {
    return resp.data.links[0].affiliate_link;
  }
  throw new Error('Link de afiliado não retornado');
}

module.exports = { gerarLinkAfiliado };
