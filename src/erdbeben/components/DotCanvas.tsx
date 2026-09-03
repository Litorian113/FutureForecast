import { useCallback, useEffect, useMemo, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { SpatialIndex } from '../lib/spatialIndex';

export interface DotPoint<T = unknown> {
  /** normalised 0..1 inside `mapRect` */
  x: number;
  y: number;
  /** radius in CSS px */
  r: number;
  color: string;
  alpha?: number;
  /** optional outline colour (e.g. to mark real events on top of predictions) */
  stroke?: string;
  data: T;
}

export interface MapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props<T> {
  width: number;
  height: number;
  points: DotPoint<T>[];
  mapRect: MapRect;
  mapImage?: HTMLImageElement | null;
  /** horizontal pan in px; with `wrap` the map repeats seamlessly */
  offsetX?: number;
  wrap?: boolean;
  onHover?: (point: DotPoint<T> | null, clientX: number, clientY: number) => void;
  onPointerDown?: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  style?: CSSProperties;
}

/**
 * Renders many dots on a single <canvas> (the legacy app created one DOM node per dot —
 * ~46k nodes on the overview page). Hover hit-testing uses a spatial grid.
 */
export function DotCanvas<T>({ width, height, points, mapRect, mapImage, offsetX = 0, wrap = false, onHover, onPointerDown, style }: Props<T>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoveredRef = useRef<DotPoint<T> | null>(null);

  // Spatial index in un-panned map pixel coordinates.
  const index = useMemo(() => {
    const idx = new SpatialIndex<DotPoint<T>>(24);
    for (const p of points) {
      idx.insert(mapRect.x + p.x * mapRect.w, mapRect.y + p.y * mapRect.h, p.r, p);
    }
    return idx;
  }, [points, mapRect.x, mapRect.y, mapRect.w, mapRect.h]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const copies = wrap ? [-1, 0, 1] : [0];
    if (mapImage) {
      for (const c of copies) {
        const x = mapRect.x + offsetX + c * mapRect.w;
        if (x + mapRect.w < 0 || x > width) continue;
        ctx.drawImage(mapImage, x, mapRect.y, mapRect.w, mapRect.h);
      }
    }

    // Batch by style: one Path2D per colour/alpha so fillStyle changes stay rare.
    const paths = new Map<string, { path: Path2D; color: string; alpha: number; stroke?: string }>();
    for (const p of points) {
      const key = `${p.color}|${p.alpha ?? 1}|${p.stroke ?? ''}`;
      let entry = paths.get(key);
      if (!entry) {
        entry = { path: new Path2D(), color: p.color, alpha: p.alpha ?? 1, stroke: p.stroke };
        paths.set(key, entry);
      }
      const py = mapRect.y + p.y * mapRect.h;
      for (const c of copies) {
        const px = mapRect.x + offsetX + c * mapRect.w + p.x * mapRect.w;
        if (px + p.r < 0 || px - p.r > width) continue;
        entry.path.moveTo(px + p.r, py);
        entry.path.arc(px, py, p.r, 0, Math.PI * 2);
      }
    }
    for (const { path, color, alpha, stroke } of paths.values()) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fill(path);
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.5;
        ctx.stroke(path);
      }
    }
    ctx.globalAlpha = 1;
  }, [width, height, points, mapRect, mapImage, offsetX, wrap]);

  const handleMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!onHover) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const lx = e.clientX - rect.left - offsetX;
      const ly = e.clientY - rect.top;
      let hit = index.nearest(lx, ly);
      if (!hit && wrap) hit = index.nearest(lx - mapRect.w, ly) ?? index.nearest(lx + mapRect.w, ly);
      const point = hit?.item ?? null;
      if (point !== hoveredRef.current || point) {
        hoveredRef.current = point;
        onHover(point, e.clientX, e.clientY);
      }
    },
    [index, offsetX, wrap, mapRect.w, onHover],
  );

  const handleLeave = useCallback(() => {
    hoveredRef.current = null;
    onHover?.(null, 0, 0);
  }, [onHover]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, display: 'block', touchAction: 'none', ...style }}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      onPointerDown={onPointerDown}
    />
  );
}
