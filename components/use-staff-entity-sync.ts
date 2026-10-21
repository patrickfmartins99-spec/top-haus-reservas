'use client';

import { useEffect, useRef } from 'react';
import {
  subscribeStaffEvents,
  type StaffEntityEvent,
} from '@/lib/client/staff-events';

/** Coalesces changes to one entity; never reloads the entire list on a timer. */
export function useStaffEntitySync(options: {
  scope: string;
  ready: boolean;
  accepts: (event: StaffEntityEvent) => boolean;
  load: (event: StaffEntityEvent) => Promise<() => void>;
  onError: () => void;
}) {
  const latest = useRef(options);
  const wake = useRef<() => void>(() => {});
  useEffect(() => {
    latest.current = options;
    wake.current();
  });
  useEffect(() => {
    let active = true;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = new Map<string, StaffEntityEvent>();

    const flush = async () => {
      timer = undefined;
      if (!active || running || !latest.current.ready || document.hidden)
        return;
      running = true;
      while (
        active &&
        pending.size &&
        latest.current.ready &&
        !document.hidden
      ) {
        const [key, event] = pending.entries().next().value!;
        pending.delete(key);
        if (!latest.current.accepts(event)) continue;
        try {
          const apply = await latest.current.load(event);
          // A newer event is queued: don't briefly restore an older record.
          if (active && !pending.has(key)) {
            if (latest.current.ready && !document.hidden) apply();
            else pending.set(key, event);
          }
        } catch {
          if (active) latest.current.onError();
          // Do not retry repeatedly when Firebase is unavailable.
        }
      }
      running = false;
    };
    const schedule = () => {
      if (
        !active ||
        running ||
        timer ||
        !pending.size ||
        !latest.current.ready ||
        document.hidden
      )
        return;
      timer = setTimeout(() => {
        void flush();
      }, 300);
    };
    wake.current = schedule;
    const unsubscribe = subscribeStaffEvents((event) => {
      if (!latest.current.accepts(event)) return;
      if (pending.size >= 100) {
        pending.clear();
        latest.current.onError();
        return;
      }
      pending.set(`${event.entityType}:${event.entityId}`, event);
      schedule();
    });
    document.addEventListener('visibilitychange', schedule);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      pending.clear();
      unsubscribe();
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [options.scope]);
}
