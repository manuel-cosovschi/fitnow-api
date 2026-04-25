// src/routes/gamification.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as ctrl from '../controllers/gamification.controller.js';

const router = Router();

router.get('/me',          requireAuth, ctrl.getMe);
router.get('/me/history',  requireAuth, ctrl.getHistory);
router.get('/badges',      requireAuth, ctrl.listBadges);
router.get('/ranking',     requireAuth, ctrl.getRanking);

export default router;
