import { NextResponse } from 'next/server';

import { getOperationalSettings } from '@/lib/domain/operational-settings';
import { exceptionFromSnapshot } from '@/lib/domain/special-dates';
import { getAdminDatabase } from '@/lib/firebase/admin';

export async function GET() {
  const database = getAdminDatabase();
  if (!database)
    return NextResponse.json(
      { error: 'Firebase não configurado.' },
      { status: 503 },
    );

  const [settings, specialDates] = await Promise.all([
    getOperationalSettings(database),
    database.collection('specialDates').limit(500).get(),
  ]);
  const exceptions = specialDates.docs
    .map((document) => exceptionFromSnapshot(document.id, document.data()))
    .filter((item) => item !== null);
  return NextResponse.json(
    { settings, exceptions },
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  );
}
