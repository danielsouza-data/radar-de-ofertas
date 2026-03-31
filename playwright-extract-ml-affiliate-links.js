// playwright-extract-ml-affiliate-links.js
// Script para extrair todos os links de afiliado do Hub Mercado Livre e salvar em um arquivo
// Uso: node playwright-extract-ml-affiliate-links.js <URL do Hub Mercado Livre>

const fs = require('fs');
const { chromium } = require('playwright');

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Uso: node playwright-extract-ml-affiliate-links.js <URL do Hub Mercado Livre>');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Carrega cookies de sessão se existir o arquivo cookies.json ou ml-cookies.json
  let cookiesPath = 'cookies.json';
  if (!fs.existsSync(cookiesPath) && fs.existsSync('ml-cookies.json')) {
    cookiesPath = 'ml-cookies.json';
  }
  if (fs.existsSync(cookiesPath)) {
    let cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
    // Playwright espera domínio sem subdomínio inicial para cookies cross-site
    cookies = cookies.map(c => {
      if (c.domain && c.domain.startsWith('.')) {
        c.domain = c.domain.replace(/^\./, '');
      }
  const results = [];
      // Carrega cookies de sessão se existir o arquivo cookies.json ou ml-cookies.json
      let cookiesLoaded = false;
      let cookiesPath = null;
      if (fs.existsSync('ml-cookies.json')) {
        cookiesPath = 'ml-cookies.json';
      } else if (fs.existsSync('cookies.json')) {
        cookiesPath = 'cookies.json';
      }
      if (cookiesPath) {
        const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
        await page.context().addCookies(cookies);
        cookiesLoaded = true;
        console.log(`Cookies de sessão carregados de ${cookiesPath}.`);
      }

  for (let i = 0; i < cardHandles.length; i++) {
    const card = cardHandles[i];
    // Clica no card para abrir detalhes (se necessário)
      // Verifica se está autenticado (exemplo: procura por elemento de perfil)
      let autenticado = false;
      try {
        // Ajuste o seletor abaixo conforme o elemento que só aparece quando logado
        await page.waitForSelector('img[alt*="perfil"], [data-testid*="profile"], .user-profile', { timeout: 5000 });
        autenticado = true;
      } catch (e) {
        autenticado = false;
      }

      if (!autenticado) {
        console.log('Sessão não autenticada. Faça login manualmente e pressione Enter para continuar.');
        await new Promise(resolve => process.stdin.once('data', resolve));
      } else {
        console.log('Sessão autenticada detectada. Prosseguindo automaticamente.');
      }
    await card.click();
    await page.waitForTimeout(1000);

    // Clica no botão Compartilhar
    const shareBtn = await page.$('button:has-text("Compartilhar")');
    if (!shareBtn) {
      console.log(`Card ${i+1}: Botão Compartilhar não encontrado.`);
      continue;
    }
    await shareBtn.click();
    await page.waitForTimeout(1000);

    // Clica no botão Copiar link
    const copyBtn = await page.$('button:has-text("Copiar link")');
    if (!copyBtn) {
      console.log(`Card ${i+1}: Botão Copiar link não encontrado.`);
      continue;
    }
    await copyBtn.click();
    await page.waitForTimeout(500);

    // Lê o link do campo de input do pop-up (caso disponível)
    let link = null;
    try {
      const input = await page.$('input[type="text"]');
      if (input) {
        link = await input.inputValue();
      }
    } catch (e) {}

    // Fecha o pop-up (pressiona ESC)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Tenta extrair dados extras do card
    let metadata = {};
    try {
      const metaStr = await card.getAttribute('data-metadata');
      metadata = JSON.parse(metaStr);
    } catch (e) {}

    results.push({
      ...metadata,
      link,
      cardIndex: i+1
    });
    console.log(`Card ${i+1}: link capturado.`);
  }

  if (results.length === 0) {
    console.log('Nenhum link de afiliado encontrado.');
  } else {
    fs.writeFileSync('ml-affiliate-links.json', JSON.stringify(results, null, 2), 'utf8');
    console.log(`Foram extraídos ${results.length} links de afiliado e salvos em ml-affiliate-links.json`);
  }

  await browser.close();
}

main();
