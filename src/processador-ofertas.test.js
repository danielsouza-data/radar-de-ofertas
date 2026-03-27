const test = require('node:test');
const assert = require('node:assert/strict');

const {
  gerarHashOferta,
  verificarDuplicacao,
  selecionarOfertasBalanceadas,
  selecionarLinksPoolRoundRobin
} = require('./processador-ofertas');

// ============ gerarHashOferta ============

test('gerarHashOferta retorna hash md5 estável para oferta válida', () => {
  const oferta = { marketplace: 'Shopee', product_id: '12345', price: 99.90 };
  const h1 = gerarHashOferta(oferta);
  const h2 = gerarHashOferta(oferta);

  assert.equal(typeof h1, 'string');
  assert.equal(h1.length, 32); // MD5 hex
  assert.equal(h1, h2); // determinístico
});

test('gerarHashOferta produz hashes diferentes para produtos distintos', () => {
  const a = { marketplace: 'Shopee', product_id: 'AAA', price: 50 };
  const b = { marketplace: 'Shopee', product_id: 'BBB', price: 50 };

  assert.notEqual(gerarHashOferta(a), gerarHashOferta(b));
});

test('gerarHashOferta trata price com centavos como mesmo produto (floor)', () => {
  const a = { marketplace: 'Shopee', product_id: 'X1', price: 99.10 };
  const b = { marketplace: 'Shopee', product_id: 'X1', price: 99.99 };

  assert.equal(gerarHashOferta(a), gerarHashOferta(b));
});

test('gerarHashOferta distingue marketplaces diferentes com mesmo product_id', () => {
  const shop = { marketplace: 'Shopee', product_id: '999', price: 100 };
  const ml   = { marketplace: 'Mercado Livre', product_id: '999', price: 100 };

  assert.notEqual(gerarHashOferta(shop), gerarHashOferta(ml));
});

test('gerarHashOferta com product_id undefined retorna null (não gera colisão)', () => {
  const sem_id = { marketplace: 'Shopee', product_id: undefined, price: 0 };
  const result = gerarHashOferta(sem_id);

  assert.equal(result, null);
});

test('gerarHashOferta com price null retorna null', () => {
  const sem_price = { marketplace: 'Shopee', product_id: '123', price: null };
  assert.equal(gerarHashOferta(sem_price), null);
});

test('gerarHashOferta com product_id vazio retorna null', () => {
  const id_vazio = { marketplace: 'Shopee', product_id: '', price: 50 };
  assert.equal(gerarHashOferta(id_vazio), null);
});

// ============ verificarDuplicacao ============

test('verificarDuplicacao retorna false para historico vazio', () => {
  const oferta = { marketplace: 'Shopee', product_id: 'ABC', price: 100 };
  const historico = { offers: [], lastUpdate: null };

  assert.equal(verificarDuplicacao(oferta, historico), false);
});

test('verificarDuplicacao detecta duplicata recente', () => {
  const oferta = { marketplace: 'Shopee', product_id: 'ABC', price: 100 };
  const { gerarHashOferta: h } = require('./processador-ofertas');
  const hash = h(oferta);

  const historico = {
    offers: [{ hash, timestamp: Date.now() - 1000 }]
  };

  assert.equal(verificarDuplicacao(oferta, historico), true);
});

test('verificarDuplicacao ignora duplicata com mais de 7 dias', () => {
  const oferta = { marketplace: 'Shopee', product_id: 'ABC', price: 100 };
  const { gerarHashOferta: h } = require('./processador-ofertas');
  const hash = h(oferta);

  const oitoDiasAtras = Date.now() - 8 * 24 * 60 * 60 * 1000;
  const historico = {
    offers: [{ hash, timestamp: oitoDiasAtras }]
  };

  assert.equal(verificarDuplicacao(oferta, historico), false);
});

test('verificarDuplicacao com hash null não lança exceção', () => {
  const oferta_sem_id = { marketplace: 'Shopee', product_id: undefined, price: 0 };
  const historico = { offers: [{ hash: null, timestamp: Date.now() }] };

  // Não deve lançar: hash null !== hash null (strict) é false em some(), ou hash null
  assert.doesNotThrow(() => verificarDuplicacao(oferta_sem_id, historico));
});

// ============ selecionarOfertasBalanceadas ============

function mkOferta(marketplace, i, score) {
  return {
    marketplace,
    product_id: `${marketplace}-${i}`,
    product_name: `${marketplace} produto ${i}`,
    link: `https://example.com/${marketplace}/${i}`,
    score,
    price: 10 + i,
    discount: 30,
    rating: 4.5
  };
}

test('selecionarOfertasBalanceadas garante presença dos dois marketplaces', () => {
  const ranked = [
    mkOferta('Shopee', 1, 99),
    mkOferta('Shopee', 2, 98),
    mkOferta('Shopee', 3, 97),
    mkOferta('Mercado Livre', 1, 96),
    mkOferta('Mercado Livre', 2, 95),
    mkOferta('Mercado Livre', 3, 94)
  ];

  const out = selecionarOfertasBalanceadas(ranked, 6);
  const mercados = new Set(out.map((o) => o.marketplace));

  assert.equal(out.length, 6);
  assert.equal(mercados.has('Shopee'), true);
  assert.equal(mercados.has('Mercado Livre'), true);
});

test('selecionarOfertasBalanceadas mantém distribuição equivalente em total par', () => {
  const ranked = [
    mkOferta('Shopee', 1, 99),
    mkOferta('Shopee', 2, 98),
    mkOferta('Shopee', 3, 97),
    mkOferta('Mercado Livre', 1, 96),
    mkOferta('Mercado Livre', 2, 95),
    mkOferta('Mercado Livre', 3, 94)
  ];

  const out = selecionarOfertasBalanceadas(ranked, 6);
  const countShopee = out.filter((o) => o.marketplace === 'Shopee').length;
  const countML = out.filter((o) => o.marketplace === 'Mercado Livre').length;

  assert.equal(countShopee, 3);
  assert.equal(countML, 3);
});

test('selecionarOfertasBalanceadas com total ímpar usa distribuição mais próxima possível', () => {
  const ranked = [
    mkOferta('Shopee', 1, 99),
    mkOferta('Shopee', 2, 98),
    mkOferta('Shopee', 3, 97),
    mkOferta('Mercado Livre', 1, 96),
    mkOferta('Mercado Livre', 2, 95)
  ];

  const out = selecionarOfertasBalanceadas(ranked, 5);
  const countShopee = out.filter((o) => o.marketplace === 'Shopee').length;
  const countML = out.filter((o) => o.marketplace === 'Mercado Livre').length;

  assert.equal(out.length, 5);
  assert.equal(Math.abs(countShopee - countML) <= 1, true);
  assert.equal(countShopee > 0 && countML > 0, true);
});

// ============ selecionarLinksPoolRoundRobin ============

test('selecionarLinksPoolRoundRobin rotaciona o cursor sem repetir no mesmo ciclo', () => {
  const pool = [
    'https://meli.la/A',
    'https://meli.la/B',
    'https://meli.la/C',
    'https://meli.la/D'
  ];

  const run1 = selecionarLinksPoolRoundRobin(pool, 2, 0);
  assert.deepEqual(run1.selected, ['https://meli.la/A', 'https://meli.la/B']);
  assert.equal(run1.nextCursor, 2);

  const run2 = selecionarLinksPoolRoundRobin(pool, 2, run1.nextCursor);
  assert.deepEqual(run2.selected, ['https://meli.la/C', 'https://meli.la/D']);
  assert.equal(run2.nextCursor, 0);
});

test('selecionarLinksPoolRoundRobin limita quantidade ao tamanho do pool deduplicado', () => {
  const pool = [
    'https://meli.la/X',
    'https://meli.la/X',
    'https://meli.la/Y'
  ];

  const run = selecionarLinksPoolRoundRobin(pool, 10, 0);
  assert.deepEqual(run.selected, ['https://meli.la/X', 'https://meli.la/Y']);
  assert.equal(run.total, 2);
  assert.equal(run.nextCursor, 0);
});
