const test = require('node:test');
const assert = require('node:assert/strict');
const { acquireInstanceLock, createShutdown } = require('./robot-lifecycle');

test('second instance is rejected and lock is released for a later start', async () => {
  const id = `test-${process.pid}-${Date.now()}`;
  const release = await acquireInstanceLock(id);
  try { await assert.rejects(acquireInstanceLock(id), /Já existe/); }
  finally { await release(); }
  await (await acquireInstanceLock(id))();
});
test('shutdown stops work and destroys browser only once', async () => {
  const order = [];
  const shutdown = createShutdown({
    client: { destroy: async () => { order.push('destroy'); } },
    stopWork: () => order.push('stop'), release: async () => order.push('release'),
    exit: (code) => order.push(code), log: () => {},
  });
  await Promise.all([shutdown('SIGINT'), shutdown('SIGINT')]);
  assert.deepEqual(order, ['stop', 'destroy', 'release', 0]);
});
test('startup failure exits with error after cleanup', async () => {
  let exitCode;
  const shutdown = createShutdown({ client: { destroy: async () => {} }, stopWork: () => {}, exit: (code) => { exitCode = code; }, log: () => {} });
  await shutdown('startup', 1);
  assert.equal(exitCode, 1);
});
test('failed close targets only the owned browser child', async () => {
  const child = { pid: 123 };
  let target;
  const shutdown = createShutdown({
    client: { pupBrowser: { process: () => child }, destroy: async () => { throw new Error('busy'); } },
    stopWork: () => {}, forceClose: async (value) => { target = value; }, exit: () => {}, log: () => {},
  });
  await shutdown('SIGINT');
  assert.equal(target, child);
});
test('hung close has a bounded timeout', async () => {
  let forced = false;
  const shutdown = createShutdown({
    client: { destroy: () => new Promise(() => {}) }, stopWork: () => {},
    forceClose: async () => { forced = true; }, exit: () => {}, timeoutMs: 5, log: () => {},
  });
  await shutdown('SIGINT');
  assert.equal(forced, true);
});
