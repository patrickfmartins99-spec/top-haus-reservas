'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { CheckCircle2, Clock3, LoaderCircle, MessageCircle, Save, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DEFAULT_OPERATIONAL_SETTINGS, type OperationalSettings } from '@/lib/domain/operational-settings';
import { getFirebaseClient } from '@/lib/firebase/client';

export function OperationalSettingsPanel() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<OperationalSettings>(DEFAULT_OPERATIONAL_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const firebase = getFirebaseClient();
    if (!firebase) {
      const timeout = window.setTimeout(() => { setError('Firebase não configurado.'); setLoading(false); }, 0);
      return () => window.clearTimeout(timeout);
    }
    return onAuthStateChanged(firebase.auth, async (user) => {
      if (!user) return;
      setCurrentUser(user);
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/configuracoes', { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Não foi possível carregar as configurações.');
        setSettings(data.settings);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'Não foi possível carregar as configurações.');
      } finally {
        setLoading(false);
      }
    });
  }, []);

  function setNumber(key: keyof OperationalSettings, value: string) {
    setSettings((current) => ({ ...current, [key]: Number(value) }));
  }

  async function saveSettings(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUser) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/configuracoes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(settings),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível salvar as configurações.');
      setSettings(data.settings);
      setSuccess('Configurações salvas no Firebase e aplicadas às próximas operações.');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Não foi possível salvar as configurações.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="grid min-h-[55vh] place-items-center"><p className="flex items-center gap-2 text-sm text-black/65"><LoaderCircle className="size-4 animate-spin" /> Carregando configurações...</p></div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-5 sm:p-8">
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-haus-terracotta">Administração</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em]">Configurações</h1><p className="mt-1 text-sm text-black/65">Regras reais usadas nas reservas e no atendimento.</p></div>
      {success ? <output className="flex items-center gap-2 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"><CheckCircle2 className="size-5" /> {success}</output> : null}
      {error ? <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert">{error}</p> : null}
      <form onSubmit={saveSettings} className="space-y-5">
        <Card className="bg-white ring-black/7"><CardHeader className="border-b border-black/7"><CardTitle className="flex items-center gap-2"><Clock3 className="size-5 text-haus-terracotta" /> Horários e antecedência</CardTitle></CardHeader><CardContent className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="lunch-limit">Limite de chegada no almoço</Label><Input id="lunch-limit" type="time" value={settings.lunchArrivalLimit} onChange={(event) => setSettings({ ...settings, lunchArrivalLimit: event.target.value })} required /></div><div className="space-y-2"><Label htmlFor="dinner-limit">Limite de chegada no rodízio</Label><Input id="dinner-limit" type="time" value={settings.dinnerArrivalLimit} onChange={(event) => setSettings({ ...settings, dinnerArrivalLimit: event.target.value })} required /></div><div className="space-y-2"><Label htmlFor="min-hours">Antecedência do almoço (horas)</Label><Input id="min-hours" type="number" min={1} max={168} value={settings.minAdvanceHours} onChange={(event) => setNumber('minAdvanceHours', event.target.value)} required /></div><div className="space-y-2"><p className="mb-2 text-sm font-semibold">Rodízio: reservas até as 18h do dia da visita. Cancelamento pelo cliente: até 24h antes.</p><Label htmlFor="max-months">Calendário aberto (meses)</Label><Input id="max-months" type="number" min={1} max={24} value={settings.maxBookingMonths} onChange={(event) => setNumber('maxBookingMonths', event.target.value)} required /></div></CardContent></Card>
        <Card className="bg-white ring-black/7"><CardHeader className="border-b border-black/7"><CardTitle className="flex items-center gap-2"><Users className="size-5 text-haus-terracotta" /> Capacidade e aprovação</CardTitle></CardHeader><CardContent className="grid gap-5 sm:grid-cols-3"><div className="space-y-2"><Label htmlFor="capacity">Lugares por serviço</Label><Input id="capacity" type="number" min={1} max={500} value={settings.capacityPerService} onChange={(event) => setNumber('capacityPerService', event.target.value)} required /></div><div className="space-y-2"><Label htmlFor="automatic">Aprovação automática até</Label><Input id="automatic" type="number" min={1} max={200} value={settings.autoApprovalLimit} onChange={(event) => setNumber('autoApprovalLimit', event.target.value)} required /></div><div className="space-y-2"><Label htmlFor="delay">Tolerância de atraso (min)</Label><Input id="delay" type="number" min={0} max={120} value={settings.lateToleranceMinutes} onChange={(event) => setNumber('lateToleranceMinutes', event.target.value)} required /></div></CardContent></Card>
        <Card className="bg-white ring-black/7"><CardHeader className="border-b border-black/7"><CardTitle className="flex items-center gap-2"><MessageCircle className="size-5 text-haus-terracotta" /> WhatsApp assistido</CardTitle></CardHeader><CardContent className="grid gap-5 sm:grid-cols-[1fr_1.3fr]"><div className="space-y-2"><Label htmlFor="restaurant-whatsapp">Número oficial do restaurante</Label><Input id="restaurant-whatsapp" value={settings.restaurantWhatsapp} onChange={(event) => setSettings({ ...settings, restaurantWhatsapp: event.target.value })} inputMode="tel" placeholder="(47) 99999-9999" /><p className="text-xs text-black/60">Usado pelo cliente quando uma solicitação precisa de atendimento manual.</p></div><div className="rounded-xl bg-[#f4e7d7] p-4 text-sm leading-6 text-black/75"><strong>Modo atual:</strong> o sistema monta a mensagem e abre a conversa no WhatsApp Business. O colaborador confere e envia. Isso dispensa API oficial e não conecta sessões não autorizadas.</div></CardContent></Card>
        <div className="flex justify-end"><Button type="submit" disabled={saving} className="bg-haus-terracotta text-white hover:bg-haus-terracotta/90">{saving ? <LoaderCircle className="animate-spin" /> : <Save />} Salvar configurações</Button></div>
      </form>
    </div>
  );
}
