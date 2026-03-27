const REFRESH_MS = 15000;
let intervalId = null;
const THEME_KEY = 'radar-dashboard-theme';

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
  const agora = new Date();
  const el = document.getElementById('hora-sistema');
  if (el) el.textContent = agora.toLocaleTimeString('pt-BR');
}

function mostrarJson(id, data) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = JSON.stringify(data, null, 2);
}

function mostrarErro(id, error) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = `Erro ao carregar endpoint:\n${error?.message || error}`;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`${url} retornou ${res.status}`);
  }
  return res.json();
}

async function carregarApis() {
  const refresh = document.getElementById('refresh-status');
  if (refresh) refresh.textContent = 'Atualizando...';

  const endpoints = [
    { id: 'api-whatsapp', url: '/api/whatsapp-status' },
    { id: 'api-stats', url: '/api/stats' },
    { id: 'api-ofertas', url: '/api/ofertas/enviadas' },
    { id: 'api-dashboard', url: '/api/dashboard' }
  ];

  const resultados = await Promise.allSettled(
    endpoints.map((endpoint) => fetchJson(endpoint.url))
  );

  resultados.forEach((r, i) => {
    const { id } = endpoints[i];
    if (r.status === 'fulfilled') {
      mostrarJson(id, r.value);
    } else {
      mostrarErro(id, r.reason);
    }
  });

  if (refresh) {
    refresh.textContent = `Atualizado em ${new Date().toLocaleTimeString('pt-BR')}`;
  }
}

function iniciar() {
  inicializarTema();
  atualizarHora();
  carregarApis();
  setInterval(atualizarHora, 1000);

  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(carregarApis, REFRESH_MS);
}

document.addEventListener('DOMContentLoaded', iniciar);
