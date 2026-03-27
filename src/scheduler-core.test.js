const test = require('node:test');
const assert = require('node:assert/strict');

const { getDispatchSkipReason } = require('./scheduler-core');

test('getDispatchSkipReason retorna run_in_progress quando já existe execução', () => {
  assert.equal(getDispatchSkipReason({ isRunning: true, existingLock: null, lockStaleMs: 1000 }), 'run_in_progress');
});

test('getDispatchSkipReason retorna global_lock_active quando lock válido existe', () => {
  const lock = { createdAt: Date.now(), pid: process.pid, owner: 'test' };
  assert.equal(getDispatchSkipReason({ isRunning: false, existingLock: lock, lockStaleMs: 60_000 }), 'global_lock_active');
});

test('getDispatchSkipReason retorna null quando scheduler pode disparar', () => {
  assert.equal(getDispatchSkipReason({ isRunning: false, existingLock: null, lockStaleMs: 60_000 }), null);
});