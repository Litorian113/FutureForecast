import { useEffect, useMemo, useState } from 'react';
import { Loader } from '../components/Loader';
import { YearSlider } from '../components/YearSlider';
import { useAppData } from '../hooks/useAppData';
import { useElementSize } from '../hooks/useElementSize';
import { COLORS, YEAR_MAX, YEAR_MIN, formatDate, formatIsoDate, magnitudeLevel } from '../lib/scales';
import type { Earthquake, Tsunami } from '../types';

interface Pair {
  eq: Earthquake;
  tsu: Tsunami;
}

const EQ_DIAMETER = { low: 16, medium: 24, high: 40 } as const;
const TSU_DIAMETER = 40;
const TIME_TOLERANCE_MIN = 5;
const DISTANCE_TOLERANCE_DEG = 2;

/**
 * Pairs earthquakes with tsunamis on the same calendar day when either the recorded
 * times agree within a few minutes or (no tsunami time recorded) the epicentres are close.
 * The legacy page required an exact minute match, which missed rounded times.
 */
function findPairs(eqs: Earthquake[], tsus: Tsunami[]): Pair[] {
  const pairs: Pair[] = [];
  for (const eq of eqs) {
    if (eq.type !== 'Earthquake') continue;
    const [hh, mm] = eq.time.split(':').map(Number);
    const eqMinutes = hh * 60 + mm;
    for (const t of tsus) {
      if (t.month !== eq.month || t.day !== Number(eq.date.slice(8, 10))) continue;
      const close = Math.hypot(t.lat - eq.lat, t.lon - eq.lon) <= DISTANCE_TOLERANCE_DEG;
      if (t.hour === null) {
        if (close) pairs.push({ eq, tsu: t });
        continue;
      }
      const tMinutes = t.hour * 60 + (t.minute ?? 0);
      if (Math.abs(tMinutes - eqMinutes) <= TIME_TOLERANCE_MIN || (close && Math.abs(tMinutes - eqMinutes) <= 60)) {
        pairs.push({ eq, tsu: t });
      }
    }
  }
  return pairs;
}

export default function Comparison() {
  const { data, error } = useAppData();
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const [year, setYear] = useState(YEAR_MIN);
  const [active, setActive] = useState(0);

  const byYear = useMemo(() => {
    const eq = new Map<number, Earthquake[]>();
    const tsu = new Map<number, Tsunami[]>();
    for (const e of data?.earthquakes ?? []) (eq.get(e.year) ?? eq.set(e.year, []).get(e.year)!).push(e);
    for (const t of data?.tsunamis ?? []) (tsu.get(t.year) ?? tsu.set(t.year, []).get(t.year)!).push(t);
    return { eq, tsu };
  }, [data]);

  const pairs = useMemo(() => findPairs(byYear.eq.get(year) ?? [], byYear.tsu.get(year) ?? []), [byYear, year]);
  useEffect(() => setActive(0), [year]);

  if (error) return <div className="errorBox">{error}</div>;

  const spacing = Math.min(100, pairs.length ? (width - 80) / pairs.length : 100);
  const startX = width / 2 - (pairs.length * spacing) / 2 + spacing / 2;
  const topY = height * 0.22;
  const bottomY = topY + 150;
  const current = pairs[active];

  return (
    <div className="page">
      {!data && <Loader />}
      <div ref={ref} className="comparisonStage">
        {data && width > 0 && (
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Earthquake and tsunami pairs">
            {pairs.map((p, i) => {
              const x = startX + i * spacing;
              const lvl = magnitudeLevel(p.eq.mag);
              const rEq = EQ_DIAMETER[lvl] / 2;
              const isActive = i === active;
              return (
                <g key={`${p.eq.id}-${p.tsu.id}`} className="pair" opacity={isActive ? 1 : 0.45} onMouseEnter={() => setActive(i)} onClick={() => setActive(i)}>
                  {isActive && (
                    <path
                      d={`M ${x} ${bottomY} C ${x} ${(topY + bottomY) / 2}, ${x} ${(topY + bottomY) / 2}, ${x} ${topY}`}
                      stroke="#fff"
                      strokeWidth={3}
                      fill="none"
                    />
                  )}
                  <circle cx={x} cy={topY} r={TSU_DIAMETER / 2} fill={COLORS.tsu.medium} style={{ filter: 'drop-shadow(0 0 6px #4873ffb3)' }} />
                  <circle cx={x} cy={bottomY} r={rEq} fill={COLORS.eq[lvl]} style={{ filter: 'drop-shadow(0 0 10px #ff5b5bb3)' }} />
                  <rect x={x - 25} y={topY - 25} width={50} height={bottomY - topY + 50} fill="transparent" />
                </g>
              );
            })}
          </svg>
        )}
        {data && (
          <div className="centerText" style={{ top: bottomY + 40 }}>
            {pairs.length ? `Matches found in this year: ${pairs.length}` : `No earthquake–tsunami pairs found in ${year}`}
            <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>top: tsunami · bottom: triggering earthquake · hover a pair for details</div>
          </div>
        )}
        {current && (
          <div className="commentsBox">
            <b>
              {formatIsoDate(current.eq.date)} {current.eq.time} · M{current.eq.mag.toFixed(1)} earthquake, depth {current.eq.depth ?? '–'} km
            </b>
            <br />
            <b>Tsunami:</b> {current.tsu.location}
            {current.tsu.country ? `, ${current.tsu.country}` : ''} · {formatDate(current.tsu.year, current.tsu.month, current.tsu.day)} · intensity{' '}
            {current.tsu.intensity ?? 'unknown'} · {current.tsu.validity}
            <br />
            {current.tsu.comments ? current.tsu.comments : <i>No comments recorded.</i>}
            {current.tsu.url && (
              <>
                {' '}
                <a href={current.tsu.url} target="_blank" rel="noreferrer" style={{ color: '#9cf' }}>
                  NOAA record ↗
                </a>
              </>
            )}
          </div>
        )}
      </div>
      <YearSlider min={YEAR_MIN} max={YEAR_MAX} value={year} onChange={setYear} />
    </div>
  );
}
