import { cert, deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const [rawUsername, ...displayNameParts] = process.argv.slice(2);
const username = rawUsername?.trim().toLowerCase();
const displayName = displayNameParts.join(' ').trim();

if (!username || !/^[a-z0-9._-]{3,32}$/.test(username) || displayName.length < 2) {
  throw new Error('Informe um usuário válido e o nome completo do administrador.');
}

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const authentication = getAuth(app);
const database = getFirestore(app);

try {
  const expectedEmail = `${username}@staff.reservastophausnavega.firebaseapp.com`;
  let user;
  try {
    user = await authentication.getUserByEmail(expectedEmail);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
    user = await authentication.getUserByEmail(`${username}@reservastophausnavega.firebaseapp.com`);
  }
  await authentication.updateUser(user.uid, {
    email: expectedEmail,
    displayName,
    emailVerified: true,
    disabled: false,
  });
  await authentication.setCustomUserClaims(user.uid, { staff: true, admin: true });

  const batch = database.batch();
  batch.set(database.collection('staff').doc(user.uid), {
    username,
    displayName,
    role: 'admin',
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: 'bootstrap',
  }, { merge: true });
  batch.set(database.collection('auditLogs').doc(), {
    actorType: 'system',
    actorId: 'bootstrap',
    action: 'initial_admin_promoted',
    targetId: user.uid,
    changes: { username, role: 'admin' },
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  console.log(`Administrador inicial configurado para o usuário ${username}.`);
} finally {
  await deleteApp(app);
}
