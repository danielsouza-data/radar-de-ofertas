const REFRESH_MS = 10000;
const THEME_KEY = 'radar-dashboard-theme';
const CONTROL_PLANE_URL_KEY = 'radar-control-plane-url';
const CONTROL_PLANE_TOKEN_KEY = 'radar-control-plane-token';
let intervalId = null;

function getControlPlaneBaseUrl() {
  const saved = String(localStorage.getItem(CONTROL_PLANE_URL_KEY) || '').trim();
  if (saved) return saved.replace(/\/$/, '');

  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  const host = window.location.hostname || 'localhost';
  const port = '3001';
  return `${protocol}//${host}:${port}`;
}

function getControlPlaneHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = String(localStorage.getItem(CONTROL_PLANE_TOKEN_KEY) || '').trim();
  if (token) {
    headers['x-control-token'] = token;
  }
  return headers;
}

function getConfiguredControlPlaneToken() {
  return String(localStorage.getItem(CONTROL_PLANE_TOKEN_KEY) || '').trim();
}

function setControlPlaneStatus(msg, ok = true) {
  const el = document.getElementById('control-plane-status');
  if (!el) return;
  el.textContent = msg;
  el.className = `monitor-control-plane-status ${ok ? 'ok' : 'erro'}`;
}

function syncControlPlaneFields() {
  const urlInput = document.getElementById('control-plane-url');
  const tokenInput = document.getElementById('control-plane-token');
  if (urlInput) {
    urlInput.value = String(localStorage.getItem(CONTROL_PLANE_URL_KEY) || '').trim();
  }
  if (tokenInput) {
    tokenInput.value = getConfiguredControlPlaneToken();
  }
}

function saveControlPlaneConfig() {
  const urlInput = document.getElementById('control-plane-url');
  const tokenInput = document.getElementById('control-plane-token');
  const rawUrl = String(urlInput?.value || '').trim();
  const rawToken = String(tokenInput?.value || '').trim();

  if (rawUrl) {
    localStorage.setItem(CONTROL_PLANE_URL_KEY, rawUrl.replace(/\/$/, ''));
  } else {
    localStorage.removeItem(CONTROL_PLANE_URL_KEY);
  }

  if (rawToken) {
    localStorage.setItem(CONTROL_PLANE_TOKEN_KEY, rawToken);
  } else {
    localStorage.removeItem(CONTROL_PLANE_TOKEN_KEY);
  }

  syncControlPlaneFields();
  setControlPlaneStatus(`Control plane configurado em ${getControlPlaneBaseUrl()}.`, true);
}

function clearControlPlaneConfig() {
  localStorage.removeItem(CONTROL_PLANE_URL_KEY);
  localStorage.removeItem(CONTROL_PLANE_TOKEN_KEY);
  syncControlPlaneFields();
  setControlPlaneStatus(`Configuração limpa. Usando ${getControlPlaneBaseUrl()}.`, true);
}

async function testControlPlaneConnection() {
  setControlPlaneStatus('Testando conexão com o control plane...', true);

  try {
    const res = await fetch(`${getControlPlaneBaseUrl()}/api/control/health`, {
      method: 'GET',
      headers: getControlPlaneHeaders(),
      cache: 'no-store'
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.ok) {
      throw new Error(payload.message || `HTTP ${res.status}`);
    }

    const tokenInfo = payload.tokenRequired ? 'token exigido' : 'sem token';
    setControlPlaneStatus(`Conexão OK com ${getControlPlaneBaseUrl()} (${tokenInfo}).`, true);
  } catch (err) {
    setControlPlaneStatus(`Falha ao conectar em ${getControlPlaneBaseUrl()}: ${err.message}`, false);
  }
}

function aplicarTema(tema) {
  const isLight = tema === 'light';
  document.body.classList.toggle('light-theme', isLight);

  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.textContent = isLight ? '☀️ Claro' : '🌙 Escuro';
    btn.setAttribute('aria-label', isLight ? 'Tema claro ativo' : 'Tema escuro ativo');
  }
}

function inicializarTema() {
  const temaSalvo = localStorage.getItem(THEME_KEY) || 'dark';
  aplicarTema(temaSalvo);

  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const temaAtual = document.body.classList.contains('light-theme') ? 'light' : 'dark';
    const proximoTema = temaAtual === 'light' ? 'dark' : 'light';
    localStorage.setItem(THEME_KEY, proximoTema);
    aplicarTema(proximoTema);
  });
}

function atualizarHora() {
  const agora = new Date().toLocaleString('pt-BR');
  const el = document.getElementById('hora-sistema');
  if (el) el.textContent = agora;
}

function formatSegundos(valor) {
  if (!Number.isFinite(Number(valor))) return '—';
  const total = Number(valor);
  if (total < 60) return `${total}s`;
  const min = Math.floor(total / 60);
  const seg = total % 60;
  return `${min}m ${seg}s`;
}

function formatPreco(valor) {
  if (!Number.isFinite(Number(valor))) return '—';
  return `R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setMonitorStatus(texto, ok) {
  const dot = document.getElementById('monitor-dot');
  const status = document.getElementById('monitor-status');
  if (!dot || !status) return;

  dot.className = 'status-dot' + (ok ? ' conectado' : '');
  status.textContent = texto;
}

function setAcaoResultado(msg, ok = true) {
  const el = document.getElementById('monitor-action-result');
  if (!el) return;
  el.textContent = msg;
  el.className = `monitor-action-result ${ok ? 'ok' : 'erro'}`;
}

function renderCards(payload) {
  const scheduler = payload?.processos?.scheduler || {};
  const lock = payload?.processos?.disparoLockGlobal || {};

  document.getElementById('mon-scheduler').textContent = scheduler.status || 'unknown';
  document.getElementById('mon-lock').textContent = lock.ativo ? `${lock.owner || 'ativo'} (#${lock.pid || 'n/a'})` : 'Livre';
  document.getElementById('mon-fila').textContent = String(payload?.fila?.reprocessamentoTotal ?? 0);
  document.getElementById('mon-falhas').textContent = String(payload?.falhas?.ultimaHora ?? 0);
  document.getElementById('mon-enviados').textContent = String(payload?.envios?.total ?? 0);
}

function renderProcessos(payload) {
  const processos = payload?.processos || {};
  const lock = processos.disparoLockGlobal || {};
  const scheduler = processos.scheduler || {};
  const whatsapp = processos.whatsapp || {};

  const linhas = [
    {
      nome: 'Dashboard',
      status: 'running',
      detalhe: `PID ${processos?.dashboard?.pid || 'n/a'} | Porta ${processos?.dashboard?.porta || 'n/a'}`
    },
    {
      nome: 'Scheduler',
      status: scheduler.status || 'unknown',
      detalhe: `Atualização: ${formatSegundos(scheduler.ageSeconds)} atrás | Trigger: ${scheduler.lastTrigger || 'n/d'}`
    },
    {
      nome: 'Lock de Disparo',
      status: lock.ativo ? 'ativo' : 'livre',
      detalhe: lock.ativo
        ? `${lock.owner || 'manual'} | PID ${lock.pid || 'n/a'} | idade ${formatSegundos(lock.ageSeconds)}`
        : 'Sem lock ativo'
    },
    {
      nome: 'WhatsApp',
      status: whatsapp.status || 'unknown',
      detalhe: `${whatsapp.detail || 'Sem detalhe'} | atualização ${formatSegundos(whatsapp.ageSeconds)} atrás`
    }
  ];

  const html = linhas.map((p) => {
    const statusClass = (p.status === 'running' || p.status === 'ready' || p.status === 'livre')
      ? 'monitor-state-ok'
      : (p.status === 'ativo' || p.status === 'state_change' || p.status === 'authenticated')
        ? 'monitor-state-warn'
        : 'monitor-state-err';

    return `<article class="monitor-process-item">
      <div class="monitor-process-head">
        <strong>${p.nome}</strong>
        <span class="monitor-state ${statusClass}">${p.status}</span>
      </div>
      <p>${p.detalhe}</p>
    </article>`;
  }).join('');

  document.getElementById('process-list').innerHTML = html;
}

function renderAlertas(payload) {
  const host = document.getElementById('monitor-alerts');
  if (!host) return;

  const criticos = Array.isArray(payload?.alertas?.criticos) ? payload.alertas.criticos : [];
  const avisos = Array.isArray(payload?.alertas?.avisos) ? payload.alertas.avisos : [];
  const itens = [];

  criticos.forEach((a) => {
    itens.push(`<div class="monitor-alert monitor-alert-crit">🚨 ${escapeHtml(a?.mensagem || 'Alerta crítico')}</div>`);
  });

  avisos.forEach((a) => {
    itens.push(`<div class="monitor-alert monitor-alert-warn">⚠️ ${escapeHtml(a?.mensagem || 'Alerta')}</div>`);
  });

  if (itens.length === 0) {
    host.innerHTML = '<div class="monitor-alert monitor-alert-ok">✅ Sem alertas no momento.</div>';
    return;
  }

  host.innerHTML = itens.join('');
}

function renderFila(payload) {
  const fila = payload?.fila?.itens || [];
  const tbody = document.getElementById('fila-body');

  if (!Array.isArray(fila) || fila.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="tabela-vazia">Fila vazia no momento.</td></tr>';
    return;
  }

  tbody.innerHTML = fila.map((item) => {
    const link = item.link
      ? `<a href="${String(item.link).replace(/"/g, '&quot;')}" target="_blank" class="link-btn">🔗</a>`
      : '—';

    return `<tr>
      <td>${item.ordem}</td>
      <td class="col-produto">${escapeHtml(String(item.produto || '—'))}</td>
      <td>${escapeHtml(String(item.marketplace || '—'))}</td>
      <td>${formatPreco(item.preco)}</td>
      <td>${link}</td>
    </tr>`;
  }).join('');
}

function renderResumo(payload) {
  const el = document.getElementById('monitor-json');
  el.textContent = JSON.stringify(payload, null, 2);
}

async function carregarMonitor() {
  const refresh = document.getElementById('refresh-status');
  if (refresh) refresh.textContent = 'Atualizando...';

  try {
    const res = await fetch('/api/monitor', { cache: 'no-store' });
    if (!res.ok) throw new Error(`API monitor retornou ${res.status}`);

    const payload = await res.json();
    renderCards(payload);
    renderAlertas(payload);
    renderProcessos(payload);
    renderFila(payload);
    renderResumo(payload);

    const scheduler = payload?.processos?.scheduler || {};
    const whatsapp = payload?.processos?.whatsapp || {};
    const ok = !scheduler.stale && !whatsapp.stale;
    setMonitorStatus(ok ? 'Monitor saudável' : 'Atenção no monitor', ok);

    if (refresh) {
      refresh.textContent = `Atualizado em ${new Date().toLocaleTimeString('pt-BR')}`;
    }
  } catch (err) {
    setMonitorStatus('Falha ao carregar monitor', false);
    document.getElementById('process-list').innerHTML = `<article class="monitor-process-item"><p>${err.message}</p></article>`;
    if (refresh) refresh.textContent = 'Erro ao atualizar';
  }
}

async function executarAcaoMonitor(action) {
  const actionName = String(action || '').trim();
  if (!actionName) return;

  setAcaoResultado('Executando ação...', true);

  try {
    const controlPlaneUrl = `${getControlPlaneBaseUrl()}/api/control/action`;
    const res = await fetch(controlPlaneUrl, {
      method: 'POST',
      headers: getControlPlaneHeaders(),
      body: JSON.stringify({ action: actionName })
    });

    const payload = await res.json().catch(() => ({}));
    const ok = Boolean(res.ok && payload.ok);
    setAcaoResultado(payload.message || (ok ? 'Ação executada.' : 'Falha ao executar ação.'), ok);
    await carregarMonitor();
  } catch (err) {
    setAcaoResultado(`Falha na ação via control plane (${getControlPlaneBaseUrl()}): ${err.message}`, false);
  }
}

function configurarAcoes() {
  const host = document.getElementById('monitor-actions');
  if (!host) return;

  host.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      executarAcaoMonitor(action);
    });
  });
}

function configurarControlPlane() {
  syncControlPlaneFields();
  setControlPlaneStatus(`Usando ${getControlPlaneBaseUrl()}.`, true);

  const saveBtn = document.getElementById('btn-save-control-plane');
  if (saveBtn) saveBtn.addEventListener('click', saveControlPlaneConfig);

  const testBtn = document.getElementById('btn-test-control-plane');
  if (testBtn) testBtn.addEventListener('click', testControlPlaneConnection);

  const clearBtn = document.getElementById('btn-clear-control-plane');
  if (clearBtn) clearBtn.addEventListener('click', clearControlPlaneConfig);
}

function iniciar() {
  inicializarTema();
  atualizarHora();
  configurarControlPlane();
  carregarMonitor();
  configurarAcoes();

  setInterval(atualizarHora, 1000);
  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(carregarMonitor, REFRESH_MS);

  const btn = document.getElementById('btn-refresh');
  if (btn) btn.addEventListener('click', carregarMonitor);
}

document.addEventListener('DOMContentLoaded', iniciar);
