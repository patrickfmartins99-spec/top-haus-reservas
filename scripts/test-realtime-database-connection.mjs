import { randomUUID } from 'node:crypto';

import { cert, deleteApp, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const required = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'NEXT_PUBLIC_FIREBASE_DATABASE_URL',
];

for (const key of required) {
  if (!process.env[key]) throw new Error(`Variável obrigatória ausente: ${key}`);
}

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
});

const reference = getDatabase(app).ref(`_connectionTests/${randomUUID()}`);

try {
  await reference.set({ createdAt: Date.now(), purpose: 'temporary-connection-test' });
  const snapshot = await reference.get();
  if (!snapshot.exists()) throw new Error('O registro temporário não pôde ser lido.');
  console.log('Conexão de leitura e gravação com o Realtime Database validada.');
} finally {
  await reference.remove().catch(() => undefined);
  await deleteApp(app);
}
