let contadorProxima = 15;
let intervalRefresh = null;
let intervalRelogio = null;
const THEME_KEY = 'radar-dashboard-theme';
const DISPAROS_PAGE_SIZE_KEY = 'radar-dashboard-disparos-page-size';
const DISPAROS_PAGE_SIZE_OPTIONS = [10, 20, 50];
const DEFAULT_DISPAROS_PAGE_SIZE = 20;
let paginaDisparosAtual = 1;
let disparosCache = [];
let disparosPorPagina = DEFAULT_DISPAROS_PAGE_SIZE;

function obterDisparosPorPaginaSalvo() {
  const valor = Number(localStorage.getItem(DISPAROS_PAGE_SIZE_KEY));
  return DISPAROS_PAGE_SIZE_OPTIONS.includes(valor) ? valor : DEFAULT_DISPAROS_PAGE_SIZE;
}

function configurarSeletorDisparosPorPagina() {
  const selectEl = document.getElementById('disparos-por-pagina');
  if (!selectEl) return;

  disparosPorPagina = obterDisparosPorPaginaSalvo();
  selectEl.value = String(disparosPorPagina);

  selectEl.addEventListener('change', (event) => {
    const novoValor = Number(event.target.value);
    if (!DISPAROS_PAGE_SIZE_OPTIONS.includes(novoValor)) return;
    disparosPorPagina = novoValor;
    localStorage.setItem(DISPAROS_PAGE_SIZE_KEY, String(novoValor));
    paginaDisparosAtual = 1;
    renderTabela(disparosCache);
  });
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

// ─── Relógio ────────────────────────────────────────────────────────────────
function atualizarRelogio() {
  const agora = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  document.getElementById('hora-sistema').textContent = agora;
}

// ─── Contador de próxima atualização ────────────────────────────────────────
function tickContador() {
  contadorProxima--;
  if (contadorProxima <= 0) {
    contadorProxima = 15;
    carregarDados();
  }
  const el = document.getElementById('proxima-atualizacao');
  if (el) el.textContent = `Próxima atualização em ${contadorProxima}s`;
}

// ─── Carregar dados da API ───────────────────────────────────────────────────
async function carregarDados() {
  setStatus('Atualizando...', false);
  contadorProxima = 15;

  try {
    const [resOfertas, resStats, resWhatsapp, resHealth, resPool] = await Promise.all([
      fetch('/api/ofertas/enviadas'),
      fetch('/api/stats'),
      fetch('/api/whatsapp-status'),
      fetch('/api/healthcheck'),
      fetch('/api/link-pool-status')
    ]);

    if (!resOfertas.ok || !resStats.ok || !resWhatsapp.ok) throw new Error('Falha na API');

    const dadosOfertas = await resOfertas.json();
    const dadosStats  = await resStats.json();
    const dadosWhatsapp = await resWhatsapp.json();
    const dadosHealth = resHealth.ok ? await resHealth.json() : null;
    const poolPayload = resPool.ok ? await resPool.json() : null;

    renderStats(dadosStats, dadosOfertas);
    renderTabela(dadosOfertas.ofertas || []);
    renderWhatsappStatus(dadosWhatsapp);
    renderAlertas(dadosHealth);
    renderPoolStatus(poolPayload || dadosHealth?.poolMercadoLivre || null);

    const el = document.getElementById('refresh-status');
    if (el) el.textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR')}`;

  } catch (err) {
    setStatus('Erro ao consultar status WhatsApp', false);
    console.error('[ERR]', err);
  }
}

function renderPoolStatus(pool) {
  const totalEl = document.getElementById('pool-total-links');
  const minimoEl = document.getElementById('pool-minimo');
  const diaEl = document.getElementById('pool-necessario-dia');
  const janelaEl = document.getElementById('pool-janela');
  const badgeEl = document.getElementById('pool-status-badge');
  const msgEl = document.getElementById('pool-status-msg');
  const cardEl = document.getElementById('pool-status-card');

  if (!totalEl || !minimoEl || !diaEl || !janelaEl || !badgeEl || !msgEl || !cardEl) return;

  if (!pool) {
    totalEl.textContent = '—';
    minimoEl.textContent = '—';
    diaEl.textContent = '—';
    janelaEl.textContent = '—';
    badgeEl.textContent = 'SEM DADOS';
    badgeEl.className = 'pool-badge pool-warn';
    msgEl.textContent = 'Não foi possível carregar o status do pool do Mercado Livre.';
    cardEl.className = 'pool-status pool-warn';
    return;
  }

  totalEl.textContent = Number(pool.totalLinks || 0);
  minimoEl.textContent = Number(pool.minRecomendado || 0);
  diaEl.textContent = Number(pool.linksNecessariosDiaAlternando || 0);
  janelaEl.textContent = `${pool.janelaInicioHora ?? 8}h-${pool.janelaFimHora ?? 22}h / ${pool.intervaloMinutos ?? 5} min`;

  if (!pool.cobreDiaAlternando) {
    badgeEl.textContent = 'CRÍTICO';
    badgeEl.className = 'pool-badge pool-critical';
    cardEl.className = 'pool-status pool-critical';
    msgEl.textContent = `Capacidade insuficiente para o dia: precisa ${pool.linksNecessariosDiaAlternando} links e possui ${pool.totalLinks}.`;
    return;
  }

  if (!pool.atendeMinimo) {
    badgeEl.textContent = 'ATENÇÃO';
    badgeEl.className = 'pool-badge pool-warn';
    cardEl.className = 'pool-status pool-warn';
    msgEl.textContent = `Pool abaixo do mínimo: ${pool.totalLinks}/${pool.minRecomendado}.`;
    return;
  }

  badgeEl.textContent = 'OK';
  badgeEl.className = 'pool-badge pool-ok';
  cardEl.className = 'pool-status pool-ok';
  const totalPool = Number(pool.totalLinksPool || pool.totalLinks || 0);
  const disponiveis = Number(pool.totalLinks || 0);
  msgEl.textContent = `Cobertura adequada para o dia. Disponiveis agora: ${disponiveis}/${totalPool}. Fonte: ${pool.fonte || 'arquivo'}.`;
}

function renderWhatsappStatus(wa) {
  const status = String(wa?.status || 'unknown');
  const detail = String(wa?.detail || 'Sem detalhe');
  const stale = Boolean(wa?.stale);

  const statusMap = {
    ready: { text: 'WhatsApp conectado', ok: true },
    authenticated: { text: 'Sessão autenticada', ok: true },
    initializing: { text: 'Inicializando sessão', ok: false },
    qr_required: { text: 'Aguardando leitura do QR', ok: false },
    auth_failure: { text: 'Falha de autenticação', ok: false },
    disconnected: { text: 'WhatsApp desconectado', ok: false },
    error: { text: 'Erro no cliente WhatsApp', ok: false },
    stopped: { text: 'Processo de disparo parado', ok: false },
    state_change: { text: `Estado: ${detail}`, ok: !stale },
    unknown: { text: 'Status ainda indisponível', ok: false }
  };

  const conf = statusMap[status] || { text: `Status: ${status}`, ok: !stale };
  const sufixoStale = stale ? ' (sem atualização recente)' : '';
  setStatus(conf.text + sufixoStale, conf.ok && !stale);
}

// ─── Alertas de saúde ────────────────────────────────────────────────────────
function renderAlertas(health) {
  const painel = document.getElementById('alertas-saude');
  if (!painel) return;

  if (!health || health.saudavel) {
    painel.style.display = 'none';
    painel.innerHTML = '';
    return;
  }

  const alarmes = health.alarmes || [];
  const itens = alarmes.map((a) => {
    const cls = a.severidade === 'critico' ? 'alerta-critico' : 'alerta-aviso';
    const icone = a.severidade === 'critico' ? '🚨' : '⚠️';
    return `<div class="alerta-item ${cls}">${icone} ${escapeHtml(a.mensagem)}</div>`;
  }).join('');

  painel.innerHTML = itens;
  painel.style.display = 'flex';
}

// ─── Status badge ────────────────────────────────────────────────────────────
function setStatus(texto, ok) {
  const dot  = document.getElementById('status-dot');
  const span = document.getElementById('status-texto');
  dot.className  = 'status-dot' + (ok ? ' conectado' : '');
  span.textContent = texto;
}

// ─── Renderizar stats cards ──────────────────────────────────────────────────
function renderStats(stats, dadosOfertas) {
  document.getElementById('stat-total').textContent    = stats.total_enviado ?? '—';
  document.getElementById('stat-desconto').textContent = stats.desconto_medio ? stats.desconto_medio + '%' : '—';
  document.getElementById('stat-comissao').textContent = stats.comissao_media ? stats.comissao_media + '%' : '—';
  document.getElementById('stat-preco').textContent    = stats.preco_medio ? 'R$ ' + Number(stats.preco_medio).toLocaleString('pt-BR', {minimumFractionDigits:2}) : '—';
  document.getElementById('stat-24h').textContent      = stats.ultimas_24h ?? '—';

  // Último envio vem do dashboard endpoint
  const ofertas = dadosOfertas.ofertas || [];
  if (ofertas.length > 0) {
    const ultimo = ofertas[0]; // já ordenado desc
    document.getElementById('stat-ultimo').textContent = ultimo.data || '—';
  } else {
    document.getElementById('stat-ultimo').textContent = 'Nenhum';
  }
}

// ─── Renderizar tabela ───────────────────────────────────────────────────────
function renderTabela(ofertas) {
  const tbody = document.getElementById('disparos-body');
  const totalEl = document.getElementById('disparos-total');
  const paginaEl = document.getElementById('disparos-pagina');
  const btnPrev = document.getElementById('disparos-prev');
  const btnNext = document.getElementById('disparos-next');

  disparosCache = Array.isArray(ofertas) ? ofertas : [];
  const totalItens = disparosCache.length;
  const totalPaginas = Math.max(1, Math.ceil(totalItens / disparosPorPagina));

  if (paginaDisparosAtual > totalPaginas) {
    paginaDisparosAtual = totalPaginas;
  }
  if (paginaDisparosAtual < 1) {
    paginaDisparosAtual = 1;
  }

  if (totalEl) {
    totalEl.textContent = `${totalItens} disparo(s)`;
  }

  if (paginaEl) {
    paginaEl.textContent = `Página ${paginaDisparosAtual} de ${totalPaginas}`;
  }

  if (btnPrev) {
    btnPrev.disabled = paginaDisparosAtual <= 1;
  }

  if (btnNext) {
    btnNext.disabled = paginaDisparosAtual >= totalPaginas;
  }

  if (totalItens === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="tabela-vazia">Nenhum disparo registrado ainda.</td></tr>';
    return;
  }

  const inicio = (paginaDisparosAtual - 1) * disparosPorPagina;
  const fim = inicio + disparosPorPagina;
  const ofertasPagina = disparosCache.slice(inicio, fim);

  tbody.innerHTML = ofertasPagina.map((o, idx) => {
    const preco    = o.preco != null ? 'R$ ' + Number(o.preco).toLocaleString('pt-BR', {minimumFractionDigits:2}) : '—';
    const desconto = o.desconto != null ? o.desconto + '%' : '—';
    const badgeClass = o.desconto >= 50 ? 'badge-best' : o.desconto >= 30 ? 'badge-good' : 'badge-low';
    const comissaoRaw = o.comissaoPercentual;
    const comissao = (comissaoRaw === null || comissaoRaw === undefined || comissaoRaw === '')
      ? '—'
      : (Number.isFinite(Number(comissaoRaw)) ? `${Number(comissaoRaw).toFixed(2)}%` : '—');
    const reenvio  = o.reenvio ? ' <span class="tag-reenvio">↺</span>' : '';
    const produto  = escapeHtml(o.produto || '—');
    const marketplace = escapeHtml(o.marketplace || '—');
    const data     = o.data || '—';
    const link     = o.link ? `<a href="${escapeHtml(o.link)}" target="_blank" class="link-btn">🔗</a>` : '—';
    const numPadrao = totalItens - (inicio + idx);
    const num      = typeof o.numero === 'number' ? o.numero : o.numero ?? numPadrao;
    const ack      = Number(o.ackEnvio ?? 0);
    const tentativas = Number(o.tentativasEnvio ?? 1);
    const recuperada = Boolean(o.entregaRecuperada);
    const ackBadgeClass = ack >= 1 ? 'ack-ok' : 'ack-pendente';
    const ackLabel = ack >= 1 ? `Confirmado (ack ${ack})` : `Pendente (ack ${ack})`;
    const tentativasLabel = `${tentativas}${recuperada ? ' (rec)' : ''}`;
    const tentativasTitle = recuperada
      ? `Recuperado automaticamente. Erro: ${escapeHtml(o.erroRecuperado || 'n/d')}`
      : 'Sem recuperação';

    return `<tr>
      <td class="col-num">${num}${reenvio}</td>
      <td class="col-produto" title="${produto}">${produto}</td>
      <td class="col-marketplace"><span class="marketplace-badge">${marketplace}</span></td>
      <td class="col-preco">${preco}</td>
      <td class="col-desconto"><span class="desconto-badge ${badgeClass}">${desconto}</span></td>
      <td class="col-comissao">${comissao}</td>
      <td class="col-entrega"><span class="ack-badge ${ackBadgeClass}" title="${escapeHtml(o.messageId || 'sem messageId')}">${ackLabel}</span></td>
      <td class="col-tentativas" title="${tentativasTitle}">${tentativasLabel}</td>
      <td class="col-data">${data}</td>
      <td class="col-link">${link}</td>
    </tr>`;
  }).join('');
}

function mudarPaginaDisparos(delta) {
  const totalPaginas = Math.max(1, Math.ceil(disparosCache.length / disparosPorPagina));
  const proximaPagina = Math.min(Math.max(1, paginaDisparosAtual + delta), totalPaginas);
  if (proximaPagina === paginaDisparosAtual) return;
  paginaDisparosAtual = proximaPagina;
  renderTabela(disparosCache);
}

// ─── Utilitário seguro ───────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Init ────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  inicializarTema();
  configurarSeletorDisparosPorPagina();

  const btnPrev = document.getElementById('disparos-prev');
  const btnNext = document.getElementById('disparos-next');
  if (btnPrev) btnPrev.addEventListener('click', () => mudarPaginaDisparos(-1));
  if (btnNext) btnNext.addEventListener('click', () => mudarPaginaDisparos(1));

  atualizarRelogio();
  intervalRelogio  = setInterval(atualizarRelogio, 1000);
  intervalRefresh  = setInterval(tickContador, 1000);
  carregarDados();
});
