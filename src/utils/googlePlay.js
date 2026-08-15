// src/utils/googlePlay.js
//
// Validación de compras de Google Play Billing contra la Play Developer API.
// Necesita una service account con permiso "View financial data" sobre la app,
// cargada en GOOGLE_PLAY_SERVICE_ACCOUNT_JSON (el JSON tal cual o en base64).
//
// Sin esa variable el módulo queda deshabilitado: `isConfigured()` devuelve
// false y el servicio de suscripciones decide si acepta el recibo sin validar
// (dev/staging) o lo rechaza (producción).

import { google } from 'googleapis';
import logger from './logger.js';

const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

let cachedClient;

function readCredentials() {
  const raw = (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) return null;

  const json = raw.startsWith('{')
    ? raw
    : Buffer.from(raw, 'base64').toString('utf8');

  try {
    return JSON.parse(json);
  } catch (err) {
    throw new Error(`[google-play] GOOGLE_PLAY_SERVICE_ACCOUNT_JSON no es un JSON válido: ${err.message}`);
  }
}

export function packageName() {
  return process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.fitnow.app';
}

export function isConfigured() {
  return Boolean((process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '').trim());
}

/** Solo para tests: descarta el cliente cacheado. */
export function resetClientCache() {
  cachedClient = undefined;
}

function androidPublisher() {
  if (cachedClient) return cachedClient;

  const credentials = readCredentials();
  if (!credentials) throw new Error('[google-play] Falta GOOGLE_PLAY_SERVICE_ACCOUNT_JSON.');

  const auth = new google.auth.GoogleAuth({ credentials, scopes: [SCOPE] });
  cachedClient = google.androidpublisher({ version: 'v3', auth });
  return cachedClient;
}

// Estados de la Play Developer API v2 → estados nuestros.
const STATE_MAP = {
  SUBSCRIPTION_STATE_ACTIVE:            'active',
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD:   'grace',
  SUBSCRIPTION_STATE_CANCELED:          'active',   // sigue vigente hasta expiry
  SUBSCRIPTION_STATE_ON_HOLD:           'expired',
  SUBSCRIPTION_STATE_PAUSED:            'expired',
  SUBSCRIPTION_STATE_EXPIRED:           'expired',
  SUBSCRIPTION_STATE_PENDING:           'expired',
  SUBSCRIPTION_STATE_UNSPECIFIED:       'expired',
};

/**
 * Consulta el estado de una compra y lo traduce al modelo de `subscriptions`.
 * @param {string} purchaseToken token que devuelve Play Billing en el cliente
 */
export async function getSubscription(purchaseToken) {
  const client = androidPublisher();
  const { data } = await client.purchases.subscriptionsv2.get({
    packageName: packageName(),
    token: purchaseToken,
  });

  return purchaseToSubscription(data, purchaseToken);
}

/**
 * Traduce una SubscriptionPurchaseV2 a los campos de la tabla `subscriptions`.
 * Exportada aparte para poder testearla sin tocar la red.
 */
export function purchaseToSubscription(data, purchaseToken) {
  const lineItem = data?.lineItems?.[0] ?? {};
  const expiry   = lineItem.expiryTime ? new Date(lineItem.expiryTime) : null;

  let status = STATE_MAP[data?.subscriptionState] ?? 'expired';
  // Un reembolso o una baja forzada cortan el acceso al toque.
  if (data?.subscriptionState === 'SUBSCRIPTION_STATE_EXPIRED' && data?.canceledStateContext?.systemInitiatedCancellation) {
    status = 'expired';
  }

  return {
    platform: 'google',
    product_id: lineItem.productId ?? data?.lineItems?.[0]?.productId ?? 'unknown',
    status,
    original_transaction_id: data?.latestOrderId ?? null,
    latest_transaction_id: data?.latestOrderId ?? null,
    purchase_token: purchaseToken,
    environment: data?.testPurchase ? 'sandbox' : 'production',
    auto_renew: Boolean(lineItem.autoRenewingPlan?.autoRenewEnabled),
    started_at: data?.startTime ? new Date(data.startTime) : null,
    expires_at: expiry,
    revoked_at: null,
    raw_payload: data,
  };
}

/**
 * Marca la compra como reconocida. Play cancela y reembolsa automáticamente
 * las suscripciones que no se reconocen dentro de los 3 días.
 */
export async function acknowledge(purchaseToken, productId) {
  try {
    const client = androidPublisher();
    await client.purchases.subscriptions.acknowledge({
      packageName: packageName(),
      subscriptionId: productId,
      token: purchaseToken,
    });
  } catch (err) {
    // Reconocer dos veces devuelve 400; no es un error que deba romper la compra.
    logger.warn(`[google-play] No se pudo reconocer la compra: ${err.message}`);
  }
}
