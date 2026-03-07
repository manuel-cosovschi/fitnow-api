// src/routes/hazards.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.middleware.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { createHazardSchema, nearQuerySchema, updateStatusSchema } from '../schemas/hazard.schemas.js';
import * as ctrl from '../controllers/hazards.controller.js';

const router = Router();

router.post ('/',          requireAuth, validateBody(createHazardSchema),    ctrl.create);
router.get  ('/near',      requireAuth, validateQuery(nearQuerySchema),       ctrl.findNear);
router.post ('/:id/vote',  requireAuth,                                       ctrl.vote);
router.patch('/:id/status', requireAuth, requireRole('admin'), validateBody(updateStatusSchema), ctrl.updateStatus);
router.get  ('/', requireAuth, requireRole('admin'),                          ctrl.listAll);

export default router;
