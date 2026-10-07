import { getFirebaseAuth } from '../firebase.js';
import { ForbiddenError, UnauthorizedError } from '../utils/AppError.js';

export interface VerifiedIdentity {
  firebaseUid: string;
  email: string;
  netid: string;
  name: string;
  avatarUrl?: string;
}

const CORNELL_SUFFIX = '@cornell.edu';

/** Comma-separated full emails allowed besides @cornell.edu (e.g. a reviewer account). */
const emailAllowlist = () =>
  new Set(
    (process.env.EMAIL_ALLOWLIST ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );

export const isDevBypassEnabled = () =>
  process.env.AUTH_DEV_BYPASS === 'true' &&
  process.env.NODE_ENV !== 'production';

const netidFromEmail = (email: string) => email.split('@')[0]!.toLowerCase();

/**
 * Verifies a Firebase ID token (from Google sign-in on iOS/Android) and returns
 * who it belongs to. Only Cornell accounts get through.
 *
 * Local development: with AUTH_DEV_BYPASS=true (never in production) you can send
 * `Bearer dev:<netid>` instead of a real token.
 */
export const verifyIdToken = async (
  token: string,
): Promise<VerifiedIdentity> => {
  if (token.startsWith('dev:')) {
    if (!isDevBypassEnabled()) {
      throw new UnauthorizedError('Invalid token.');
    }
    const netid = token.slice(4).toLowerCase();
    if (!/^[a-z]{1,4}\d{1,6}$/.test(netid)) {
      throw new UnauthorizedError('Dev tokens look like dev:<netid>.');
    }
    return {
      firebaseUid: `dev-${netid}`,
      email: `${netid}${CORNELL_SUFFIX}`,
      netid,
      name: netid,
    };
  }

  let decoded;
  try {
    decoded = await getFirebaseAuth().verifyIdToken(token);
  } catch {
    throw new UnauthorizedError('Invalid or expired token.');
  }

  const email = decoded.email?.trim().toLowerCase();
  if (!email || !decoded.email_verified) {
    throw new ForbiddenError('A verified email is required.');
  }
  if (!email.endsWith(CORNELL_SUFFIX) && !emailAllowlist().has(email)) {
    throw new ForbiddenError('Only Cornell accounts can use Roomie.');
  }

  return {
    firebaseUid: decoded.uid,
    email,
    netid: netidFromEmail(email),
    name: (decoded.name as string | undefined) ?? netidFromEmail(email),
    avatarUrl: decoded.picture,
  };
};

export const bearerToken = (header: string | undefined) => {
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('No token provided or wrong format.');
  }
  const token = header.slice(7).trim();
  if (!token) {
    throw new UnauthorizedError('No token provided.');
  }
  return token;
};
