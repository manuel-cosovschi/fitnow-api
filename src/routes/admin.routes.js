// src/routes/admin.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.middleware.js';
import * as ctrl from '../controllers/admin.controller.js';

const router = Router();

router.get ('/ai/weights',              requireAuth, requireRole('admin'), ctrl.listWeights);
router.post('/ai/weights',              requireAuth, requireRole('admin'), ctrl.upsertWeights);

// Stats
router.get ('/stats',                   requireAuth, requireRole('admin'), ctrl.getStats);

// User management
router.get ('/users',                   requireAuth, requireRole('admin'), ctrl.listUsers);
router.patch('/users/:id/role',         requireAuth, requireRole('admin'), ctrl.assignProviderRole);

// Providers
router.get ('/providers',               requireAuth, requireRole('admin'), ctrl.listProviders);

// Offers
router.get ('/offers',                  requireAuth, requireRole('admin'), ctrl.listAdminOffers);
router.post('/offers/:id/approve',      requireAuth, requireRole('admin'), ctrl.approveOffer);
router.post('/offers/:id/reject',       requireAuth, requireRole('admin'), ctrl.rejectOffer);

export default router;
