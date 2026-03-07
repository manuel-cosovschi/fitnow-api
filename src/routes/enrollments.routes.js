// src/routes/enrollments.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { enrollSchema } from '../schemas/enrollment.schemas.js';
import * as ctrl from '../controllers/enrollments.controller.js';

const router = Router();

router.post  ('/',     requireAuth, validateBody(enrollSchema), ctrl.enroll);
router.get   ('/mine', requireAuth,                             ctrl.listMine);
router.delete('/:id',  requireAuth,                             ctrl.cancel);

export default router;
