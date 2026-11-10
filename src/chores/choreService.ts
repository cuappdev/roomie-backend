import type {
  Chore,
  ChoreFrequency,
  ChoreRotation,
  Prisma,
} from '../generated/prisma/client.js';
import { prisma } from '../prisma.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../utils/AppError.js';
import { addDays, formatDate, parseDate } from '../utils/dates.js';
import { publicUserSelect } from '../utils/selects.js';
import {
  assigneeFor,
  dueDateOf,
  firstTurnOnOrAfter,
  turnsInRange,
} from './schedule.js';

type Db = Prisma.TransactionClient | typeof prisma;
type ChoreWithRotation = Chore & { rotation: ChoreRotation[] };

const OVERDUE_LOOKBACK_DAYS = 30;
const COMING_UP_COUNT = 3;

const rotationOrder = (chore: ChoreWithRotation) =>
  [...chore.rotation]
    .sort((a, b) => a.position - b.position)
    .map((r) => r.userId);

const loadChore = async (db: Db, houseId: number, choreId: number) => {
  const chore = await db.chore.findFirst({
    where: { id: choreId, houseId, archivedAt: null },
    include: { rotation: true },
  });
  if (!chore) throw new NotFoundError('Chore not found.');
  return chore;
};

const assertMembers = async (db: Db, houseId: number, userIds: number[]) => {
  const count = await db.houseMember.count({
    where: { houseId, userId: { in: userIds } },
  });
  if (count !== new Set(userIds).size) {
    throw new BadRequestError(
      'Everyone in the rotation must live in the house.',
    );
  }
};

/**
 * Turns are stored lazily: whenever a date range is read, any turn in it that
 * hasn't been stored yet is created from the rotation. After that the stored row
 * wins, so completions and swaps stick even if the rotation changes later.
 */
const ensureAssignments = async (
  db: Db,
  chores: ChoreWithRotation[],
  from: Date,
  to: Date,
) => {
  const rows: Prisma.ChoreAssignmentCreateManyInput[] = [];
  for (const chore of chores) {
    const order = rotationOrder(chore);
    for (const { k, dueOn } of turnsInRange(chore, from, to)) {
      const occurrence = chore.occurrenceBase + k;
      const assigneeId = assigneeFor(chore, order, occurrence);
      if (assigneeId !== null) {
        rows.push({ choreId: chore.id, occurrence, dueOn, assigneeId });
      }
    }
  }
  if (rows.length > 0) {
    await db.choreAssignment.createMany({ data: rows, skipDuplicates: true });
  }
};

/** Drops unfinished turns due today or later so they're regenerated from the new setup. */
const clearFutureTurns = (db: Db, choreId: number, today: Date) =>
  db.choreAssignment.deleteMany({
    where: { choreId, completedAt: null, dueOn: { gte: today } },
  });

const writeRotation = async (db: Db, choreId: number, userIds: number[]) => {
  await db.choreRotation.deleteMany({ where: { choreId } });
  await db.choreRotation.createMany({
    data: userIds.map((userId, position) => ({ choreId, userId, position })),
  });
};

const assignmentInclude = {
  chore: {
    select: { id: true, title: true, frequency: true, allowSwaps: true },
  },
  assignee: { select: publicUserSelect },
  completedBy: { select: publicUserSelect },
} as const;

type AssignmentRow = Prisma.ChoreAssignmentGetPayload<{
  include: typeof assignmentInclude;
}>;

const serializeAssignment = (a: AssignmentRow, today: Date) => ({
  id: a.id,
  chore: { id: a.chore.id, title: a.chore.title, frequency: a.chore.frequency },
  dueOn: formatDate(a.dueOn),
  status: a.completedAt
    ? 'DONE'
    : a.dueOn < today
      ? 'OVERDUE'
      : a.dueOn.getTime() === today.getTime()
        ? 'DUE_TODAY'
        : 'UPCOMING',
  assignee: a.assignee,
  completedAt: a.completedAt,
  completedBy: a.completedBy,
  canSwap: a.chore.allowSwaps && !a.completedAt && a.dueOn >= today,
});

// ─────────────────────────── Chore definitions ───────────────────────────

const serializeChore = async (chore: ChoreWithRotation, today: Date) => {
  // "Coming up": make sure the next few turns exist, then read them back.
  const k = firstTurnOnOrAfter(chore, today);
  await ensureAssignments(
    prisma,
    [chore],
    today,
    dueDateOf(chore, k + COMING_UP_COUNT - 1),
  );
  const comingUp = await prisma.choreAssignment.findMany({
    where: { choreId: chore.id, dueOn: { gte: today } },
    orderBy: { dueOn: 'asc' },
    take: COMING_UP_COUNT,
    include: assignmentInclude,
  });
  const users = await prisma.user.findMany({
    where: { id: { in: chore.rotation.map((r) => r.userId) } },
    select: publicUserSelect,
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  return {
    id: chore.id,
    title: chore.title,
    frequency: chore.frequency,
    startsOn: formatDate(chore.startsOn),
    allowSwaps: chore.allowSwaps,
    reminderHour: chore.reminderHour,
    rotation: rotationOrder(chore).map((id) => byId.get(id)!),
    comingUp: comingUp.map((a) => serializeAssignment(a, today)),
  };
};

export const listChores = async (houseId: number, today: Date) => {
  const chores = await prisma.chore.findMany({
    where: { houseId, archivedAt: null },
    include: { rotation: true },
    orderBy: { createdAt: 'asc' },
  });
  return Promise.all(chores.map((c) => serializeChore(c, today)));
};

export const getChore = async (houseId: number, choreId: number, today: Date) =>
  serializeChore(await loadChore(prisma, houseId, choreId), today);

export interface ChoreInput {
  title?: string;
  frequency?: ChoreFrequency;
  startsOn?: string;
  rotation?: number[];
  allowSwaps?: boolean;
  reminderHour?: number | null;
}

export const createChore = async (
  houseId: number,
  createdById: number,
  input: Required<
    Pick<ChoreInput, 'title' | 'frequency' | 'startsOn' | 'rotation'>
  > &
    ChoreInput,
  today: Date,
) => {
  const id = await prisma.$transaction(async (tx) => {
    await assertMembers(tx, houseId, input.rotation);
    const chore = await tx.chore.create({
      data: {
        houseId,
        createdById,
        title: input.title,
        frequency: input.frequency,
        startsOn: parseDate(input.startsOn),
        allowSwaps: input.allowSwaps,
        reminderHour: input.reminderHour,
      },
    });
    await writeRotation(tx, chore.id, input.rotation);
    return chore.id;
  });
  return getChore(houseId, id, today);
};

/**
 * Editing a chore never rewrites history: finished turns and overdue ones stay.
 *  - schedule change (frequency / start date): new turns start at startsOn
 *    (defaults to the next turn under the old schedule) with rotation position 0.
 *  - rotation change only: rotation position 0 takes the next turn.
 */
export const updateChore = async (
  houseId: number,
  choreId: number,
  input: ChoreInput,
  today: Date,
) => {
  await prisma.$transaction(async (tx) => {
    const chore = await loadChore(tx, houseId, choreId);
    const data: Prisma.ChoreUpdateInput = {
      title: input.title,
      allowSwaps: input.allowSwaps,
      reminderHour: input.reminderHour,
    };

    const scheduleChanged =
      (input.frequency !== undefined && input.frequency !== chore.frequency) ||
      (input.startsOn !== undefined &&
        input.startsOn !== formatDate(chore.startsOn));

    if (input.rotation) {
      await assertMembers(tx, houseId, input.rotation);
    }

    if (scheduleChanged || input.rotation) {
      await clearFutureTurns(tx, choreId, today);
    }

    if (scheduleChanged) {
      const startsOn = input.startsOn
        ? parseDate(input.startsOn)
        : dueDateOf(chore, firstTurnOnOrAfter(chore, today));
      if (startsOn < today) {
        throw new BadRequestError(
          'A new schedule has to start today or later.',
        );
      }
      const last = await tx.choreAssignment.aggregate({
        where: { choreId },
        _max: { occurrence: true },
      });
      const base = Math.max(
        chore.occurrenceBase + firstTurnOnOrAfter(chore, today),
        (last._max.occurrence ?? -1) + 1,
      );
      Object.assign(data, {
        frequency: input.frequency ?? chore.frequency,
        startsOn,
        occurrenceBase: base,
        rotationAnchor: base,
      });
    } else if (input.rotation) {
      data.rotationAnchor =
        chore.occurrenceBase + firstTurnOnOrAfter(chore, today);
    }

    if (input.rotation) {
      await writeRotation(tx, choreId, input.rotation);
    }
    await tx.chore.update({ where: { id: choreId }, data });
  });
  return getChore(houseId, choreId, today);
};

export const archiveChore = async (
  houseId: number,
  choreId: number,
  today: Date,
) => {
  await prisma.$transaction(async (tx) => {
    await loadChore(tx, houseId, choreId);
    await clearFutureTurns(tx, choreId, today);
    await tx.chore.update({
      where: { id: choreId },
      data: { archivedAt: new Date() },
    });
  });
};

/**
 * Called when someone leaves the house. They drop out of every rotation, their
 * unfinished turns go away, and the rotation carries on with whoever was next.
 */
export const removeFromRotations = async (
  tx: Prisma.TransactionClient,
  houseId: number,
  userId: number,
  today: Date,
) => {
  const chores = await tx.chore.findMany({
    where: { houseId, rotation: { some: { userId } } },
    include: { rotation: true },
  });

  for (const chore of chores) {
    const oldOrder = rotationOrder(chore);
    const newOrder = oldOrder.filter((id) => id !== userId);
    const nextK = firstTurnOnOrAfter(chore, today);
    const nextOccurrence = chore.occurrenceBase + nextK;

    // Who would have gone next? If that's the leaver, the person after them.
    let nextUser = assigneeFor(chore, oldOrder, nextOccurrence);
    if (nextUser === userId && newOrder.length > 0) {
      nextUser = oldOrder[(oldOrder.indexOf(userId) + 1) % oldOrder.length]!;
    }

    await tx.choreAssignment.deleteMany({
      where: {
        choreId: chore.id,
        completedAt: null,
        OR: [{ dueOn: { gte: today } }, { assigneeId: userId }],
      },
    });
    await writeRotation(tx, chore.id, newOrder);
    if (newOrder.length > 0 && nextUser !== null) {
      await tx.chore.update({
        where: { id: chore.id },
        data: { rotationAnchor: nextOccurrence - newOrder.indexOf(nextUser) },
      });
    }
  }
};

// ─────────────────────────── Turns (assignments) ───────────────────────────

export const listAssignments = async (
  houseId: number,
  meId: number,
  q: {
    from: string;
    to: string;
    assignee?: 'me' | number;
    includeOverdue: boolean;
  },
  today: Date,
) => {
  const from = parseDate(q.from);
  const to = parseDate(q.to);
  const lookbackFrom = q.includeOverdue
    ? addDays(from, -OVERDUE_LOOKBACK_DAYS)
    : from;

  const chores = await prisma.chore.findMany({
    where: { houseId, archivedAt: null },
    include: { rotation: true },
  });
  await ensureAssignments(prisma, chores, lookbackFrom, to);

  const assigneeId = q.assignee === 'me' ? meId : q.assignee;
  const rows = await prisma.choreAssignment.findMany({
    where: {
      chore: { houseId, archivedAt: null },
      ...(assigneeId !== undefined && { assigneeId }),
      OR: [
        { dueOn: { gte: from, lte: to } },
        ...(q.includeOverdue
          ? [{ dueOn: { gte: lookbackFrom, lt: from }, completedAt: null }]
          : []),
      ],
    },
    orderBy: [{ dueOn: 'asc' }, { id: 'asc' }],
    include: assignmentInclude,
  });
  return rows.map((a) => serializeAssignment(a, today));
};

const loadAssignment = async (houseId: number, assignmentId: number) => {
  const a = await prisma.choreAssignment.findFirst({
    where: { id: assignmentId, chore: { houseId } },
    include: assignmentInclude,
  });
  if (!a) throw new NotFoundError('Chore turn not found.');
  return a;
};

/** Anyone in the house can tick a turn off (covering for someone counts). */
export const setCompleted = async (
  houseId: number,
  assignmentId: number,
  userId: number,
  completed: boolean,
  today: Date,
) => {
  await loadAssignment(houseId, assignmentId);
  await prisma.choreAssignment.update({
    where: { id: assignmentId },
    data: completed
      ? { completedAt: new Date(), completedById: userId }
      : { completedAt: null, completedById: null },
  });
  return serializeAssignment(
    await loadAssignment(houseId, assignmentId),
    today,
  );
};

/**
 * Trade turns of the same chore. MVP: takes effect immediately if you hold one
 * of the two turns. (Later: ask the other person to accept first.)
 */
export const swapTurns = async (
  houseId: number,
  assignmentId: number,
  withAssignmentId: number,
  userId: number,
  today: Date,
) => {
  const [a, b] = await Promise.all([
    loadAssignment(houseId, assignmentId),
    loadAssignment(houseId, withAssignmentId),
  ]);
  if (a.chore.id !== b.chore.id) {
    throw new BadRequestError('You can only swap turns of the same chore.');
  }
  if (!a.chore.allowSwaps) {
    throw new ForbiddenError('Swaps are turned off for this chore.');
  }
  if (a.completedAt || b.completedAt || a.dueOn < today || b.dueOn < today) {
    throw new BadRequestError(
      'Only upcoming, unfinished turns can be swapped.',
    );
  }
  if (a.assignee.id !== userId && b.assignee.id !== userId) {
    throw new ForbiddenError('You can only swap one of your own turns.');
  }
  await prisma.$transaction([
    prisma.choreAssignment.update({
      where: { id: a.id },
      data: { assigneeId: b.assignee.id },
    }),
    prisma.choreAssignment.update({
      where: { id: b.id },
      data: { assigneeId: a.assignee.id },
    }),
  ]);
  return Promise.all([
    loadAssignment(houseId, a.id).then((x) => serializeAssignment(x, today)),
    loadAssignment(houseId, b.id).then((x) => serializeAssignment(x, today)),
  ]);
};

/** "Done this month": turns each roommate finished in the given month. */
export const monthlyStats = async (houseId: number, month: string) => {
  const start = parseDate(`${month}-01`);
  const end = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
  );
  const [members, counts] = await Promise.all([
    prisma.houseMember.findMany({
      where: { houseId },
      orderBy: { joinedAt: 'asc' },
      select: { user: { select: publicUserSelect } },
    }),
    prisma.choreAssignment.groupBy({
      by: ['completedById'],
      where: {
        chore: { houseId },
        completedAt: { not: null },
        dueOn: { gte: start, lt: end },
      },
      _count: { _all: true },
    }),
  ]);
  const byUser = new Map(counts.map((c) => [c.completedById, c._count._all]));
  return {
    month,
    members: members.map(({ user }) => ({
      user,
      done: byUser.get(user.id) ?? 0,
    })),
  };
};
