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
const { spawn } = require('child_process');
const { carregarLinksMercadoLivreArquivo, deduplicarLinks, ehLinkMercadoLivreCurto, calcularCiclosPorJanela } = require('../src/utils-link');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.DASHBOARD_PORT || 3000;

// Diretórios de dados
const DISPAROS_LOG = path.join(__dirname, '..', 'data', 'disparos-log.json');
const HISTORICO_OFERTAS = path.join(__dirname, '..', 'src', 'historico-ofertas.json');
const WHATSAPP_STATUS = path.join(__dirname, '..', 'data', 'whatsapp-status.json');
const FALHAS_LOG = path.join(__dirname, '..', 'data', 'disparos-falhas.json');
const SCHEDULER_STATUS_FILE = path.join(__dirname, '..', 'data', 'scheduler-status.json');
const GLOBAL_LOCK_FILE = path.join(__dirname, '..', 'data', 'disparo-global.lock');
const REPROCESS_QUEUE_FILE = path.join(__dirname, '..', 'data', 'fila-reprocessamento.json');
const SCHEDULER_SCRIPT = path.join(__dirname, '..', 'agendador-envios.js');
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

function salvarJson(filePath, payload) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    return true;
  } catch (e) {
    console.error(`[ERR] Erro ao salvar ${path.basename(filePath)}:`, e.message);
    return false;
  }
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

function encerrarPid(pid) {
  const pidNum = Number(pid);
  if (!Number.isFinite(pidNum) || pidNum <= 0) return false;
  if (!pidEstaAtivo(pidNum)) return false;

  try {
    process.kill(pidNum, 'SIGTERM');
    return true;
  } catch {
    try {
      process.kill(pidNum);
      return true;
    } catch {
      return false;
    }
  }
}

function iniciarProcessoDetached(scriptPath, extraEnv = {}) {
  try {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: PATHS.ROOT,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        ...extraEnv
      }
    });

    child.unref();

    return {
      ok: true,
      pid: child.pid
    };
  } catch (e) {
    return {
      ok: false,
      error: e.message
    };
  }
}

function acaoLiberarLock() {
  const lockRaw = lerJsonOpcional(GLOBAL_LOCK_FILE, null);
  if (!lockRaw) {
    return { ok: true, action: 'release-lock', message: 'Lock já estava livre.' };
  }

  const lockPid = Number(lockRaw?.pid || 0) || null;
  const ativo = lockPid ? pidEstaAtivo(lockPid) : false;
  if (ativo) {
    return {
      ok: false,
      action: 'release-lock',
      message: `Lock ativo por PID ${lockPid}. Use "encerrar-disparo" antes de liberar.`
    };
  }

  try {
    fs.unlinkSync(GLOBAL_LOCK_FILE);
  } catch (e) {
    return { ok: false, action: 'release-lock', message: `Falha ao remover lock: ${e.message}` };
  }

  return { ok: true, action: 'release-lock', message: 'Lock liberado com sucesso.' };
}

function acaoLimparFila() {
  const ok = salvarJson(REPROCESS_QUEUE_FILE, []);
  if (!ok) {
    return { ok: false, action: 'clear-queue', message: 'Falha ao limpar fila de reprocessamento.' };
  }

  return { ok: true, action: 'clear-queue', message: 'Fila de reprocessamento limpa.' };
}

function acaoEncerrarDisparo() {
  const lockRaw = lerJsonOpcional(GLOBAL_LOCK_FILE, null);
  const lockPid = Number(lockRaw?.pid || 0) || null;

  if (!lockRaw || !lockPid) {
    return { ok: true, action: 'stop-disparo', message: 'Nenhum disparo ativo identificado.' };
  }

  const encerrou = encerrarPid(lockPid);
  const lockRelease = acaoLiberarLock();

  return {
    ok: encerrou || lockRelease.ok,
    action: 'stop-disparo',
    message: encerrou
      ? `Sinal de encerramento enviado para PID ${lockPid}.`
      : `PID ${lockPid} não estava ativo. ${lockRelease.message}`
  };
}

function acaoRestartScheduler() {
  const schedulerRaw = lerJsonOpcional(SCHEDULER_STATUS_FILE, null);
  const schedulerPid = Number(schedulerRaw?.pid || 0) || null;

  if (schedulerPid && pidEstaAtivo(schedulerPid)) {
    encerrarPid(schedulerPid);
  }

  const start = iniciarProcessoDetached(SCHEDULER_SCRIPT);
  if (!start.ok) {
    return {
      ok: false,
      action: 'restart-scheduler',
      message: `Falha ao reiniciar scheduler: ${start.error}`
    };
  }

  return {
    ok: true,
    action: 'restart-scheduler',
    message: `Scheduler reiniciado (PID ${start.pid}).`,
    pid: start.pid
  };
}

function acaoRestartStack() {
  const stopDisparo = acaoEncerrarDisparo();
  const clearQueue = acaoLimparFila();
  const restartScheduler = acaoRestartScheduler();

  return {
    ok: stopDisparo.ok && clearQueue.ok && restartScheduler.ok,
    action: 'restart-stack',
    message: restartScheduler.ok
      ? 'Stack operacional reiniciada (disparo encerrado, fila limpa, scheduler reiniciado).'
      : 'Stack parcialmente reiniciada; verifique detalhes.',
    details: {
      stopDisparo,
      clearQueue,
      restartScheduler
    }
  };
}

function obterMonitorRuntime() {
  const agora = Date.now();
  const whatsapp = lerWhatsappStatus();
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
  const linksEnv = String(process.env.MERCADO_LIVRE_LINKBUILDER_LINKS || '')
    .split(/[\n,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const linksArquivo = carregarLinksMercadoLivreArquivo(ML_LINKBUILDER_LINKS_FILE);
  const linksBrutos = deduplicarLinks([...linksEnv, ...linksArquivo]);
  const links = ML_LINKBUILDER_REQUIRE_SHORT ? linksBrutos.filter(ehLinkMercadoLivreCurto) : linksBrutos;
  const ciclosDia = calcularCiclosPorJanela(ML_JANELA_INICIO_HORA, ML_JANELA_FIM_HORA, ML_INTERVALO_MINUTOS);
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

app.post('/api/monitor/action', (req, res) => {
  const action = String(req.body?.action || '').trim().toLowerCase();

  let result;
  switch (action) {
    case 'release-lock':
      result = acaoLiberarLock();
      break;
    case 'clear-queue':
      result = acaoLimparFila();
      break;
    case 'stop-disparo':
      result = acaoEncerrarDisparo();
      break;
    case 'restart-scheduler':
      result = acaoRestartScheduler();
      break;
    case 'restart-stack':
      result = acaoRestartStack();
      break;
    default:
      result = {
        ok: false,
        action,
        message: 'Ação inválida. Use: release-lock, clear-queue, stop-disparo, restart-scheduler, restart-stack.'
      };
  }

  res.status(result.ok ? 200 : 400).json(result);
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
