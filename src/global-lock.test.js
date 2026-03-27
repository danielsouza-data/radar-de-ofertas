const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  readLock,
  isLockActive,
  acquireGlobalLock,
  releaseGlobalLock
} = require('./global-lock');

function getTempLockPath() {
  return path.join(os.tmpdir(), `radar-lock-test-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
}

test('acquireGlobalLock acquires when lock file does not exist', () => {
  const lockPath = getTempLockPath();

  const result = acquireGlobalLock(lockPath, 'test_owner', 60_000);
  assert.equal(result.acquired, true);
  assert.equal(readLock(lockPath).owner, 'test_owner');

  const released = releaseGlobalLock(lockPath);
  assert.equal(released, true);
  assert.equal(fs.existsSync(lockPath), false);
});

test('acquireGlobalLock is denied when active lock exists', () => {
  const lockPath = getTempLockPath();

  const first = acquireGlobalLock(lockPath, 'first_owner', 60_000);
  assert.equal(first.acquired, true);

  const second = acquireGlobalLock(lockPath, 'second_owner', 60_000);
  assert.equal(second.acquired, false);
  assert.equal(second.reason, 'active_lock');
  assert.equal(second.lock.owner, 'first_owner');

  releaseGlobalLock(lockPath);
});

test('acquireGlobalLock replaces stale lock', () => {
  const lockPath = getTempLockPath();
  const staleLock = {
    pid: process.pid,
    owner: 'stale_owner',
    createdAt: Date.now() - 10 * 60 * 1000,
    createdAtISO: new Date(Date.now() - 10 * 60 * 1000).toISOString()
  };

  fs.writeFileSync(lockPath, JSON.stringify(staleLock, null, 2));

  const result = acquireGlobalLock(lockPath, 'fresh_owner', 60_000);
  assert.equal(result.acquired, true);
  assert.equal(readLock(lockPath).owner, 'fresh_owner');

  releaseGlobalLock(lockPath);
});

test('acquireGlobalLock recupera lock com arquivo invalido (stale/corrompido)', () => {
  const lockPath = getTempLockPath();
  fs.writeFileSync(lockPath, '{json-invalido');

  const result = acquireGlobalLock(lockPath, 'recovered_owner', 60_000);
  assert.equal(result.acquired, true);

  const parsed = readLock(lockPath);
  assert.equal(parsed.owner, 'recovered_owner');

  releaseGlobalLock(lockPath);
});

test('acquireGlobalLock nega segunda aquisicao mesmo com chamadas seguidas imediatas', () => {
  const lockPath = getTempLockPath();

  const first = acquireGlobalLock(lockPath, 'owner_a', 60_000);
  const second = acquireGlobalLock(lockPath, 'owner_b', 60_000);

  assert.equal(first.acquired, true);
  assert.equal(second.acquired, false);
  assert.equal(second.reason, 'active_lock');

  releaseGlobalLock(lockPath);
});

test('isLockActive returns false for malformed lock', () => {
  const malformed = { pid: 'abc', createdAt: 'not-a-number' };
  assert.equal(isLockActive(malformed, 60_000), false);
});

test('releaseGlobalLock refuses lock owned by another pid', () => {
  const lockPath = getTempLockPath();
  const foreignLock = {
    pid: process.pid + 100_000,
    owner: 'foreign',
    createdAt: Date.now(),
    createdAtISO: new Date().toISOString()
  };

  fs.writeFileSync(lockPath, JSON.stringify(foreignLock, null, 2));

  const released = releaseGlobalLock(lockPath);
  assert.equal(released, false);
  assert.equal(fs.existsSync(lockPath), true);

  fs.unlinkSync(lockPath);
});
