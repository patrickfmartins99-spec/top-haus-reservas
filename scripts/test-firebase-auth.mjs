import { cert, deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const required = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Variável obrigatória ausente: ${key}`);
}

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

try {
  await getAuth(app).listUsers(1);
  console.log('Acesso administrativo ao Firebase Authentication validado.');
} finally {
  await deleteApp(app);
}
