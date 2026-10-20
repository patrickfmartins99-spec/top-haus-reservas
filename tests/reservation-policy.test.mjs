import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bookingExceptions,
  canApplyQuickStatus,
} from '../lib/domain/booking-policy.ts';
import { canBook, isReservationInput } from '../lib/domain/reservations.ts';

test('customer cutoff: dinner until 18h Brasília, lunch retains 24 hours', () => {
  const dinner = {
    service: 'rodizio',
    serviceDate: '2026-10-20',
    arrivalTime: '19:00',
  };
  assert.equal(
    canBook(dinner, 24, Date.parse('2026-10-20T18:00:00-03:00')),
    true,
  );
  assert.equal(
    canBook(dinner, 24, Date.parse('2026-10-20T18:00:01-03:00')),
    false,
  );
  const lunch = { ...dinner, service: 'almoco', arrivalTime: '11:30' };
  assert.equal(
    canBook(lunch, 24, Date.parse('2026-10-19T11:30:00-03:00')),
    true,
  );
  assert.equal(
    canBook(lunch, 24, Date.parse('2026-10-19T11:30:01-03:00')),
    false,
  );
});

test('only verified staff can exceed deadline or capacity, while keeping actual seats', () => {
  for (const deadlinePassed of [true, false]) {
    for (const heldSeats of [60, 70]) {
      const input = { deadlinePassed, heldSeats, partySize: 5, capacity: 70 };
      const customer = bookingExceptions({ ...input, staff: false });
      const staff = bookingExceptions({ ...input, staff: true });
      assert.equal(customer.allowed, !deadlinePassed && heldSeats <= 65);
      assert.equal(customer.deadlineOverride, false);
      assert.equal(customer.capacityOverride, false);
      assert.equal(staff.allowed, true);
      assert.equal(staff.deadlineOverride, deadlinePassed);
      assert.equal(staff.capacityOverride, heldSeats > 65);
      assert.equal(staff.heldSeatsAfter, heldSeats + 5);
    }
  }
});

test('approval/refusal applies only to pending; arrival/no-show only to approved', () => {
  for (const previous of [
    'pending_approval',
    'confirmed',
    'presence_confirmed',
    'cancelled',
    'seated',
    'no_show',
    'completed',
  ]) {
    for (const next of ['confirmed', 'cancelled'])
      assert.equal(
        canApplyQuickStatus(previous, next),
        previous === 'pending_approval',
      );
    for (const next of ['seated', 'no_show'])
      assert.equal(
        canApplyQuickStatus(previous, next),
        ['confirmed', 'presence_confirmed'].includes(previous),
      );
  }
});

test('staff exception does not remove basic input validation', () => {
  const input = {
    service: 'rodizio',
    serviceDate: '2026-10-20',
    arrivalTime: '19:00',
    partySize: 2,
    customerName: 'Teste local',
    whatsapp: '51900000000',
  };
  assert.equal(isReservationInput(input), true);
  for (const patch of [
    { partySize: 0 },
    { partySize: 2.5 },
    { serviceDate: '2026-02-30' },
    { arrivalTime: '25:00' },
    { whatsapp: '' },
  ])
    assert.equal(isReservationInput({ ...input, ...patch }), false);
});
