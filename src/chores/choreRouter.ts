import { Router } from 'express';

import { validateRequest } from '../middleware/validateRequest.js';
import {
  archiveChore,
  completeAssignment,
  createChore,
  getChore,
  listAssignments,
  listChores,
  stats,
  swapAssignment,
  uncompleteAssignment,
  updateChore,
} from './choreController.js';
import {
  assignmentParamsSchema,
  choreParamsSchema,
  createChoreSchema,
  listAssignmentsSchema,
  listChoresSchema,
  statsSchema,
  swapSchema,
  updateChoreSchema,
} from './chores.schema.js';

/** Mounted under /houses/:houseId (membership already checked). */
const router = Router({ mergeParams: true });

// Chore definitions + rotations ("New chore" screen)
router.get('/chores', validateRequest(listChoresSchema), listChores);
router.post('/chores', validateRequest(createChoreSchema), createChore);
router.get('/chores/stats', validateRequest(statsSchema), stats);
router.get('/chores/:choreId', validateRequest(choreParamsSchema), getChore);
router.patch(
  '/chores/:choreId',
  validateRequest(updateChoreSchema),
  updateChore,
);
router.delete(
  '/chores/:choreId',
  validateRequest(choreParamsSchema),
  archiveChore,
);

// Individual turns ("Chores" week view, "Your chores today" on Home)
router.get(
  '/chore-assignments',
  validateRequest(listAssignmentsSchema),
  listAssignments,
);
router.post(
  '/chore-assignments/:assignmentId/complete',
  validateRequest(assignmentParamsSchema),
  completeAssignment,
);
router.delete(
  '/chore-assignments/:assignmentId/complete',
  validateRequest(assignmentParamsSchema),
  uncompleteAssignment,
);
router.post(
  '/chore-assignments/:assignmentId/swap',
  validateRequest(swapSchema),
  swapAssignment,
);

export default router;
