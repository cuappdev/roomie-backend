import { Router } from 'express';
import type { Request, Response } from 'express';

import { prisma } from '../prisma.js';
import { getSession } from '../users/userService.js';
import { meSelect } from '../utils/selects.js';
import { bearerToken, verifyIdToken } from './tokens.js';

const router = Router();

/**
 * POST /auth/login
 * Header: Authorization: Bearer <Firebase ID token from Google sign-in>
 *
 * Creates the Roomie account on first sign-in and returns the session the app
 * needs to decide where to go next:
 *   - no house + pendingInvites  → show "join <house>?"
 *   - no house                   → onboarding (create a house or enter an invite code)
 *   - house                      → Home
 */
router.post('/login', async (req: Request, res: Response) => {
  const identity = await verifyIdToken(bearerToken(req.headers.authorization));

  const existing = await prisma.user.findUnique({
    where: { firebaseUid: identity.firebaseUid },
    select: { id: true },
  });

  const user = existing
    ? existing
    : await prisma.user.create({
        data: {
          firebaseUid: identity.firebaseUid,
          email: identity.email,
          netid: identity.netid,
          name: identity.name,
          avatarUrl: identity.avatarUrl,
        },
        select: meSelect,
      });

  const session = await getSession(user.id);
  res.status(existing ? 200 : 201).json({ isNewUser: !existing, ...session });
});

export default router;
