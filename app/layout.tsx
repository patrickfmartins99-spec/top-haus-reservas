import type { Metadata, Viewport } from 'next';
import './globals.css';

const isStaffSurface = process.env.APP_SURFACE !== 'cliente';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  ),
  applicationName: 'Top Haus Reservas',
  title: isStaffSurface
    ? 'Equipe | Top Haus Reservas'
    : 'Reservas | Top Haus Restaurante',
  description: isStaffSurface
    ? 'Ambiente interno para gestão de reservas do Top Haus.'
    : 'Reserve seu almoço ou rodízio no Top Haus Restaurante.',
  robots: isStaffSurface ? { index: false, follow: false } : undefined,
  appleWebApp: { capable: true, statusBarStyle: 'black', title: 'Reservas' },
  openGraph: {
    title: isStaffSurface
      ? 'Equipe | Top Haus Reservas'
      : 'Reservas | Top Haus Restaurante',
    description: isStaffSurface
      ? 'Ambiente interno para gestão de reservas do Top Haus.'
      : 'Reserve seu almoço ou rodízio no Top Haus Restaurante.',
    images: [
      { url: '/og.png', width: 1536, height: 1024, alt: 'Top Haus Reservas' },
    ],
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: isStaffSurface
      ? 'Equipe | Top Haus Reservas'
      : 'Reservas | Top Haus Restaurante',
    description: isStaffSurface
      ? 'Ambiente interno para gestão de reservas do Top Haus.'
      : 'Reserve seu almoço ou rodízio no Top Haus Restaurante.',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#000000',
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

