'use client';
import { useEffect, useState } from 'react';
import { BellRing, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getFirebaseClient } from '@/lib/firebase/client';

async function pushRequest(action: string, subscription?: PushSubscription) {
  const user = getFirebaseClient()?.auth.currentUser;
  if (!user) throw new Error('Entre com seu usuário de colaborador.');
  const response = await fetch('/api/equipe/notificacoes', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify({ action, subscription: subscription?.toJSON() }) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error); return data;
}
async function registration() {
  await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  return Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Não foi possível preparar o aparelho. Atualize a página e tente novamente.')), 10_000))]);
}
export async function removeStaffPush() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) { try { await pushRequest('unsubscribe', sub); } finally { await sub.unsubscribe(); } }
}
export function StaffPushControls() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    const timer = setTimeout(() => setSupported(supported), 0);
    if (supported) void (async () => {
      try { const reg = await registration(); const sub = await reg.pushManager.getSubscription(); if (sub && Notification.permission === 'granted') { await pushRequest('subscribe', sub); if (active) setSubscribed(true); } }
      catch (error) { if (active) setMessage(error instanceof Error ? error.message : 'Não foi possível verificar o aparelho.'); }
    })();
    return () => { active = false; clearTimeout(timer); };
  }, []);
  async function toggle() {
    setBusy(true); setMessage('');
    try {
      if (subscribed) { await removeStaffPush(); setSubscribed(false); setMessage('Avisos no celular desativados.'); return; }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setMessage('Permita notificações nas configurações do navegador para ativar.'); return; }
      const { publicKey } = await pushRequest('config');
      const reg = await registration();
      const base64 = publicKey.replace(/-/g, '+').replace(/_/g, '/');
      const key = Uint8Array.from(atob(base64 + '='.repeat((4 - base64.length % 4) % 4)), (char) => char.charCodeAt(0));
      const sub = await reg.pushManager.getSubscription() ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await pushRequest('subscribe', sub); setSubscribed(true); setMessage('Aparelho inscrito. Use “Enviar teste” para conferir o recebimento.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível ativar.'); }
    finally { setBusy(false); }
  }
  async function test() {
    setBusy(true);
    try { const sub = await (await registration()).pushManager.getSubscription(); if (!sub) throw new Error('Ative as notificações primeiro.'); setMessage((await pushRequest('test', sub)).message); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Falha no teste.'); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-xl bg-[#f4e7d7] p-4 text-sm text-black"><p className="font-bold">Avisos no celular da equipe</p><p className="text-xs leading-5">No iPhone, adicione este painel à Tela de Início e abra pelo ícone (iOS 16.4+). No Android, abra no Chrome. Ao sair da conta, os avisos deste aparelho serão desativados.</p>{supported ? <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={toggle} className="bg-black text-white">{busy ? <LoaderCircle className="animate-spin"/> : <BellRing/>}{subscribed ? 'Desativar no celular' : 'Ativar no celular'}</Button>{subscribed && <Button size="sm" variant="outline" disabled={busy} onClick={test}>Enviar teste</Button>}</div> : <p className="text-xs font-semibold">Instale ou abra em um navegador compatível para ativar. O sino continua disponível.</p>}{message && <output className="block text-xs leading-5" aria-live="polite">{message}</output>}</section>;
}
