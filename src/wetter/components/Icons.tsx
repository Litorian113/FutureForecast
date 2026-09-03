import type { IconClass } from '../types';

interface Props {
  kind: IconClass | null | undefined;
  className?: string;
  title?: string;
}

const LABEL: Record<IconClass, string> = { clear: 'klar', cloudy: 'bewölkt', rain: 'Regen', snow: 'Schnee', fog: 'Nebel' };

/** Small hand-drawn SVG set in soft raised shapes (no icon font). Shapes are filled with the
 * page ground and lifted by a paired drop shadow; strokes carry the meaning. */
export default function WeatherIcon({ kind, className, title }: Props) {
  const label = kind ? LABEL[kind] : 'unbekannt';
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={title ?? label}>
      <defs>
        <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="3" dy="3" stdDeviation="3" floodColor="var(--sh-dark)" floodOpacity="0.9" />
          <feDropShadow dx="-3" dy="-3" stdDeviation="3" floodColor="var(--sh-light)" floodOpacity="0.9" />
        </filter>
      </defs>
      <g filter="url(#soft)" fill="var(--bg)" stroke="var(--text-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {kind === 'clear' && (
          <>
            <circle cx="32" cy="32" r="11" />
            <g strokeWidth="2.2">
              {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                <line
                  key={a}
                  x1={32 + 17 * Math.cos((a * Math.PI) / 180)}
                  y1={32 + 17 * Math.sin((a * Math.PI) / 180)}
                  x2={32 + 23 * Math.cos((a * Math.PI) / 180)}
                  y2={32 + 23 * Math.sin((a * Math.PI) / 180)}
                />
              ))}
            </g>
          </>
        )}
        {kind === 'cloudy' && <Cloud />}
        {kind === 'rain' && (
          <>
            <Cloud y={-4} />
            <g strokeWidth="2.4">
              <line x1="24" y1="46" x2="21" y2="54" />
              <line x1="33" y1="46" x2="30" y2="54" />
              <line x1="42" y1="46" x2="39" y2="54" />
            </g>
          </>
        )}
        {kind === 'snow' && (
          <>
            <Cloud y={-5} />
            <g strokeWidth="2">
              {[24, 33, 42].map((x) => (
                <g key={x}>
                  <line x1={x - 3} y1="50" x2={x + 3} y2="50" />
                  <line x1={x} y1="47" x2={x} y2="53" />
                  <line x1={x - 2.2} y1="47.8" x2={x + 2.2} y2="52.2" />
                  <line x1={x + 2.2} y1="47.8" x2={x - 2.2} y2="52.2" />
                </g>
              ))}
            </g>
          </>
        )}
        {kind === 'fog' && (
          <>
            <Cloud y={-8} />
            <g strokeWidth="2.2">
              <line x1="16" y1="46" x2="48" y2="46" />
              <line x1="20" y1="52" x2="44" y2="52" />
            </g>
          </>
        )}
        {!kind && <circle cx="32" cy="32" r="12" strokeDasharray="3 3" />}
      </g>
    </svg>
  );
}

function Cloud({ y = 0 }: { y?: number }) {
  return (
    <path
      transform={`translate(0 ${y})`}
      d="M20 44 h26 a9 9 0 0 0 1 -18 a12 12 0 0 0 -23 -3 a8 8 0 0 0 -4 21 z"
    />
  );
}

export function SearchGlyph() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <line x1="12.7" y1="12.7" x2="17" y2="17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
