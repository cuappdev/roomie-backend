import type { ChoreFrequency } from '../generated/prisma/client.js';
import { addDays, addMonths, daysBetween } from '../utils/dates.js';

/**
 * How chore turns are numbered
 * ────────────────────────────
 * Each turn of a chore has an occurrence number. Turn k of the current schedule
 * is due on `startsOn + k × frequency` and has occurrence `occurrenceBase + k`.
 * When the schedule changes, occurrenceBase moves past every number already used,
 * so stored turns (completed ones especially) never collide with new ones.
 *
 * Whose turn it is: rotation[(occurrence − rotationAnchor) mod rotation.length].
 * Moving the anchor to the next upcoming occurrence makes rotation position 0
 * take the next turn.
 */
export interface ChoreSchedule {
  frequency: ChoreFrequency;
  startsOn: Date;
  occurrenceBase: number;
  rotationAnchor: number;
}

const STEP_DAYS: Record<Exclude<ChoreFrequency, 'MONTHLY'>, number> = {
  DAILY: 1,
  EVERY_OTHER_DAY: 2,
  WEEKLY: 7,
  BIWEEKLY: 14,
};

/** Due date of local turn k (k = 0 is startsOn). */
export const dueDateOf = (s: ChoreSchedule, k: number): Date =>
  s.frequency === 'MONTHLY'
    ? addMonths(s.startsOn, k)
    : addDays(s.startsOn, k * STEP_DAYS[s.frequency]);

/** Smallest local k whose due date is on or after `date`. */
export const firstTurnOnOrAfter = (s: ChoreSchedule, date: Date): number => {
  if (date <= s.startsOn) return 0;
  if (s.frequency === 'MONTHLY') {
    const months =
      (date.getUTCFullYear() - s.startsOn.getUTCFullYear()) * 12 +
      (date.getUTCMonth() - s.startsOn.getUTCMonth());
    let k = Math.max(0, months - 1);
    while (dueDateOf(s, k) < date) k++;
    return k;
  }
  return Math.ceil(daysBetween(s.startsOn, date) / STEP_DAYS[s.frequency]);
};

/** Local turn numbers due within [from, to] (inclusive). */
export const turnsInRange = (s: ChoreSchedule, from: Date, to: Date) => {
  const turns: { k: number; dueOn: Date }[] = [];
  for (let k = firstTurnOnOrAfter(s, from); ; k++) {
    const dueOn = dueDateOf(s, k);
    if (dueOn > to) break;
    turns.push({ k, dueOn });
  }
  return turns;
};

export const assigneeFor = (
  s: ChoreSchedule,
  rotation: number[],
  occurrence: number,
): number | null => {
  if (rotation.length === 0) return null;
  const n = rotation.length;
  return rotation[(((occurrence - s.rotationAnchor) % n) + n) % n]!;
};
