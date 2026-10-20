import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const logoSource = `data:image/jpeg;base64,${readFileSync(
  join(process.cwd(), 'public', 'logo-tophaus.jpg'),
).toString('base64')}`;

type AppIconArtworkProps = {
  size: number;
};

export function AppIconArtwork({ size }: AppIconArtworkProps) {
  return (
    <div
      style={{
        alignItems: 'center',
        background: '#000000',
        color: '#ffffff',
        display: 'flex',
        height: '100%',
        justifyContent: 'center',
        width: '100%',
      }}
    >
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flexDirection: 'column',
          height: '90%',
          justifyContent: 'center',
          width: '90%',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse requires a native image. */}
        <img
          alt="Top Haus"
          src={logoSource}
          style={{
            height: Math.round(size * 0.38),
            objectFit: 'contain',
            width: Math.round(size * 0.74),
          }}
        />
        <div
          style={{
            display: 'flex',
            fontFamily: 'Arial, sans-serif',
            fontSize: Math.round(size * 0.068),
            fontWeight: 700,
            letterSpacing: Math.round(size * 0.012),
            lineHeight: 1,
            marginLeft: Math.round(size * 0.012),
            marginTop: Math.round(size * 0.04),
            textTransform: 'uppercase',
          }}
        >
          RESERVAS
        </div>
      </div>
    </div>
  );
}
