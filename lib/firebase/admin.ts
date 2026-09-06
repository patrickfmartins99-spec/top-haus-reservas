import 'server-only';

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const firebaseAdminCache = globalThis as typeof globalThis & {
  topHausAdminDatabase?: Firestore;
};

function hasAdminConfiguration() {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
  );
}

function getAdminApp() {
  if (!hasAdminConfiguration()) return null;

  return (
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    })
  );
}

export function getAdminDatabase() {
  const app = getAdminApp();
  if (!app) return null;
  if (firebaseAdminCache.topHausAdminDatabase)
    return firebaseAdminCache.topHausAdminDatabase;

  const database = getFirestore(app);
  // Netlify Functions are short-lived. REST avoids long-lived gRPC channels
  // hanging during a cold start or after the Firestore rejects a request.
  database.settings({ preferRest: true });
  firebaseAdminCache.topHausAdminDatabase = database;
  return database;
}

export function getAdminAuthentication() {
  const app = getAdminApp();
  return app ? getAuth(app) : null;
}
