/**
 * Uniform grid for fast "which dot is under the cursor" lookups on a canvas
 * with tens of thousands of points.
 */
export interface Indexed<T> {
  x: number;
  y: number;
  r: number;
  item: T;
  /** insertion order — later entries are drawn on top and win ties */
  order: number;
}

export class SpatialIndex<T> {
  private cells = new Map<number, Indexed<T>[]>();
  private count = 0;
  constructor(private cellSize = 24) {}

  private key(cx: number, cy: number) {
    return cx * 73856093 + cy * 19349663;
  }

  insert(x: number, y: number, r: number, item: T) {
    const entry: Indexed<T> = { x, y, r, item, order: this.count++ };
    const minCx = Math.floor((x - r) / this.cellSize);
    const maxCx = Math.floor((x + r) / this.cellSize);
    const minCy = Math.floor((y - r) / this.cellSize);
    const maxCy = Math.floor((y + r) / this.cellSize);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const k = this.key(cx, cy);
        let bucket = this.cells.get(k);
        if (!bucket) {
          bucket = [];
          this.cells.set(k, bucket);
        }
        bucket.push(entry);
      }
    }
  }

  /** Returns the top-most point whose (radius + slack) covers the query. */
  nearest(x: number, y: number, slack = 3): Indexed<T> | null {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    let best: Indexed<T> | null = null;
    let bestScore = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = this.cells.get(this.key(cx + dx, cy + dy));
        if (!bucket) continue;
        for (const e of bucket) {
          const d = Math.hypot(e.x - x, e.y - y);
          const hit = Math.max(e.r, 4) + slack;
          if (d > hit) continue;
          // prefer closer, then top-most
          const score = d - e.order * 1e-6;
          if (score < bestScore) {
            bestScore = score;
            best = e;
          }
        }
      }
    }
    return best;
  }
}
