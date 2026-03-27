#!/usr/bin/env node
/**
 * AUTENTICAR E SALVAR SESSÃO
 * Gera QR code, autentica, e salva sessão para reuso posterior
 * Execute uma única vez, autentique via QR, depois deixar rodando em background
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');
const fs = require('fs');
const { patchConsole } = require('./src/log-mask');
require('dotenv').config();
patchConsole();

console.log('\n' + '='.repeat(70));
console.log('  📱 AUTENTICAÇÃO WHATSAPP - SALVAR SESSÃO');
console.log('='.repeat(70));

// Usar SESSION_ID fixo para reutilizar
const SESSION_ID = 'producao';
const AUTH_STORE_PATH = path.join(__dirname, '.wwebjs_sessions', SESSION_ID);
const WHATSAPP_STATUS_FILE = path.join(__dirname, 'data', 'whatsapp-status.json');

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
  console.log('  📱 QR CODE - ESCANEIE COM WHATSAPP');
  console.log('='.repeat(70));
  console.log(qr);
  console.log('='.repeat(70));
  console.log('');
});

client.on('ready', () => {
  atualizarStatusWhatsapp('ready', { detail: 'Sessao autenticada e pronta para uso' });
  console.log('\n✅ WhatsApp autenticado com sucesso!\n');
  console.log('📌 Sessão salva em: ' + AUTH_STORE_PATH);
  console.log('🔄 Você pode fechar este script - a sessão será reutilizada.\n');
  console.log('💡 Em caso de erro, execute novamente para reautenticar.\n');
  console.log('⏳ Pressione Ctrl+C para sair...\n');
});

client.on('authenticated', () => {
  atualizarStatusWhatsapp('authenticated', { detail: 'Sessao autenticada' });
});

client.on('auth_failure', (message) => {
  atualizarStatusWhatsapp('auth_failure', { detail: message || 'Falha na autenticacao' });
});

client.on('disconnected', () => {
  atualizarStatusWhatsapp('disconnected', { detail: 'Desconectado do WhatsApp' });
  console.log('\n❌ Desconectado do WhatsApp');
  process.exit(1);
});

atualizarStatusWhatsapp('initializing', { detail: 'Inicializando autenticacao WhatsApp' });
client.initialize();
