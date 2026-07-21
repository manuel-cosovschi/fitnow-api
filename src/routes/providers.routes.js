// src/routes/providers.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.middleware.js';
import { validateBody } from '../middleware/validate.js';
import { createProviderSchema, updateProviderSchema, setHoursSchema, addServiceSchema, withdrawalSchema, resolveWithdrawalSchema } from '../schemas/provider.schemas.js';
import * as ctrl from '../controllers/providers.controller.js';

const router = Router();

router.get  ('/',                                                                                              ctrl.list);

// Saldo y retiros (antes de /:id para que "me" no se tome como id)
router.get ('/me/balance',      requireAuth, requireRole('admin','provider_admin'),                            ctrl.myBalance);
router.get ('/me/ledger',       requireAuth, requireRole('admin','provider_admin'),                            ctrl.myLedger);
router.get ('/me/withdrawals',  requireAuth, requireRole('admin','provider_admin'),                            ctrl.myWithdrawals);
router.post('/me/withdrawals',  requireAuth, requireRole('admin','provider_admin'), validateBody(withdrawalSchema), ctrl.requestWithdrawal);
router.get ('/withdrawals',     requireAuth, requireRole('admin'),                                             ctrl.allWithdrawals);
router.patch('/withdrawals/:id', requireAuth, requireRole('admin'), validateBody(resolveWithdrawalSchema),     ctrl.resolveWithdrawal);

router.get  ('/:id',                                                                                           ctrl.getById);
router.get  ('/:id/sports',                                                                                    ctrl.getSports);
router.post ('/', requireAuth, requireRole('admin'), validateBody(createProviderSchema),                        ctrl.create);
router.patch('/:id', requireAuth, requireRole('admin','provider_admin'), validateBody(updateProviderSchema),    ctrl.update);
router.post ('/:id/activate', requireAuth, requireRole('admin'),                                               ctrl.activate);
router.post ('/:id/suspend',  requireAuth, requireRole('admin'),                                               ctrl.suspend);
router.put  ('/:id/hours', requireAuth, requireRole('admin','provider_admin'), validateBody(setHoursSchema), ctrl.setHours);
router.post ('/:id/services', requireAuth, requireRole('admin','provider_admin'), validateBody(addServiceSchema), ctrl.addService);
router.delete('/:id/services/:serviceId', requireAuth, requireRole('admin','provider_admin'),                  ctrl.removeService);

export default router;
