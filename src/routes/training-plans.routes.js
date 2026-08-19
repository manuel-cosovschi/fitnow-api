// src/routes/training-plans.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePremium } from '../middleware/entitlements.js';
import { PREMIUM_FEATURES } from '../config/plans.js';
import * as ctrl from '../controllers/training-plans.controller.js';

const router = Router();

router.get  ('/',             requireAuth, ctrl.list);
router.get  ('/active',       requireAuth, ctrl.listActive);

// Generar un plan usa IA: es parte de FitNow+. Los planes ya generados se
// siguen leyendo con cualquier plan.
router.post ('/generate',
  requireAuth,
  requirePremium(PREMIUM_FEATURES.AI_TRAINING_PLAN, 'Los planes de entrenamiento con IA son parte de FitNow+.'),
  ctrl.generate,
);

router.get  ('/:id',          requireAuth, ctrl.getById);
router.patch('/:id/cancel',   requireAuth, ctrl.cancel);

export default router;
