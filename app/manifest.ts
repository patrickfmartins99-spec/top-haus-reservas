import type { MetadataRoute } from 'next';

const isStaffSurface = process.env.APP_SURFACE !== 'cliente';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: isStaffSurface ? '/painel' : '/',
    name: 'Top Haus Reservas',
    short_name: 'Reservas',
    description: 'Reservas e atendimento no Top Haus.',
    start_url: isStaffSurface ? '/painel' : '/',
    scope: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    lang: 'pt-BR',
    icons: [
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}

