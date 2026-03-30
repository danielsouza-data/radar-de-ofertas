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
const { carregarLinksMercadoLivreArquivo, deduplicarLinks, ehLinkMercadoLivreCurto, calcularCiclosPorJanela } = require('../src/utils-link');
const { PATHS, ensureDirectories } = require('../src/config/paths');
const { findTrackedLink } = require('../src/services/tracking-service');
require('dotenv').config();

ensureDirectories();

const app = express();
const server = http.createServer(app);
const PORT = process.env.DASHBOARD_PORT || 3000;

// Diretórios de dados
const DISPAROS_LOG = PATHS.DISPAROS_LOG;
const HISTORICO_OFERTAS = PATHS.HISTORICO_OFERTAS;
const WHATSAPP_STATUS = PATHS.WHATSAPP_STATUS;
const DISPARO_WORKER_HEALTH_FILE = PATHS.DISPARO_WORKER_HEALTH;
const FALHAS_LOG = PATHS.DISPAROS_FALHAS;
const SCHEDULER_STATUS_FILE = PATHS.SCHEDULER_STATUS;
const GLOBAL_LOCK_FILE = PATHS.GLOBAL_LOCK;
const REPROCESS_QUEUE_FILE = PATHS.FILA_REPROCESSAMENTO;
const ML_LINKBUILDER_LINKS_FILE = process.env.MERCADO_LIVRE_LINKBUILDER_LINKS_FILE
  ? path.resolve(process.env.MERCADO_LIVRE_LINKBUILDER_LINKS_FILE)
  : PATHS.ML_POOL_LINKS;
const ML_LINKBUILDER_POOL_WARN_MIN = Math.max(1, Number(process.env.MERCADO_LIVRE_LINKBUILDER_POOL_WARN_MIN || 10));
const ML_LINKBUILDER_REQUIRE_SHORT = String(process.env.MERCADO_LIVRE_LINKBUILDER_REQUIRE_SHORT || 'true').toLowerCase() !== 'false';
const ML_JANELA_INICIO_HORA = Math.max(0, Math.min(23, Number(process.env.ML_JANELA_INICIO_HORA || 8)));
const ML_JANELA_FIM_HORA = Math.max(0, Math.min(23, Number(process.env.ML_JANELA_FIM_HORA || 22)));
const ML_INTERVALO_MINUTOS = Math.max(1, Number(process.env.ML_INTERVALO_MINUTOS || 5));
const WHATSAPP_STALE_THRESHOLD_SECONDS = Math.max(60, Number(process.env.WHATSAPP_STALE_THRESHOLD_SECONDS || 180));
const WHATSAPP_READY_CACHE_THRESHOLD_SECONDS = Math.max(
  WHATSAPP_STALE_THRESHOLD_SECONDS,
  Number(process.env.WHATSAPP_READY_CACHE_THRESHOLD_SECONDS || 21600)
);

console.log('\n' + '='.repeat(70));
console.log('  📊 DASHBOARD - RADAR DE OFERTAS');
console.log(`  🌐 Acesso: http://localhost:${PORT}`);
console.log('='.repeat(70) + '\n');

// Middleware
app.use(express.static(PATHS.PUBLIC));
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

function lerJsonOpcional(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    console.error(`[ERR] Erro ao ler ${path.basename(filePath)}:`, e.message);
  }
  return fallback;
}

function pidEstaAtivo(pid) {
  const pidNum = Number(pid);
  if (!Number.isFinite(pidNum) || pidNum <= 0) return false;
  try {
    process.kill(pidNum, 0);
    return true;
  } catch {
    return false;
  }
}

function avaliarSaudeWhatsapp(statusPayload, workerHealthRaw) {
  const status = String(statusPayload?.status || 'unknown').toLowerCase();
  const ageSeconds = Number(statusPayload?.ageSeconds);
  const readyLike = status === 'ready' || status === 'authenticated';
  const workerPid = Number(workerHealthRaw?.pid || 0) || null;
  const workerPidAtivo = workerPid ? pidEstaAtivo(workerPid) : false;
  const workerUpdatedAt = Number(workerHealthRaw?.updatedAt || 0);
  const workerAgeSeconds = workerUpdatedAt > 0
    ? Math.floor((Date.now() - workerUpdatedAt) / 1000)
    : null;
  const workerRecent = workerAgeSeconds != null && workerAgeSeconds <= 300;
  const cacheReadyIdle = readyLike && !workerPidAtivo && !workerRecent;
  const threshold = cacheReadyIdle
    ? WHATSAPP_READY_CACHE_THRESHOLD_SECONDS
    : WHATSAPP_STALE_THRESHOLD_SECONDS;
  const stale = Number.isFinite(ageSeconds) ? ageSeconds > threshold : true;

  return {
    ...statusPayload,
    stale,
    staleThresholdSeconds: threshold,
    cacheReadyIdle
  };
}

function obterMonitorRuntime() {
  const agora = Date.now();
  const workerHealthRaw = lerJsonOpcional(DISPARO_WORKER_HEALTH_FILE, null);
  const whatsapp = avaliarSaudeWhatsapp(lerWhatsappStatus(), workerHealthRaw);
  const schedulerRaw = lerJsonOpcional(SCHEDULER_STATUS_FILE, null);
  const lockRaw = lerJsonOpcional(GLOBAL_LOCK_FILE, null);
  const fila = lerJsonOpcional(REPROCESS_QUEUE_FILE, []);
  const falhas = lerFalhasLog();
  const disparos = lerDisparosLog();
  const poolML = obterStatusPoolMercadoLivre();

  const schedulerUpdatedAt = Number(schedulerRaw?.updatedAt || 0);
  const schedulerAgeSeconds = schedulerUpdatedAt > 0
    ? Math.floor((agora - schedulerUpdatedAt) / 1000)
    : null;

  const lockCreatedAt = Number(lockRaw?.createdAt || 0);
  const lockAgeSeconds = lockCreatedAt > 0
    ? Math.floor((agora - lockCreatedAt) / 1000)
    : null;
  const lockPid = Number(lockRaw?.pid || 0) || null;
  const lockPidAtivo = lockPid ? pidEstaAtivo(lockPid) : false;
  const workerUpdatedAt = Number(workerHealthRaw?.updatedAt || 0);
  const workerAgeSeconds = workerUpdatedAt > 0
    ? Math.floor((agora - workerUpdatedAt) / 1000)
    : null;

  const falhasUltimaHora = (falhas.falhas || []).filter((f) => {
    const ageMs = agora - Number(f.timestamp || 0);
    return ageMs <= 60 * 60 * 1000;
  });

  return {
    timestamp: agora,
    timestampISO: new Date(agora).toISOString(),
    processos: {
      dashboard: {
        status: 'running',
        pid: process.pid,
        porta: PORT
      },
      scheduler: {
        status: schedulerRaw?.scheduler || 'unknown',
        pid: Number(schedulerRaw?.pid || 0) || null,
        isRunning: Boolean(schedulerRaw?.isRunning),
        dispatchInProgress: Boolean(schedulerRaw?.dispatchInProgress),
        timezone: schedulerRaw?.timezone || 'America/Sao_Paulo',
        cronRegular: schedulerRaw?.cronRegular || null,
        cron2200: schedulerRaw?.cron2200 || null,
        lastTrigger: schedulerRaw?.lastTrigger || null,
        lastSkipReason: schedulerRaw?.lastSkipReason || null,
        updatedAt: schedulerRaw?.updatedAt || null,
        updatedAtISO: schedulerRaw?.updatedAtISO || null,
        ageSeconds: schedulerAgeSeconds,
        stale: schedulerAgeSeconds != null ? schedulerAgeSeconds > 180 : true
      },
      disparoLockGlobal: {
        ativo: Boolean(lockRaw && lockPidAtivo),
        owner: lockRaw?.owner || null,
        pid: lockPid,
        pidAtivo: lockPidAtivo,
        createdAt: lockRaw?.createdAt || null,
        createdAtISO: lockRaw?.createdAtISO || null,
        ageSeconds: lockAgeSeconds
      },
      whatsapp: {
        status: whatsapp.status,
        detail: whatsapp.detail,
        stale: whatsapp.stale,
        ageSeconds: whatsapp.ageSeconds,
        updatedAt: whatsapp.updatedAt,
        updatedAtISO: whatsapp.updatedAtISO
      },
      workerDisparo: {
        status: workerHealthRaw?.status || 'unknown',
        pid: Number(workerHealthRaw?.pid || 0) || null,
        offerIndex: Number(workerHealthRaw?.offerIndex || 0),
        offerTotal: Number(workerHealthRaw?.offerTotal || 0),
        sentCount: Number(workerHealthRaw?.sentCount || 0),
        queueSize: Number(workerHealthRaw?.queueSize || 0),
        updatedAt: workerUpdatedAt || null,
        updatedAtISO: workerHealthRaw?.updatedAtISO || null,
        ageSeconds: workerAgeSeconds,
        stale: workerAgeSeconds != null ? workerAgeSeconds > 300 : true
      }
    },
    fila: {
      reprocessamentoTotal: Array.isArray(fila) ? fila.length : 0,
      itens: Array.isArray(fila)
        ? fila.slice(0, 12).map((item, idx) => ({
            ordem: idx + 1,
            produto: item?.product_name || 'Sem nome',
            marketplace: item?.marketplace || 'N/D',
            preco: Number.isFinite(Number(item?.price)) ? Number(item.price) : null,
            link: item?.link || null
          }))
        : []
    },
    falhas: {
      total: Number(falhas.totalFalhas || 0),
      ultimaHora: falhasUltimaHora.length,
      ultimas: falhasUltimaHora.slice(-8).reverse()
    },
    alertas: {
      criticos: [
        lockRaw && lockPid && !lockPidAtivo
          ? {
              tipo: 'lock_orfao',
              mensagem: `Lock órfão detectado (pid ${lockPid} inativo).`
            }
          : null,
        !poolML.cobreDiaAlternando
          ? {
              tipo: 'pool_critico',
              mensagem: `Pool ML insuficiente para 1 dia (${poolML.totalLinks}/${poolML.linksNecessariosDiaAlternando}).`
            }
          : null
      ].filter(Boolean),
      avisos: [
        schedulerAgeSeconds != null && schedulerAgeSeconds > 180
          ? {
              tipo: 'scheduler_stale',
              mensagem: `Scheduler sem atualização há ${schedulerAgeSeconds}s.`
            }
          : null,
        whatsapp.stale
          ? {
              tipo: 'whatsapp_stale',
              mensagem: `WhatsApp sem atualização há ${whatsapp.ageSeconds ?? 'n/d'}s.`
            }
          : null,
        !poolML.atendeMinimo
          ? {
              tipo: 'pool_baixo',
              mensagem: `Pool ML abaixo do mínimo (${poolML.totalLinks}/${poolML.minRecomendado}).`
            }
          : null
      ].filter(Boolean)
    },
    envios: {
      total: Number(disparos.totalEnviados || 0),
      ultimo: (disparos.disparos || []).slice(-1)[0] || null
    },
    poolMercadoLivre: poolML
  };
}

function obterStatusPoolMercadoLivre() {
  const disparos = lerDisparosLog();
  const envios = Array.isArray(disparos?.disparos) ? disparos.disparos : [];
  const enviosMlTotal = envios.filter((d) => {
    const marketplace = String(d?.marketplace || '').toLowerCase();
    return marketplace.includes('mercado livre') || marketplace === 'ml';
  }).length;

  const linksEnv = String(process.env.MERCADO_LIVRE_LINKBUILDER_LINKS || '')
    .split(/[\n,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const linksArquivo = carregarLinksMercadoLivreArquivo(ML_LINKBUILDER_LINKS_FILE);
  const linksBrutos = deduplicarLinks([...linksEnv, ...linksArquivo]);
  const links = ML_LINKBUILDER_REQUIRE_SHORT ? linksBrutos.filter(ehLinkMercadoLivreCurto) : linksBrutos;
  const totalLinksPool = links.length;
  const consumidosNoCiclo = totalLinksPool > 0 ? (enviosMlTotal % totalLinksPool) : 0;
  const linksDisponiveis = totalLinksPool > 0 ? (totalLinksPool - consumidosNoCiclo) : 0;
  const ciclosDia = calcularCiclosPorJanela(ML_JANELA_INICIO_HORA, ML_JANELA_FIM_HORA, ML_INTERVALO_MINUTOS);
  const linksNecessariosDiaAlternando = Math.ceil(ciclosDia / 2);

  return {
    // Mantido como principal para o card: representa disponibilidade atual no ciclo.
    totalLinks: linksDisponiveis,
    totalLinksPool,
    enviosMlTotal,
    consumidosNoCiclo,
    minRecomendado: ML_LINKBUILDER_POOL_WARN_MIN,
    atendeMinimo: linksDisponiveis >= ML_LINKBUILDER_POOL_WARN_MIN,
    janelaInicioHora: ML_JANELA_INICIO_HORA,
    janelaFimHora: ML_JANELA_FIM_HORA,
    intervaloMinutos: ML_INTERVALO_MINUTOS,
    ciclosDia,
    linksNecessariosDiaAlternando,
    cobreDiaAlternando: linksDisponiveis >= linksNecessariosDiaAlternando,
    fonte: linksEnv.length > 0 ? 'env+arquivo' : 'arquivo',
    modoCurtoObrigatorio: ML_LINKBUILDER_REQUIRE_SHORT,
    linksDescartadosNaoCurtos: Math.max(0, linksBrutos.length - links.length)
  };
}

// APIs
app.get('/api/dashboard', (req, res) => {
  const disparos = lerDisparosLog();
  const historico = lerHistorico();
  const workerHealthRaw = lerJsonOpcional(DISPARO_WORKER_HEALTH_FILE, null);
  const whatsapp = avaliarSaudeWhatsapp(lerWhatsappStatus(), workerHealthRaw);

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
  const workerHealthRaw = lerJsonOpcional(DISPARO_WORKER_HEALTH_FILE, null);
  res.json(avaliarSaudeWhatsapp(lerWhatsappStatus(), workerHealthRaw));
});

app.get('/api/ofertas/enviadas', (req, res) => {
  const disparos = lerDisparosLog();
  const lista = (disparos.disparos || []).map((o, i) => {
    const comissaoRaw = o.comissaoPercentual;

    return {
      id: i,
      numero: o.numero,
      produto: o.produto,
      preco: o.preco,
      desconto: o.desconto,
      marketplace: o.marketplace,
      link: o.link,
      data: o.data,
      timestamp: o.timestamp,
      comissaoPercentual: (comissaoRaw === null || comissaoRaw === undefined || comissaoRaw === '')
        ? null
        : (Number.isFinite(Number(comissaoRaw)) ? Number(comissaoRaw) : null),
      tentativasEnvio: o.tentativasEnvio ?? 1,
      entregaRecuperada: Boolean(o.entregaRecuperada),
      erroRecuperado: o.erroRecuperado ?? null,
      ackEnvio: Number(o.ackEnvio ?? 0),
      messageId: o.messageId ?? null,
      reenvio: Boolean(o.reenvio)
    };
  });

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
  const comissoes = ultimasOfertas
    .map((o) => Number(o.comissaoPercentual))
    .filter((c) => Number.isFinite(c) && c > 0);

  const stats = {
    total_enviado: disparos.totalEnviados || 0,
    preco_medio: precos.length ? (precos.reduce((a, b) => a + b, 0) / precos.length).toFixed(2) : 0,
    desconto_medio: descontos.length ? (descontos.reduce((a, b) => a + b, 0) / descontos.length).toFixed(0) : 0,
    comissao_media: comissoes.length ? (comissoes.reduce((a, b) => a + b, 0) / comissoes.length).toFixed(2) : 0,
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

app.get('/api/monitor', (req, res) => {
  res.json(obterMonitorRuntime());
});

app.get('/r/:token', (req, res) => {
  const tracked = findTrackedLink(String(req.params.token || '').trim());
  if (!tracked || !tracked.targetUrl) {
    return res.status(404).send('Link de rastreamento inválido.');
  }

  res.redirect(tracked.targetUrl);
});

app.get('/api/healthcheck', (req, res) => {
  const STALE_THRESHOLD_SECONDS = 300; // 5 min sem atualizacao = stale
  const FALHAS_ALARME_POR_HORA = 3;
  const UMA_HORA_MS = 60 * 60 * 1000;

  const workerHealthRaw = lerJsonOpcional(DISPARO_WORKER_HEALTH_FILE, null);
  const whatsapp = avaliarSaudeWhatsapp(lerWhatsappStatus(), workerHealthRaw);
  const falhasLog = lerFalhasLog();
  const poolML = obterStatusPoolMercadoLivre();
  const alarmes = [];
  const workerUpdatedAt = Number(workerHealthRaw?.updatedAt || 0);
  const workerAgeSeconds = workerUpdatedAt > 0
    ? Math.floor((Date.now() - workerUpdatedAt) / 1000)
    : null;
  const workerPid = Number(workerHealthRaw?.pid || 0) || null;
  const workerPidAtivo = workerPid ? pidEstaAtivo(workerPid) : false;

  // Sessao WhatsApp desatualizada
  if (whatsapp.stale) {
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

  if (workerAgeSeconds != null && workerAgeSeconds > STALE_THRESHOLD_SECONDS) {
    alarmes.push({
      tipo: 'worker_stale',
      severidade: 'aviso',
      mensagem: `Worker de disparo sem heartbeat ha ${Math.ceil(workerAgeSeconds / 60)} min.`
    });
  }

  if (workerHealthRaw && workerPid && !workerPidAtivo) {
    alarmes.push({
      tipo: 'worker_pid_inativo',
      severidade: 'critico',
      mensagem: `Heartbeat indica PID ${workerPid}, mas processo nao esta ativo.`
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
    workerDisparo: {
      status: workerHealthRaw?.status || 'unknown',
      pid: workerPid,
      pidAtivo: workerPidAtivo,
      ageSeconds: workerAgeSeconds,
      stale: workerAgeSeconds != null ? workerAgeSeconds > STALE_THRESHOLD_SECONDS : true
    },
    falhasUltimaHora: falhasRecentes.length,
    poolMercadoLivre: poolML
  });
});

// Rota principal
app.get('/', (req, res) => {
  res.sendFile(PATHS.DASHBOARD_HTML);
});

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`✅ Dashboard rodando em http://localhost:${PORT}`);
  console.log(`📊 Ofertas enviadas: /api/ofertas/enviadas`);
  console.log(`📈 Estatísticas: /api/stats`);
  console.log(`🔗 Pool ML:      /api/link-pool-status`);
  console.log(`🖥️ Monitor:      /api/monitor`);
  console.log(`📋 Dashboard geral: /api/dashboard\n`);
  console.log(`📱 Status WhatsApp: /api/whatsapp-status\n`);
  console.log(`🩺 Healthcheck:     /api/healthcheck\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n✅ Dashboard encerrado');
  process.exit(0);
});
