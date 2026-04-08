// src/routes/gamification.routes.js
import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.middleware.js';
import { validateBody } from '../middleware/validate.js';
import { claimXpSchema } from '../schemas/gamification.schemas.js';
import * as ctrl from '../controllers/gamification.controller.js';

const router = Router();

router.get('/me',                  requireAuth, ctrl.getMyProfile);
router.get('/me/history',          requireAuth, ctrl.getMyXpHistory);
router.get('/users/:id',           optionalAuth, ctrl.getPublicProfile);
router.get('/ranking',             requireAuth, ctrl.getRanking);
router.get('/ranking/provider/:id', requireAuth, ctrl.getProviderRanking);
router.get('/badges',              optionalAuth, ctrl.listBadges);
router.post('/xp/claim',           requireAuth, requireRole('admin'), validateBody(claimXpSchema), ctrl.claimXp);

export default router;
