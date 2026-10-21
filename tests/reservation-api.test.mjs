import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import * as reservations from '../lib/domain/reservations.ts';
import * as policy from '../lib/domain/booking-policy.ts';
import * as outcomes from '../lib/domain/service-outcomes.ts';
import * as codes from '../lib/domain/reservation-code.ts';
import * as waitlistTime from '../lib/domain/waitlist-time.ts';

// Isolated route integration tests: never initialize Firebase or send a message.
function harness(initial = {}) {
  const records = new Map(Object.entries(initial));
  const events = [];
  const reads = [];
  let sequence = 0;
  let lock = Promise.resolve();
  const snapshot = (path) => ({
    id: path.split('/').at(-1),
    exists: records.has(path),
    data: () => records.get(path),
  });
  const db = {
    collection(name) {
      let filter,
        maximum = Infinity,
        afterId,
        order;
      const query = {
        doc(id = `local-${++sequence}`) {
          const path = `${name}/${id}`;
          return {
            path,
            id,
            get: async () => {
              reads.push(path);
              return snapshot(path);
            },
          };
        },
        where(field, _operator, value) {
          filter = { field, value };
          return query;
        },
        orderBy(field, direction) {
          order = { field, direction };
          return query;
        },
        limit(value) {
          maximum = value;
          return query;
        },
        startAfter(value) {
          afterId = value.id;
          return query;
        },
        async get() {
          let entries = [...records.entries()].filter(
            ([key, data]) =>
              key.startsWith(`${name}/`) &&
              (!filter || data[filter.field] === filter.value),
          );
          entries.sort((a, b) =>
            order
              ? String(b[1][order.field]).localeCompare(
                  String(a[1][order.field]),
                ) || a[0].localeCompare(b[0])
              : a[0].localeCompare(b[0]),
          );
          if (afterId)
            entries = entries.slice(
              entries.findIndex(([key]) => key === `${name}/${afterId}`) + 1,
            );
          entries = entries.slice(0, maximum);
          reads.push(...entries.map(([key]) => key));
          return { docs: entries.map(([key]) => snapshot(key)) };
        },
      };
      return query;
    },
    runTransaction(fn) {
      const result = lock.then(async () => {
        const writes = [];
        const value = await fn({
          get: async (ref) => {
            reads.push(ref.path);
            return snapshot(ref.path);
          },
          set: (ref, data, options) =>
            writes.push(() =>
              records.set(
                ref.path,
                options?.merge ? { ...records.get(ref.path), ...data } : data,
              ),
            ),
          update: (ref, data) =>
            writes.push(() =>
              records.set(ref.path, { ...records.get(ref.path), ...data }),
            ),
        });
        writes.forEach((write) => write());
        return value;
      });
      lock = result.catch(() => undefined);
      return result;
    },
  };
  const settings = {
    minAdvanceHours: 24,
    maxBookingMonths: 12,
    capacityPerService: 70,
    autoApprovalLimit: 20,
    lunchArrivalLimit: '11:30',
    dinnerArrivalLimit: '19:00',
    lateToleranceMinutes: 10,
  };
  const imports = {
    'node:crypto': { createHash },
    'firebase-admin/firestore': {
      FieldValue: { serverTimestamp: () => 'server-time' },
    },
    'next/server': {
      after: () => undefined,
      NextResponse: { json: (data, init) => Response.json(data, init) },
    },
    '@/lib/domain/reservations': reservations,
    '@/lib/domain/booking-policy': policy,
    '@/lib/domain/service-outcomes': outcomes,
    '@/lib/domain/reservation-code': codes,
    '@/lib/domain/waitlist-time': waitlistTime,
    '@/lib/domain/operational-settings': {
      getOperationalSettings: async () => settings,
    },
    '@/lib/auth/staff-request': {
      requireStaff: async (request) =>
        request.headers.get('authorization') === 'Bearer verified-staff'
          ? {
              decodedToken: { uid: 'staff-test' },
              user: { displayName: 'Equipe teste' },
            }
          : null,
    },
    '@/lib/firebase/admin': { getAdminDatabase: () => db },
    '@/lib/firebase/reservation-notifications': {
      enqueueReservationEvent: (_db, _tx, event) => events.push(event),
      dispatchReservationPush: async () => undefined,
    },
    '@/lib/firebase/staff-push': {
      enqueueStaffNotification: (_db, _tx, event) => events.push(event),
      dispatchStaffNotifications: async () => undefined,
    },
    '@/lib/firebase/whatsapp-outbox': {
      createWhatsAppOutboxEvent: (event) => event,
    },
    '@/lib/firebase/delete-reservation': {
      deleteReservation: () => {
        throw new Error('Not part of these tests');
      },
    },
  };
  function route(path) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const exports = {};
    vm.runInNewContext(compiled, {
      exports,
      URL,
      Date,
      console,
      require: (name) => {
        if (!(name in imports))
          throw new Error(`Unexpected dependency: ${name}`);
        return imports[name];
      },
    });
    return exports;
  }
  const pending = route('../app/api/reservas/[id]/route.ts');
  const create = route('../app/api/reservas/route.ts');
  const waitlist = route('../app/api/fila/route.ts');
  const waitlistUpdate = route('../app/api/fila/[id]/route.ts');
  function request(body, staff = true) {
    return new Request('https://test.invalid/api/reservas', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(staff ? { Authorization: 'Bearer verified-staff' } : {}),
      },
      body: JSON.stringify(body),
    });
  }
  return {
    records,
    reads,
    events,
    settings,
    updateQueue: (body, staff = true) =>
      waitlistUpdate.PATCH(request(body, staff), {
        params: Promise.resolve({ id: 'q1' }),
      }),
    queue: (parameters = '', staff = true) =>
      waitlist.GET(
        new Request(`https://test.invalid/api/fila?${parameters}`, {
          headers: staff ? { Authorization: 'Bearer verified-staff' } : {},
        }),
      ),
    create: (body, staff = true) => create.POST(request(body, staff)),
    list: (parameters = '', staff = true) =>
      create.GET(
        new Request(`https://test.invalid/api/reservas?${parameters}`, {
          headers: staff ? { Authorization: 'Bearer verified-staff' } : {},
        }),
      ),
    update: (body, staff = true) =>
      pending.PATCH(request(body, staff), {
        params: Promise.resolve({ id: 'r1' }),
      }),
  };
}

const sample = {
  status: 'pending_approval',
  serviceDate: '2026-10-20',
  service: 'rodizio',
  arrivalTime: '19:00',
  partySize: 25,
  customerName: 'Teste local',
  whatsapp: '51900000000',
};

const queueSample = {
  customerName: 'Cliente teste',
  whatsapp: '51900000000',
  partySize: 3,
  status: 'waiting',
  revision: 0,
};

test('concurrent calls create one message and keep the original call timestamp', async () => {
  const h = harness({ 'waitlist/q1': queueSample });
  const results = await Promise.all([
    h.updateQueue({ status: 'called', expectedRevision: 0 }),
    h.updateQueue({ status: 'called', expectedRevision: 0 }),
  ]);
  assert.deepEqual(
    results.map((r) => r.status),
    [200, 200],
  );
  assert.equal(h.events.length, 1);
  assert.equal(
    [...h.records.keys()].filter((k) => k.startsWith('whatsappQueue/')).length,
    1,
  );
  assert.equal(h.records.get('waitlist/q1').revision, 1);
  assert.equal(h.events[0].eventType, 'waitlist_called');
  assert.deepEqual(h.reads, ['waitlist/q1', 'waitlist/q1']);
});

test('arrival and removal cannot both close the same queue entry', async () => {
  const h = harness({ 'waitlist/q1': { ...queueSample, status: 'called' } });
  const results = await Promise.all([
    h.updateQueue({ status: 'seated', expectedRevision: 0 }),
    h.updateQueue({
      status: 'removed',
      reason: 'customer_gave_up',
      expectedRevision: 0,
    }),
  ]);
  assert.deepEqual(
    results.map((r) => r.status),
    [200, 409],
  );
  assert.equal(h.events.length, 1);
  assert.equal(h.records.get('waitlist/q1').status, 'seated');
  assert.ok(h.records.get('waitlist/q1').endedAt);
});

test('queue rejects stale edits, changes to closed entries and invalid transitions', async () => {
  const h = harness({ 'waitlist/q1': queueSample });
  assert.equal(
    (
      await h.updateQueue({
        ...queueSample,
        status: undefined,
        customerName: 'Novo nome',
        expectedRevision: 0,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await h.updateQueue({
        ...queueSample,
        status: undefined,
        partySize: 8,
        expectedRevision: 0,
      })
    ).status,
    409,
  );
  assert.equal(h.records.get('waitlist/q1').customerName, 'Novo nome');
  assert.equal(h.records.get('waitlist/q1').partySize, 3);
  assert.equal((await h.updateQueue({ status: 'seated' })).status, 409);
  assert.equal(
    (await h.updateQueue({ status: 'no_show', reason: 'did_not_return' }))
      .status,
    409,
  );
  assert.equal((await h.updateQueue({ status: 'called' }, false)).status, 403);
  h.records.set('waitlist/q1', { ...queueSample, status: 'removed' });
  assert.equal(
    (
      await h.updateQueue({
        ...queueSample,
        status: undefined,
        customerName: 'Não deve mudar',
      })
    ).status,
    409,
  );
});

test('waitlist event lookup reads one record and rejects unauthenticated or invalid paths', async () => {
  const h = harness({
    'waitlist/q1': { customerName: 'Teste', status: 'called', partySize: 3 },
    'waitlist/q2': { customerName: 'Outro', status: 'waiting' },
  });
  const response = await h.queue('id=q1');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).entries[0].id, 'q1');
  assert.deepEqual(h.reads, ['waitlist/q1']);
  h.reads.length = 0;
  assert.equal((await h.queue('id=q1', false)).status, 403);
  assert.equal((await h.queue('id=../private')).status, 400);
  assert.deepEqual(h.reads, []);
  assert.deepEqual((await (await h.queue('id=missing')).json()).entries, []);
  assert.deepEqual(h.reads, ['waitlist/missing']);
});

test('assigning the same table twice emits one internal event and no customer message', async () => {
  const h = harness({ 'reservations/r1': sample });
  assert.equal(
    (await h.update({ action: 'assign_table', tableLabel: '12' })).status,
    200,
  );
  assert.equal(
    (await h.update({ action: 'assign_table', tableLabel: '12' })).status,
    200,
  );
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].eventType, 'reservation_table_assigned');
  assert.equal(h.events[0].payload.serviceDate, sample.serviceDate);
});

test('approve reads only the reservation, preserves capacity and is idempotent', async () => {
  const h = harness({
    'reservations/r1': sample,
    'serviceCapacity/2026-10-20_rodizio': { heldSeats: 60 },
  });
  assert.equal(
    (await h.update({ action: 'set_status', status: 'confirmed' })).status,
    200,
  );
  assert.equal(h.records.get('reservations/r1').status, 'confirmed');
  assert.equal(
    h.records.get('serviceCapacity/2026-10-20_rodizio').heldSeats,
    60,
  );
  assert.deepEqual(h.reads, ['reservations/r1']);
  assert.equal(h.events[0].eventType, 'reservation_approved');
  await h.update({ action: 'set_status', status: 'confirmed' });
  assert.equal(h.events.length, 1);
});

test('history loads 50 at a time without duplicate records; direct link reads only one', async () => {
  const entries = Object.fromEntries(
    Array.from({ length: 75 }, (_, index) => [
      `reservations/r${String(index).padStart(3, '0')}`,
      { ...sample, createdAt: String(index).padStart(3, '0') },
    ]),
  );
  const h = harness(entries);
  const first = await (await h.list()).json();
  assert.equal(first.reservations.length, 50);
  assert.ok(first.nextCursor);
  assert.equal(h.reads.length, 51);
  const second = await (await h.list(`cursor=${first.nextCursor}`)).json();
  assert.equal(second.reservations.length, 25);
  assert.equal(second.nextCursor, null);
  assert.equal(
    new Set(
      [...first.reservations, ...second.reservations].map((item) => item.id),
    ).size,
    75,
  );
  const before = h.reads.length;
  const selected = await (await h.list('id=r003')).json();
  assert.equal(selected.reservations[0].id, 'r003');
  assert.equal(h.reads.length - before, 1);
  assert.equal((await h.list('', false)).status, 403);
});

test('refusal requires reason and releases seats once; audit remains', async () => {
  const h = harness({
    'reservations/r1': sample,
    'serviceCapacity/2026-10-20_rodizio': { heldSeats: 60 },
  });
  assert.equal(
    (await h.update({ action: 'set_status', status: 'cancelled' })).status,
    400,
  );
  assert.equal(h.events.length, 0);
  const body = {
    action: 'set_status',
    status: 'cancelled',
    reason: 'changed_plans',
    note: 'Teste isolado',
  };
  assert.equal((await h.update(body)).status, 200);
  await h.update(body);
  assert.equal(
    h.records.get('serviceCapacity/2026-10-20_rodizio').heldSeats,
    35,
  );
  assert.equal(
    h.records.get('reservations/r1').cancellationReason,
    'changed_plans',
  );
  assert.equal(h.events.length, 1);
  assert.equal(
    [...h.records.entries()].filter(([key]) => key.startsWith('auditLogs/'))
      .length,
    1,
  );
});

test('competing approval and refusal cannot both take effect', async () => {
  const h = harness({ 'reservations/r1': sample });
  const result = await Promise.all([
    h.update({ action: 'set_status', status: 'confirmed' }),
    h.update({
      action: 'set_status',
      status: 'cancelled',
      reason: 'changed_plans',
    }),
  ]);
  assert.deepEqual(
    result.map((response) => response.status),
    [200, 409],
  );
  assert.equal(h.events.length, 1);
});

test('quick actions require staff; pending cannot be seated directly', async () => {
  const h = harness({ 'reservations/r1': sample });
  assert.equal(
    (await h.update({ action: 'set_status', status: 'confirmed' }, false))
      .status,
    403,
  );
  assert.equal(
    (await h.update({ action: 'set_status', status: 'seated' })).status,
    409,
  );
  assert.equal(h.events.length, 0);
});

test('staff can exceed capacity, customer cannot; real seats and exception are audited', async () => {
  const tomorrow = new Date(Date.now() + 3 * 86_400_000);
  while (reservations.isMonday(reservations.brazilDate(tomorrow)))
    tomorrow.setDate(tomorrow.getDate() + 1);
  const serviceDate = reservations.brazilDate(tomorrow);
  const key = `serviceCapacity/${serviceDate}_rodizio`;
  const h = harness({ [key]: { heldSeats: 70 } });
  const input = { ...sample, serviceDate, partySize: 2 };
  assert.equal((await h.create(input, false)).status, 409);
  assert.equal((await h.create(input, true)).status, 201);
  assert.equal(h.records.get(key).heldSeats, 72);
  const saved = [...h.records.entries()].find(([key]) =>
    key.startsWith('reservations/'),
  )[1];
  assert.equal(saved.bookingExceptions.capacityOverride, true);
  assert.equal(saved.createdBy, 'staff-test');
});

test('staff deadline exception does not open dates administratively closed', async () => {
  const today = reservations.brazilDate();
  const h = harness({ [`specialDates/${today}_almoco`]: { isOpen: false } });
  assert.equal(
    (
      await h.create({
        ...sample,
        service: 'almoco',
        serviceDate: today,
        arrivalTime: '11:00',
      })
    ).status,
    409,
  );
  assert.equal(h.events.length, 0);
});

test('lunch deadline remains enforced for customer but staff may override it', async () => {
  const today = reservations.brazilDate();
  const h = harness({ [`specialDates/${today}_almoco`]: { isOpen: true } });
  h.settings.minAdvanceHours = 48;
  const input = {
    ...sample,
    service: 'almoco',
    serviceDate: today,
    arrivalTime: '11:00',
    partySize: 2,
  };
  assert.equal((await h.create(input, false)).status, 400);
  assert.equal((await h.create(input)).status, 201);
  const saved = [...h.records.entries()].find(([key]) =>
    key.startsWith('reservations/'),
  )[1];
  assert.equal(saved.bookingExceptions.deadlineOverride, true);
});

test('full edit rejects a stale version instead of overwriting a colleague', async () => {
  const h = harness({
    'reservations/r1': {
      ...sample,
      updatedAt: { toDate: () => new Date('2026-10-20T13:00:00Z') },
    },
  });
  const response = await h.update({
    ...sample,
    updatedAt: '2026-10-20T12:00:00Z',
  });
  assert.equal(response.status, 409);
  assert.equal(h.events.length, 0);
  assert.equal(h.records.get('reservations/r1').status, 'pending_approval');
});
