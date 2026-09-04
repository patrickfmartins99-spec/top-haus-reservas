import 'server-only';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  CANCELLATION_HOURS,
  reservationInstant,
} from '@/lib/domain/reservations';
import {
  outcomeReason,
  RESERVATION_CANCELLATION_REASONS,
} from '@/lib/domain/service-outcomes';
import { enqueueReservationEvent } from '@/lib/firebase/reservation-notifications';

// Exclusão lógica: remove da operação, mas mantém a trilha de auditoria.
export async function deleteReservation(
  database: Firestore,
  id: string,
  actor: {
    type: 'staff' | 'customer';
    id: string | null;
    name?: string;
    whatsapp?: string;
    reason?: string;
    note?: string;
  },
) {
  const outcome = outcomeReason(
    actor.type === 'customer' ? 'customer_request' : actor.reason,
    RESERVATION_CANCELLATION_REASONS,
    actor.note,
  );
  const ref = database.collection('reservations').doc(id);
  await database.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new Error('NOT_FOUND');
    const data = snapshot.data()!;
    if (actor.type === 'customer' && data.whatsapp !== actor.whatsapp)
      throw new Error('NOT_FOUND');
    if (data.deletedAt) return;
    if (actor.type === 'customer') {
      if (
        ['seated', 'completed', 'no_show'].includes(data.status) ||
        reservationInstant({
          serviceDate: data.serviceDate,
          arrivalTime: data.arrivalTime,
        }).getTime() -
          Date.now() <
          CANCELLATION_HOURS * 3_600_000
      )
        throw new Error('DEADLINE');
    }
    const capacityRef = database
      .collection('serviceCapacity')
      .doc(`${data.serviceDate}_${data.service}`);
    const capacity = await tx.get(capacityRef);
    const holdsSeats = [
      'pending_approval',
      'confirmed',
      'presence_confirmed',
      'seated',
    ].includes(data.status);
    if (holdsSeats)
      tx.set(
        capacityRef,
        {
          heldSeats: Math.max(
            0,
            Number(capacity.data()?.heldSeats ?? 0) - Number(data.partySize),
          ),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    tx.update(ref, {
      status: 'cancelled',
      deletedAt: FieldValue.serverTimestamp(),
      deletedBy: actor.id ?? 'customer',
      cancelledAt: FieldValue.serverTimestamp(),
      cancelledBy: actor.id ?? 'customer',
      cancellationActorType: actor.type,
      cancellationReason: outcome.reason,
      cancellationReasonLabel: outcome.reasonLabel,
      cancellationNote: outcome.note,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(database.collection('auditLogs').doc(), {
      reservationId: id,
      action: 'reservation_cancelled',
      actorType: actor.type,
      actorId: actor.id,
      fromStatus: data.status,
      toStatus: 'cancelled',
      changes: {
        customerName: data.customerName,
        partySize: data.partySize,
        serviceDate: data.serviceDate,
        service: data.service,
        tableLabel: data.tableLabel ?? '',
        reason: outcome.reason,
        reasonLabel: outcome.reasonLabel,
        note: outcome.note,
      },
      createdAt: FieldValue.serverTimestamp(),
    });
    enqueueReservationEvent(database, tx, {
      eventType: 'reservation_cancelled',
      entityType: 'reservation',
      entityId: id,
      whatsapp: data.whatsapp,
      payload: {
        customerName: data.customerName,
        serviceDate: data.serviceDate,
        arrivalTime: data.arrivalTime,
        partySize: data.partySize,
        service: data.service,
        reservationCode: id,
        deleted: true,
      },
      staffNotification: {
        actorType: actor.type,
        actorName: actor.name,
      },
    });
  });
}
