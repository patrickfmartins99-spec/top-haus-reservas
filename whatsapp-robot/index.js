require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const admin = require('firebase-admin');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { LoadUtils } = require('whatsapp-web.js/src/util/Injected/Utils');
const { createReadinessGate } = require('./whatsapp-readiness');
const { acquireInstanceLock, createShutdown } = require('./robot-lifecycle');
const {
  buildMessage,
  normalizeBrazilianPhone,
  positiveNumber,
} = require('./messages');

const ROBOT_VERSION = '2.1.0';
const CHECK_ONLY = process.argv.includes('--verificar-whatsapp');
let releaseInstance = async () => {};
let stopping = false;
let checkTimeout = null;
const ROBOT_ID = `${os.hostname()}-${process.pid}`;
const SEND_DELAY_MIN_MS = positiveNumber(process.env.SEND_DELAY_MIN_MS, 5000);
const SEND_DELAY_MAX_MS = Math.max(
  SEND_DELAY_MIN_MS,
  positiveNumber(process.env.SEND_DELAY_MAX_MS, 10000),
);
const POLL_INTERVAL_MS = positiveNumber(process.env.POLL_INTERVAL_MS, 2000);
const MAX_PENDING_AGE_HOURS = positiveNumber(
  process.env.MAX_PENDING_AGE_HOURS,
  24,
);

function loadServiceAccount() {
  const configuredPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!configuredPath) {
    throw new Error('Defina FIREBASE_SERVICE_ACCOUNT_PATH no arquivo .env.');
  }

  const resolvedPath = path.resolve(configuredPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Arquivo da conta de serviço não encontrado: ${resolvedPath}`,
    );
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
let whatsappReady = false;
let whatsappStateTimer = null;
let heartbeatTimer = null;
let dailyReviewTimer = null;
let lastDailyReviewDate = '';
let pendingCount = 0;
let failedCount = 0;
let firebaseConnected = true;

const robotStatusRef = db.collection('robotStatus').doc('reservas-whatsapp');

async function writeRobotStatus(fields = {}) {
  try {
    await robotStatusRef.set(
      {
        robotId: ROBOT_ID,
        version: ROBOT_VERSION,
        hostName: os.hostname(),
        processId: process.pid,
        status: whatsappReady ? 'connected' : stopping ? 'stopped' : 'starting',
        whatsappConnected: whatsappReady,
        firebaseConnected,
        pendingCount,
        failedCount,
        lastHeartbeatAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...fields,
      },
      { merge: true },
    );
    firebaseConnected = true;
  } catch (error) {
    firebaseConnected = false;
    console.warn(
      '⚠️ Não foi possível atualizar o estado do robô no painel:',
      error.message,
    );
  }
}

async function heartbeat() {
  if (stopping) return;
  try {
    const failures = await db
      .collection('whatsappQueue')
      .where('status', '==', 'failed')
      .limit(100)
      .get();
    failedCount = failures.size;
    firebaseConnected = true;
  } catch {
    firebaseConnected = false;
  }
  await writeRobotStatus();
}

function brazilClock() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

async function runDailyReviewIfDue() {
  if (stopping || CHECK_ONLY) return;
  const clock = brazilClock();
  const date = `${clock.year}-${clock.month}-${clock.day}`;
  if (Number(clock.hour) < 15 || lastDailyReviewDate === date) return;
  lastDailyReviewDate = date;
  console.log('🔎 Revisão diária das 15h concluída pelo robô de reservas.');
  await writeRobotStatus({
    lastDailyReviewAt: admin.firestore.FieldValue.serverTimestamp(),
    lastDailyReviewDate: date,
  });
}

const chromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const chromePath = chromeCandidates.find((candidate) =>
  fs.existsSync(candidate),
);

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: process.env.WHATSAPP_SESSION_NAME || 'top-haus-reservas-v2',
    dataPath: path.join(__dirname, '.sessao-whatsapp'),
    rmMaxRetries: 10,
  }),
  puppeteer: {
    headless: true,
    ...(chromePath ? { executablePath: chromePath } : {}),
    args: [
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  },
});

const checkSendReadiness = createReadinessGate({
  client,
  loadUtils: LoadUtils,
  warn: (message) => console.warn(`⚠️ ${message}`),
});

function markWhatsappReady(source) {
  if (whatsappReady || stopping) return;
  whatsappReady = true;
  console.log(`✅ Robô de reservas conectado e pronto (${source})`);
  void writeRobotStatus({ status: 'connected', whatsappConnected: true });
  if (CHECK_ONLY) {
    console.log('✅ VERIFICAÇÃO CONCLUÍDA — nenhuma mensagem enviada.');
    shutdown('verificação concluída');
    return;
  }
  startQueuePolling();
}

async function checkWhatsappState() {
  if (stopping) return;
  if (await checkSendReadiness()) {
    markWhatsappReady('funções de envio verificadas');
  } else {
    if (whatsappReady)
      console.warn(
        '⏸️ Envio pausado: aguardando inicialização completa do WhatsApp.',
      );
    whatsappReady = false;
  }
}

function startWhatsappStateMonitor() {
  if (whatsappStateTimer) return;
  whatsappStateTimer = setInterval(checkWhatsappState, 5000);
}

client.on('qr', (qr) => {
  console.log('\n📱 Escaneie o QR Code abaixo com o WhatsApp do Top Haus:\n');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
  console.log('🔐 WhatsApp autenticado');
});

client.on('ready', () => {
  checkWhatsappState();
});

client.on('loading_screen', (percent, message) => {
  console.log(`⏳ ${percent}% - ${message}`);
  if (Number(percent) >= 99) setTimeout(checkWhatsappState, 2000);
});

client.on('change_state', (state) => {
  console.log('📡 Estado do WhatsApp:', state);
  if (state === 'CONNECTED') checkWhatsappState();
});

client.on('auth_failure', (message) => {
  console.error('❌ Falha de autenticação no WhatsApp:', message);
  void writeRobotStatus({
    status: 'auth_failure',
    whatsappConnected: false,
    lastError: String(message).slice(0, 300),
  });
});

client.on('disconnected', (reason) => {
  console.error('❌ WhatsApp desconectado:', reason);
  whatsappReady = false;
  void writeRobotStatus({
    status: 'disconnected',
    whatsappConnected: false,
    lastError: String(reason).slice(0, 300),
  });
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
  if (pollingTimer || stopping || CHECK_ONLY) return;
  console.log(
    `👀 Consultando novas mensagens a cada ${POLL_INTERVAL_MS / 1000} segundo(s)`,
  );
  pollQueue();
  pollingTimer = setInterval(pollQueue, POLL_INTERVAL_MS);
}

async function pollQueue() {
  if (polling || stopping || CHECK_ONLY) return;
  polling = true;

  try {
    if (!(await checkSendReadiness())) return;
    const snapshot = await db
      .collection('whatsappQueue')
      .where('status', 'in', ['pending', 'manual_pending'])
      .limit(100)
      .get();
    pendingCount = snapshot.size;
    firebaseConnected = true;

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
    firebaseConnected = false;
    console.error(
      '❌ Erro ao consultar o Firestore. Nova tentativa será feita automaticamente:',
      error.message,
    );
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
    if (
      !snapshot.exists ||
      !['pending', 'manual_pending'].includes(snapshot.data()?.status)
    )
      return;

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
  if (processing || queue.length === 0 || stopping || CHECK_ONLY) return;
  processing = true;
  if (!(await checkSendReadiness())) {
    processing = false;
    return;
  }

  const queuedEvent = queue.shift();
  let claimed = null;

  try {
    claimed = await claimEvent(queuedEvent.id);
    if (!claimed.data) return;

    const message = buildMessage(
      claimed.data.eventType,
      claimed.data.payload || {},
    );
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

    console.log(
      `⏳ Enviando ${claimed.data.eventType} para final ${destination.slice(-4)}...`,
    );
    const contact = await client.getNumberId(destination);
    if (!contact)
      throw new Error(
        `Número final ${destination.slice(-4)} não encontrado no WhatsApp.`,
      );

    if (!(await checkSendReadiness())) {
      const error = new Error(
        'WhatsApp ainda não está pronto; mensagem mantida pendente.',
      );
      error.code = 'WHATSAPP_NOT_READY';
      throw error;
    }
    await client.sendMessage(contact._serialized, message);
    await claimed.reference.update({
      status: 'sent',
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      error: admin.firestore.FieldValue.delete(),
    });
    pendingCount = Math.max(0, pendingCount - 1);
    console.log('✅ Mensagem enviada com sucesso');
    await writeRobotStatus({
      lastMessageSentAt: admin.firestore.FieldValue.serverTimestamp(),
      lastEventProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastError: admin.firestore.FieldValue.delete(),
    });
  } catch (error) {
    console.error(`❌ Falha no evento ${queuedEvent.id}:`, error.message);
    if (claimed?.reference && claimed.data) {
      await claimed.reference
        .update({
          status: error.code === 'WHATSAPP_NOT_READY' ? 'pending' : 'failed',
          error: String(error.message || error).slice(0, 500),
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        .catch((updateError) => {
          console.error(
            '❌ Também não foi possível registrar a falha no Firestore:',
            updateError.message,
          );
        });
      failedCount += error.code === 'WHATSAPP_NOT_READY' ? 0 : 1;
      await writeRobotStatus({
        status:
          error.code === 'WHATSAPP_NOT_READY'
            ? 'waiting_whatsapp'
            : 'connected_with_errors',
        lastError: String(error.message || error).slice(0, 300),
        lastEventProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  } finally {
    queuedIds.delete(queuedEvent.id);
    processing = false;
    if (queue.length > 0) {
      const delay = randomDelay();
      console.log(
        `⏱️ Próximo envio em ${Math.ceil(delay / 1000)} segundo(s)...`,
      );
      setTimeout(processQueue, delay);
    }
  }
}

function randomDelay() {
  return (
    Math.floor(Math.random() * (SEND_DELAY_MAX_MS - SEND_DELAY_MIN_MS + 1)) +
    SEND_DELAY_MIN_MS
  );
}

const shutdown = createShutdown({
  client,
  stopWork: () => {
    stopping = true;
    whatsappReady = false;
    clearInterval(pollingTimer);
    clearInterval(whatsappStateTimer);
    clearInterval(heartbeatTimer);
    clearInterval(dailyReviewTimer);
    clearTimeout(checkTimeout);
    void writeRobotStatus({
      status: 'stopped',
      whatsappConnected: false,
      stoppedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  },
  release: () => releaseInstance(),
});

process.on('SIGINT', () => shutdown('CTRL+C'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGHUP', () => shutdown('janela do CMD fechada'));
process.on('unhandledRejection', (error) =>
  console.error('❌ Promise não tratada:', error),
);
process.on('uncaughtException', (error) =>
  console.error('❌ Exceção não tratada:', error),
);

async function startRobot() {
  releaseInstance = await acquireInstanceLock(
    path.join(__dirname, '.sessao-whatsapp'),
  );
  console.log('🚀 Iniciando o robô de reservas Top Haus...');
  console.log(
    '🖥️ Puppeteer em modo oculto — nenhuma janela de navegador será aberta.',
  );
  console.log(
    chromePath
      ? `🌐 Chrome encontrado: ${chromePath}`
      : '🌐 Usando o navegador fornecido pelo pacote',
  );

  await db.collection('whatsappQueue').limit(1).get();
  console.log('✅ Leitura do Firestore confirmada');

  await writeRobotStatus({
    status: 'starting',
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  heartbeatTimer = setInterval(heartbeat, 60_000);
  dailyReviewTimer = setInterval(runDailyReviewIfDue, 60_000);
  await runDailyReviewIfDue();

  startWhatsappStateMonitor();
  if (CHECK_ONLY)
    checkTimeout = setTimeout(
      () => shutdown('verificação não concluiu em 60 segundos', 1),
      60000,
    );
  await client.initialize();
}

startRobot().catch((error) => {
  console.error('❌ Não foi possível iniciar o robô:', error);
  shutdown('falha na inicialização', 1);
});
