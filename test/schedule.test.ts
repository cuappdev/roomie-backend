import { describe, expect, it } from 'vitest';

import {
  assigneeFor,
  dueDateOf,
  firstTurnOnOrAfter,
  turnsInRange,
} from '../src/chores/schedule.js';
import { formatDate, parseDate, todayIn } from '../src/utils/dates.js';

const sched = (frequency: string, startsOn: string, anchor = 0) => ({
  frequency: frequency as 'WEEKLY',
  startsOn: parseDate(startsOn),
  occurrenceBase: 0,
  rotationAnchor: anchor,
});

describe('chore schedule math', () => {
  it('steps weekly and every other day', () => {
    expect(formatDate(dueDateOf(sched('WEEKLY', '2026-11-15'), 2))).toBe(
      '2026-11-29',
    );
    expect(
      formatDate(dueDateOf(sched('EVERY_OTHER_DAY', '2026-11-09'), 3)),
    ).toBe('2026-11-15');
  });

  it('clamps monthly chores to the end of short months', () => {
    const s = sched('MONTHLY', '2027-01-31');
    expect([1, 2, 3].map((k) => formatDate(dueDateOf(s, k)))).toEqual([
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
    ]);
    expect(firstTurnOnOrAfter(s, parseDate('2027-03-01'))).toBe(2);
  });

  it('lists turns in a range', () => {
    const s = sched('EVERY_OTHER_DAY', '2026-11-01');
    expect(
      turnsInRange(s, parseDate('2026-11-09'), parseDate('2026-11-15')).map(
        (t) => formatDate(t.dueOn),
      ),
    ).toEqual(['2026-11-09', '2026-11-11', '2026-11-13', '2026-11-15']);
  });

  it('rotates from the anchor', () => {
    const s = sched('WEEKLY', '2026-11-01', 4);
    expect([4, 5, 6, 7].map((o) => assigneeFor(s, [10, 20, 30], o))).toEqual([
      10, 20, 30, 10,
    ]);
    expect(assigneeFor(s, [10, 20, 30], 3)).toBe(30);
    expect(assigneeFor(s, [], 3)).toBeNull();
  });

  it("computes today in the house's time zone", () => {
    const lateNightUtc = new Date('2026-11-10T03:30:00Z'); // 10:30pm Nov 9 in Ithaca
    expect(formatDate(todayIn('America/New_York', lateNightUtc))).toBe(
      '2026-11-09',
    );
    expect(formatDate(todayIn('UTC', lateNightUtc))).toBe('2026-11-10');
  });
});
