/**
 * Date-only values (due dates, lease end) are stored as Postgres DATE and handled
 * here as UTC-midnight Date objects. Over the API they are plain "YYYY-MM-DD" strings.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const parseDate = (ymd: string): Date => {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || formatDate(d) !== ymd) {
    throw new Error(`Invalid date: ${ymd}`);
  }
  return d;
};

export const formatDate = (d: Date): string => d.toISOString().slice(0, 10);

export const addDays = (d: Date, days: number): Date =>
  new Date(d.getTime() + days * DAY_MS);

/** Adds months, clamping to the end of the month (Jan 31 + 1 month = Feb 28/29). */
export const addMonths = (d: Date, months: number): Date => {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d.getUTCDate(), lastDay)));
};

export const daysBetween = (from: Date, to: Date): number =>
  Math.round((to.getTime() - from.getTime()) / DAY_MS);

/** Today's calendar date in the house's time zone. */
export const todayIn = (timeZone: string, now = new Date()): Date => {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parseDate(ymd);
};
