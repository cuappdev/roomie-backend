import { z } from 'zod';

import { houseIdParams, ymd } from '../houses/houses.schema.js';

const frequency = z.enum([
  'DAILY',
  'EVERY_OTHER_DAY',
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
]);

const rotation = z
  .array(z.number().int())
  .min(1, 'Pick at least one person')
  .refine((ids) => new Set(ids).size === ids.length, 'No duplicates');

const choreFields = z.object({
  title: z.string().trim().min(1).max(80),
  frequency,
  startsOn: ymd,
  /** User IDs in turn order; the first person takes the next turn. */
  rotation,
  allowSwaps: z.boolean(),
  /** Hour (0–23) the day before to remind the assignee; null for no reminder. */
  reminderHour: z.number().int().min(0).max(23).nullable(),
});

const choreParams = houseIdParams.extend({ choreId: z.coerce.number().int() });
const assignmentParams = houseIdParams.extend({
  assignmentId: z.coerce.number().int(),
});

export const listChoresSchema = z.object({ params: houseIdParams });

export const createChoreSchema = z.object({
  params: houseIdParams,
  body: choreFields.partial({ allowSwaps: true, reminderHour: true }),
});

export const choreParamsSchema = z.object({ params: choreParams });

export const updateChoreSchema = z.object({
  params: choreParams,
  body: choreFields.partial(),
});

export const listAssignmentsSchema = z.object({
  params: houseIdParams,
  query: z
    .object({
      from: ymd,
      to: ymd,
      /** "me" or a user ID */
      assignee: z.union([z.literal('me'), z.coerce.number().int()]).optional(),
      /** Also return unfinished turns from the 30 days before `from`. */
      includeOverdue: z
        .enum(['true', 'false'])
        .default('false')
        .transform((v) => v === 'true'),
    })
    .refine((q) => q.from <= q.to, 'from must be on or before to')
    .refine(
      (q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= 62,
      'Range can be at most 62 days',
    ),
});

export const assignmentParamsSchema = z.object({ params: assignmentParams });

export const swapSchema = z.object({
  params: assignmentParams,
  body: z.object({ withAssignmentId: z.number().int() }),
});

export const statsSchema = z.object({
  params: houseIdParams,
  query: z.object({
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM')
      .optional(),
  }),
});
