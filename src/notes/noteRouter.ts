import { Router } from 'express';

import { validateRequest } from '../middleware/validateRequest.js';
import {
  createNote,
  deleteNote,
  getNote,
  listNotes,
  pinNote,
  unpinNote,
  updateNote,
} from './noteController.js';
import {
  createNoteSchema,
  listNotesSchema,
  noteParamsSchema,
  updateNoteSchema,
} from './notes.schema.js';

/** Mounted at /houses/:houseId/notes (membership already checked). */
const router = Router({ mergeParams: true });

router.get('/', validateRequest(listNotesSchema), listNotes);
router.post('/', validateRequest(createNoteSchema), createNote);
router.get('/:noteId', validateRequest(noteParamsSchema), getNote);
router.patch('/:noteId', validateRequest(updateNoteSchema), updateNote);
router.delete('/:noteId', validateRequest(noteParamsSchema), deleteNote);
router.post('/:noteId/pin', validateRequest(noteParamsSchema), pinNote);
router.delete('/:noteId/pin', validateRequest(noteParamsSchema), unpinNote);

export default router;
