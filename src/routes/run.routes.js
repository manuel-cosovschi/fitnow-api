// src/routes/run.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { attachEntitlement } from '../middleware/entitlements.js';
import { validateBody } from '../middleware/validate.js';
import { startSessionSchema, pushTelemetrySchema, finishSessionSchema, submitFeedbackSchema } from '../schemas/run.schemas.js';
import * as ctrl from '../controllers/run.controller.js';

const router = Router();

// Routes
router.get  ('/routes',             ctrl.listRoutes);
router.get  ('/routes/recommend',   requireAuth, ctrl.recommend);
router.get  ('/routes/:id',         ctrl.getRoute);
// attachEntitlement: la generación de rutas respeta el tope de distancia del plan.
router.post ('/routes',             requireAuth, attachEntitlement, ctrl.routesPost);
router.get  ('/routes/:id/feedback', ctrl.getRouteFeedback);
router.post ('/routes/:id/feedback', requireAuth, validateBody(submitFeedbackSchema), ctrl.submitFeedback);

// Sessions (telemetry)
router.get  ('/sessions/mine',       requireAuth, ctrl.listMySessions);
router.post ('/sessions',            requireAuth, validateBody(startSessionSchema), ctrl.startSession);
router.get  ('/sessions/:id',        requireAuth, ctrl.getSession);
// La telemetría y el cierre necesitan el plan para aplicar el límite de distancia.
router.post ('/sessions/:id/points', requireAuth, attachEntitlement, validateBody(pushTelemetrySchema), ctrl.pushTelemetry);
router.post ('/sessions/:id/finish', requireAuth, attachEntitlement, validateBody(finishSessionSchema), ctrl.finishSession);
router.post ('/sessions/:id/abandon',requireAuth, ctrl.abandonSession);

export default router;
