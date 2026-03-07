// src/routes/run.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.middleware.js';
import { validateBody } from '../middleware/validate.js';
import { startSessionSchema, pushTelemetrySchema, finishSessionSchema, submitFeedbackSchema } from '../schemas/run.schemas.js';
import * as ctrl from '../controllers/run.controller.js';

const router = Router();

// Routes
router.get  ('/routes',             ctrl.listRoutes);
router.get  ('/routes/recommend',   requireAuth, ctrl.recommend);
router.get  ('/routes/:id',         ctrl.getRoute);
router.post ('/routes', requireAuth, requireRole('admin','provider_admin'), ctrl.createRoute);
router.get  ('/routes/:id/feedback', ctrl.getRouteFeedback);
router.post ('/routes/:id/feedback', requireAuth, validateBody(submitFeedbackSchema), ctrl.submitFeedback);

// Sessions (telemetry)
router.get  ('/sessions/mine',       requireAuth, ctrl.listMySessions);
router.post ('/sessions',            requireAuth, validateBody(startSessionSchema), ctrl.startSession);
router.get  ('/sessions/:id',        requireAuth, ctrl.getSession);
router.post ('/sessions/:id/points', requireAuth, validateBody(pushTelemetrySchema), ctrl.pushTelemetry);
router.post ('/sessions/:id/finish', requireAuth, validateBody(finishSessionSchema), ctrl.finishSession);
router.post ('/sessions/:id/abandon',requireAuth, ctrl.abandonSession);

export default router;
