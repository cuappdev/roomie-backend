import type { NextFunction, Request, Response } from 'express';

import { bearerToken, verifyIdToken } from '../auth/tokens.js';
import { prisma } from '../prisma.js';
import { ForbiddenError, NotFoundError } from '../utils/AppError.js';

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

/**
 * For routes under /houses/:houseId. Responds 404 (not 403) to non-members so
 * house IDs can't be probed.
 */
export const requireHouseMember = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const houseId = Number(req.params.houseId);
  const membership = req.user?.membership;
  if (!membership || membership.houseId !== houseId) {
    throw new NotFoundError('House not found.');
  }
  req.membership = membership;
  next();
};

export const requireHouseOwner = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (req.membership?.role !== 'OWNER') {
    throw new ForbiddenError('Only the house owner can do this.');
  }
  next();
};
