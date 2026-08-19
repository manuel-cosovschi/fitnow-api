// src/routes/subscriptions.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { appleVerifySchema, googleVerifySchema } from '../schemas/subscription.schemas.js';
import * as ctrl from '../controllers/subscriptions.controller.js';

const router = Router();

// Catálogo de planes — público: el paywall lo lee antes de que haya sesión.
router.get('/plans', ctrl.plans);

// Plan vigente del usuario.
router.get('/me', requireAuth, ctrl.me);

// Canje de compras.
router.post('/apple/verify',  requireAuth, validateBody(appleVerifySchema),  ctrl.verifyApple);
router.post('/google/verify', requireAuth, validateBody(googleVerifySchema), ctrl.verifyGoogle);

// Webhooks de las tiendas. No llevan JWT: la autenticidad la da la firma del
// payload (Apple) o el token de Pub/Sub configurado en la suscripción (Google).
router.post('/apple/notifications',  ctrl.appleNotifications);
router.post('/google/notifications', ctrl.googleNotifications);

export default router;
