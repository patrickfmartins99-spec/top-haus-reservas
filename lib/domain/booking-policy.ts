/** Only a server-verified staff identity may override customer booking limits. */
export function bookingExceptions({
  staff,
  deadlinePassed,
  heldSeats,
  partySize,
  capacity,
}: {
  staff: boolean;
  deadlinePassed: boolean;
  heldSeats: number;
  partySize: number;
  capacity: number;
}) {
  const capacityExceeded = heldSeats + partySize > capacity;
  return {
    allowed: staff || (!deadlinePassed && !capacityExceeded),
    deadlineOverride: staff && deadlinePassed,
    capacityOverride: staff && capacityExceeded,
    heldSeatsAfter: heldSeats + partySize,
    capacityLimit: capacity,
  };
}

export function canApplyQuickStatus(previous: string, next: string) {
  if (next === 'confirmed' || next === 'cancelled')
    return previous === 'pending_approval';
  return (
    (next === 'seated' || next === 'no_show') &&
    ['confirmed', 'presence_confirmed'].includes(previous)
  );
}
