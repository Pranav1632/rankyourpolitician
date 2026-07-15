// Server-safe "where is this place" mini-map: soft state silhouette with the
// constituency / district highlighted and a pulsing locator. Pure SVG + SMIL,
// no client JS needed.
export default function SpotMiniMap({
  outline,
  spot,
  spotCx,
  spotCy,
  w,
  h,
  label,
  className,
}: {
  outline: string;
  spot: string;
  spotCx: number;
  spotCy: number;
  w: number;
  h: number;
  label: string;
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={className ?? 'mx-auto h-auto w-full max-w-[16rem]'}
      role="img"
      aria-label={label}
    >
      <path d={outline} fill="var(--color-map-terrain)" stroke="rgb(var(--color-line))" strokeWidth={1} strokeLinejoin="round" className="animate-map-in" />
      <path d={spot} fill="#f97316" stroke="#fff" strokeWidth={0.8} strokeLinejoin="round" className="animate-scale-in" opacity={0.92} />
      <g className="pointer-events-none">
        <circle cx={spotCx} cy={spotCy} r={6} fill="none" stroke="#f97316" strokeWidth={1.6} opacity={0.5}>
          <animate attributeName="r" values="4;10;4" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0;0.5" dur="2.4s" repeatCount="indefinite" />
        </circle>
        <circle cx={spotCx} cy={spotCy} r={3.2} fill="#fff" stroke="#f97316" strokeWidth={2} />
      </g>
    </svg>
  );
}
