import { cert, deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const [reservationId, serviceKey] = process.argv.slice(2);
if (!reservationId || !serviceKey) throw new Error('Informe a reserva e o serviço de teste.');

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const database = getFirestore(app);
const reservationReference = database.collection('reservations').doc(reservationId);
const capacityReference = database.collection('serviceCapacity').doc(serviceKey);

try {
  const [reservationSnapshot, capacitySnapshot, auditSnapshot] = await Promise.all([
    reservationReference.get(),
    capacityReference.get(),
    database.collection('auditLogs').where('reservationId', '==', reservationId).get(),
  ]);

  if (!reservationSnapshot.exists) throw new Error('Reserva de teste não encontrada.');
  const partySize = Number(reservationSnapshot.data()?.partySize ?? 0);
  const currentHeldSeats = Number(capacitySnapshot.data()?.heldSeats ?? 0);
  const batch = database.batch();

  batch.delete(reservationReference);
  for (const auditDocument of auditSnapshot.docs) batch.delete(auditDocument.ref);

  const nextHeldSeats = Math.max(0, currentHeldSeats - partySize);
  if (nextHeldSeats === 0) batch.delete(capacityReference);
  else batch.update(capacityReference, { heldSeats: nextHeldSeats });

  await batch.commit();
  console.log('Reserva, auditoria e capacidade temporárias removidas.');
} finally {
  await deleteApp(app);
}
