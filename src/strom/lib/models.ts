/** Display metadata for every model the backtest can contain. Colours were validated as a
 * categorical set on the #0a0a0a surface; variants of one family share the hue and differ
 * by dash pattern (secondary encoding). */
export interface ModelStyle {
  label: string;
  short: string;
  color: string;
  dash?: string;
  family: 'naive' | 'classic' | 'timesfm';
  defaultVisible: boolean;
  description: string;
}

export const MODEL_STYLES: Record<string, ModelStyle> = {
  naive_week: {
    label: 'Seasonal naive',
    short: 'Naive',
    color: '#9085e9',
    family: 'naive',
    defaultVisible: false,
    description: 'Same hour, last week.',
  },
  naive_week_avg4: {
    label: 'Naive · 4-week mean',
    short: 'Naive ×4',
    color: '#c98500',
    family: 'naive',
    defaultVisible: true,
    description: 'Mean of the same hour in the last four weeks.',
  },
  holt_winters: {
    label: 'Holt-Winters · daily',
    short: 'HW 24h',
    color: '#d95926',
    family: 'classic',
    defaultVisible: false,
    description: 'Additive ETS, 24 h season, damped trend, fitted on 8 weeks.',
  },
  holt_winters_week: {
    label: 'Holt-Winters · weekly',
    short: 'HW 168h',
    color: '#d95926',
    dash: '6 4',
    family: 'classic',
    defaultVisible: false,
    description: 'Additive ETS, 168 h season, damped trend, fitted on 8 weeks.',
  },
  stl_ets: {
    label: 'STL + ETS',
    short: 'STL+ETS',
    color: '#3987e5',
    family: 'classic',
    defaultVisible: true,
    description: 'STL (168 h) seasonal repeated, remainder with damped Holt.',
  },
  timesfm: {
    label: 'TimesFM 3.0',
    short: 'TimesFM',
    color: '#199e70',
    family: 'timesfm',
    defaultVisible: true,
    description: 'Zero-shot, 8-week context, no training.',
  },
  timesfm_long: {
    label: 'TimesFM · 1-year context',
    short: 'TFM 1y',
    color: '#199e70',
    dash: '6 4',
    family: 'timesfm',
    defaultVisible: true,
    description: 'Zero-shot with 8 760 h of context.',
  },
  timesfm_cov: {
    label: 'TimesFM · calendar covariates',
    short: 'TFM cov',
    color: '#199e70',
    dash: '2 3',
    family: 'timesfm',
    defaultVisible: false,
    description: 'Hour-of-day and day-of-week as past + future covariates.',
  },
  timesfm_multi: {
    label: 'TimesFM · 4 regions',
    short: 'TFM multi',
    color: '#199e70',
    dash: '10 3 2 3',
    family: 'timesfm',
    defaultVisible: false,
    description: 'PJME + AEP + DOM + DAYTON as one multivariate context.',
  },
};

export const FALLBACK_STYLE: ModelStyle = {
  label: '?',
  short: '?',
  color: '#c3c2b7',
  family: 'classic',
  defaultVisible: false,
  description: '',
};

export function styleOf(name: string): ModelStyle {
  return MODEL_STYLES[name] ?? { ...FALLBACK_STYLE, label: name, short: name };
}

/** Stable display order: naive, classic, timesfm, then by name. */
export function orderModels(names: string[]): string[] {
  const rank = { naive: 0, classic: 1, timesfm: 2 };
  return [...names].sort((a, b) => {
    const ra = rank[styleOf(a).family];
    const rb = rank[styleOf(b).family];
    return ra !== rb ? ra - rb : Object.keys(MODEL_STYLES).indexOf(a) - Object.keys(MODEL_STYLES).indexOf(b);
  });
}
