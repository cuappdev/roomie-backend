import type { Request, Response } from 'express';

import { valid } from '../middleware/validateRequest.js';
import { prisma } from '../prisma.js';
import { todayIn } from '../utils/dates.js';
import * as choreService from './choreService.js';
import {
  assignmentParamsSchema,
  choreParamsSchema,
  createChoreSchema,
  listAssignmentsSchema,
  listChoresSchema,
  statsSchema,
  swapSchema,
  updateChoreSchema,
} from './chores.schema.js';

/** "Today" depends on where the house is, not the server. */
const houseToday = async (houseId: number) => {
  const { timezone } = await prisma.house.findUniqueOrThrow({
    where: { id: houseId },
    select: { timezone: true },
  });
  return todayIn(timezone);
};

export const listChores = async (req: Request, res: Response) => {
  const { params } = valid(req, listChoresSchema);
  const today = await houseToday(params.houseId);
  res.json({ chores: await choreService.listChores(params.houseId, today) });
};

export const getChore = async (req: Request, res: Response) => {
  const { params } = valid(req, choreParamsSchema);
  const today = await houseToday(params.houseId);
  res.json({
    chore: await choreService.getChore(params.houseId, params.choreId, today),
  });
};

export const createChore = async (req: Request, res: Response) => {
  const { params, body } = valid(req, createChoreSchema);
  const today = await houseToday(params.houseId);
  const chore = await choreService.createChore(
    params.houseId,
    req.user!.id,
    body,
    today,
  );
  res.status(201).json({ chore });
};

export const updateChore = async (req: Request, res: Response) => {
  const { params, body } = valid(req, updateChoreSchema);
  const today = await houseToday(params.houseId);
  const chore = await choreService.updateChore(
    params.houseId,
    params.choreId,
    body,
    today,
  );
  res.json({ chore });
};

export const archiveChore = async (req: Request, res: Response) => {
  const { params } = valid(req, choreParamsSchema);
  const today = await houseToday(params.houseId);
  await choreService.archiveChore(params.houseId, params.choreId, today);
  res.status(204).end();
};

export const listAssignments = async (req: Request, res: Response) => {
  const { params, query } = valid(req, listAssignmentsSchema);
  const today = await houseToday(params.houseId);
  const assignments = await choreService.listAssignments(
    params.houseId,
    req.user!.id,
    query,
    today,
  );
  res.json({ assignments });
};

const setCompleted =
  (completed: boolean) => async (req: Request, res: Response) => {
    const { params } = valid(req, assignmentParamsSchema);
    const today = await houseToday(params.houseId);
    const assignment = await choreService.setCompleted(
      params.houseId,
      params.assignmentId,
      req.user!.id,
      completed,
      today,
    );
    res.json({ assignment });
  };
export const completeAssignment = setCompleted(true);
export const uncompleteAssignment = setCompleted(false);

export const swapAssignment = async (req: Request, res: Response) => {
  const { params, body } = valid(req, swapSchema);
  const today = await houseToday(params.houseId);
  const assignments = await choreService.swapTurns(
    params.houseId,
    params.assignmentId,
    body.withAssignmentId,
    req.user!.id,
    today,
  );
  res.json({ assignments });
};

export const stats = async (req: Request, res: Response) => {
  const { params, query } = valid(req, statsSchema);
  const month =
    query.month ?? (await houseToday(params.houseId)).toISOString().slice(0, 7);
  res.json(await choreService.monthlyStats(params.houseId, month));
};
