// src/services/subscription.service.js
import * as subsRepo from '../repositories/subscription.repository.js';
import { Errors } from '../utils/errors.js';
import logger from '../utils/logger.js';
import {
  verifyAppleJws,
  transactionToSubscription,
} from '../utils/appleStore.js';
import * as googlePlay from '../utils/googlePlay.js';
import { isPremiumProduct, planLimits, planCatalog } from '../config/plans.js';

const FREE = Object.freeze({ plan: 'free', status: 'none', source: null, expires_at: null });

function appleBundleId() {
  // Tiene que ser el mismo PRODUCT_BUNDLE_IDENTIFIER con el que se firma la app
  // iOS: Apple lo mete en el comprobante y acá se compara. Si no coinciden, se
  // rechazan todas las compras.
  return process.env.APPLE_BUNDLE_ID || 'com.manuelcosovschi.FitNow';
}

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Fuera de producción se aceptan recibos que no se pudieron validar contra la
 * tienda (no hay raíz de Apple fijada, no hay service account de Google). Así
 * la app se puede probar end-to-end en sandbox sin configurar nada, igual que
 * la IA en modo stub. En producción se puede forzar con ALLOW_UNVERIFIED_RECEIPTS.
 */
function allowsUnverifiedReceipts() {
  if (process.env.ALLOW_UNVERIFIED_RECEIPTS === 'true') return true;
  return !isProduction();
}

// ─── Entitlement ──────────────────────────────────────────────────────────────

/**
 * Plan efectivo del usuario. Nunca tira: si algo falla, el usuario queda free
 * (que es el estado seguro: no regala funciones premium).
 */
export async function getEntitlement(userId) {
  if (!userId) return { ...FREE, ...planLimits('free') };

  const sub = await subsRepo.findActiveByUser(userId);
  if (!sub || !isPremiumProduct(sub.product_id)) {
    return { ...FREE, ...planLimits('free') };
  }

  return {
    plan: 'premium',
    status: sub.status,
    source: sub.platform,
    product_id: sub.product_id,
    expires_at: sub.expires_at,
    auto_renew: sub.auto_renew,
    environment: sub.environment,
    ...planLimits('premium'),
  };
}

/** ¿Este usuario tiene premium? Atajo para servicios que solo necesitan el booleano. */
export async function isPremium(userId) {
  const ent = await getEntitlement(userId);
  return ent.plan === 'premium';
}

/** Estado de suscripción para la pantalla de perfil: plan vigente + historial. */
export async function getSubscriptionState(userId) {
  const [entitlement, history] = await Promise.all([
    getEntitlement(userId),
    subsRepo.findAllByUser(userId),
  ]);
  return { entitlement, history };
}

export function getPlanCatalog() {
  return { plans: planCatalog(), limits: planLimits('free') };
}

// ─── Apple ────────────────────────────────────────────────────────────────────

/**
 * Valida una transacción de StoreKit 2 y la guarda contra la cuenta del usuario.
 *
 * @param {number} userId
 * @param {{ signed_transaction: string, signed_renewal_info?: string }} payload
 */
export async function verifyAppleTransaction(userId, { signed_transaction, signed_renewal_info }) {
  if (!signed_transaction) throw Errors.badRequest('Falta signed_transaction.');

  let transaction;
  let verification;
  try {
    const result = verifyAppleJws(signed_transaction);
    transaction  = result.payload;
    verification = result.verification;
  } catch (err) {
    logger.warn(`[subscriptions] JWS de Apple rechazado: ${err.message}`);
    throw Errors.badRequest('El comprobante de compra no es válido.');
  }

  if (verification === 'unverified' && !allowsUnverifiedReceipts()) {
    logger.error('[subscriptions] APPLE_ROOT_CA_G3 no está configurado en producción.');
    throw Errors.internal('La validación de compras no está configurada.');
  }

  if (transaction.bundleId && transaction.bundleId !== appleBundleId()) {
    throw Errors.badRequest('El comprobante no pertenece a esta app.');
  }

  if (!isPremiumProduct(transaction.productId)) {
    throw Errors.badRequest(`Producto desconocido: ${transaction.productId}`);
  }

  let renewal = null;
  if (signed_renewal_info) {
    try {
      renewal = verifyAppleJws(signed_renewal_info).payload;
    } catch (err) {
      // El renewal info es opcional: sin él asumimos renovación automática activa.
      logger.warn(`[subscriptions] Renewal info de Apple ignorada: ${err.message}`);
    }
  }

  const fields = transactionToSubscription(transaction, renewal);
  await assertNotClaimedByAnotherUser(userId, 'apple', fields.original_transaction_id);

  const saved = await subsRepo.upsert({ ...fields, user_id: userId, verification });
  logger.info(`[subscriptions] Apple ${saved.status} · user=${userId} · ${saved.product_id}`);

  return getEntitlement(userId);
}

/**
 * Webhook de App Store Server Notifications v2.
 * Apple reintenta hasta 5 veces, por eso se descartan los duplicados por UUID.
 */
export async function handleAppleNotification(signedPayload) {
  if (!signedPayload) throw Errors.badRequest('Falta signedPayload.');

  let notification;
  let verification;
  try {
    const result = verifyAppleJws(signedPayload);
    notification = result.payload;
    verification = result.verification;
  } catch (err) {
    logger.warn(`[subscriptions] Notificación de Apple rechazada: ${err.message}`);
    throw Errors.badRequest('Notificación inválida.');
  }

  if (verification === 'unverified' && !allowsUnverifiedReceipts()) {
    throw Errors.internal('La validación de notificaciones no está configurada.');
  }

  const isNew = await subsRepo.recordNotification({
    platform: 'apple',
    notification_id: notification.notificationUUID,
    notification_type: notification.notificationType,
    subtype: notification.subtype,
    payload: notification,
  });
  if (!isNew) return { status: 'duplicate' };

  const signedTx = notification.data?.signedTransactionInfo;
  if (!signedTx) return { status: 'ignored', reason: 'sin transacción' };

  const transaction = verifyAppleJws(signedTx).payload;
  const renewal = notification.data?.signedRenewalInfo
    ? verifyAppleJws(notification.data.signedRenewalInfo).payload
    : null;

  const fields = transactionToSubscription(transaction, renewal);

  // REFUND y REVOKE cortan el acceso aunque la fecha de vencimiento sea futura.
  if (['REFUND', 'REVOKE'].includes(notification.notificationType)) {
    fields.status = 'revoked';
    fields.revoked_at = fields.revoked_at ?? new Date();
  }

  const existing = await subsRepo.findByOriginalTransactionId('apple', fields.original_transaction_id);
  if (!existing) {
    // Todavía no vimos esta compra desde la app; sin user_id no hay a quién asignarla.
    logger.warn(`[subscriptions] Notificación de una compra desconocida: ${fields.original_transaction_id}`);
    return { status: 'ignored', reason: 'compra sin usuario asociado' };
  }

  await subsRepo.upsert({ ...fields, user_id: existing.user_id, verification });
  logger.info(`[subscriptions] Apple ${notification.notificationType} · user=${existing.user_id}`);

  return { status: 'ok', type: notification.notificationType };
}

// ─── Google Play ──────────────────────────────────────────────────────────────

/**
 * Valida una compra de Play Billing y la guarda contra la cuenta del usuario.
 *
 * @param {number} userId
 * @param {{ purchase_token: string, product_id: string }} payload
 */
export async function verifyGooglePurchase(userId, { purchase_token, product_id }) {
  if (!purchase_token) throw Errors.badRequest('Falta purchase_token.');

  let fields;
  let verification = 'verified';

  if (googlePlay.isConfigured()) {
    try {
      fields = await googlePlay.getSubscription(purchase_token);
    } catch (err) {
      logger.warn(`[subscriptions] Play rechazó el token: ${err.message}`);
      throw Errors.badRequest('El comprobante de compra no es válido.');
    }
  } else {
    if (!allowsUnverifiedReceipts()) {
      logger.error('[subscriptions] GOOGLE_PLAY_SERVICE_ACCOUNT_JSON no está configurado en producción.');
      throw Errors.internal('La validación de compras no está configurada.');
    }
    if (!product_id) throw Errors.badRequest('Falta product_id.');
    // Sin credenciales aceptamos el token para poder probar el flujo completo,
    // pero queda marcado como no verificado y con vencimiento corto.
    verification = 'unverified';
    fields = {
      platform: 'google',
      product_id,
      status: 'active',
      original_transaction_id: purchase_token,
      latest_transaction_id: purchase_token,
      purchase_token,
      environment: 'sandbox',
      auto_renew: true,
      started_at: new Date(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      revoked_at: null,
      raw_payload: null,
    };
  }

  if (!isPremiumProduct(fields.product_id)) {
    throw Errors.badRequest(`Producto desconocido: ${fields.product_id}`);
  }

  await assertNotClaimedByAnotherUser(userId, 'google', fields.original_transaction_id);

  const saved = await subsRepo.upsert({ ...fields, user_id: userId, verification });
  logger.info(`[subscriptions] Google ${saved.status} · user=${userId} · ${saved.product_id}`);

  if (googlePlay.isConfigured() && saved.status === 'active') {
    await googlePlay.acknowledge(purchase_token, saved.product_id);
  }

  return getEntitlement(userId);
}

/**
 * Webhook de Real-time Developer Notifications (Pub/Sub push).
 * El cuerpo llega como { message: { data: <base64 del JSON> } }.
 */
export async function handleGoogleNotification(body) {
  const encoded = body?.message?.data;
  if (!encoded) throw Errors.badRequest('Falta message.data.');

  let notification;
  try {
    notification = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch (err) {
    throw Errors.badRequest('El payload de la notificación no es un JSON válido.');
  }

  const messageId = body.message.messageId || body.message.message_id;
  const sub = notification.subscriptionNotification;
  if (!sub) return { status: 'ignored', reason: 'no es una notificación de suscripción' };

  const isNew = await subsRepo.recordNotification({
    platform: 'google',
    notification_id: messageId || `${sub.purchaseToken}:${sub.notificationType}`,
    notification_type: String(sub.notificationType),
    subtype: null,
    payload: notification,
  });
  if (!isNew) return { status: 'duplicate' };

  const existing = await subsRepo.findByPurchaseToken('google', sub.purchaseToken);
  if (!existing) {
    logger.warn('[subscriptions] Notificación de Play de una compra desconocida.');
    return { status: 'ignored', reason: 'compra sin usuario asociado' };
  }

  if (!googlePlay.isConfigured()) {
    return { status: 'ignored', reason: 'Play Developer API no configurada' };
  }

  const fields = await googlePlay.getSubscription(sub.purchaseToken);
  await subsRepo.upsert({ ...fields, user_id: existing.user_id, verification: 'verified' });
  logger.info(`[subscriptions] Google notif ${sub.notificationType} · user=${existing.user_id}`);

  return { status: 'ok', type: sub.notificationType };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Una suscripción de tienda vale para una sola cuenta: si alguien intenta
 * canjear un recibo que ya está asociado a otro usuario, se rechaza.
 */
async function assertNotClaimedByAnotherUser(userId, platform, originalTransactionId) {
  if (!originalTransactionId) return;
  const existing = await subsRepo.findByOriginalTransactionId(platform, originalTransactionId);
  if (existing && existing.user_id !== userId) {
    throw Errors.conflict(
      'SUBSCRIPTION_ALREADY_CLAIMED',
      'Esta suscripción ya está asociada a otra cuenta de FitNow.'
    );
  }
}
