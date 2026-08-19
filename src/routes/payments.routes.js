// src/routes/payments.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.middleware.js';
import * as ctrl from '../controllers/payments.controller.js';

const router = Router();

// Stripe (webhook registered in app.js before express.json to preserve raw body)
router.post('/stripe/intent',                   requireAuth, ctrl.stripeIntent);

// MercadoPago
router.post('/mercadopago/preference',          requireAuth, ctrl.mpPreference);
router.post('/mercadopago/webhook',             ctrl.mpWebhook);

// Cuenta de cobro del proveedor (split de pagos).
router.get   ('/mercadopago/connect', requireAuth, requireRole('admin','provider_admin'), ctrl.mpConnectStart);
router.get   ('/mercadopago/status',  requireAuth, requireRole('admin','provider_admin'), ctrl.mpConnectStatus);
router.delete('/mercadopago/connect', requireAuth, requireRole('admin','provider_admin'), ctrl.mpDisconnect);
// Sin JWT: acá vuelve el navegador desde MercadoPago. La autenticidad la da el
// `state` firmado, que ata el código a un proveedor concreto.
router.get   ('/mercadopago/oauth/callback', ctrl.mpOAuthCallback);

// Coupons
router.post('/coupons/validate',                requireAuth, ctrl.validateCoupon);

// Saved payment methods
router.get  ('/methods',                        requireAuth, ctrl.listMethods);
router.delete('/methods/:id',                   requireAuth, ctrl.deleteMethod);
router.post ('/methods/:id/default',            requireAuth, ctrl.setDefaultMethod);

// Refunds
router.post ('/refunds',                        requireAuth, ctrl.requestRefund);

export default router;
