import { NextResponse } from 'next/server';

import { getAdminAuthentication, getAdminDatabase } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

const HEALTH_CHECK_TIMEOUT_MS = 5_000;

async function withTimeout<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('FIREBASE_HEALTH_TIMEOUT')),
          HEALTH_CHECK_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isQuotaError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const message =
    typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
  return (
    candidate.code === 8 ||
    candidate.code === 'resource-exhausted' ||
    message.includes('quota exceeded')
  );
}

function hasClientFirebaseConfiguration() {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  );
}

function hasWhatsAppConfiguration() {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
  );
}

export async function GET() {
  const authentication = getAdminAuthentication();
  const database = getAdminDatabase();

  if (!hasClientFirebaseConfiguration() || !authentication || !database) {
    return NextResponse.json(
      {
        firebase: 'not_configured',
        whatsapp: hasWhatsAppConfiguration() ? 'configured' : 'not_configured',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    await withTimeout(
      Promise.all([
        authentication.listUsers(1),
        database.collection('operationalSettings').doc('default').get(),
      ]),
    );
    return NextResponse.json(
      {
        firebase: 'connected',
        whatsapp: hasWhatsAppConfiguration() ? 'configured' : 'not_configured',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        firebase: isQuotaError(error) ? 'quota_exceeded' : 'error',
        whatsapp: hasWhatsAppConfiguration() ? 'configured' : 'not_configured',
      },
      {
        status: isQuotaError(error) ? 429 : 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
