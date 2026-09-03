import { useCallback, useMemo, useState } from 'react';
import { DotCanvas, type DotPoint } from '../components/DotCanvas';
import { Loader } from '../components/Loader';
import { Tooltip } from '../components/Tooltip';
import { useAppData } from '../hooks/useAppData';
import { useElementSize } from '../hooks/useElementSize';
import { mulberry32 } from '../lib/random';
import { formatIsoDate } from '../lib/scales';
import type { Earthquake } from '../types';

/** Depth classes (km) → colour, lighter shades for stronger magnitudes. */
const DEPTH_CLASSES: { max: number; colors: [string, string, string] }[] = [
  { max: 4, colors: ['#2c9448', '#80bf91', '#b3d9bd'] },
  { max: 8, colors: ['#306f67', '#83a9a4', '#b5cbc8'] },
  { max: 12, colors: ['#345a76', '#859cad', '#b6c4ce'] },
  { max: 16, colors: ['#3b457d', '#898fb1', '#b8bcd0'] },
  { max: 20, colors: ['#644265', '#a28ea3', '#c7bbc8'] },
  { max: 24, colors: ['#8c3c4a', '#ba8a92', '#d6b9be'] },
  { max: 28, colors: ['#b33332', '#d18584', '#e3b6b5'] },
  { max: 32, colors: ['#ce562c', '#e29a80', '#eec2b3'] },
  { max: 50, colors: ['#fef5a4', '#ebb57d', '#f3d3b1'] },
  { max: Infinity, colors: ['#fde201', '#feee67', '#fef5a4'] },
];

function dotColor(depth: number, mag: number): string {
  const cls = DEPTH_CLASSES.find((c) => depth <= c.max) ?? DEPTH_CLASSES[DEPTH_CLASSES.length - 1];
  return cls.colors[mag < 6.5 ? 0 : mag < 7.2 ? 1 : 2];
}

function dotDiameter(mag: number): number {
  if (mag < 6.5) return mag / 2;
  if (mag < 7.2) return mag;
  return mag * 2;
}

export default function Depth() {
  const { data, error } = useAppData();
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<{ point: DotPoint<Earthquake>; x: number; y: number } | null>(null);

  const sorted = useMemo(
    () => (data?.earthquakes ?? []).filter((e) => e.depth !== null).sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0)),
    [data],
  );

  // Deep quakes sit near the centre, shallow ones at the rim; the angle is random but seeded.
  const points = useMemo(() => {
    if (!width || !height) return [];
    const rng = mulberry32(20240703);
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.min(width, height) / 2 - 30;
    const minR = Math.max(30, maxR * 0.12);
    const step = (maxR - minR) / Math.max(1, sorted.length);
    return sorted.map<DotPoint<Earthquake>>((e, i) => {
      const radius = minR + step * (i + 1);
      const angle = rng() * Math.PI * 2;
      return {
        x: (cx + Math.cos(angle) * radius) / width,
        y: (cy + Math.sin(angle) * radius) / height,
        r: dotDiameter(e.mag) / 2,
        color: dotColor(e.depth ?? 0, e.mag),
        data: e,
      };
    });
  }, [sorted, width, height]);

  const mapRect = useMemo(() => ({ x: 0, y: 0, w: width, h: height }), [width, height]);
  const onHover = useCallback((point: DotPoint<Earthquake> | null, x: number, y: number) => setHover(point ? { point, x, y } : null), []);

  if (error) return <div className="errorBox">{error}</div>;

  return (
    <div className="page">
      {!data && <Loader />}
      <div ref={ref} className="stage">
        {data && width > 0 && <DotCanvas width={width} height={height} points={points} mapRect={mapRect} onHover={onHover} />}
      </div>
      <div className="overlayBox topLeft" style={{ maxWidth: 300 }}>
        <b>Depth and intensity</b>
        <div style={{ fontSize: 12, color: '#bbb' }}>
          Each dot is one earthquake. Deep quakes sit in the centre, shallow ones at the rim. Colour = depth class, size = magnitude.
        </div>
      </div>
      <div className="overlayBox bottomLeft legend" style={{ fontSize: 12 }}>
        {DEPTH_CLASSES.map((c, i) => (
          <div className="item" key={c.max}>
            <span className="swatch" style={{ background: c.colors[0] }} />
            {i === 0 ? `≤ ${c.max} km` : c.max === Infinity ? `> ${DEPTH_CLASSES[i - 1].max} km` : `${DEPTH_CLASSES[i - 1].max} – ${c.max} km`}
          </div>
        ))}
      </div>
      {hover && (
        <Tooltip x={hover.x} y={hover.y}>
          <b>Depth:</b> {hover.point.data.depth} km
          <br />
          <b>Magnitude:</b> {hover.point.data.mag.toFixed(1)}
          <br />
          <b>Date:</b> {formatIsoDate(hover.point.data.date)}
        </Tooltip>
      )}
    </div>
  );
}
