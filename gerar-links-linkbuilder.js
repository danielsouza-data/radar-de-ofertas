// Script para automatizar geração de links curtos no Link Builder do Mercado Livre
// Requer: playwright instalado e configurado
// Uso: node-portable\node gerar-links-linkbuilder.js links.txt

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const LINKBUILDER_URL = 'https://www.mercadolivre.com.br/afiliados/linkbuilder#hub';
const INPUT_FILE = process.argv[2] || 'links-ml.txt';
const OUTPUT_FILE = process.argv[3] || 'mercadolivre-linkbuilder-map.txt';

const COOKIES_FILE = 'ml-cookies.json';

async function saveCookies(page) {
  const cookies = await page.context().cookies();
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
  console.log('Cookies salvos em', COOKIES_FILE);
}

async function loadCookies(page) {
  if (fs.existsSync(COOKIES_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
    await page.context().addCookies(cookies);
    console.log('Cookies carregados de', COOKIES_FILE);
  }
}

async function gerarLinksCurto() {
  const links = fs.readFileSync(INPUT_FILE, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const output = fs.existsSync(OUTPUT_FILE) ? fs.readFileSync(OUTPUT_FILE, 'utf8') : '';
  const mapeados = new Set(output.split(/\r?\n/).map(l => l.split('|')[0].trim()));
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Se for chamado com --save-cookies, só salva cookies após login manual
  if (process.argv.includes('--save-cookies')) {
    console.log('Acesse o Link Builder, faça login manualmente e aguarde...');
    await page.goto(LINKBUILDER_URL);
    await page.waitForTimeout(45000); // 45s para login manual
    await saveCookies(page);
    await browser.close();
    return;
  }

  // Tenta carregar cookies salvos para login automático
  await page.goto('about:blank');
  await loadCookies(page);
  await page.goto(LINKBUILDER_URL);

  // Verifica se está logado (ajuste o seletor conforme necessário)
  try {
    await page.waitForSelector('input[type="text"]', { timeout: 15000 });
    console.log('Login automático bem-sucedido!');
  } catch {
    console.log('Não foi possível logar automaticamente. Faça login manualmente e os cookies serão salvos.');
    await page.waitForTimeout(45000); // 45s para login manual
    await saveCookies(page);
  }

  for (const link of links) {
    if (mapeados.has(link)) continue;
    console.log(`Processando: ${link}`);
    await page.goto(LINKBUILDER_URL);
    // Preencher o campo de link (primeiro input[type="text"])
    const inputs = await page.$$('input[type="text"]');
    if (!inputs.length) {
      console.log('Campo de link não encontrado! Pulando...');
      continue;
    }
    // Simular digitação real no textarea url-0
    await page.focus('#url-0');
    // Limpar campo
    await page.evaluate(() => {
      const textarea = document.getElementById('url-0');
      if (textarea) textarea.value = '';
    });
    for (const char of link) {
      await page.type('#url-0', char, { delay: 20 });
    }
    await page.waitForTimeout(500); // Aguarda debounce
    // Espera o botão "Gerar" estar habilitado
    const btnGerar = await page.waitForSelector('button:has-text("Gerar")', { timeout: 10000 });
    await btnGerar.waitForElementState('enabled', { timeout: 10000 });
    await btnGerar.click();
    // Aguardar o botão "Copiar" aparecer (indica que o link foi gerado)
    await page.waitForSelector('button:has-text("Copiar")', { timeout: 20000 });
    // Capturar o link curto do textarea de resultado
    await page.waitForSelector('textarea#textfield-copyLink-1', { timeout: 10000 });
    const linkCurto = await page.$eval('textarea#textfield-copyLink-1', el => el.value);
    if (!linkCurto || linkCurto.includes('não é do Mercado Livre')) {
      console.log('Link curto não encontrado ou inválido! Pulando...');
      continue;
    }
    fs.appendFileSync(OUTPUT_FILE, `${link}|${linkCurto}\n`);
    console.log(`✔️  ${linkCurto}`);
    await page.waitForTimeout(1000);
  }

  await browser.close();
  console.log('Processo concluído. Todos os links foram mapeados.');
}

gerarLinksCurto();
