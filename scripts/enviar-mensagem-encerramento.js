#!/usr/bin/env node
/**
 * ENVIAR MENSAGEM DE ENCERRAMENTO NO GRUPO
 * Conecta ao WhatsApp e envia mensagem personalizada ao grupo antes do shutdown
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');
const { assertSessionDirectoryAccess } = require('../src/security/session-permissions');
require('dotenv').config();

function parseEnvBool(val, defaultVal = false) {
  if (val === undefined || val === null || val === '') return defaultVal;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(val).trim().toLowerCase());
}

const CHANNEL_ID = process.env.WHATSAPP_CHANNEL_ID;
const CHANNEL_NAME = String(process.env.WHATSAPP_CHANNEL_NAME || '').trim();
const PROD_CHANNEL_ID = String(process.env.WHATSAPP_PROD_CHANNEL_ID || '').trim();
const TEST_CHANNEL_ID = String(process.env.WHATSAPP_TEST_CHANNEL_ID || '').trim();
const TEST_CHANNEL_NAME = String(process.env.WHATSAPP_TEST_CHANNEL_NAME || '').trim();
const RADAR_TEST_MODE = parseEnvBool(process.env.RADAR_TEST_MODE, false);
const SESSION_ID = 'producao';
const AUTH_STORE_PATH = path.join(__dirname, '..', '.wwebjs_sessions', SESSION_ID);
const TIMEOUT_MS = 30000; // 30 segundos para conectar e enviar

const isTestContext =
  RADAR_TEST_MODE ||
  (TEST_CHANNEL_ID && CHANNEL_ID === TEST_CHANNEL_ID) ||
  (TEST_CHANNEL_NAME && CHANNEL_NAME && CHANNEL_NAME === TEST_CHANNEL_NAME) ||
  (CHANNEL_NAME && /\bteste\b/i.test(CHANNEL_NAME));

if (RADAR_TEST_MODE && (!TEST_CHANNEL_ID || !PROD_CHANNEL_ID)) {
  console.error('[SAFETY_BLOCK] RADAR_TEST_MODE exige WHATSAPP_TEST_CHANNEL_ID e WHATSAPP_PROD_CHANNEL_ID configurados.');
  process.exit(1);
}

if (!CHANNEL_ID) {
  console.error('[ERR] WHATSAPP_CHANNEL_ID nao configurado no .env');
  process.exit(1);
}

if (isTestContext && PROD_CHANNEL_ID && CHANNEL_ID === PROD_CHANNEL_ID) {
  console.error('[SAFETY_BLOCK] Encerramento bloqueado: contexto de teste/homologacao detectado apontando para grupo de producao.');
  console.error(`[SAFETY_BLOCK] CHANNEL_NAME=${CHANNEL_NAME || 'n/a'} | CHANNEL_ID=${CHANNEL_ID || 'n/a'}`);
  console.error('[SAFETY_BLOCK] Ajuste WHATSAPP_CHANNEL_ID para WHATSAPP_TEST_CHANNEL_ID ou desative RADAR_TEST_MODE conscientemente.');
  process.exit(1);
}

console.log('[ENCERRAMENTO] Conectando ao WhatsApp...\n');
assertSessionDirectoryAccess(AUTH_STORE_PATH, console);

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: AUTH_STORE_PATH
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate'
    ],
    timeout: 30000
  }
});

let timeoutHandle = null;
let enviada = false;

function criarMensagemEncerramento() {
  const agora = new Date();
  const hora = agora.getHours().toString().padStart(2, '0');
  const minuto = agora.getMinutes().toString().padStart(2, '0');

  return `✋ *Por hoje finalizamos as ofertas!* 🌙

Mas relaxa, voltaremos amanhã com mais deals incríveis! 🚀

🛍️ *Compartilhe nosso grupo com seus amigos* e não perca nenhuma oportunidade de economizar! 👥💰

Até amanhã! 👋

_Encerramento automático: ${hora}:${minuto}_`;
}

async function enviarMensagemEncerramento() {
  try {
    const chat = await client.getChatById(CHANNEL_ID);
    if (!chat) {
      console.error('[ERR] Chat nao encontrado');
      return false;
    }

    const mensagem = criarMensagemEncerramento();
    const sent = await chat.sendMessage(mensagem);

    if (sent) {
      console.log('\n✅ Mensagem de encerramento enviada com sucesso!\n');
      console.log('Conteúdo da mensagem:');
      console.log(mensagem);
      console.log('\n');
      enviada = true;
      return true;
    } else {
      console.error('[ERR] Falha ao enviar mensagem (returned null)');
      return false;
    }
  } catch (error) {
    console.error(`[ERR] Erro ao enviar mensagem: ${error.message}`);
    return false;
  }
}

client.on('ready', async () => {
  console.log('[OK] WhatsApp conectado!\n');

  const resultado = await enviarMensagemEncerramento();

  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }

  // Dar um pouco de tempo para sincronizar antes de desligar
  setTimeout(() => {
    client.destroy().catch(() => {});
    process.exit(resultado ? 0 : 1);
  }, 2000);
});

client.on('error', (error) => {
  console.error(`[CLIENT_ERR] ${error.message}`);
  if (timeoutHandle) clearTimeout(timeoutHandle);
  process.exit(1);
});

client.on('disconnected', (reason) => {
  if (!enviada) {
    console.error(`[ERR] Desconectado antes de enviar: ${reason}`);
    if (timeoutHandle) clearTimeout(timeoutHandle);
    process.exit(1);
  }
});

// Timeout de segurança
timeoutHandle = setTimeout(() => {
  console.error('[TIMEOUT] Nao conseguiu conectar dentro de 30s');
  client.destroy().catch(() => {});
  process.exit(1);
}, TIMEOUT_MS);

console.log(`[INIT] Inicializando client WhatsApp (timeout: ${TIMEOUT_MS}ms)...\n`);
client.initialize();
