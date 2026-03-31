// Script de inspeção para identificar seletores do Link Builder
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Carregar cookies se existirem
  const fs = require('fs');
  const COOKIES_FILE = 'ml-cookies.json';
  await page.goto('about:blank');
  if (fs.existsSync(COOKIES_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
    await page.context().addCookies(cookies);
    console.log('Cookies carregados de', COOKIES_FILE);
  }
  await page.goto('https://www.mercadolivre.com.br/afiliados/linkbuilder#hub');
  await page.waitForTimeout(10000); // tempo para login automático

  // Preenche o campo de link, se existir
  const input = await page.$('input[type="text"]');
  if (input) {
    await input.fill('https://www.mercadolivre.com.br/');
    console.log('Campo de link preenchido.');
  } else {
    console.log('Campo de link não encontrado.');
  }

  // Lista botões visíveis
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await btn.innerText();
    const visible = await btn.isVisible();
    if (visible) {
      console.log('Botão visível:', text);
    }
  }

  // Lista campos de texto/readonly
  const outputs = await page.$$('input[readonly], input[disabled], input');
  for (const out of outputs) {
    const value = await out.inputValue();
    const type = await out.getAttribute('type');
    const readonly = await out.getAttribute('readonly');
    const disabled = await out.getAttribute('disabled');
    console.log(`Campo: type=${type}, readonly=${readonly}, disabled=${disabled}, value=${value}`);
  }

  await page.waitForTimeout(20000); // tempo para inspeção manual
  await browser.close();
})();
