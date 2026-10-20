import type { NextFunction, Request, Response } from 'express';

import { bearerToken, verifyIdToken } from '../auth/tokens.js';
import { prisma } from '../prisma.js';
import { ForbiddenError } from '../utils/AppError.js';

/**
 * Verifies the Firebase ID token on every request and loads the Roomie user.
 * The user must have called POST /auth/login once to create their account.
 */
export const requireAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const identity = await verifyIdToken(bearerToken(req.headers.authorization));
  const user = await prisma.user.findUnique({
    where: { firebaseUid: identity.firebaseUid },
    include: { membership: true },
  });
  if (!user) {
    throw new ForbiddenError(
      'No Roomie account yet. Call POST /auth/login first.',
    );
  }
  req.user = user;
  next();
};
