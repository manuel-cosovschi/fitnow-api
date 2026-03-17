// src/routes/activities.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.middleware.js';
import { validateBody } from '../middleware/validate.js';
import { createActivitySchema, updateActivitySchema, addSessionSchema } from '../schemas/activity.schemas.js';
import * as ctrl from '../controllers/activities.controller.js';

const router = Router();

router.get  ('/',                                                                                    ctrl.list);
router.get  ('/:id',                                                                                 ctrl.getById);
router.post ('/', requireAuth, requireRole('admin','provider_admin'), validateBody(createActivitySchema), ctrl.create);
router.patch('/:id', requireAuth, requireRole('admin','provider_admin'), validateBody(updateActivitySchema), ctrl.update);
router.patch('/:id/settings', requireAuth, requireRole('admin','provider_admin','provider'),         ctrl.updateSettings);
router.post ('/:id/activate', requireAuth, requireRole('admin'),                                     ctrl.activate);
router.post ('/:id/sessions', requireAuth, requireRole('admin','provider_admin'), validateBody(addSessionSchema), ctrl.addSession);

export default router;
