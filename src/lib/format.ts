const NBSP = ' ';

export const fmtTemp = (v: number | null | undefined, digits = 0): string =>
  v == null ? '–' : `${v.toFixed(digits).replace('-', '−')}${NBSP}°C`;
export const fmtDeg = (v: number | null | undefined, digits = 0): string =>
  v == null ? '–' : `${v.toFixed(digits).replace('-', '−')}°`;
export const fmtPct = (v: number | null | undefined): string => (v == null ? '–' : `${Math.round(v * 100)}${NBSP}%`);
export const fmtSigned = (v: number, digits = 1): string =>
  `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(digits)}`;
export const fmtPm = (v: number | null | undefined, digits = 1): string =>
  v == null ? '–' : `±${v.toFixed(digits)}${NBSP}°C`;

const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DAYS_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/** Parses the server's local-time ISO strings ("2026-09-03T14:00") as local dates (no zone shift). */
export function parseLocal(iso: string): Date {
  const [d, t] = iso.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = (t ?? '00:00').split(':').map(Number);
  return new Date(y, m - 1, day, hh, mm);
}

export const addHours = (d: Date, h: number): Date => new Date(d.getTime() + h * 3600_000);
export const fmtDay = (d: Date): string => `${DAYS[d.getDay()]} ${d.getDate()}.`;
export const fmtDayLong = (d: Date): string => DAYS_LONG[d.getDay()];
export const fmtDate = (d: Date): string => `${d.getDate()}. ${MONTHS[d.getMonth()]}`;
export const fmtDateTime = (d: Date): string =>
  `${DAYS[d.getDay()]} ${d.getDate()}. ${MONTHS[d.getMonth()]} · ${String(d.getHours()).padStart(2, '0')}:00`;
