// Script para capturar o HTML do hub de afiliados do Mercado Livre para inspeção
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const COOKIES_FILE = 'ml-cookies.json';
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Carregar cookies
  if (fs.existsSync(COOKIES_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
    await context.addCookies(cookies);
    console.log('Cookies carregados de', COOKIES_FILE);
  }

  // Acessar o hub de afiliados
  await page.goto('https://www.mercadolivre.com.br/afiliados/hub', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);

  // Salvar HTML da página
  const html = await page.content();
  fs.writeFileSync('hub-afiliados.html', html, 'utf8');
  console.log('HTML salvo em hub-afiliados.html');

  await browser.close();
})();
