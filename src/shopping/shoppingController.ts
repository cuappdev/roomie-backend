import type { Request, Response } from 'express';

import type { Prisma } from '../generated/prisma/client.js';
import { valid } from '../middleware/validateRequest.js';
import { prisma } from '../prisma.js';
import { BadRequestError, NotFoundError } from '../utils/AppError.js';
import { publicUserSelect } from '../utils/selects.js';
import {
  buyItemSchema,
  createItemSchema,
  itemParamsSchema,
  listItemsSchema,
  updateItemSchema,
} from './shopping.schema.js';

/** Bought items drop off the list after this long unless they're still waiting to be billed. */
const BOUGHT_VISIBLE_DAYS = 14;

const itemInclude = {
  addedBy: { select: publicUserSelect },
  claimedBy: { select: publicUserSelect },
  boughtBy: { select: publicUserSelect },
} as const;

type ItemRow = Prisma.ShoppingItemGetPayload<{ include: typeof itemInclude }>;

const serialize = ({
  houseId: _h,
  addedById: _a,
  claimedById: _c,
  boughtById: _b,
  ...item
}: ItemRow) => item;

const loadItem = async (houseId: number, itemId: number) => {
  const item = await prisma.shoppingItem.findFirst({
    where: { id: itemId, houseId },
    include: itemInclude,
  });
  if (!item) throw new NotFoundError('Item not found.');
  return item;
};

const updateAndReturn = async (
  houseId: number,
  itemId: number,
  data: Prisma.ShoppingItemUncheckedUpdateInput,
) => {
  await loadItem(houseId, itemId);
  await prisma.shoppingItem.update({ where: { id: itemId }, data });
  return serialize(await loadItem(houseId, itemId));
};

/**
 * GET /houses/:houseId/shopping-items
 * Returns the two sections of the Shopping screen plus what "Split $X as a bill"
 * would cover (bought by you, priced, not billed yet).
 */
export const listItems = async (req: Request, res: Response) => {
  const { params, query } = valid(req, listItemsSchema);
  const since = new Date(Date.now() - BOUGHT_VISIBLE_DAYS * 86_400_000);

  const items = await prisma.shoppingItem.findMany({
    where: {
      houseId: params.houseId,
      ...(query.category && { category: query.category }),
      ...(query.status && { status: query.status }),
      OR: [
        { status: 'NEEDED' },
        { status: 'BOUGHT', billId: null },
        { status: 'BOUGHT', boughtAt: { gte: since } },
      ],
    },
    orderBy: [{ createdAt: 'asc' }],
    include: itemInclude,
  });

  const needed = items.filter((i) => i.status === 'NEEDED');
  const bought = items
    .filter((i) => i.status === 'BOUGHT')
    .sort((a, b) => b.boughtAt!.getTime() - a.boughtAt!.getTime());
  const billable = bought.filter(
    (i) =>
      i.boughtById === req.user!.id &&
      i.billId === null &&
      i.priceCents !== null,
  );

  res.json({
    needed: needed.map(serialize),
    bought: bought.map(serialize),
    billable: {
      itemIds: billable.map((i) => i.id),
      totalCents: billable.reduce((sum, i) => sum + i.priceCents!, 0),
    },
  });
};

export const createItem = async (req: Request, res: Response) => {
  const { params, body } = valid(req, createItemSchema);
  const item = await prisma.shoppingItem.create({
    data: { ...body, houseId: params.houseId, addedById: req.user!.id },
    include: itemInclude,
  });
  res.status(201).json({ item: serialize(item) });
};

export const updateItem = async (req: Request, res: Response) => {
  const { params, body } = valid(req, updateItemSchema);
  const existing = await loadItem(params.houseId, params.itemId);
  if (existing.billId !== null && body.priceCents !== undefined) {
    throw new BadRequestError('This item is already on a bill.');
  }
  res.json({
    item: await updateAndReturn(params.houseId, params.itemId, body),
  });
};

export const deleteItem = async (req: Request, res: Response) => {
  const { params } = valid(req, itemParamsSchema);
  const item = await loadItem(params.houseId, params.itemId);
  if (item.billId !== null) {
    throw new BadRequestError('This item is on a bill and can’t be deleted.');
  }
  await prisma.shoppingItem.delete({ where: { id: item.id } });
  res.status(204).end();
};

/** "I'll get it" */
export const claimItem = async (req: Request, res: Response) => {
  const { params } = valid(req, itemParamsSchema);
  const item = await loadItem(params.houseId, params.itemId);
  if (item.status !== 'NEEDED') throw new BadRequestError('Already bought.');
  res.json({
    item: await updateAndReturn(params.houseId, params.itemId, {
      claimedById: req.user!.id,
    }),
  });
};

export const unclaimItem = async (req: Request, res: Response) => {
  const { params } = valid(req, itemParamsSchema);
  res.json({
    item: await updateAndReturn(params.houseId, params.itemId, {
      claimedById: null,
    }),
  });
};

/** Tick the checkbox. Price is optional now and can be added later with PATCH. */
export const buyItem = async (req: Request, res: Response) => {
  const { params, body } = valid(req, buyItemSchema);
  const item = await loadItem(params.houseId, params.itemId);
  if (item.status === 'BOUGHT') throw new BadRequestError('Already bought.');
  res.json({
    item: await updateAndReturn(params.houseId, params.itemId, {
      status: 'BOUGHT',
      boughtById: req.user!.id,
      boughtAt: new Date(),
      claimedById: null,
      ...(body.priceCents !== undefined && { priceCents: body.priceCents }),
    }),
  });
};

/** Undo a mis-tap. */
export const unbuyItem = async (req: Request, res: Response) => {
  const { params } = valid(req, itemParamsSchema);
  const item = await loadItem(params.houseId, params.itemId);
  if (item.billId !== null) {
    throw new BadRequestError('This item is already on a bill.');
  }
  res.json({
    item: await updateAndReturn(params.houseId, params.itemId, {
      status: 'NEEDED',
      boughtById: null,
      boughtAt: null,
      priceCents: null,
    }),
  });
};
