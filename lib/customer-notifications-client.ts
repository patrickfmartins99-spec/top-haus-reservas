export type CustomerAccess = { id: string; token: string };
const storageKey = 'tophaus-reservation-access';
export function customerAccesses(): CustomerAccess[] {
  try { const value = JSON.parse(localStorage.getItem(storageKey) ?? '[]'); return Array.isArray(value) ? value.slice(-20) : []; }
  catch { return []; }
}
export function rememberReservation(id: string, token: string) {
  try { localStorage.setItem(storageKey, JSON.stringify([...customerAccesses().filter((item) => item.id !== id), { id, token }].slice(-20))); }
  catch { /* Reservation still succeeds if storage is unavailable. */ }
  window.dispatchEvent(new Event('tophaus-reservation-change'));
}
export async function notificationRequest(action: string, extra: Record<string, unknown> = {}) {
  const response = await fetch('/api/cliente/notificacoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, accesses: customerAccesses(), ...extra }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Não foi possível atualizar as notificações.');
  return data;
}
