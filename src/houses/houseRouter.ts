import { Router } from 'express';

import choreRouter from '../chores/choreRouter.js';
import {
  requireHouseMember,
  requireHouseOwner,
} from '../middleware/authentication.js';
import { validateRequest } from '../middleware/validateRequest.js';
import shoppingRouter from '../shopping/shoppingRouter.js';
import {
  acceptInvite,
  createHouse,
  createInvites,
  declineInvite,
  getHouse,
  joinHouse,
  regenerateInviteCode,
  removeMember,
  revokeInvite,
  updateHouse,
} from './houseController.js';
import {
  createHouseSchema,
  createInvitesSchema,
  houseParamsSchema,
  inviteParamsSchema,
  joinHouseSchema,
  memberParamsSchema,
  respondInviteSchema,
  updateHouseSchema,
} from './houses.schema.js';

export const inviteRouter = Router();
inviteRouter.post(
  '/:inviteId/accept',
  validateRequest(respondInviteSchema),
  acceptInvite,
);
inviteRouter.post(
  '/:inviteId/decline',
  validateRequest(respondInviteSchema),
  declineInvite,
);

const router = Router();

router.post('/', validateRequest(createHouseSchema), createHouse);
router.post('/join', validateRequest(joinHouseSchema), joinHouse);

// Everything below needs you to live in :houseId.
const house = Router({ mergeParams: true });
router.use('/:houseId', requireHouseMember, house);

house.get('/', validateRequest(houseParamsSchema), getHouse);
house.patch('/', validateRequest(updateHouseSchema), updateHouse);
house.post(
  '/invite-code',
  requireHouseOwner,
  validateRequest(houseParamsSchema),
  regenerateInviteCode,
);
house.post('/invites', validateRequest(createInvitesSchema), createInvites);
house.delete(
  '/invites/:inviteId',
  validateRequest(inviteParamsSchema),
  revokeInvite,
);
house.delete(
  '/members/:userId',
  validateRequest(memberParamsSchema),
  removeMember,
);

// Feature routers mounted under /houses/:houseId
house.use('/', choreRouter);
house.use('/shopping-items', shoppingRouter);

export default router;
