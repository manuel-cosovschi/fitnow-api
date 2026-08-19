// src/routes/gym.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePremium } from '../middleware/entitlements.js';
import { validateBody } from '../middleware/validate.js';
import { aiHeavyLimiter } from '../middleware/aiRateLimit.js';
import { PREMIUM_FEATURES } from '../config/plans.js';
import { gymCreateSchema, gymRerouteSchema } from '../schemas/ai.schemas.js';
import * as ctrl from '../controllers/gym.controller.js';

const router = Router();

router.get ('/sessions/mine',       requireAuth, ctrl.listMine);

// AI-backed: parte de FitNow+, rate-limited (4/min/user) y validado.
router.post('/sessions',
  requireAuth,
  requirePremium(PREMIUM_FEATURES.AI_GYM_PLAN, 'Las rutinas generadas con IA son parte de FitNow+.'),
  aiHeavyLimiter,
  validateBody(gymCreateSchema),
  ctrl.create,
);

router.get ('/sessions/:id',        requireAuth, ctrl.getById);
router.post('/sessions/:id/sets',   requireAuth, ctrl.addSet);
router.post('/sessions/:id/finish', requireAuth, ctrl.finish);

router.post('/sessions/:id/reroute',
  requireAuth,
  requirePremium(PREMIUM_FEATURES.AI_GYM_PLAN, 'Ajustar la rutina en vivo es parte de FitNow+.'),
  aiHeavyLimiter,
  validateBody(gymRerouteSchema),
  ctrl.reroute,
);

export default router;
