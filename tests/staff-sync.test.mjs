import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as events from '../lib/client/staff-events.ts';

const changed = (id = 'n1', entityId = 'r1') => ({
  id,
  entityId,
  entityType: 'reservation',
});

test('bell deduplicates delivery status updates and keeps bounded memory', () => {
  const seen = new Set();
  assert.equal(events.newStaffEvents([changed()], seen).length, 1);
  assert.equal(events.newStaffEvents([changed()], seen).length, 0);
  events.newStaffEvents(
    Array.from({ length: 400 }, (_, i) => changed(`n${i}`)),
    seen,
  );
  assert.equal(seen.size, 300);
  assert.equal(events.isStaffEntityEvent(changed('n', '../private')), false);
});

test('entity merge handles cancellation, date change and arrival without duplicates', () => {
  const current = [
    { id: 'r1', status: 'waiting' },
    { id: 'r2', status: 'waiting' },
  ];
  assert.equal(
    events.mergeStaffEntity(current, 'r1', { id: 'r1', status: 'called' })
      .length,
    2,
  );
  assert.deepEqual(events.mergeStaffEntity(current, 'r1', undefined), [
    current[1],
  ]);
  assert.deepEqual(
    events.mergeStaffEntity(
      current,
      'r1',
      { id: 'r1', status: 'seated' },
      (item) => item.status === 'waiting',
    ),
    [current[1]],
  );
});

function hookHarness() {
  let cursor = 0;
  const refs = [],
    effects = [],
    commits = [],
    timers = new Map(),
    visibility = new Set();
  let serial = 0;
  const document = {
    hidden: false,
    addEventListener: (_name, fn) => visibility.add(fn),
    removeEventListener: (_name, fn) => visibility.delete(fn),
  };
  const react = {
    useRef(value) {
      const index = cursor++;
      return (refs[index] ??= { current: value });
    },
    useEffect(fn, deps) {
      const index = cursor++;
      const previous = effects[index];
      if (
        !deps ||
        !previous ||
        deps.some((value, i) => value !== previous.deps?.[i])
      )
        commits.push(() => {
          previous?.cleanup?.();
          effects[index] = { deps, cleanup: fn() };
        });
    },
  };
  const compiled = ts.transpileModule(
    readFileSync(
      new URL('../components/use-staff-entity-sync.ts', import.meta.url),
      'utf8',
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    document,
    setTimeout(fn) {
      const id = ++serial;
      timers.set(id, fn);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    require: (name) => (name === 'react' ? react : events),
  });
  return {
    render(options) {
      cursor = 0;
      exports.useStaffEntitySync(options);
      commits.splice(0).forEach((fn) => fn());
    },
    async flush() {
      const pending = [...timers.values()];
      timers.clear();
      pending.forEach((fn) => fn());
      await setImmediate();
    },
    visibility(hidden) {
      document.hidden = hidden;
      visibility.forEach((fn) => fn());
    },
    stop() {
      effects.forEach((effect) => effect?.cleanup?.());
    },
    timers,
  };
}

test('sync only loads on events, coalesces same entity and pauses in background', async () => {
  const harness = hookHarness();
  let reads = 0,
    applied = 0;
  try {
    harness.render({
      scope: 'staff',
      ready: true,
      accepts: () => true,
      load: async () => {
        reads++;
        return () => applied++;
      },
      onError: () => assert.fail('unexpected error'),
    });
    await harness.flush();
    assert.equal(reads, 0);
    events.publishStaffEvent(changed());
    events.publishStaffEvent(changed('n2'));
    events.publishStaffEvent(changed('n3'));
    await harness.flush();
    assert.equal(reads, 1);
    assert.equal(applied, 1);
    assert.equal(harness.timers.size, 0);
    harness.visibility(true);
    events.publishStaffEvent(changed('n4'));
    await harness.flush();
    assert.equal(reads, 1);
    harness.visibility(false);
    await harness.flush();
    assert.equal(reads, 2);
  } finally {
    harness.stop();
  }
});

test('sync does not apply older data after a new event or after leaving the screen', async () => {
  const harness = hookHarness();
  const pending = [];
  const applied = [];
  try {
    harness.render({
      scope: 'staff',
      ready: true,
      accepts: () => true,
      load: (event) =>
        new Promise((resolve) =>
          pending.push(() => resolve(() => applied.push(event.id))),
        ),
      onError: () => {},
    });
    events.publishStaffEvent(changed('first'));
    await harness.flush();
    events.publishStaffEvent(changed('newer'));
    pending.shift()();
    await setImmediate();
    assert.deepEqual(applied, []);
    pending.shift()();
    await setImmediate();
    assert.deepEqual(applied, ['newer']);
    events.publishStaffEvent(changed('leaving'));
    await harness.flush();
    harness.stop();
    pending.shift()();
    await setImmediate();
    assert.deepEqual(applied, ['newer']);
  } finally {
    harness.stop();
  }
});

test('sync waits during a local save and reports failure without a retry loop', async () => {
  const harness = hookHarness();
  let reads = 0,
    errors = 0;
  const options = {
    scope: 'staff',
    ready: false,
    accepts: () => true,
    load: async () => {
      reads++;
      throw new Error('unavailable');
    },
    onError: () => errors++,
  };
  try {
    harness.render(options);
    events.publishStaffEvent(changed());
    await harness.flush();
    assert.equal(reads, 0);
    harness.render({ ...options, ready: true });
    await harness.flush();
    assert.equal(reads, 1);
    assert.equal(errors, 1);
    await harness.flush();
    assert.equal(reads, 1);
    assert.equal(harness.timers.size, 0);
  } finally {
    harness.stop();
  }
});
