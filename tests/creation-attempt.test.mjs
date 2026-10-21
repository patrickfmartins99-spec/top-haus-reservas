import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearCreationRequestKey,
  creationRequestKey,
  pendingCreationRequestKey,
} from '../lib/client/creation-attempt.ts';

test('a lost response reuses the same key; a changed form or completed creation does not', async () => {
  const storage = new Map();
  const previousWindow = globalThis.window;
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  };
  try {
    const scope = 'test-reservation';
    const input = { customerName: 'Cliente', whatsapp: '51900000000' };
    assert.equal(await pendingCreationRequestKey(scope, input), null);
    const first = await creationRequestKey(scope, input);
    assert.equal(await creationRequestKey(scope, input), first);
    assert.equal(await pendingCreationRequestKey(scope, input), first);
    assert.doesNotMatch([...storage.values()][0], /51900000000/);
    const changed = await creationRequestKey(scope, {
      ...input,
      whatsapp: '51900000001',
    });
    assert.notEqual(changed, first);
    clearCreationRequestKey(scope);
    assert.equal(await pendingCreationRequestKey(scope, input), null);
    assert.notEqual(await creationRequestKey(scope, input), first);
  } finally {
    clearCreationRequestKey('test-reservation');
    globalThis.window = previousWindow;
  }
});
