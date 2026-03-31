// Script para capturar todas as ofertas do hub de afiliados do Mercado Livre e gerar mapa de links
// Salva cookies de ml-cookies.json, acessa o hub, extrai produtos e links curtos, salva em mercadolivre-linkbuilder-map.txt

const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const COOKIES_FILE = 'ml-cookies.json';
  const MAP_FILE = 'mercadolivre-linkbuilder-map.txt';
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
  await page.waitForTimeout(5000);


  // Scroll automático até carregar todos os cards
  let previousCount = 0;
  let sameCountTimes = 0;
  for (let i = 0; i < 30; i++) { // Limite de tentativas para evitar loop infinito
    const cards = await page.$$('[data-testid="affiliate-product-card"]');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1200);
    if (cards.length === previousCount) {
      sameCountTimes++;
      if (sameCountTimes >= 3) break;
    } else {
      sameCountTimes = 0;
      previousCount = cards.length;
    }
  }

  // Extrair todos os cards carregados
  const cards = await page.$$('[data-testid="affiliate-product-card"]');
  let results = [];
  const clipboardy = await import('clipboardy');
  let idx = 0;
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  for (const card of cards) {
    idx++;
    try {
      const url = await card.$eval('a', a => a.href);
      let shortLink = '';
      console.log(`[${idx}] Produto: ${url}`);
      // Busca o botão Compartilhar corretamente dentro do form-action
      // Busca o botão Compartilhar pelo texto dentro do card
      const compartilharBtn = await card.$('button:has(span:has-text("Compartilhar"))');
      if (compartilharBtn) {
        console.log(`[${idx}] Clicando no botão Compartilhar (por texto)...`);
        await compartilharBtn.click();
        await page.waitForTimeout(1000);
        // Espera o pop-up aparecer
        try {
          await page.waitForSelector('text=Compartilhe para ganhar dinheiro', { timeout: 5000 });
          console.log(`[${idx}] Pop-up de compartilhamento apareceu.`);
          // Captura e exibe o HTML do pop-up para análise
          const popupHtml = await page.evaluate(() => {
            const popup = Array.from(document.querySelectorAll('div,section')).find(e => e.innerText && e.innerText.includes('Compartilhe para ganhar dinheiro'));
            return popup ? popup.outerHTML : 'NÃO ENCONTROU POPUP NO DOM';
          });
          console.log(`[${idx}] HTML do pop-up:\n`, popupHtml);
        } catch (e) {
          console.log(`[${idx}] Pop-up NÃO apareceu!`);
        }
        // (Não tenta clicar em Copiar link nem ler clipboard por enquanto)
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      } else {
        console.log(`[${idx}] NÃO encontrou botão Compartilhar pelo texto dentro do card!`);
      }
      results.push({ url, shortLink });
      await new Promise(resolve => rl.question(`[${idx}] Pressione Enter para continuar para o próximo card...`, resolve));
    } catch (err) {
      console.log(`[${idx}] ERRO ao processar card:`, err);
    }
  }
  rl.close();

  // Salva no arquivo de mapa
  const lines = results.filter(r => r.url && r.shortLink).map(r => `${r.url}\t${r.shortLink}`);
  fs.writeFileSync(MAP_FILE, lines.join('\n'), 'utf8');
  console.log(`Mapa salvo em ${MAP_FILE} (${lines.length} links)`);

  await browser.close();
})();
