import { ImageResponse } from 'next/og';
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';
export default function Icon() {
  return new ImageResponse(<div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#fff', fontFamily: 'sans-serif', border: '24px solid #8c4b28', fontWeight: 700 }}><div style={{ fontSize: 86 }}>TOP HAUS</div><div style={{ fontSize: 32, marginTop: 22 }}>RESERVAS</div></div>, size);
}
