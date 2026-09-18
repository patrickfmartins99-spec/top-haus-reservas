import { ImageResponse } from 'next/og';
import { createElement } from 'react';
import { AppIconArtwork } from '@/components/app-icon-artwork';

export function GET() {
  return new ImageResponse(createElement(AppIconArtwork, { size: 192 }), {
    width: 192,
    height: 192,
  });
}
