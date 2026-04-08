// src/routes/analytics.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as ctrl from '../controllers/analytics.controller.js';

const router = Router();

router.get('/running/summary',     requireAuth, ctrl.runningSummary);
router.get('/running/weekly',      requireAuth, ctrl.runningWeekly);
router.get('/running/progress',    requireAuth, ctrl.runningProgress);
router.get('/gym/summary',         requireAuth, ctrl.gymSummary);
router.get('/gym/weekly',          requireAuth, ctrl.gymWeekly);
router.get('/gym/muscle-distribution', requireAuth, ctrl.gymMuscleDistribution);
router.get('/combined/streak',     requireAuth, ctrl.combinedStreak);

export default router;
