/** Labels and line styles of the two live sources and the backtest models. */
export const LABELS: Record<string, string> = {
  persistence: 'Persistenz (gestern)',
  naive_week: 'Letzte Woche',
  climatology: 'Klimatologie',
  blend: 'Blend (Persistenz → Klima)',
  nwp: 'Wettermodell (Open-Meteo)',
  nwp_ecmwf: 'Wettermodell (ECMWF)',
  timesfm: 'TimesFM 3.0 (92 Tage)',
  timesfm_long: 'TimesFM 3.0 (1 Jahr)',
  timesfm_cov: 'TimesFM 3.0 + Kalender',
  timesfm_multi: 'TimesFM 3.0 (6 Variablen)',
};

/** Colours chosen for the light and the dark neumorphic ground and for colour-vision deficiency:
 * TimesFM = blue, weather model = orange/brown, truth/history = neutral. Dashes are the second encoding. */
export const STYLE: Record<string, { color: string; dash?: string }> = {
  timesfm: { color: 'var(--c-timesfm)' },
  timesfm_multi: { color: 'var(--c-timesfm)' },
  timesfm_long: { color: 'var(--c-timesfm)', dash: '6 3' },
  timesfm_cov: { color: 'var(--c-timesfm)', dash: '2 3' },
  nwp: { color: 'var(--c-nwp)' },
  nwp_ecmwf: { color: 'var(--c-nwp)', dash: '6 3' },
  persistence: { color: 'var(--c-base)', dash: '2 3' },
  naive_week: { color: 'var(--c-base)', dash: '8 3 2 3' },
  climatology: { color: 'var(--c-base)', dash: '6 4' },
  blend: { color: 'var(--c-base)' },
};
