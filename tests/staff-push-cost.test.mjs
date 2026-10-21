import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness(eventCount, deviceCount) {
  const reads = [],
    sends = [],
    keys = [];
  const data = new Map();
  let transaction = Promise.resolve();
  for (let i = 0; i < eventCount; i++)
    data.set(`staffNotifications/n${i}`, {
      pushStatus: 'pending',
      createdAt: { toMillis: () => Date.now() },
      title: 'Reserva nova',
      href: '/painel',
    });
  for (let i = 0; i < deviceCount; i++)
    data.set(`staffPushSubscriptions/s${i}`, {
      uid: 'staff',
      expiresAt: Date.now() + 60_000,
      subscription: { endpoint: `device${i}` },
    });
  function ref(path) {
    return {
      id: path.split('/').at(-1),
      path,
      update: async (value) => data.set(path, { ...data.get(path), ...value }),
      delete: async () => data.delete(path),
    };
  }
  const snapshot = (path) => ({
    id: ref(path).id,
    ref: ref(path),
    data: () => data.get(path),
  });
  const db = {
    collection(name) {
      let filter;
      const query = {
        where(field, operator, value) {
          filter = { field, operator, value };
          return query;
        },
        limit() {
          return query;
        },
        async get() {
          reads.push(name);
          return {
            docs: [...data.entries()]
              .filter(
                ([path, value]) =>
                  path.startsWith(name + '/') &&
                  (!filter ||
                    (filter.operator === '=='
                      ? value[filter.field] === filter.value
                      : value[filter.field] > filter.value)),
              )
              .map(([path]) => snapshot(path)),
          };
        },
      };
      return query;
    },
    runTransaction(fn) {
      const run = transaction.then(() =>
        fn({
          get: async (r) => snapshot(r.path),
          update: (r, value) => r.update(value),
        }),
      );
      transaction = run.catch(() => {});
      return run;
    },
  };
  const authentication = {
    getUser: async () => ({ disabled: false, customClaims: { staff: true } }),
  };
  const imports = {
    'server-only': {},
    'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => 0 } },
    'web-push': {
      sendNotification: async (...args) => {
        sends.push(args);
      },
    },
    '@/lib/firebase/admin': { getAdminAuthentication: () => authentication },
    '@/lib/firebase/reservation-notifications': {
      validSubscription: () => true,
      getPushKeys: async () => {
        keys.push('read');
        return { publicKey: 'test-public', privateKey: 'test-private' };
      },
    },
    '@/lib/whatsapp': { messageTitles: {} },
  };
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(
        new URL('../lib/firebase/staff-push.ts', import.meta.url),
        'utf8',
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      },
    ).outputText,
    {
      exports,
      console,
      require: (name) => {
        if (!(name in imports)) throw new Error(name);
        return imports[name];
      },
    },
  );
  return {
    run: () => exports.dispatchStaffNotifications(db),
    reads,
    sends,
    keys,
    data,
  };
}

test('empty outbox does not read devices or push keys', async () => {
  const h = harness(0, 10);
  await h.run();
  assert.deepEqual(h.reads, ['staffNotifications']);
  assert.equal(h.keys.length, 0);
});
test('push keys are read once per batch, not once per device and notification', async () => {
  const h = harness(3, 4);
  await h.run();
  assert.equal(h.sends.length, 12);
  assert.equal(h.keys.length, 1);
  assert.equal(h.data.get('staffNotifications/n0').pushStatus, 'sent');
  assert.equal(
    h.sends[0][2].vapidDetails.subject,
    'https://reservas-tophaus.netlify.app',
  );
});
test('no registered device does not read keys; concurrent dispatch does not duplicate sends', async () => {
  const empty = harness(1, 0);
  await empty.run();
  assert.equal(empty.keys.length, 0);
  assert.equal(
    empty.data.get('staffNotifications/n0').pushStatus,
    'no_devices',
  );
  const h = harness(2, 3);
  await Promise.all([h.run(), h.run()]);
  assert.equal(h.sends.length, 6);
});
