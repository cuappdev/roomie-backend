import { z } from 'zod';

export const netid = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z]{1,4}\d{1,6}$/, 'Not a valid NetID');

export const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Invalid date');

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color');
const feature = z.enum([
  'BILLS',
  'CHORES',
  'SHOPPING',
  'CALENDAR',
  'STORAGE',
  'MOODBOARD',
]);

export const houseIdParams = z.object({ houseId: z.coerce.number().int() });

const houseFields = z.object({
  name: z.string().trim().min(1).max(60),
  color: hexColor,
  livingType: z.enum(['ON_CAMPUS', 'OFF_CAMPUS']),
  address: z.string().trim().max(200).nullable(),
  unit: z.string().trim().max(40).nullable(),
  leaseEndsOn: ymd.nullable(),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown time zone'),
  features: z.array(feature).max(6),
});

/** Onboarding steps 3a–5 can be sent in one request, or name only and the rest later. */
export const createHouseSchema = z.object({
  body: houseFields.partial().extend({
    name: houseFields.shape.name,
    inviteNetids: z.array(netid).max(12).default([]),
  }),
});

export const updateHouseSchema = z.object({
  params: houseIdParams,
  body: houseFields.partial(),
});

export const houseParamsSchema = z.object({ params: houseIdParams });

export const joinHouseSchema = z.object({
  body: z.object({ inviteCode: z.string().trim().min(4).max(20) }),
});

export const createInvitesSchema = z.object({
  params: houseIdParams,
  body: z.object({ netids: z.array(netid).min(1).max(12) }),
});

export const inviteParamsSchema = z.object({
  params: houseIdParams.extend({ inviteId: z.coerce.number().int() }),
});

export const respondInviteSchema = z.object({
  params: z.object({ inviteId: z.coerce.number().int() }),
});

export const memberParamsSchema = z.object({
  params: houseIdParams.extend({
    userId: z.union([z.literal('me'), z.coerce.number().int()]),
  }),
});
