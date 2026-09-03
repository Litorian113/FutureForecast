const intFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export const fmtMW = (v: number | null | undefined): string => (v == null ? '–' : intFmt.format(v));
export const fmtGW = (v: number): string => `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}\u00A0GW`;
export const fmtPct = (v: number | null | undefined, digits = 1): string =>
  v == null ? '–' : `${(v * 100).toFixed(digits)}\u00A0%`;
export const fmtSigned = (v: number): string => `${v > 0 ? '+' : ''}${intFmt.format(v)}`;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parses the backtest's local-time ISO strings ("2016-08-01T00:00") as local dates. */
export function parseLocal(iso: string): Date {
  const [d, t] = iso.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = (t ?? '00:00').split(':').map(Number);
  return new Date(y, m - 1, day, hh, mm);
}

export const addHours = (d: Date, h: number): Date => new Date(d.getTime() + h * 3600_000);

export function fmtDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtDateTime(d: Date): string {
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${String(d.getHours()).padStart(2, '0')}:00`;
}

export const fmtDay = (d: Date): string => `${DAYS[d.getDay()]} ${d.getDate()}`;
export const weekdayName = (d: Date): string => DAYS_LONG[d.getDay()];
export const monthShort = (m: number): string => MONTHS[m - 1];
