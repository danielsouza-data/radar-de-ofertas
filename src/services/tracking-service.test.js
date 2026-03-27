const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCampaignMetadata,
  computeTrackingStats,
  inferOfferCategory
} = require('./tracking-service');

test('inferOfferCategory classifica eletrônicos por heurística simples', () => {
  assert.equal(inferOfferCategory({ product_name: 'Headset Gamer Astro A10', marketplace: 'Mercado Livre' }), 'eletronicos');
});

test('buildCampaignMetadata gera campaign id estável por data e hora', () => {
  const when = new Date('2026-03-27T20:00:00Z');
  const meta = buildCampaignMetadata({ product_name: 'Headset Gamer Astro A10', marketplace: 'Mercado Livre' }, 'run-1', when);
  assert.match(meta.campaignId, /^radar_mercado-livre_eletronicos_20260327_h17$/);
  assert.equal(meta.runId, 'run-1');
});

test('computeTrackingStats calcula ctr a partir de envios rastreáveis e cliques únicos', () => {
  const disparos = [
    { trackingEnabled: true },
    { trackingEnabled: true },
    { trackingEnabled: false }
  ];
  const clicks = [{ token: 'a' }, { token: 'a' }, { token: 'b' }];
  const trackedLinks = [
    { token: 'a', campaignId: 'c1', category: 'eletronicos', marketplace: 'mercado-livre' },
    { token: 'b', campaignId: 'c1', category: 'eletronicos', marketplace: 'mercado-livre' }
  ];

  const stats = computeTrackingStats(disparos, clicks, trackedLinks);
  assert.equal(stats.totalSends, 2);
  assert.equal(stats.uniqueClicks, 2);
  assert.equal(stats.ctr, 100);
});

test('computeTrackingStats usa trackedLinks como fonte principal de envios', () => {
  const disparos = [{ trackingEnabled: false }];
  const clicks = [{ token: 'x' }];
  const trackedLinks = [
    { token: 'x', campaignId: 'c2', category: 'eletronicos', marketplace: 'mercado-livre' }
  ];

  const stats = computeTrackingStats(disparos, clicks, trackedLinks);
  assert.equal(stats.totalSends, 1);
  assert.equal(stats.uniqueClicks, 1);
  assert.equal(stats.ctr, 100);
});