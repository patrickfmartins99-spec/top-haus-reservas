import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'Reservas | Top Haus Restaurante',
  description: 'Reserve seu almoço ou rodízio no Top Haus Restaurante.',
  openGraph: {
    title: 'Reservas | Top Haus Restaurante',
    description: 'Reserve seu almoço ou rodízio no Top Haus Restaurante.',
    images: [{ url: '/og.png', width: 1536, height: 1024, alt: 'Top Haus Reservas' }],
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Reservas | Top Haus Restaurante',
    description: 'Reserve seu almoço ou rodízio no Top Haus Restaurante.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
