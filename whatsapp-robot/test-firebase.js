require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const { cert, deleteApp, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

async function main() {
  const configuredPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!configuredPath) throw new Error('Defina FIREBASE_SERVICE_ACCOUNT_PATH no arquivo .env.');

  const resolvedPath = path.resolve(configuredPath);
  const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  const app = initializeApp({ credential: cert(serviceAccount) }, `firebase-test-${Date.now()}`);

  try {
    await getFirestore(app).collection('whatsappQueue').limit(1).get();
    console.log('✅ Firestore acessível com a conta de serviço configurada.');
  } finally {
    await deleteApp(app);
  }
}

main().catch((error) => {
  console.error('❌ Falha ao acessar o Firestore:', error.message);
  process.exitCode = 1;
});
