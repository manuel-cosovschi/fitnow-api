// src/routes/offers.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.middleware.js';
import * as ctrl from '../controllers/offers.controller.js';

const router = Router();

router.get ('/',     ctrl.listApproved);
router.post('/',     requireAuth, requireRole('admin','provider_admin','provider'), ctrl.create);
router.get ('/mine', requireAuth, requireRole('admin','provider_admin','provider'), ctrl.listMine);

export default router;
