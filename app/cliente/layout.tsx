import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reservas | Top Haus Restaurante',
  description: 'Reserve seu almoço ou rodízio no Top Haus Restaurante.',
  robots: { index: true, follow: true },
};

export default function CustomerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
