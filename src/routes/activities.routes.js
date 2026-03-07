// src/routes/activities.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.middleware.js';
import * as ctrl from '../controllers/activities.controller.js';

const router = Router();

router.get  ('/',                                ctrl.list);
router.get  ('/:id',                             ctrl.getById);
router.post ('/', requireAuth, requireRole('admin','provider_admin'), ctrl.create);
router.patch('/:id', requireAuth, requireRole('admin','provider_admin'), ctrl.update);
router.post ('/:id/activate', requireAuth, requireRole('admin'), ctrl.activate);
router.post ('/:id/sessions', requireAuth, requireRole('admin','provider_admin'), ctrl.addSession);

export default router;
