// src/controllers/subscriptions.controller.js
import * as service from '../services/subscription.service.js';
import logger from '../utils/logger.js';

/** GET /api/subscriptions/plans — catálogo público para el paywall. */
export function plans(_req, res) {
  res.json(service.getPlanCatalog());
}

/** GET /api/subscriptions/me — plan vigente del usuario + historial. */
export async function me(req, res, next) {
  try {
    res.json(await service.getSubscriptionState(req.user.id));
  } catch (err) { next(err); }
}

/** POST /api/subscriptions/apple/verify — canjea una compra de StoreKit 2. */
export async function verifyApple(req, res, next) {
  try {
    const entitlement = await service.verifyAppleTransaction(req.user.id, req.body);
    res.json({ entitlement });
  } catch (err) { next(err); }
}

/** POST /api/subscriptions/google/verify — canjea una compra de Play Billing. */
export async function verifyGoogle(req, res, next) {
  try {
    const entitlement = await service.verifyGooglePurchase(req.user.id, req.body);
    res.json({ entitlement });
  } catch (err) { next(err); }
}

/**
 * POST /api/subscriptions/apple/notifications
 * App Store Server Notifications v2. Apple espera un 200 para dejar de
 * reintentar: solo devolvemos error si el payload no se pudo verificar.
 */
export async function appleNotifications(req, res, next) {
  try {
    const result = await service.handleAppleNotification(req.body?.signedPayload);
    res.status(200).json(result);
  } catch (err) { next(err); }
}

/**
 * POST /api/subscriptions/google/notifications
 * Real-time Developer Notifications vía Pub/Sub push. Pub/Sub reintenta ante
 * cualquier respuesta que no sea 2xx, así que un payload que no podemos
 * procesar se acusa igual con 200 y queda en el log.
 */
export async function googleNotifications(req, res) {
  try {
    const result = await service.handleGoogleNotification(req.body);
    res.status(200).json(result);
  } catch (err) {
    logger.warn(`[subscriptions] Notificación de Play descartada: ${err.message}`);
    res.status(200).json({ status: 'ignored', reason: err.message });
  }
}
