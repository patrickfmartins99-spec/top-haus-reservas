import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldRefreshStaffPush } from '../lib/client/push-refresh.ts';

const day = 24 * 60 * 60_000;
const minute = 60_000;
const now = 2_000_000_000_000;

test('push verification is event-driven and at most daily while healthy', () => {
  assert.equal(shouldRefreshStaffPush(now, 0, 0, true), true);
  assert.equal(shouldRefreshStaffPush(now, now - day + minute, 0, true), false);
  assert.equal(shouldRefreshStaffPush(now, now - day, 0, true), true);
  assert.equal(shouldRefreshStaffPush(now, 0, 0, false), false);
});

test('failed checks back off for fifteen minutes without a timer', () => {
  assert.equal(shouldRefreshStaffPush(now, 0, now - 14 * minute, true), false);
  assert.equal(shouldRefreshStaffPush(now, 0, now - 15 * minute, true), true);
  assert.equal(shouldRefreshStaffPush(now, now + day, 0, true), true);
});
