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
          border: `${Math.max(6, Math.round(size * 0.025))}px solid #8c4b28`,
          borderRadius: Math.round(size * 0.2),
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
            height: Math.round(size * 0.35),
            objectFit: 'contain',
            width: Math.round(size * 0.68),
          }}
        />
        <div
          style={{
            background: '#8c4b28',
            borderRadius: 999,
            display: 'flex',
            height: Math.max(4, Math.round(size * 0.014)),
            marginTop: Math.round(size * 0.035),
            width: Math.round(size * 0.18),
          }}
        />
        <div
          style={{
            display: 'flex',
            fontFamily: 'Arial, sans-serif',
            fontSize: Math.round(size * 0.077),
            fontWeight: 700,
            letterSpacing: Math.round(size * 0.012),
            lineHeight: 1,
            marginLeft: Math.round(size * 0.012),
            marginTop: Math.round(size * 0.04),
            textTransform: 'uppercase',
          }}
        >
          Reservas
        </div>
      </div>
    </div>
  );
}

