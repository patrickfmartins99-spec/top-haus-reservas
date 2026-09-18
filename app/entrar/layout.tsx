import type { Metadata } from 'next';
import Script from 'next/script';

export const metadata: Metadata = {
  title: 'Equipe | Top Haus Reservas',
  description: 'Ambiente interno para gestão de reservas do Top Haus.',
  robots: { index: false, follow: false },
  manifest: '/entrar/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black', title: 'Reservas' },
};

export default function StaffLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
      <Script id="staff-service-worker" strategy="afterInteractive">
        {`if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(() => undefined); }`}
      </Script>
    </>
  );
}
