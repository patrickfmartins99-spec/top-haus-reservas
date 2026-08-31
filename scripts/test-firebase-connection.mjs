import { randomUUID } from 'node:crypto';

import { cert, deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const required = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Variável obrigatória ausente: ${key}`);
  }
}

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const database = getFirestore(app);
const testReference = database.collection('_connectionTests').doc(randomUUID());

try {
  await testReference.set({ createdAt: new Date(), purpose: 'temporary-connection-test' });
  const snapshot = await testReference.get();
  if (!snapshot.exists) throw new Error('O registro temporário não pôde ser lido.');
  console.log('Conexão de leitura e gravação com o Firestore validada.');
} finally {
  await testReference.delete().catch(() => undefined);
  await deleteApp(app);
}
