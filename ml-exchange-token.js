// ml-exchange-token.js
// Troca o código de autorização do Mercado Livre por um access token
// Execute com: .\node-portable\node ml-exchange-token.js <code>


const https = require('https');
const fs = require('fs');
// Carrega variáveis do .env automaticamente
require('dotenv').config();


const clientId = process.env.MERCADO_LIVRE_CLIENT_ID || '';
const clientSecret = process.env.MERCADO_LIVRE_CLIENT_SECRET || '';
const redirectUri = process.env.MERCADO_LIVRE_REDIRECT_URI || 'https://www.example.com/auth';

// Permite passar o código como argumento ou ler do arquivo
const code = process.argv[2] || fs.readFileSync('ml-auth-code.txt', 'utf8').trim();

// Lê o code_verifier salvo pelo playwright-ml-auth.js
let code_verifier = '';
try {
  const pkce = JSON.parse(fs.readFileSync('ml-pkce.json', 'utf8'));
  code_verifier = pkce.code_verifier;
} catch (e) {
  console.error('Erro ao ler o code_verifier (ml-pkce.json):', e);
  process.exit(1);
}

if (!clientId || !clientSecret || !code || !code_verifier) {
  console.error('Defina MERCADO_LIVRE_CLIENT_ID, MERCADO_LIVRE_CLIENT_SECRET, forneça o código de autorização e o code_verifier.');
  process.exit(1);
}

const data = new URLSearchParams({
  grant_type: 'authorization_code',
  client_id: clientId,
  client_secret: clientSecret,
  code,
  redirect_uri: redirectUri,
  code_verifier
}).toString();

const options = {
  hostname: 'api.mercadolibre.com',
  path: '/oauth/token',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': data.length
  }
};

const req = https.request(options, res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    if (res.statusCode === 200) {
      const json = JSON.parse(body);
      console.log('Access token:', json.access_token);
      fs.writeFileSync('ml-access-token.json', JSON.stringify(json, null, 2));
      console.log('Token salvo em ml-access-token.json');

      // Atualiza o .env automaticamente
      const envPath = '.env';
      let envContent = fs.readFileSync(envPath, 'utf8');
      const newTokenLine = `MERCADO_LIVRE_ACCESS_TOKEN=${json.access_token}`;
      if (envContent.match(/^MERCADO_LIVRE_ACCESS_TOKEN=.*$/m)) {
        envContent = envContent.replace(/^MERCADO_LIVRE_ACCESS_TOKEN=.*$/m, newTokenLine);
      } else {
        envContent += `\n${newTokenLine}\n`;
      }
      fs.writeFileSync(envPath, envContent);
      console.log('MERCADO_LIVRE_ACCESS_TOKEN atualizado no .env');
    } else {
      console.error('Erro ao trocar código por token:', res.statusCode, body);
    }
  });
});

req.on('error', e => console.error('Erro de conexão:', e));
req.write(data);
req.end();
