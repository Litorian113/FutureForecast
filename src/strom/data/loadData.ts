import type { Backtest } from '../types';

let cache: Promise<Backtest | null> | null = null;

/** Loads public/data/energy/backtest.json once per session. Resolves to null if the file is missing. */
export function loadBacktest(): Promise<Backtest | null> {
  if (!cache) {
    cache = fetch('data/energy/backtest.json')
      .then((r) => (r.ok ? (r.json() as Promise<Backtest>) : null))
      .catch(() => null);
  }
  return cache;
}
