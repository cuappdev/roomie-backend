import type { HouseMember, User } from '../../generated/prisma/client.js';

export type AuthedUser = User & { membership: HouseMember | null };

declare global {
  namespace Express {
    export interface Request {
      /** Set by requireAuth. */
      user?: AuthedUser;
      /** Set by requireHouseMember. */
      membership?: HouseMember;
      /** Set by validateRequest: the parsed (coerced, defaulted) request data. */
      validated?: { body: unknown; query: unknown; params: unknown };
    }
  }
}
