// src/routes/run.routes.js
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { startSessionSchema, pushTelemetrySchema, finishSessionSchema, submitFeedbackSchema, rerouteSchema } from '../schemas/run.schemas.js';
import * as ctrl from '../controllers/run.controller.js';

const router = Router();

// 10 reroute requests / minute / user
const rerouteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => `reroute:${req.user?.id ?? req.ip}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMIT', message: 'Demasiados recálculos. Intentá en un momento.' },
});

// Routes
router.get  ('/routes',             ctrl.listRoutes);
router.get  ('/routes/recommend',   requireAuth, ctrl.recommend);
router.get  ('/routes/:id',         ctrl.getRoute);
router.post ('/routes',             requireAuth, ctrl.routesPost);
router.get  ('/routes/:id/feedback', ctrl.getRouteFeedback);
router.post ('/routes/:id/feedback', requireAuth, validateBody(submitFeedbackSchema), ctrl.submitFeedback);

// Sessions (telemetry)
router.get  ('/sessions/mine',       requireAuth, ctrl.listMySessions);
router.post ('/sessions',            requireAuth, validateBody(startSessionSchema), ctrl.startSession);
router.get  ('/sessions/:id',        requireAuth, ctrl.getSession);
router.post ('/sessions/:id/points', requireAuth, validateBody(pushTelemetrySchema), ctrl.pushTelemetry);
router.post ('/sessions/:id/finish', requireAuth, validateBody(finishSessionSchema), ctrl.finishSession);
router.post ('/sessions/:id/abandon', requireAuth, ctrl.abandonSession);
router.post ('/sessions/:id/reroute', requireAuth, rerouteLimiter, validateBody(rerouteSchema), ctrl.rerouteSession);

export default router;
