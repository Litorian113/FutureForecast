/** US holidays that visibly change electricity demand, computed per year (no library). */

function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - offset);
}

export function holidaysOfYear(year: number): { name: string; date: Date }[] {
  return [
    { name: "New Year's Day", date: new Date(year, 0, 1) },
    { name: 'Memorial Day', date: lastWeekday(year, 4, 1) },
    { name: 'Independence Day', date: new Date(year, 6, 4) },
    { name: 'Labor Day', date: nthWeekday(year, 8, 1, 1) },
    { name: 'Thanksgiving', date: nthWeekday(year, 10, 4, 4) },
    { name: 'Christmas', date: new Date(year, 11, 25) },
  ];
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Holidays whose calendar day falls inside [start, start + hours). */
export function holidaysInWindow(start: Date, hours: number): string[] {
  const names: string[] = [];
  const years = new Set([start.getFullYear(), new Date(start.getTime() + hours * 3600_000).getFullYear()]);
  for (const y of years) {
    for (const h of holidaysOfYear(y)) {
      for (let i = 0; i < hours; i += 24) {
        const d = new Date(start.getTime() + i * 3600_000);
        if (sameDay(d, h.date) && !names.includes(h.name)) names.push(h.name);
      }
    }
  }
  return names;
}
