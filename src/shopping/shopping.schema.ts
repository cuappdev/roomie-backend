import { z } from 'zod';

import { houseIdParams } from '../houses/houses.schema.js';

const category = z.enum(['GROCERIES', 'HOUSEHOLD', 'OTHER']);
/** Money is always whole cents: $4.29 → 429. */
const cents = z.number().int().min(0).max(10_000_000);

const itemParams = houseIdParams.extend({ itemId: z.coerce.number().int() });

export const listItemsSchema = z.object({
  params: houseIdParams,
  query: z.object({
    category: category.optional(),
    status: z.enum(['NEEDED', 'BOUGHT']).optional(),
  }),
});

export const createItemSchema = z.object({
  params: houseIdParams,
  body: z.object({
    name: z.string().trim().min(1).max(80),
    category: category.default('GROCERIES'),
  }),
});

export const updateItemSchema = z.object({
  params: itemParams,
  body: z
    .object({
      name: z.string().trim().min(1).max(80),
      category,
      priceCents: cents.nullable(),
    })
    .partial(),
});

export const itemParamsSchema = z.object({ params: itemParams });

export const buyItemSchema = z.object({
  params: itemParams,
  body: z.object({ priceCents: cents.optional() }),
});
