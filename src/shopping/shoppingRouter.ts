import { Router } from 'express';

import { validateRequest } from '../middleware/validateRequest.js';
import {
  buyItemSchema,
  createItemSchema,
  itemParamsSchema,
  listItemsSchema,
  updateItemSchema,
} from './shopping.schema.js';
import {
  buyItem,
  claimItem,
  createItem,
  deleteItem,
  listItems,
  unbuyItem,
  unclaimItem,
  updateItem,
} from './shoppingController.js';

/** Mounted at /houses/:houseId/shopping-items (membership already checked). */
const router = Router({ mergeParams: true });

router.get('/', validateRequest(listItemsSchema), listItems);
router.post('/', validateRequest(createItemSchema), createItem);
router.patch('/:itemId', validateRequest(updateItemSchema), updateItem);
router.delete('/:itemId', validateRequest(itemParamsSchema), deleteItem);
router.post('/:itemId/claim', validateRequest(itemParamsSchema), claimItem);
router.delete('/:itemId/claim', validateRequest(itemParamsSchema), unclaimItem);
router.post('/:itemId/buy', validateRequest(buyItemSchema), buyItem);
router.delete('/:itemId/buy', validateRequest(itemParamsSchema), unbuyItem);

export default router;
