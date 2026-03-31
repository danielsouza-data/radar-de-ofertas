// Teste: Captura ofertas novas do ML e gera links encurtados com o linkbuilder

const { buscarOfertasPaginaOficialML } = require('./src/processador-ofertas');
const fs = require('fs');
const { gerarLinkAfiliado } = require('./ml-linkbuilder');

// Utilitário para extrair cookies e csrfToken do arquivo ml-cookies.json
function getCookiesAndCsrf() {
  const cookiesArr = JSON.parse(fs.readFileSync('ml-cookies.json', 'utf8'));
  const cookiesStr = cookiesArr.map(c => `${c.name}=${c.value}`).join('; ');
  // Procura o x-csrf-token no cookie (ou ajuste para capturar de outro local se necessário)
  const csrfCookie = cookiesArr.find(c => c.name === 'x-csrf-token');
  const csrfToken = csrfCookie ? csrfCookie.value : '';
  return { cookiesStr, csrfToken };
}

(async () => {
  // 1. Buscar ofertas novas
  let ofertas;
  try {
    ofertas = await buscarOfertasPaginaOficialML(5);
    if (!ofertas || !ofertas.length) {
      console.log('[ML-TESTE] Nenhuma oferta encontrada.');
      return;
    }
    console.log(`[ML-TESTE] ${ofertas.length} ofertas capturadas.`);
  } catch (err) {
    console.error('[ML-TESTE] Erro ao buscar ofertas:', err.message);
    fs.appendFileSync('logs/ml-linkbuilder-errors.log', `[${new Date().toISOString()}] Erro ao buscar ofertas: ${err.stack}\n`);
    return;
  }

  // 2. Carregar cookies e csrfToken
  let cookiesStr, csrfToken;
  try {
    ({ cookiesStr, csrfToken } = getCookiesAndCsrf());
    if (!cookiesStr || !csrfToken) throw new Error('Cookies ou CSRF token ausentes');
  } catch (err) {
    console.error('[ML-TESTE] Erro ao carregar cookies/csrf:', err.message);
    fs.appendFileSync('logs/ml-linkbuilder-errors.log', `[${new Date().toISOString()}] Erro ao carregar cookies/csrf: ${err.stack}\n`);
    return;
  }

  // 3. Gerar links de afiliado encurtados via API oficial
  const results = [];
  for (const oferta of ofertas) {
    try {
      const link_encurtado = await gerarLinkAfiliado(oferta.raw_link, cookiesStr, csrfToken);
      results.push({
        produto: oferta.product_name,
        preco: oferta.price,
        link_produto: oferta.raw_link,
        link_encurtado
      });
      console.log(`[ML-TESTE] Link encurtado para ${oferta.product_name}: ${link_encurtado}`);
    } catch (e) {
      console.error(`[ML-TESTE] Erro ao gerar link encurtado para ${oferta.raw_link}:`, e.message);
      fs.appendFileSync('logs/ml-linkbuilder-errors.log', `[${new Date().toISOString()}] Erro ao gerar link para ${oferta.raw_link}: ${e.stack}\n`);
    }
  }

  // 4. Salvar resultado em JSON
  fs.writeFileSync('links-ml-teste-curtos.json', JSON.stringify(results, null, 2), 'utf8');
  console.log(`[ML-TESTE] Resultados salvos em links-ml-teste-curtos.json (${results.length} links gerados)`);
})();
