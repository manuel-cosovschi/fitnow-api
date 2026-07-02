// src/controllers/payments.controller.js
import * as svc from '../services/payments.service.js';

// Prepara un pago con Stripe (crea la 'intención de pago') y la inscripción pendiente.
export async function stripeIntent(req, res, next) {
  try {
    res.json(await svc.createStripeIntent(req.user.id, req.body));
  } catch (err) { next(err); }
}

// Recibe el aviso de Stripe cuando el pago se confirma y activa la inscripción.
export async function stripeWebhook(req, res, next) {
  try {
    await svc.handleStripeWebhook(req.body, req.headers['stripe-signature']);
    res.json({ received: true });
  } catch (err) { next(err); }
}

// Prepara un pago con MercadoPago.
export async function mpPreference(req, res, next) {
  try {
    res.json(await svc.createMpPreference(req.user.id, req.body));
  } catch (err) { next(err); }
}

// B-1: pass req.headers so the service can verify the MP signature
export async function mpWebhook(req, res, next) {
  try {
    await svc.handleMpWebhook(req.body, req.query, req.headers);
    res.json({ received: true });
  } catch (err) { next(err); }
}

// Valida un cupón de descuento.
export async function validateCoupon(req, res, next) {
  try {
    res.json(await svc.validateCoupon(req.body));
  } catch (err) { next(err); }
}

// Lista tus métodos de pago guardados.
export async function listMethods(req, res, next) {
  try {
    res.json(await svc.listMethods(req.user.id));
  } catch (err) { next(err); }
}

// Borra un método de pago.
export async function deleteMethod(req, res, next) {
  try {
    await svc.deleteMethod(req.user.id, Number(req.params.id));
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
}

// Marca un método como el principal.
export async function setDefaultMethod(req, res, next) {
  try {
    await svc.setDefaultMethod(req.user.id, Number(req.params.id));
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
}

// Pide un reembolso.
export async function requestRefund(req, res, next) {
  try {
    res.json(await svc.requestRefund(req.user.id, req.body));
  } catch (err) { next(err); }
}
