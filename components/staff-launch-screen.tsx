/** The OS splash is configured by the manifest. This covers the in-app session check. */
export function StaffLaunchScreen() {
  return (
    <output
      className="staff-launch-screen"
      aria-label="Abrindo Top Haus Reservas"
    >
      {/* Same official artwork as the installed icon, without a network-dependent status check. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-tophaus.jpg" width={800} height={447} alt="Top Haus" />
      <p>RESERVAS</p>
      <span>Preparando seu painel…</span>
    </output>
  );
}
