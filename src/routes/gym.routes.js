// src/routes/gym.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { startGymSessionSchema, logSetSchema, rerouteGymSchema } from '../schemas/gym.schemas.js';
import * as ctrl from '../controllers/gym.controller.js';

const router = Router();

router.post('/sessions',              requireAuth, validateBody(startGymSessionSchema), ctrl.startSession);
router.get('/sessions/mine',          requireAuth, ctrl.listMySessions);
router.get('/sessions/:id',           requireAuth, ctrl.getSession);
router.post('/sessions/:id/sets',     requireAuth, validateBody(logSetSchema), ctrl.logSet);
router.post('/sessions/:id/reroute',  requireAuth, validateBody(rerouteGymSchema), ctrl.reroute);
router.post('/sessions/:id/finish',   requireAuth, ctrl.finishSession);
router.post('/sessions/:id/abandon',  requireAuth, ctrl.abandonSession);

export default router;
