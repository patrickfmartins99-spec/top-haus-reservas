import { NextResponse } from 'next/server';

import { getOperationalSettings } from '@/lib/domain/operational-settings';
import { getAdminDatabase } from '@/lib/firebase/admin';

export async function GET() {
  const database = getAdminDatabase();
  if (!database) return NextResponse.json({ error: 'Firebase não configurado.' }, { status: 503 });

  const settings = await getOperationalSettings(database);
  return NextResponse.json({ settings });
}
