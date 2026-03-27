const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseWindowsAclOutput,
  findInsecureWindowsAclEntries
} = require('./session-permissions');

test('parseWindowsAclOutput extrai identidades e permissões', () => {
  const entries = parseWindowsAclOutput('BUILTIN\\Users:(I)(RX)\nEveryone:(I)(F)');
  assert.equal(entries.length, 2);
  assert.equal(entries[0].identity, 'BUILTIN\\Users');
  assert.match(entries[1].permissions, /\(F\)/);
});

test('findInsecureWindowsAclEntries detecta grupos amplos com escrita', () => {
  const insecure = findInsecureWindowsAclEntries([
    { identity: 'Everyone', permissions: '(I)(F)' },
    { identity: 'BUILTIN\\Administrators', permissions: '(I)(F)' }
  ]);

  assert.equal(insecure.length, 1);
  assert.equal(insecure[0].identity, 'Everyone');
});