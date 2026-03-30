// playwright-ml-auth.js
// Script para automatizar o login no Mercado Livre e capturar o token OAuth
// Execute com: .\node-portable\node playwright-ml-auth.js



require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const crypto = require('crypto');

// Função para gerar code_verifier e code_challenge (PKCE)
function generatePKCE() {
  const code_verifier = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(code_verifier).digest();
  const code_challenge = hash.toString('base64url');
  return { code_verifier, code_challenge };
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // URL de autorização do Mercado Livre com PKCE
  const clientId = process.env.MERCADO_LIVRE_CLIENT_ID || '';
  const redirectUri = process.env.MERCADO_LIVRE_REDIRECT_URI || 'https://www.example.com/auth';
  console.log('DEBUG: redirect_uri lido do .env:', redirectUri);
  const { code_verifier, code_challenge } = generatePKCE();
  const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${code_challenge}&code_challenge_method=S256`;

  // Salva o code_verifier para uso posterior
  fs.writeFileSync('ml-pkce.json', JSON.stringify({ code_verifier, code_challenge }, null, 2));

  console.log('Abrindo página de login do Mercado Livre...');
  await page.goto(authUrl);

  // Aguarda o usuário fazer login e autorizar manualmente
  console.log('Faça login e autorize o app. Após o redirecionamento, copie o código da URL.');
  await page.waitForURL(url => typeof url === 'string' && url.startsWith(redirectUri), { timeout: 0 });

  const finalUrl = page.url();
  const codeMatch = finalUrl.match(/[?&]code=([^&]+)/);
  if (!codeMatch) {
    console.error('Código de autorização não encontrado na URL.');
    await browser.close();
    process.exit(1);
  }
  const code = codeMatch[1];
  console.log('Código de autorização capturado:', code);

  // Salva o código e o PKCE juntos
  fs.writeFileSync('ml-auth-code.txt', code);
  console.log('Código salvo em ml-auth-code.txt');
  console.log('PKCE salvo em ml-pkce.json');

  await browser.close();
})();
