'use strict';
/**
 * Utilitários compartilhados de gerenciamento de links/pool do Mercado Livre.
 * Usado por src/processador-ofertas.js e bin/dashboard-server.js.
 */

const fs = require('fs');

function carregarLinksMercadoLivreArquivo(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];

  try {
    return fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch {
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

function calcularCiclosPorJanela(inicioHora, fimHora, intervaloMin) {
  const inicio = Math.max(0, Math.min(23, Number(inicioHora)));
  const fim = Math.max(0, Math.min(23, Number(fimHora)));
  const intervalo = Math.max(1, Number(intervaloMin));

  const janelaHoras = fim > inicio ? (fim - inicio) : ((24 - inicio) + fim);
  const janelaMinutos = janelaHoras * 60;

  if (janelaMinutos <= 0) return 0;

  return Math.ceil(janelaMinutos / intervalo);
}

module.exports = {
  carregarLinksMercadoLivreArquivo,
  deduplicarLinks,
  ehLinkMercadoLivreCurto,
  calcularCiclosPorJanela
};
