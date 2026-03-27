#!/usr/bin/env node
/**
 * AUTENTICAR E SALVAR SESSAO
 * Gera QR code, autentica, e salva sessao para reuso posterior
 * Execute uma unica vez, autentique via QR, depois deixe rodando em background
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const { patchConsole } = require('./src/log-mask');
const { PATHS, ensureDirectories } = require('./src/config/paths');
require('dotenv').config();
patchConsole();

console.log('\n' + '='.repeat(70));
console.log('  AUTENTICACAO WHATSAPP - SALVAR SESSAO');
console.log('='.repeat(70));

// Usar SESSION_ID fixo para reutilizar
const SESSION_ID = 'producao';
const AUTH_STORE_PATH = PATHS.WWEBJS_SESSIONS + '/' + SESSION_ID;
const WHATSAPP_STATUS_FILE = PATHS.WHATSAPP_STATUS;

console.log(`\n[SESSION] ID: ${SESSION_ID}`);
console.log(`[PATH] ${AUTH_STORE_PATH}\n`);

function atualizarStatusWhatsapp(status, extra = {}) {
  try {
    const payload = {
      status,
      updatedAt: Date.now(),
      updatedAtISO: new Date().toISOString(),
      sessionId: SESSION_ID,
      ...extra
    };

    fs.writeFileSync(WHATSAPP_STATUS_FILE, JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error('[WA_STATUS_ERR]', err.message);
  }
}

ensureDirectories();

// Cliente WhatsApp
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: AUTH_STORE_PATH
  }),
  puppeteer: {
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  }
});

client.on('qr', (qr) => {
  atualizarStatusWhatsapp('qr_required', { detail: 'QR Code gerado, aguardando autenticacao' });
  console.log('='.repeat(70));
  console.log('  QR CODE - ESCANEIE COM WHATSAPP');
  console.log('='.repeat(70));
  console.log(qr);
  console.log('='.repeat(70));
  console.log('');

  fs.writeFileSync(PATHS.QR_CODE_TXT, qr);
});

client.on('ready', () => {
  atualizarStatusWhatsapp('ready', { detail: 'Sessao autenticada e pronta para uso' });
  console.log('\nWhatsApp autenticado com sucesso!\n');
  console.log('Sessao salva em: ' + AUTH_STORE_PATH);
  console.log('Voce pode fechar este script; a sessao sera reutilizada.\n');
  console.log('Em caso de erro, execute novamente para reautenticar.\n');
  console.log('Pressione Ctrl+C para sair...\n');
});

client.on('authenticated', () => {
  atualizarStatusWhatsapp('authenticated', { detail: 'Sessao autenticada' });
});

client.on('auth_failure', (message) => {
  atualizarStatusWhatsapp('auth_failure', { detail: message || 'Falha na autenticacao' });
});

client.on('disconnected', () => {
  atualizarStatusWhatsapp('disconnected', { detail: 'Desconectado do WhatsApp' });
  console.log('\nDesconectado do WhatsApp');
  process.exit(1);
});

atualizarStatusWhatsapp('initializing', { detail: 'Inicializando autenticacao WhatsApp' });
client.initialize();
