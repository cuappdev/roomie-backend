import type { Request, Response } from 'express';

import type { NoteColor, Prisma } from '../generated/prisma/client.js';
import { valid } from '../middleware/validateRequest.js';
import { prisma } from '../prisma.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../utils/AppError.js';
import { formatDate, parseDate, todayIn } from '../utils/dates.js';
import { publicUserSelect } from '../utils/selects.js';
import {
  NOTE_COLORS,
  createNoteSchema,
  listNotesSchema,
  noteParamsSchema,
  updateNoteSchema,
} from './notes.schema.js';

/** "Notes stay on the board for 14 days." */
export const NOTE_VISIBLE_DAYS = 14;

const noteInclude = { author: { select: publicUserSelect } } as const;

type NoteRow = Prisma.NoteGetPayload<{ include: typeof noteInclude }>;

const serialize = ({
  houseId: _h,
  authorId: _a,
  dueOn,
  pinnedAt,
  ...note
}: NoteRow) => ({
  ...note,
  dueOn: dueOn && formatDate(dueOn),
  pinned: pinnedAt !== null,
  pinnedAt,
});

const houseToday = async (houseId: number) => {
  const house = await prisma.house.findUniqueOrThrow({
    where: { id: houseId },
    select: { timezone: true },
  });
  return todayIn(house.timezone);
};

/** Due dates can be today or later, in the house's time zone. */
const checkDueOn = async (
  houseId: number,
  dueOn: string | null | undefined,
) => {
  if (!dueOn) return;
  if (parseDate(dueOn) < (await houseToday(houseId))) {
    throw new BadRequestError('The due date can’t be in the past.');
  }
};

/**
 * Notes still on the board: pinned, posted in the last 14 days, or due today or later.
 * Same visibility everywhere, so an expired note 404s like a deleted one.
 */
const visibleWhere = (
  houseId: number,
  today: Date,
  now = new Date(),
): Prisma.NoteWhereInput => ({
  houseId,
  OR: [
    { pinnedAt: { not: null } },
    {
      createdAt: {
        gte: new Date(now.getTime() - NOTE_VISIBLE_DAYS * 86_400_000),
      },
    },
    { dueOn: { gte: today } },
  ],
});

const loadNote = async (houseId: number, noteId: number) => {
  const today = await houseToday(houseId);
  const note = await prisma.note.findFirst({
    where: { id: noteId, ...visibleWhere(houseId, today) },
    include: noteInclude,
  });
  if (!note) throw new NotFoundError('Note not found.');
  return note;
};

/**
 * Picks the color used least among the house's recent notes, so new notes cycle through
 * the palette the way the design shows. Ties go to the earliest color in NOTE_COLORS.
 */
const pickColor = async (houseId: number): Promise<NoteColor> => {
  const recent = await prisma.note.findMany({
    where: { houseId },
    orderBy: { id: 'desc' },
    take: NOTE_COLORS.length - 1,
    select: { color: true },
  });
  const uses = (c: NoteColor) => recent.filter((n) => n.color === c).length;
  return NOTE_COLORS.reduce((best, c) => (uses(c) < uses(best) ? c : best));
};

/**
 * GET /houses/:houseId/notes
 * The Note Board: pinned notes (most recently pinned first), then the rest newest first.
 */
export const listNotes = async (req: Request, res: Response) => {
  const { params } = valid(req, listNotesSchema);
  const today = await houseToday(params.houseId);
  const notes = await prisma.note.findMany({
    where: visibleWhere(params.houseId, today),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: noteInclude,
  });
  const pinned = notes
    .filter((n) => n.pinnedAt !== null)
    .sort((a, b) => b.pinnedAt!.getTime() - a.pinnedAt!.getTime());
  res.json({
    pinned: pinned.map(serialize),
    notes: notes.filter((n) => n.pinnedAt === null).map(serialize),
  });
};

/** POST /houses/:houseId/notes ("Leave a Note"). */
export const createNote = async (req: Request, res: Response) => {
  const { params, body } = valid(req, createNoteSchema);
  await checkDueOn(params.houseId, body.dueOn);
  const note = await prisma.note.create({
    data: {
      houseId: params.houseId,
      authorId: req.user!.id,
      body: body.body,
      color: body.color ?? (await pickColor(params.houseId)),
      dueOn: body.dueOn ? parseDate(body.dueOn) : null,
      pinnedAt: body.pinned ? new Date() : null,
    },
    include: noteInclude,
  });
  res.status(201).json({ note: serialize(note) });
};

export const getNote = async (req: Request, res: Response) => {
  const { params } = valid(req, noteParamsSchema);
  res.json({ note: serialize(await loadNote(params.houseId, params.noteId)) });
};

/** Inline edit: message, due date or color. Only the author can edit. */
export const updateNote = async (req: Request, res: Response) => {
  const { params, body } = valid(req, updateNoteSchema);
  const note = await loadNote(params.houseId, params.noteId);
  if (note.authorId !== req.user!.id) {
    throw new ForbiddenError('You can only edit your own notes.');
  }
  await checkDueOn(params.houseId, body.dueOn);
  const updated = await prisma.note.update({
    where: { id: note.id },
    data: {
      ...(body.body !== undefined && { body: body.body }),
      ...(body.color !== undefined && { color: body.color }),
      ...(body.dueOn !== undefined && {
        dueOn: body.dueOn ? parseDate(body.dueOn) : null,
      }),
    },
    include: noteInclude,
  });
  res.json({ note: serialize(updated) });
};

/** The author can delete their own notes; the house owner can delete any. */
export const deleteNote = async (req: Request, res: Response) => {
  const { params } = valid(req, noteParamsSchema);
  const note = await loadNote(params.houseId, params.noteId);
  if (note.authorId !== req.user!.id && req.membership!.role !== 'OWNER') {
    throw new ForbiddenError(
      'Only the author or the house owner can delete this.',
    );
  }
  await prisma.note.delete({ where: { id: note.id } });
  res.status(204).end();
};

/** Any member can pin. Pinning an already pinned note moves it to the top. */
export const pinNote = async (req: Request, res: Response) => {
  const { params } = valid(req, noteParamsSchema);
  const note = await loadNote(params.houseId, params.noteId);
  const updated = await prisma.note.update({
    where: { id: note.id },
    data: { pinnedAt: new Date() },
    include: noteInclude,
  });
  res.json({ note: serialize(updated) });
};

/** An unpinned note older than 14 days drops off the board, like any other. */
export const unpinNote = async (req: Request, res: Response) => {
  const { params } = valid(req, noteParamsSchema);
  const note = await loadNote(params.houseId, params.noteId);
  const updated = await prisma.note.update({
    where: { id: note.id },
    data: { pinnedAt: null },
    include: noteInclude,
  });
  res.json({ note: serialize(updated) });
};
