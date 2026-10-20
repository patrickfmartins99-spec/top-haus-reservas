import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export function GET() {
  const manifest: MetadataRoute.Manifest = {
    id: '/entrar',
    name: 'Top Haus Reservas — Equipe',
    short_name: 'Reservas',
    description: 'Gestão interna de reservas do Top Haus.',
    start_url: '/entrar',
    scope: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    lang: 'pt-BR',
    icons: [
      {
        src: '/icon-192?v=20261020',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon?v=20261020',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon?v=20261020',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
  return Response.json(manifest, {
    headers: { 'Content-Type': 'application/manifest+json' },
  });
}
