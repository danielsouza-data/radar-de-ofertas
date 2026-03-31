const test = require('node:test');
const assert = require('node:assert/strict');
const Joi = require('joi');
const { ofertaMlSchema } = require('./processador-ofertas');

// Mock de oferta válida
const ofertaValida = {
  marketplace: 'Mercado Livre',
  product_id: 'MLB123456',
  product_name: 'Produto Teste',
  slug: 'produto-teste',
  price: 100,
  original_price: 150,
  rating: 4.5,
  sales: 10,
  raw_link: 'https://www.mercadolivre.com.br/produto-teste/p/MLB123456',
  image_url: ''
};

test('Validação de oferta Mercado Livre válida', () => {
  const { error } = ofertaMlSchema.validate(ofertaValida);
  assert.equal(error, undefined);
});

test('Validação de oferta Mercado Livre inválida (sem product_id)', () => {
  const ofertaInvalida = { ...ofertaValida };
  delete ofertaInvalida.product_id;
  const { error } = ofertaMlSchema.validate(ofertaInvalida);
  assert.ok(error);
});

// Teste de deduplicação e transformação pode ser expandido conforme funções exportadas
