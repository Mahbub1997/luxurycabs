/** Top-down car SVG with a yellow number-plate badge. Shared by admin map & driver app. */
export function vehicleIconSvg(plate: string, online: boolean, kind: "sedan" | "suv" = "sedan") {
  const body = online ? "#16a34a" : "#64748b";
  const stroke = "#0f172a";
  const p = (plate || "—").toString().toUpperCase();
  const plateW = Math.max(56, Math.min(96, p.length * 8 + 16));
  const carPath =
    kind === "suv"
      ? "M28 14 h40 a6 6 0 0 1 6 6 v20 a6 6 0 0 1 -6 6 h-40 a6 6 0 0 1 -6 -6 v-20 a6 6 0 0 1 6 -6 z"
      : "M30 14 h36 q8 0 10 8 v12 q-2 8 -10 8 h-36 q-8 0 -10 -8 v-12 q2 -8 10 -8 z";
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="80" viewBox="0 0 96 80">
  <g filter="url(#sh)">
    <path d="${carPath}" fill="${body}" stroke="${stroke}" stroke-width="2"/>
    <rect x="34" y="20" width="28" height="8" rx="2" fill="#e2e8f0" opacity="0.85"/>
    <rect x="34" y="32" width="28" height="8" rx="2" fill="#e2e8f0" opacity="0.85"/>
    <circle cx="22" cy="22" r="2" fill="#fde68a"/>
    <circle cx="22" cy="38" r="2" fill="#fde68a"/>
  </g>
  <g transform="translate(${(96 - plateW) / 2}, 54)">
    <rect width="${plateW}" height="20" rx="4" fill="#facc15" stroke="#0f172a" stroke-width="1.5"/>
    <text x="${plateW / 2}" y="14" text-anchor="middle" font-family="Inter, Arial, sans-serif"
          font-size="11" font-weight="800" fill="#0f172a" letter-spacing="0.5">${escapeXml(p)}</text>
  </g>
  <defs>
    <filter id="sh" x="-10%" y="-10%" width="120%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-opacity="0.35"/>
    </filter>
  </defs>
</svg>`.trim();
}

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

export function VehicleIcon({
  plate,
  online,
  kind = "sedan",
  className,
  width = 96,
  height = 80,
}: {
  plate: string;
  online?: boolean;
  kind?: "sedan" | "suv";
  className?: string;
  width?: number;
  height?: number;
}) {
  const svg = vehicleIconSvg(plate, !!online, kind);
  const src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  return <img src={src} alt={`Vehicle ${plate}`} width={width} height={height} className={className} />;
}
