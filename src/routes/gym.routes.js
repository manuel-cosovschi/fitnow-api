// src/routes/gym.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as ctrl from '../controllers/gym.controller.js';

const router = Router();

router.get ('/sessions/mine',       requireAuth, ctrl.listMine);
router.post('/sessions',            requireAuth, ctrl.create);
router.get ('/sessions/:id',        requireAuth, ctrl.getById);
router.post('/sessions/:id/sets',   requireAuth, ctrl.addSet);
router.post('/sessions/:id/finish', requireAuth, ctrl.finish);
router.post('/sessions/:id/reroute',requireAuth, ctrl.reroute);

export default router;
