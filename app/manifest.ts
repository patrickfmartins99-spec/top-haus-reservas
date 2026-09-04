import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return { id: '/', name: 'Top Haus Reservas', short_name: 'Top Haus', description: 'Reservas e atendimento no Top Haus.', start_url: '/', scope: '/', display: 'standalone', background_color: '#000000', theme_color: '#000000', lang: 'pt-BR', icons: [{ src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'any' }] };
}
