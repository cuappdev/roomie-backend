import { randomInt } from 'crypto';

/**
 * Codes look like the design's "LOFT-4827": up to 4 letters from the last word of
 * the house name plus 4 random digits. Uniqueness is enforced by the DB; callers
 * retry on conflict.
 */
export const makeInviteCode = (houseName: string): string => {
  const words = houseName.toUpperCase().match(/[A-Z]+/g) ?? [];
  const letters = (words.at(-1) ?? 'HOME').slice(0, 4);
  return `${letters}-${randomInt(0, 10000).toString().padStart(4, '0')}`;
};

export const normalizeInviteCode = (code: string) =>
  code.trim().toUpperCase().replace(/\s+/g, '');
