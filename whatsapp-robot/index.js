require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const admin = require('firebase-admin');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { buildMessage, normalizeBrazilianPhone, positiveNumber } = require('./messages');

const ROBOT_VERSION = '1.0.0';
const ROBOT_ID = `${os.hostname()}-${process.pid}`;
const SEND_DELAY_MIN_MS = positiveNumber(process.env.SEND_DELAY_MIN_MS, 5000);
const SEND_DELAY_MAX_MS = Math.max(SEND_DELAY_MIN_MS, positiveNumber(process.env.SEND_DELAY_MAX_MS, 10000));
const POLL_INTERVAL_MS = positiveNumber(process.env.POLL_INTERVAL_MS, 2000);
const MAX_PENDING_AGE_HOURS = positiveNumber(process.env.MAX_PENDING_AGE_HOURS, 24);

function loadServiceAccount() {
  const configuredPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!configuredPath) {
    throw new Error('Defina FIREBASE_SERVICE_ACCOUNT_PATH no arquivo .env.');
  }

  const resolvedPath = path.resolve(configuredPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Arquivo da conta de serviço não encontrado: ${resolvedPath}`);
  }

  return JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(loadServiceAccount()),
  });
  console.log('✅ Firebase do sistema de reservas conectado com sucesso');
} catch (error) {
  console.error('❌ Não foi possível conectar ao Firebase:', error.message);
  process.exit(1);
}

const db = admin.firestore();
db.settings({ preferRest: true });
const queue = [];
const queuedIds = new Set();
let processing = false;
let pollingTimer = null;
let polling = false;

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: process.env.WHATSAPP_SESSION_NAME || 'top-haus-reservas',
    dataPath: path.join(__dirname, '.wwebjs_auth'),
  }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

client.on('qr', (qr) => {
  console.log('\n📱 Escaneie o QR Code abaixo com o WhatsApp do Top Haus:\n');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
  console.log('🔐 WhatsApp autenticado');
});

client.on('ready', () => {
  console.log('✅ Robô de reservas conectado e pronto');
  startQueuePolling();
});

client.on('loading_screen', (percent, message) => {
  console.log(`⏳ ${percent}% - ${message}`);
});

client.on('auth_failure', (message) => {
  console.error('❌ Falha de autenticação no WhatsApp:', message);
});

client.on('disconnected', (reason) => {
  console.error('❌ WhatsApp desconectado:', reason);
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
});

function timestampMilliseconds(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function startQueuePolling() {
  if (pollingTimer) return;
  console.log(`👀 Consultando novas mensagens a cada ${POLL_INTERVAL_MS / 1000} segundo(s)`);
  pollQueue();
  pollingTimer = setInterval(pollQueue, POLL_INTERVAL_MS);
}

async function pollQueue() {
  if (polling) return;
  polling = true;

  try {
    const snapshot = await db.collection('whatsappQueue')
      .where('status', '==', 'pending')
      .limit(100)
      .get();

    for (const document of snapshot.docs) {
      const data = document.data();
      const createdAt = timestampMilliseconds(data.createdAt);
      const ageHours = createdAt > 0 ? (Date.now() - createdAt) / 3600000 : 0;

      if (ageHours > MAX_PENDING_AGE_HOURS) {
        await document.ref.update({
          status: 'ignored',
          ignoredReason: `Mensagem pendente há mais de ${MAX_PENDING_AGE_HOURS} hora(s).`,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`ℹ️ Evento antigo ${document.id} marcado como ignorado.`);
        continue;
      }

      enqueueEvent(document.id, data, createdAt);
    }

    processQueue();
  } catch (error) {
    console.error('❌ Erro ao consultar o Firestore. Nova tentativa será feita automaticamente:', error.message);
  } finally {
    polling = false;
  }
}

function enqueueEvent(id, data, createdAt) {
  if (queuedIds.has(id)) return;
  queuedIds.add(id);
  queue.push({ id, data, createdAt });
  queue.sort((first, second) => first.createdAt - second.createdAt);
}

async function claimEvent(id) {
  const reference = db.collection('whatsappQueue').doc(id);
  let claimedData = null;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists || snapshot.data()?.status !== 'pending') return;

    claimedData = snapshot.data();
    transaction.update(reference, {
      status: 'processing',
      processingAt: admin.firestore.FieldValue.serverTimestamp(),
      processingBy: ROBOT_ID,
      robotVersion: ROBOT_VERSION,
      attempts: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return { reference, data: claimedData };
}

async function processQueue() {
  if (processing || queue.length === 0) return;
  processing = true;

  const queuedEvent = queue.shift();
  let claimed = null;

  try {
    claimed = await claimEvent(queuedEvent.id);
    if (!claimed.data) return;

    const message = buildMessage(claimed.data.eventType, claimed.data.payload || {});
    if (!message) {
      await claimed.reference.update({
        status: 'ignored',
        ignoredReason: 'A ação não exige mensagem ao cliente.',
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`ℹ️ Evento ${queuedEvent.id} não exige envio.`);
      return;
    }

    const destination = normalizeBrazilianPhone(claimed.data.recipientWhatsapp);
    if (!destination) throw new Error('WhatsApp do cliente inválido.');

    console.log(`⏳ Enviando ${claimed.data.eventType} para final ${destination.slice(-4)}...`);
    const contact = await client.getNumberId(destination);
    if (!contact) throw new Error(`Número final ${destination.slice(-4)} não encontrado no WhatsApp.`);

    await client.sendMessage(contact._serialized, message);
    await claimed.reference.update({
      status: 'sent',
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      error: admin.firestore.FieldValue.delete(),
    });
    console.log('✅ Mensagem enviada com sucesso');
  } catch (error) {
    console.error(`❌ Falha no evento ${queuedEvent.id}:`, error.message);
    if (claimed?.reference && claimed.data) {
      await claimed.reference.update({
        status: 'failed',
        error: String(error.message || error).slice(0, 500),
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch((updateError) => {
        console.error('❌ Também não foi possível registrar a falha no Firestore:', updateError.message);
      });
    }
  } finally {
    queuedIds.delete(queuedEvent.id);
    processing = false;
    if (queue.length > 0) {
      const delay = randomDelay();
      console.log(`⏱️ Próximo envio em ${Math.ceil(delay / 1000)} segundo(s)...`);
      setTimeout(processQueue, delay);
    }
  }
}

function randomDelay() {
  return Math.floor(Math.random() * (SEND_DELAY_MAX_MS - SEND_DELAY_MIN_MS + 1)) + SEND_DELAY_MIN_MS;
}

async function shutdown(signal) {
  console.log(`\n🛑 Encerrando o robô (${signal})...`);
  if (pollingTimer) clearInterval(pollingTimer);
  await client.destroy().catch(() => undefined);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('CTRL+C'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => console.error('❌ Promise não tratada:', error));
process.on('uncaughtException', (error) => console.error('❌ Exceção não tratada:', error));

console.log('🚀 Iniciando o robô de reservas Top Haus...');
client.initialize();
