import type { Request, Response } from 'express';

import { valid } from '../middleware/validateRequest.js';
import * as houseService from './houseService.js';
import {
  createHouseSchema,
  createInvitesSchema,
  houseParamsSchema,
  inviteParamsSchema,
  joinHouseSchema,
  memberParamsSchema,
  respondInviteSchema,
  updateHouseSchema,
} from './houses.schema.js';

export const createHouse = async (req: Request, res: Response) => {
  const { body } = valid(req, createHouseSchema);
  res
    .status(201)
    .json({ house: await houseService.createHouse(req.user!.id, body) });
};

export const getHouse = async (req: Request, res: Response) => {
  const { params } = valid(req, houseParamsSchema);
  res.json({ house: await houseService.getHouse(params.houseId) });
};

export const updateHouse = async (req: Request, res: Response) => {
  const { params, body } = valid(req, updateHouseSchema);
  res.json({ house: await houseService.updateHouse(params.houseId, body) });
};

export const regenerateInviteCode = async (req: Request, res: Response) => {
  const { params } = valid(req, houseParamsSchema);
  res.json({ house: await houseService.regenerateInviteCode(params.houseId) });
};

export const joinHouse = async (req: Request, res: Response) => {
  const { body } = valid(req, joinHouseSchema);
  const house = await houseService.joinByCode(
    req.user!.id,
    req.user!.netid,
    body.inviteCode,
  );
  res.json({ house });
};

export const createInvites = async (req: Request, res: Response) => {
  const { params, body } = valid(req, createInvitesSchema);
  const house = await houseService.inviteToHouse(
    params.houseId,
    req.user!.id,
    body.netids,
  );
  res.status(201).json({ house });
};

export const revokeInvite = async (req: Request, res: Response) => {
  const { params } = valid(req, inviteParamsSchema);
  await houseService.revokeInvite(params.houseId, params.inviteId);
  res.status(204).end();
};

export const acceptInvite = async (req: Request, res: Response) => {
  const { params } = valid(req, respondInviteSchema);
  const house = await houseService.respondToInvite(
    req.user!.id,
    req.user!.netid,
    params.inviteId,
    true,
  );
  res.json({ house });
};

export const declineInvite = async (req: Request, res: Response) => {
  const { params } = valid(req, respondInviteSchema);
  await houseService.respondToInvite(
    req.user!.id,
    req.user!.netid,
    params.inviteId,
    false,
  );
  res.status(204).end();
};

export const removeMember = async (req: Request, res: Response) => {
  const { params } = valid(req, memberParamsSchema);
  const target = params.userId === 'me' ? req.user!.id : params.userId;
  await houseService.removeMember(
    params.houseId,
    { userId: req.user!.id, role: req.membership!.role },
    target,
  );
  res.status(204).end();
};
