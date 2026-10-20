import { z } from 'zod';

import { Router } from 'express';
import type { Request, Response } from 'express';

import { valid, validateRequest } from '../middleware/validateRequest.js';
import { prisma } from '../prisma.js';
import { getSession } from './userService.js';

const router = Router();

/** GET /users/me: same payload as login, for app launch. */
router.get('/me', async (req: Request, res: Response) => {
  res.json(await getSession(req.user!.id));
});

const updateMeSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(1).max(80),
      major: z.string().trim().max(80).nullable(),
      presence: z.enum(['HOME', 'AWAY']),
    })
    .partial(),
});

/** PATCH /users/me: profile edits and the "I'm home / away" toggle. */
router.patch(
  '/me',
  validateRequest(updateMeSchema),
  async (req: Request, res: Response) => {
    const { body } = valid(req, updateMeSchema);
    await prisma.user.update({ where: { id: req.user!.id }, data: body });
    res.json(await getSession(req.user!.id));
  },
);

export default router;
