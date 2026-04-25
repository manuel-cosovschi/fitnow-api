// src/routes/training-plans.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as ctrl from '../controllers/training-plans.controller.js';

const router = Router();

router.get  ('/',             requireAuth, ctrl.list);
router.get  ('/active',       requireAuth, ctrl.listActive);
router.post ('/generate',     requireAuth, ctrl.generate);
router.get  ('/:id',          requireAuth, ctrl.getById);
router.patch('/:id/cancel',   requireAuth, ctrl.cancel);

export default router;
