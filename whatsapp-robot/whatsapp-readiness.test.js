const test = require('node:test');
const assert = require('node:assert/strict');
const { createReadinessGate, inspectPage } = require('./whatsapp-readiness');

function fixture(state, failure = false) {
  let time = 0;
  let initializations = 0;
  const loadUtils = () => {};
  const client = { pupPage: {
    isClosed: () => false,
    async evaluate(fn) {
      if (fn === inspectPage) return { ...state };
      assert.equal(fn, loadUtils);
      initializations++;
      if (failure) throw new Error('Initializer unavailable');
      state.helpers = true;
    },
  } };
  const check = createReadinessGate({ client, loadUtils, now: () => time, graceMs: 20 });
  return { check, client, advance: () => { time += 21; }, count: () => initializations };
}

test('CONNECTED alone never permits sending', async () => {
  const f = fixture({ connected: true, synced: true, helpers: false });
  assert.equal(await f.check(), false);
  assert.equal(f.count(), 0);
});
test('all send helpers and synchronized connection permit sending', async () => {
  const f = fixture({ connected: true, synced: true, helpers: true });
  assert.equal(await f.check(), true);
});
test('missing helpers are initialized after grace and verified again', async () => {
  const f = fixture({ connected: true, synced: true, helpers: false });
  await f.check(); f.advance();
  assert.equal(await f.check(), true);
  assert.equal(f.count(), 1);
});
test('initializer failure keeps queue paused and does not loop', async () => {
  const f = fixture({ connected: true, synced: true, helpers: false }, true);
  await f.check(); f.advance();
  assert.equal(await f.check(), false);
  assert.equal(await f.check(), false);
  assert.equal(f.count(), 1);
});
test('disconnected or unsynchronized sessions never initialize', async () => {
  for (const state of [{ connected: false, synced: true }, { connected: true, synced: false }]) {
    const f = fixture({ ...state, helpers: false });
    await f.check(); f.advance();
    assert.equal(await f.check(), false);
    assert.equal(f.count(), 0);
  }
});
test('concurrent checks share a single initialization', async () => {
  const f = fixture({ connected: true, synced: true, helpers: false });
  await f.check(); f.advance();
  assert.deepEqual(await Promise.all([f.check(), f.check(), f.check()]), [true, true, true]);
  assert.equal(f.count(), 1);
});
test('loss of helpers prevents subsequent sends', async () => {
  const state = { connected: true, synced: true, helpers: true };
  const f = fixture(state);
  assert.equal(await f.check(), true);
  state.helpers = false;
  assert.equal(await f.check(), false);
});
test('closed page never permits sending', async () => {
  const f = fixture({ connected: true, synced: true, helpers: true });
  f.client.pupPage.isClosed = () => true;
  assert.equal(await f.check(), false);
});
