// src/routes/gym.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { aiHeavyLimiter } from '../middleware/aiRateLimit.js';
import { gymCreateSchema, gymRerouteSchema } from '../schemas/ai.schemas.js';
import * as ctrl from '../controllers/gym.controller.js';

const router = Router();

router.get ('/sessions/mine',       requireAuth, ctrl.listMine);

// AI-backed: rate-limited (4/min/user) and validated.
router.post('/sessions',
  requireAuth,
  aiHeavyLimiter,
  validateBody(gymCreateSchema),
  ctrl.create,
);

router.get ('/sessions/:id',        requireAuth, ctrl.getById);
router.post('/sessions/:id/sets',   requireAuth, ctrl.addSet);
router.post('/sessions/:id/finish', requireAuth, ctrl.finish);

router.post('/sessions/:id/reroute',
  requireAuth,
  aiHeavyLimiter,
  validateBody(gymRerouteSchema),
  ctrl.reroute,
);

export default router;
