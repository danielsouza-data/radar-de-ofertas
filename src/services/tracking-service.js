const crypto = require('crypto');
const fs = require('fs');
const { PATHS } = require('../config/paths');

function slugify(value, fallback = 'geral') {
  const slug = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || fallback;
}

function inferOfferCategory(offer = {}) {
  const nome = String(offer.product_name || '').toLowerCase();
  if (/fone|headset|gamer|smartphone|galaxy|buds|oppo|iphone|samsung|monitor|tv|notebook|teclado|mouse/.test(nome)) return 'eletronicos';
  if (/creme|limpeza|facial|barbeador|beleza|hidrat|perfume/.test(nome)) return 'beleza';
  if (/casa|cozinha|rack|fechadura|alarme/.test(nome)) return 'casa';
  return slugify(offer.marketplace || 'geral');
}

function buildCampaignMetadata(offer = {}, runId = 'manual', now = new Date()) {
  const category = inferOfferCategory(offer);
  const marketplace = slugify(offer.marketplace || 'geral');
  const hour = String(now.getHours()).padStart(2, '0');
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  const campaignId = `radar_${marketplace}_${category}_${day}_h${hour}`;

  return {
    category,
    marketplace,
    hourBucket: `h${hour}`,
    campaignId,
    runId,
    utmSource: 'radar_whatsapp',
    utmMedium: 'channel',
    utmCampaign: campaignId,
    utmContent: runId
  };
}

function readJsonOptional(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function createTrackingToken() {
  return crypto.randomBytes(10).toString('hex');
}

function createTrackedOfferLink({ offer, runId, publicBaseUrl }) {
  const metadata = buildCampaignMetadata(offer, runId);
  const targetUrl = String(offer.link || '').trim();
  const baseUrl = String(publicBaseUrl || '').trim().replace(/\/$/, '');

  if (!targetUrl || !baseUrl) {
    return {
      trackingEnabled: false,
      trackingToken: null,
      trackingUrl: targetUrl,
      metadata
    };
  }

  const token = createTrackingToken();
  const current = readJsonOptional(PATHS.TRACKING_LINKS, []);
  current.push({
    token,
    targetUrl,
    createdAt: Date.now(),
    createdAtISO: new Date().toISOString(),
    offerKey: String(offer.offerKey || ''),
    productId: offer.product_id || null,
    productName: offer.product_name || null,
    marketplace: offer.marketplace || null,
    ...metadata
  });
  writeJson(PATHS.TRACKING_LINKS, current.slice(-5000));

  return {
    trackingEnabled: true,
    trackingToken: token,
    trackingUrl: `${baseUrl}/r/${token}`,
    metadata
  };
}

function recordTrackingClick(token, extra = {}) {
  const current = readJsonOptional(PATHS.CLICK_EVENTS, []);
  const event = {
    token,
    clickedAt: Date.now(),
    clickedAtISO: new Date().toISOString(),
    ...extra
  };
  current.push(event);
  writeJson(PATHS.CLICK_EVENTS, current.slice(-20000));
  return event;
}

function findTrackedLink(token) {
  const items = readJsonOptional(PATHS.TRACKING_LINKS, []);
  return items.find((item) => item.token === token) || null;
}

function computeTrackingStats(disparos = [], clickEvents = [], trackedLinks = []) {
  const sends = Array.isArray(disparos) ? disparos.filter((item) => item.trackingEnabled) : [];
  const trackedSends = Array.isArray(trackedLinks) ? trackedLinks : [];
  const clicks = Array.isArray(clickEvents) ? clickEvents : [];
  const clickTokens = new Set(clicks.map((item) => item.token).filter(Boolean));
  const totalSends = trackedSends.length > 0 ? trackedSends.length : sends.length;
  const totalClicks = clicks.length;
  const uniqueClicks = clickTokens.size;
  const ctr = totalSends > 0 ? Number(((uniqueClicks / totalSends) * 100).toFixed(2)) : 0;

  const byCampaign = {};
  trackedSends.forEach((item) => {
    const key = item.campaignId || 'sem-campanha';
    if (!byCampaign[key]) {
      byCampaign[key] = {
        campaignId: key,
        category: item.category || 'geral',
        marketplace: item.marketplace || 'geral',
        sends: 0,
        uniqueClicks: 0
      };
    }
    byCampaign[key].sends += 1;
  });

  Object.values(byCampaign).forEach((entry) => {
    const tokens = trackedSends.filter((item) => item.campaignId === entry.campaignId).map((item) => item.token);
    entry.uniqueClicks = tokens.filter((token) => clickTokens.has(token)).length;
    entry.ctr = entry.sends > 0 ? Number(((entry.uniqueClicks / entry.sends) * 100).toFixed(2)) : 0;
  });

  return {
    trackingEnabled: trackedSends.length > 0,
    totalSends,
    totalClicks,
    uniqueClicks,
    ctr,
    topCampaigns: Object.values(byCampaign).sort((a, b) => b.uniqueClicks - a.uniqueClicks || b.sends - a.sends).slice(0, 5)
  };
}

module.exports = {
  slugify,
  inferOfferCategory,
  buildCampaignMetadata,
  createTrackedOfferLink,
  recordTrackingClick,
  findTrackedLink,
  computeTrackingStats
};