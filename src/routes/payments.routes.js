// src/routes/payments.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import express from 'express';
import * as ctrl from '../controllers/payments.controller.js';

const router = Router();

// Stripe
router.post('/stripe/intent',                   requireAuth, ctrl.stripeIntent);
router.post('/stripe/webhook',                  express.raw({ type: 'application/json' }), ctrl.stripeWebhook);

// MercadoPago
router.post('/mercadopago/preference',          requireAuth, ctrl.mpPreference);
router.post('/mercadopago/webhook',             ctrl.mpWebhook);

// Coupons
router.post('/coupons/validate',                requireAuth, ctrl.validateCoupon);

// Saved payment methods
router.get  ('/methods',                        requireAuth, ctrl.listMethods);
router.delete('/methods/:id',                   requireAuth, ctrl.deleteMethod);
router.post ('/methods/:id/default',            requireAuth, ctrl.setDefaultMethod);

// Refunds
router.post ('/refunds',                        requireAuth, ctrl.requestRefund);

export default router;
