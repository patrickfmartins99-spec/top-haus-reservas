import assert from 'node:assert/strict';
import test from 'node:test';
import {
  writeStaffCache,
  readStaffCache,
  clearAllStaffCache,
  isAccessDenied,
} from '../lib/offline/staff-cache.ts';
import {
  callHoldState,
  waitDurationMilliseconds,
} from '../lib/domain/waitlist-time.ts';

test('countdown expires exactly at three minutes without changing status', () => {
  const entry = {
    status: 'called',
    enteredAt: '2026-10-20T22:00:00Z',
    calledAt: '2026-10-20T22:15:00Z',
  };
  const start = Date.parse(entry.calledAt);
  assert.deepEqual(callHoldState(entry, start), {
    remaining: 180000,
    expired: false,
  });
  assert.deepEqual(callHoldState(entry, start + 179999), {
    remaining: 1,
    expired: false,
  });
  assert.deepEqual(callHoldState(entry, start + 180000), {
    remaining: 0,
    expired: true,
  });
  assert.deepEqual(callHoldState(entry, start - 5000), {
    remaining: 180000,
    expired: false,
  });
  assert.equal(waitDurationMilliseconds(entry, start + 300000), 900000);
  assert.equal(entry.status, 'called');
  assert.equal(callHoldState({ ...entry, calledAt: null }, start), null);
});

test('cache preserves same-user fallback, clears on user change/logout and rejects future dates', () => {
  const storage = new Map();
  const previous = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  };
  try {
    writeStaffCache('profile', { uid: 'staff-a' });
    writeStaffCache('waitlist', [{ id: 'q1' }]);
    writeStaffCache('profile', { uid: 'staff-a' });
    assert.equal(readStaffCache('waitlist').value[0].id, 'q1');
    writeStaffCache('profile', { uid: 'staff-b' });
    assert.equal(readStaffCache('waitlist'), null);
    writeStaffCache('reservations', []);
    clearAllStaffCache();
    assert.equal(storage.size, 0);
    storage.set(
      'tophaus.staff.cache.v1.waitlist',
      JSON.stringify({
        savedAt: new Date(Date.now() + 3600000).toISOString(),
        value: [],
      }),
    );
    assert.equal(readStaffCache('waitlist'), null);
    storage.set(
      'tophaus.staff.cache.v1.waitlist',
      JSON.stringify({
        savedAt: new Date(Date.now() - 19 * 3600000).toISOString(),
        value: [],
      }),
    );
    assert.equal(readStaffCache('waitlist'), null);
  } finally {
    globalThis.window = previous;
  }
});

test('denied or revoked access is not treated as temporary offline failure', () => {
  assert.equal(isAccessDenied({ status: 403 }), true);
  assert.equal(isAccessDenied({ code: 'auth/user-disabled' }), true);
  assert.equal(isAccessDenied({ status: 503 }), false);
  assert.equal(isAccessDenied(new Error('network')), false);
});
