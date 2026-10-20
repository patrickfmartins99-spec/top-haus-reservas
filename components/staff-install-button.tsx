'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

type InstallPrompt = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function StaffInstallButton() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(true);
  const [help, setHelp] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)');
    const update = () =>
      setInstalled(
        standalone.matches ||
          Boolean(
            (navigator as Navigator & { standalone?: boolean }).standalone,
          ),
      );
    update();
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    standalone.addEventListener('change', update);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      standalone.removeEventListener('change', update);
    };
  }, []);
  if (installed) return null;

  async function install() {
    setError('');
    if (!prompt) {
      setHelp((value) => !value);
      return;
    }
    try {
      await prompt.prompt();
      await prompt.userChoice;
      setPrompt(null);
    } catch {
      setError(
        'Abra o menu do navegador e escolha a opção de instalar ou adicionar à tela inicial.',
      );
    }
  }

  return (
    <div className="mt-5 border-t border-black/10 pt-5">
      <Button
        type="button"
        variant="outline"
        className="min-h-12 w-full"
        onClick={() => void install()}
      >
        <Download /> Instalar aplicativo da equipe
      </Button>
      {help && (
        <div className="mt-3 space-y-2 text-sm leading-6 text-stone-700">
          <p>
            <strong>Android:</strong> no menu do Chrome, escolha “Instalar
            aplicativo” ou “Adicionar à tela inicial”.
          </p>
          <p>
            <strong>iPhone:</strong> abra esta página no Safari, toque em
            Compartilhar e “Adicionar à Tela de Início”.
          </p>
          <p>
            Faça a instalação nesta página de entrada. O aplicativo abrirá o
            acesso da equipe.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
