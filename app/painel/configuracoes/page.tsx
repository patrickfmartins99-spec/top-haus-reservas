'use client';
import { MyAccount } from '@/components/my-account';
import { OperationalSettingsPanel } from '@/components/operational-settings';
import { useStaffSession } from '@/components/staff-session';
export default function SettingsPage() {
  const { profile } = useStaffSession();
  return (
    <div className="space-y-6 p-4 sm:p-8">
      <MyAccount />
      {profile?.role === 'admin' && <OperationalSettingsPanel />}
    </div>
  );
}
