'use client';
import { createContext, useContext } from 'react';
export type StaffProfile = {
  uid: string;
  displayName: string;
  username: string;
  role: 'admin' | 'staff';
  photo: string;
};
export const StaffSession = createContext<{
  profile: StaffProfile | null;
  refresh: () => Promise<void>;
}>({ profile: null, refresh: async () => {} });
export const useStaffSession = () => useContext(StaffSession);
