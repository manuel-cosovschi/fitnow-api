// src/services/payments.service.js
import { query, queryOne } from '../db.js';
import { Errors } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { awardXp } from '../utils/xp.js';

const BASE_URL = () => process.env.APP_BASE_URL || 'https://api.fitnow.com';
const DEEP_LINK = () => process.env.IOS_DEEP_LINK_SCHEME || 'fitnow';

async function getOrCreatePendingEnrollment(userId, { activity_id, plan_name, coupon_code }) {
  if (!activity_id) throw Errors.badRequest('activity_id requerido.');
  const activity = await queryOne(`SELECT * FROM activities WHERE id = ? AND status = 'active'`, [activity_id]);
  if (!activity) throw Errors.notFound('Actividad no encontrada.');

  let price = Number(activity.price ?? 0);

  if (coupon_code) {
    const coupon = await queryOne(
      `SELECT * FROM coupons WHERE code = ? AND (valid_until IS NULL OR valid_until > NOW()) AND (max_uses IS NULL OR used_count < max_uses)`,
      [coupon_code.trim().toUpperCase()]
    );
    if (coupon) {
      if (coupon.discount_percent) price = price * (1 - coupon.discount_percent / 100);
      if (coupon.discount_amount)  price = Math.max(0, price - Number(coupon.discount_amount));
    }
  }

  const amountCents = Math.round(price * 100);

  const result = await query(
    `INSERT INTO enrollments (user_id, activity_id, price_paid, plan_name, status)
     VALUES (?,?,?,?,'pending')`,
    [userId, activity_id, price, plan_name ?? null]
  );
  const enrollmentId = result.insertId;
  return { enrollmentId, amountCents, activity };
}

// ─── Stripe ───────────────────────────────────────────────────────────────────

export async function createStripeIntent(userId, { activity_id, plan_name, coupon_code }) {
  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_KEY) throw Errors.internal('Stripe no configurado.');

  const { enrollmentId, amountCents, activity } = await getOrCreatePendingEnrollment(userId, { activity_id, plan_name, coupon_code });

  let clientSecret;
  try {
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(STRIPE_KEY);
    const intent = await stripe.paymentIntents.create({
      amount:   amountCents,
      currency: 'ars',
      metadata: { enrollment_id: String(enrollmentId), user_id: String(userId) },
    });
    clientSecret = intent.client_secret;

    await query(
      `INSERT INTO payments (user_id, enrollment_id, gateway, gateway_ref, amount, currency, status)
       VALUES (?,?,'stripe',?,?,'ars','pending')`,
      [userId, enrollmentId, intent.id, amountCents]
    );
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') throw Errors.internal('Stripe SDK no instalado.');
    throw err;
  }

  return { client_secret: clientSecret, enrollment_id: enrollmentId, amount: amountCents, currency: 'ars' };
}

export async function handleStripeWebhook(rawBody, signature) {
  const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  if (!SECRET) { logger.warn('STRIPE_WEBHOOK_SECRET no configurado'); return; }

  try {
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const event  = stripe.webhooks.constructEvent(rawBody, signature, SECRET);

    if (event.type === 'payment_intent.succeeded') {
      const intent      = event.data.object;
      const enrollmentId = Number(intent.metadata?.enrollment_id);
      if (enrollmentId) await activateEnrollment(enrollmentId, 'stripe', intent.id);
    }
  } catch (err) {
    logger.error('Stripe webhook error:', err.message);
    throw Errors.badRequest('Webhook inválido.');
  }
}

// ─── MercadoPago ──────────────────────────────────────────────────────────────

export async function createMpPreference(userId, { activity_id, plan_name, coupon_code }) {
  const TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!TOKEN) throw Errors.internal('MercadoPago no configurado.');

  const { enrollmentId, amountCents, activity } = await getOrCreatePendingEnrollment(userId, { activity_id, plan_name, coupon_code });
  const price = amountCents / 100;

  const deep = DEEP_LINK();
  const body = {
    items: [{ title: activity.title, quantity: 1, unit_price: price, currency_id: 'ARS' }],
    back_urls: {
      success: `${deep}://mp-success?enrollment_id=${enrollmentId}`,
      failure: `${deep}://mp-failure?enrollment_id=${enrollmentId}`,
      pending: `${deep}://mp-cancel?enrollment_id=${enrollmentId}`,
    },
    auto_return: 'approved',
    external_reference: String(enrollmentId),
    notification_url: `${BASE_URL()}/api/payments/mercadopago/webhook`,
  };

  const resp = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body:    JSON.stringify(body),
  });
  if (!resp.ok) throw Errors.internal('Error al crear preferencia de MercadoPago.');
  const pref = await resp.json();

  await query(
    `INSERT INTO payments (user_id, enrollment_id, gateway, gateway_ref, amount, currency, status)
     VALUES (?,?,'mercadopago',?,?,'ars','pending')`,
    [userId, enrollmentId, pref.id, amountCents]
  );

  return { preference_id: pref.id, init_point: pref.init_point, enrollment_id: enrollmentId };
}

export async function handleMpWebhook(body, query_params) {
  const TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!TOKEN) return;

  const topic   = body?.type || query_params?.type;
  const id      = body?.data?.id || query_params?.id;
  if (topic !== 'payment' || !id) return;

  try {
    const resp = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!resp.ok) return;
    const payment = await resp.json();
    if (payment.status === 'approved') {
      const enrollmentId = Number(payment.external_reference);
      if (enrollmentId) await activateEnrollment(enrollmentId, 'mercadopago', String(id));
    }
  } catch (err) {
    logger.error('MP webhook error:', err.message);
  }
}

// ─── Shared activation ────────────────────────────────────────────────────────

async function activateEnrollment(enrollmentId, gateway, gatewayRef) {
  await query(`UPDATE enrollments SET status = 'active' WHERE id = ? AND status = 'pending'`, [enrollmentId]);
  await query(
    `UPDATE payments SET status = 'completed', updated_at = NOW() WHERE enrollment_id = ? AND gateway = ?`,
    [enrollmentId, gateway]
  );
  const enrollment = await queryOne(
    `SELECT e.*, u.id AS uid FROM enrollments e JOIN users u ON u.id = e.user_id WHERE e.id = ?`,
    [enrollmentId]
  );
  if (enrollment) {
    await awardXp(enrollment.user_id, 50, 'enrollment', { ref_type: 'enrollment', ref_id: enrollmentId });
    await query(
      `INSERT INTO in_app_messages (user_id, title, body, kind, deep_link)
       VALUES (?,?,?,'payment',?)`,
      [enrollment.user_id, 'Pago confirmado', 'Tu inscripción fue procesada exitosamente.',
       `${DEEP_LINK()}://enrollment/${enrollmentId}`]
    );
  }
}

// ─── Coupons ──────────────────────────────────────────────────────────────────

export async function validateCoupon({ code, activity_id }) {
  if (!code) throw Errors.badRequest('code requerido.');
  const coupon = await queryOne(
    `SELECT * FROM coupons WHERE code = ? LIMIT 1`,
    [String(code).trim().toUpperCase()]
  );
  if (!coupon) return { valid: false, message: 'Cupón no encontrado.' };
  if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) return { valid: false, message: 'Cupón expirado.' };
  if (coupon.max_uses && coupon.used_count >= coupon.max_uses) return { valid: false, message: 'Cupón agotado.' };
  if (coupon.activity_id && activity_id && coupon.activity_id !== Number(activity_id)) {
    return { valid: false, message: 'Cupón no válido para esta actividad.' };
  }

  let finalPrice = null;
  if (activity_id) {
    const act = await queryOne(`SELECT price FROM activities WHERE id = ?`, [activity_id]);
    if (act) {
      let price = Number(act.price ?? 0);
      if (coupon.discount_percent) price = price * (1 - coupon.discount_percent / 100);
      if (coupon.discount_amount)  price = Math.max(0, price - Number(coupon.discount_amount));
      finalPrice = Math.round(price * 100) / 100;
    }
  }

  return {
    valid:            true,
    discount_amount:  coupon.discount_amount ? Number(coupon.discount_amount) : null,
    discount_percent: coupon.discount_percent ?? null,
    final_price:      finalPrice,
    message:          'Cupón válido.',
  };
}

// ─── Payment methods ──────────────────────────────────────────────────────────

export async function listMethods(userId) {
  const items = await query(
    `SELECT id, provider, brand, last4, expiry_month, expiry_year, holder_name, is_default
     FROM saved_payment_methods WHERE user_id = ? ORDER BY is_default DESC, id ASC`,
    [userId]
  );
  return { items };
}

export async function deleteMethod(userId, id) {
  const method = await queryOne(`SELECT id FROM saved_payment_methods WHERE id = ? AND user_id = ?`, [id, userId]);
  if (!method) throw Errors.notFound('Método de pago no encontrado.');
  await query(`DELETE FROM saved_payment_methods WHERE id = ?`, [id]);
}

export async function setDefaultMethod(userId, id) {
  const method = await queryOne(`SELECT id FROM saved_payment_methods WHERE id = ? AND user_id = ?`, [id, userId]);
  if (!method) throw Errors.notFound('Método de pago no encontrado.');
  await query(`UPDATE saved_payment_methods SET is_default = FALSE WHERE user_id = ?`, [userId]);
  await query(`UPDATE saved_payment_methods SET is_default = TRUE WHERE id = ?`, [id]);
}

// ─── Refunds ──────────────────────────────────────────────────────────────────

export async function requestRefund(userId, { enrollment_id, reason, details }) {
  if (!enrollment_id || !reason) throw Errors.badRequest('enrollment_id y reason son requeridos.');
  const enrollment = await queryOne(`SELECT * FROM enrollments WHERE id = ? AND user_id = ?`, [enrollment_id, userId]);
  if (!enrollment) throw Errors.notFound('Inscripción no encontrada.');

  const result = await query(
    `INSERT INTO refund_requests (user_id, enrollment_id, reason, details, amount)
     VALUES (?,?,?,?,?)`,
    [userId, enrollment_id, reason, details ?? null, enrollment.price_paid ?? null]
  );
  return queryOne(`SELECT * FROM refund_requests WHERE id = ?`, [result.insertId]);
}
