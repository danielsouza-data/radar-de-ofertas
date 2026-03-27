const test = require('node:test');
const assert = require('node:assert/strict');
const { createCircuitBreaker, CircuitBreakerOpenError } = require('./circuit-breaker');

test('abre circuito ao atingir threshold de falhas', async () => {
  const cb = createCircuitBreaker({
    name: 't1',
    failureThreshold: 2,
    resetTimeoutMs: 1000,
    logger: { log: () => {}, warn: () => {} }
  });

  await assert.rejects(() => cb.execute(async () => {
    throw new Error('fail1');
  }), /fail1/);

  await assert.rejects(() => cb.execute(async () => {
    throw new Error('fail2');
  }), /fail2/);

  await assert.rejects(() => cb.execute(async () => 'ok'), CircuitBreakerOpenError);
  assert.equal(cb.getState().state, 'open');
});

test('fecha novamente apos timeout + sucesso em half-open', async () => {
  const cb = createCircuitBreaker({
    name: 't2',
    failureThreshold: 1,
    resetTimeoutMs: 1,
    logger: { log: () => {}, warn: () => {} }
  });

  await assert.rejects(() => cb.execute(async () => {
    throw new Error('fail');
  }), /fail/);

  await new Promise((r) => setTimeout(r, 5));
  const out = await cb.execute(async () => 'ok');

  assert.equal(out, 'ok');
  assert.equal(cb.getState().state, 'closed');
  assert.equal(cb.getState().failures, 0);
});
