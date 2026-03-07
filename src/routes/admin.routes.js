// src/routes/admin.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.middleware.js';
import * as ctrl from '../controllers/admin.controller.js';

const router = Router();

router.get ('/ai/weights',           requireAuth, requireRole('admin'), ctrl.listWeights);
router.post('/ai/weights',           requireAuth, requireRole('admin'), ctrl.upsertWeights);

// User management
router.get ('/users',                requireAuth, requireRole('admin'), ctrl.listUsers);
router.patch('/users/:id/role',      requireAuth, requireRole('admin'), ctrl.assignProviderRole);

export default router;
