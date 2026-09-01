import { NextResponse } from 'next/server';

import { getAdminAuthentication, getAdminDatabase } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

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
    await Promise.all([authentication.listUsers(1), database.listCollections()]);
    return NextResponse.json(
      {
        firebase: 'connected',
        whatsapp: hasWhatsAppConfiguration() ? 'configured' : 'not_configured',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      {
        firebase: 'error',
        whatsapp: hasWhatsAppConfiguration() ? 'configured' : 'not_configured',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
