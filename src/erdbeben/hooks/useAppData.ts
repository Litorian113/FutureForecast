import { useEffect, useState } from 'react';
import { loadAppData } from '../data/loadData';
import type { AppData } from '../types';

export function useAppData() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadAppData()
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);
  return { data, error };
}
