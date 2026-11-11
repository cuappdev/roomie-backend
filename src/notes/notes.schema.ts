import { z } from 'zod';

import { houseIdParams, ymd } from '../houses/houses.schema.js';

/** The post-it colors in the Note Board design, in the order the server hands them out. */
export const NOTE_COLORS = [
  'YELLOW',
  'ORANGE',
  'BLUE',
  'GREEN',
  'PINK',
  'PURPLE',
] as const;

const color = z.enum(NOTE_COLORS);
const body = z.string().trim().min(1).max(500);

const noteParams = houseIdParams.extend({ noteId: z.coerce.number().int() });

export const listNotesSchema = z.object({ params: houseIdParams });

export const createNoteSchema = z.object({
  params: houseIdParams,
  body: z.object({
    body,
    /** Leave it out and the server picks one, so the board stays colorful. */
    color: color.optional(),
    dueOn: ymd.nullable().optional(),
    /** The "Pin Note" switch on Leave a Note. */
    pinned: z.boolean().default(false),
    /** The "Notify Others" switch. Accepted, but ignored until push notifications exist. */
    notify: z.boolean().optional(),
  }),
});

export const updateNoteSchema = z.object({
  params: noteParams,
  body: z.object({ body, color, dueOn: ymd.nullable() }).partial(),
});

export const noteParamsSchema = z.object({ params: noteParams });
