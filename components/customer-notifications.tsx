'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { MessageText } from '@/components/message-text';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { customerAccesses, notificationRequest } from '@/lib/customer-notifications-client';

type Item = { id: string; reservationId: string; title: string; body: string; createdAt: string };
export function CustomerNotifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const refresh = useCallback(async () => {
    if (!customerAccesses().length) return;
    try { setItems((await notificationRequest('list')).items); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível atualizar o sino.'); }
  }, []);
  useEffect(() => {
    const init = window.setTimeout(() => {
      try { const value = JSON.parse(localStorage.getItem('tophaus-notifications-seen') ?? '[]'); setSeen(Array.isArray(value) ? value : []); } catch { /* private mode */ }
      void refresh();
    }, 0);
    const update = () => { void refresh(); };
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 30_000);
    window.addEventListener('tophaus-reservation-change', update);
    window.addEventListener('focus', update);
    return () => { clearTimeout(init); clearInterval(timer); window.removeEventListener('tophaus-reservation-change', update); window.removeEventListener('focus', update); };
  }, [refresh]);

  function markRead() {
    const ids = items.map((item) => item.id); setSeen(ids);
    try { localStorage.setItem('tophaus-notifications-seen', JSON.stringify(ids)); } catch { /* private mode */ }
  }
  const unread = items.filter((item) => !seen.includes(item.id)).length;
  return <>
    <button type="button" onClick={() => { setOpen(true); void refresh(); }} aria-label={`Notificações: ${unread} não lidas`} className="relative inline-flex items-center gap-2 rounded-full border border-current/25 px-3 py-2 text-sm font-semibold"><Bell className="size-5" /><span className="hidden sm:inline">Notificações</span>{unread > 0 && <span className="absolute -right-1 -top-2 rounded-full bg-[#8c4b28] px-1.5 text-xs text-white">{unread}</span>}</button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto bg-white text-black sm:max-w-xl"><DialogHeader><DialogTitle>Suas notificações</DialogTitle><DialogDescription className="text-black/70">Atualizações das reservas feitas ou consultadas neste aparelho.</DialogDescription></DialogHeader>
      {message && <output className="block text-sm text-black/80">{message}</output>}
      {items.length > 0 && <Button variant="outline" onClick={markRead}>Marcar todas como lidas</Button>}
      {!items.length && <p className="py-5 text-sm text-black/70">As atualizações aparecerão aqui depois que você fizer ou consultar uma reserva neste aparelho.</p>}
      {items.map((item) => <article key={item.id} className={`rounded-xl border p-4 ${seen.includes(item.id) ? 'border-black/15' : 'border-[#8c4b28] bg-[#fffaf5]'}`}><h3 className="font-bold">{item.title}</h3><p className="mt-1 text-xs text-black/65">{item.createdAt && new Date(item.createdAt).toLocaleString('pt-BR')}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-6"><MessageText text={item.body}/></p><Link onClick={() => setOpen(false)} href={`/minha-reserva?codigo=${encodeURIComponent(item.reservationId)}`} className="mt-3 inline-block text-sm font-bold underline">Consultar reserva</Link></article>)}
    </DialogContent></Dialog>
  </>;
}
