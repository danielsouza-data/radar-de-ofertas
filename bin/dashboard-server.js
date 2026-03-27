#!/usr/bin/env node
/**
 * DASHBOARD OTIMIZADO - RADAR DE OFERTAS
 * Mostra ofertas já enviadas em tempo real
 * Acesso: http://localhost:3000
 */

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.DASHBOARD_PORT || 3000;

// Diretórios de dados
const DISPAROS_LOG = path.join(__dirname, '..', 'data', 'disparos-log.json');
const HISTORICO_OFERTAS = path.join(__dirname, '..', 'data', 'historico-ofertas.json');
const WHATSAPP_STATUS = path.join(__dirname, '..', 'data', 'whatsapp-status.json');
const FALHAS_LOG = path.join(__dirname, '..', 'data', 'disparos-falhas.json');
const ML_LINKBUILDER_LINKS_FILE = process.env.MERCADO_LIVRE_LINKBUILDER_LINKS_FILE
  ? path.resolve(process.env.MERCADO_LIVRE_LINKBUILDER_LINKS_FILE)
  : path.resolve(__dirname, '..', 'mercadolivre-linkbuilder-links.txt');
const ML_LINKBUILDER_POOL_WARN_MIN = Math.max(1, Number(process.env.MERCADO_LIVRE_LINKBUILDER_POOL_WARN_MIN || 10));
const ML_LINKBUILDER_REQUIRE_SHORT = String(process.env.MERCADO_LIVRE_LINKBUILDER_REQUIRE_SHORT || 'true').toLowerCase() !== 'false';
const ML_JANELA_INICIO_HORA = Math.max(0, Math.min(23, Number(process.env.ML_JANELA_INICIO_HORA || 8)));
const ML_JANELA_FIM_HORA = Math.max(0, Math.min(23, Number(process.env.ML_JANELA_FIM_HORA || 22)));
const ML_INTERVALO_MINUTOS = Math.max(1, Number(process.env.ML_INTERVALO_MINUTOS || 5));

console.log('\n' + '='.repeat(70));
console.log('  📊 DASHBOARD - RADAR DE OFERTAS');
console.log(`  🌐 Acesso: http://localhost:${PORT}`);
console.log('='.repeat(70) + '\n');

// Middleware
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

// Função auxiliar para ler dados
function lerDisparosLog() {
  try {
    if (fs.existsSync(DISPAROS_LOG)) {
      return JSON.parse(fs.readFileSync(DISPAROS_LOG, 'utf8'));
    }
  } catch (e) {
    console.error('[ERR] Erro ao ler disparos-log.json:', e.message);
  }
  return { disparos: [], totalEnviados: 0, ultimoEnvio: null };
}

function lerHistorico() {
  try {
    if (fs.existsSync(HISTORICO_OFERTAS)) {
      return JSON.parse(fs.readFileSync(HISTORICO_OFERTAS, 'utf8'));
    }
  } catch (e) {
    console.error('[ERR] Erro ao ler historico-ofertas.json:', e.message);
  }
  return { ofertas: [] };
}

function lerFalhasLog() {
  try {
    if (fs.existsSync(FALHAS_LOG)) {
      return JSON.parse(fs.readFileSync(FALHAS_LOG, 'utf8'));
    }
  } catch (e) {
    console.error('[ERR] Erro ao ler disparos-falhas.json:', e.message);
  }
  return { falhas: [], totalFalhas: 0 };
}

function lerWhatsappStatus() {
  try {
    if (fs.existsSync(WHATSAPP_STATUS)) {
      const status = JSON.parse(fs.readFileSync(WHATSAPP_STATUS, 'utf8'));
      const updatedAt = Number(status.updatedAt || 0);
      const ageSeconds = updatedAt > 0 ? Math.floor((Date.now() - updatedAt) / 1000) : null;

      return {
        status: status.status || 'unknown',
        detail: status.detail || 'Sem detalhes',
        updatedAt,
        updatedAtISO: status.updatedAtISO || null,
        sessionId: status.sessionId || null,
        ageSeconds,
        stale: ageSeconds != null ? ageSeconds > 180 : true
      };
    }
  } catch (e) {
    console.error('[ERR] Erro ao ler whatsapp-status.json:', e.message);
  }

  return {
    status: 'unknown',
    detail: 'Status do WhatsApp ainda nao registrado',
    updatedAt: null,
    updatedAtISO: null,
    sessionId: null,
    ageSeconds: null,
    stale: true
  };
}

function carregarLinksMercadoLivreArquivo(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];

  try {
    return fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch (e) {
    console.error('[ERR] Erro ao ler pool de links do Mercado Livre:', e.message);
    return [];
  }
}

function deduplicarLinks(links = []) {
  return [...new Set(links.map((l) => String(l || '').trim()).filter(Boolean))];
}

function ehLinkMercadoLivreCurto(raw = '') {
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    return host === 'meli.la' || host.endsWith('.meli.la');
  } catch {
    return false;
  }
}

function calcularCiclosPorJanela(inicioHora = ML_JANELA_INICIO_HORA, fimHora = ML_JANELA_FIM_HORA, intervaloMin = ML_INTERVALO_MINUTOS) {
  const inicio = Math.max(0, Math.min(23, Number(inicioHora)));
  const fim = Math.max(0, Math.min(23, Number(fimHora)));
  const intervalo = Math.max(1, Number(intervaloMin));

  const janelaHoras = fim > inicio ? (fim - inicio) : ((24 - inicio) + fim);
  const janelaMinutos = janelaHoras * 60;
  if (janelaMinutos <= 0) return 0;

  return Math.ceil(janelaMinutos / intervalo);
}

function obterStatusPoolMercadoLivre() {
  const linksEnv = String(process.env.MERCADO_LIVRE_LINKBUILDER_LINKS || '')
    .split(/[\n,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const linksArquivo = carregarLinksMercadoLivreArquivo(ML_LINKBUILDER_LINKS_FILE);
  const linksBrutos = deduplicarLinks([...linksEnv, ...linksArquivo]);
  const links = ML_LINKBUILDER_REQUIRE_SHORT ? linksBrutos.filter(ehLinkMercadoLivreCurto) : linksBrutos;
  const ciclosDia = calcularCiclosPorJanela();
  const linksNecessariosDiaAlternando = Math.ceil(ciclosDia / 2);

  return {
    totalLinks: links.length,
    minRecomendado: ML_LINKBUILDER_POOL_WARN_MIN,
    atendeMinimo: links.length >= ML_LINKBUILDER_POOL_WARN_MIN,
    janelaInicioHora: ML_JANELA_INICIO_HORA,
    janelaFimHora: ML_JANELA_FIM_HORA,
    intervaloMinutos: ML_INTERVALO_MINUTOS,
    ciclosDia,
    linksNecessariosDiaAlternando,
    cobreDiaAlternando: links.length >= linksNecessariosDiaAlternando,
    fonte: linksEnv.length > 0 ? 'env+arquivo' : 'arquivo',
    modoCurtoObrigatorio: ML_LINKBUILDER_REQUIRE_SHORT,
    linksDescartadosNaoCurtos: Math.max(0, linksBrutos.length - links.length)
  };
}

// APIs
app.get('/api/dashboard', (req, res) => {
  const disparos = lerDisparosLog();
  const historico = lerHistorico();
  const whatsapp = lerWhatsappStatus();

  res.json({
    sistema: {
      horario: new Date().toLocaleString('pt-BR'),
      status: 'ativo',
      porta: PORT,
      whatsapp
    },
    ofertas_enviadas: {
      total: disparos.totalEnviados || 0,
      ultimos: (disparos.disparos || []).slice(-20).reverse(),
      ultimo_envio: disparos.ultimoEnvio ? new Date(disparos.ultimoEnvio).toLocaleString('pt-BR') : 'Nenhum'
    },
    historico_geral: {
      total_registrado: (historico.ofertas || []).length,
      dias_rastreamento: 7
    }
  });
});

app.get('/api/whatsapp-status', (req, res) => {
  res.json(lerWhatsappStatus());
});

app.get('/api/ofertas/enviadas', (req, res) => {
  const disparos = lerDisparosLog();
  const lista = (disparos.disparos || []).map((o, i) => ({
    id: i,
    numero: o.numero,
    produto: o.produto,
    preco: o.preco,
    desconto: o.desconto,
    marketplace: o.marketplace,
    link: o.link,
    data: o.data,
    timestamp: o.timestamp,
    tentativasEnvio: o.tentativasEnvio ?? 1,
    entregaRecuperada: Boolean(o.entregaRecuperada),
    erroRecuperado: o.erroRecuperado ?? null,
    ackEnvio: Number(o.ackEnvio ?? 0),
    messageId: o.messageId ?? null,
    reenvio: Boolean(o.reenvio)
  }));

  res.json({
    total: lista.length,
    ofertas: lista.sort((a, b) => b.timestamp - a.timestamp)
  });
});

app.get('/api/stats', (req, res) => {
  const disparos = lerDisparosLog();
  const ultimasOfertas = disparos.disparos || [];

  // Calcular estatísticas
  const precos = ultimasOfertas.map(o => o.preco).filter(p => p);
  const descontos = ultimasOfertas.map(o => o.desconto).filter(d => d);

  const stats = {
    total_enviado: disparos.totalEnviados || 0,
    preco_medio: precos.length ? (precos.reduce((a, b) => a + b, 0) / precos.length).toFixed(2) : 0,
    desconto_medio: descontos.length ? (descontos.reduce((a, b) => a + b, 0) / descontos.length).toFixed(0) : 0,
    preco_minimo: precos.length ? Math.min(...precos).toFixed(2) : 0,
    preco_maximo: precos.length ? Math.max(...precos).toFixed(2) : 0,
    ultimas_24h: ultimasOfertas.filter(o => {
      const idade = (Date.now() - o.timestamp) / (1000 * 60 * 60);
      return idade <= 24;
    }).length
  };

  res.json(stats);
});

app.get('/api/link-pool-status', (req, res) => {
  res.json(obterStatusPoolMercadoLivre());
});

app.get('/api/healthcheck', (req, res) => {
  const STALE_THRESHOLD_SECONDS = 300; // 5 min sem atualizacao = stale
  const FALHAS_ALARME_POR_HORA = 3;
  const UMA_HORA_MS = 60 * 60 * 1000;

  const whatsapp = lerWhatsappStatus();
  const falhasLog = lerFalhasLog();
  const poolML = obterStatusPoolMercadoLivre();
  const alarmes = [];

  // Sessao WhatsApp desatualizada
  if (whatsapp.stale || (whatsapp.ageSeconds != null && whatsapp.ageSeconds > STALE_THRESHOLD_SECONDS)) {
    const minutos = whatsapp.ageSeconds ? Math.ceil(whatsapp.ageSeconds / 60) : null;
    alarmes.push({
      tipo: 'stale_session',
      severidade: 'aviso',
      mensagem: minutos
        ? `Status do WhatsApp sem atualização há ${minutos} min. Disparo pode estar parado.`
        : 'Status do WhatsApp sem atualização recente.'
    });
  }

  // Sessao em estado critico
  if (['disconnected', 'error', 'auth_failure'].includes(whatsapp.status)) {
    alarmes.push({
      tipo: 'session_down',
      severidade: 'critico',
      mensagem: `Sessão WhatsApp em estado crítico: "${whatsapp.status}". Execute autenticar-sessao.js.`
    });
  }

  // Falhas recentes de envio
  const falhasRecentes = (falhasLog.falhas || []).filter((f) => {
    const ageMs = Date.now() - Number(f.timestamp || 0);
    return ageMs < UMA_HORA_MS;
  });

  if (falhasRecentes.length >= FALHAS_ALARME_POR_HORA) {
    alarmes.push({
      tipo: 'falhas_recentes',
      severidade: 'aviso',
      mensagem: `${falhasRecentes.length} falha(s) de envio na última hora.`
    });
  }

  if (!poolML.atendeMinimo) {
    alarmes.push({
      tipo: 'ml_pool_baixo',
      severidade: 'aviso',
      mensagem: `Pool Mercado Livre abaixo do minimo (${poolML.totalLinks}/${poolML.minRecomendado}).`
    });
  }

  if (!poolML.cobreDiaAlternando) {
    alarmes.push({
      tipo: 'ml_pool_cobertura_dia',
      severidade: 'critico',
      mensagem: `Pool Mercado Livre insuficiente para 1 dia (precisa ${poolML.linksNecessariosDiaAlternando}, atual ${poolML.totalLinks}).`
    });
  }

  res.json({
    timestamp: Date.now(),
    timestampISO: new Date().toISOString(),
    saudavel: alarmes.length === 0,
    alarmes,
    whatsapp: {
      status: whatsapp.status,
      stale: whatsapp.stale,
      ageSeconds: whatsapp.ageSeconds
    },
    falhasUltimaHora: falhasRecentes.length,
    poolMercadoLivre: poolML
  });
});

// Rota principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`✅ Dashboard rodando em http://localhost:${PORT}`);
  console.log(`📊 Ofertas enviadas: /api/ofertas/enviadas`);
  console.log(`📈 Estatísticas: /api/stats`);
  console.log(`🔗 Pool ML:      /api/link-pool-status`);
  console.log(`📋 Dashboard geral: /api/dashboard\n`);
  console.log(`📱 Status WhatsApp: /api/whatsapp-status\n`);
  console.log(`🩺 Healthcheck:     /api/healthcheck\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n✅ Dashboard encerrado');
  process.exit(0);
});
