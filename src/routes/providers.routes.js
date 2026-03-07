// src/routes/providers.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.middleware.js';
import { validateBody } from '../middleware/validate.js';
import { createProviderSchema, updateProviderSchema, setHoursSchema, addServiceSchema } from '../schemas/provider.schemas.js';
import * as ctrl from '../controllers/providers.controller.js';

const router = Router();

router.get  ('/',                                                                                              ctrl.list);
router.get  ('/:id',                                                                                           ctrl.getById);
router.post ('/', requireAuth, requireRole('admin'), validateBody(createProviderSchema),                        ctrl.create);
router.patch('/:id', requireAuth, requireRole('admin','provider_admin'), validateBody(updateProviderSchema),    ctrl.update);
router.post ('/:id/activate', requireAuth, requireRole('admin'),                                               ctrl.activate);
router.post ('/:id/suspend',  requireAuth, requireRole('admin'),                                               ctrl.suspend);
router.put  ('/:id/hours', requireAuth, requireRole('admin','provider_admin'), validateBody(setHoursSchema), ctrl.setHours);
router.post ('/:id/services', requireAuth, requireRole('admin','provider_admin'), validateBody(addServiceSchema), ctrl.addService);
router.delete('/:id/services/:serviceId', requireAuth, requireRole('admin','provider_admin'),                  ctrl.removeService);

export default router;
