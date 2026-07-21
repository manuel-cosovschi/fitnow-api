// src/controllers/providers.controller.js
import * as provService from '../services/provider.service.js';

// Lista los proveedores (gimnasios, entrenadores, clubes).
export async function list(req, res, next) {
  try {
    res.json(await provService.list(req.query));
  } catch (err) { next(err); }
}

// Detalle de un proveedor.
export async function getById(req, res, next) {
  try {
    res.json(await provService.getById(Number(req.params.id)));
  } catch (err) { next(err); }
}

// Crea un proveedor.
export async function create(req, res, next) {
  try {
    const provider = await provService.create(req.body);
    res.status(201).json(provider);
  } catch (err) { next(err); }
}

// Edita un proveedor.
export async function update(req, res, next) {
  try {
    res.json(await provService.update(Number(req.params.id), req.body, req.user));
  } catch (err) { next(err); }
}

// Activa un proveedor.
export async function activate(req, res, next) {
  try {
    res.json(await provService.activate(Number(req.params.id)));
  } catch (err) { next(err); }
}

// Suspende un proveedor.
export async function suspend(req, res, next) {
  try {
    res.json(await provService.suspend(Number(req.params.id)));
  } catch (err) { next(err); }
}

// Define los horarios de atención.
export async function setHours(req, res, next) {
  try {
    res.json(await provService.setHours(Number(req.params.id), req.body.hours, req.user));
  } catch (err) { next(err); }
}

// Agrega un servicio/deporte que ofrece.
export async function addService(req, res, next) {
  try {
    const svc = await provService.addService(Number(req.params.id), req.body, req.user);
    res.status(201).json(svc);
  } catch (err) { next(err); }
}

// Saca un servicio del proveedor.
export async function removeService(req, res, next) {
  try {
    res.json(await provService.removeService(Number(req.params.id), Number(req.params.serviceId), req.user));
  } catch (err) { next(err); }
}

// Lista los deportes del proveedor.
export async function getSports(req, res, next) {
  try {
    const services = await provService.getServices(Number(req.params.id));
    // iOS expects { items: [{ id, name }] }
    const items = services.map((s) => ({ id: s.sport_id, name: s.sport_name }));
    res.json({ items });
  } catch (err) { next(err); }
}

// ─── Saldo y retiros del proveedor ───────────────────────────────────────────
import * as finance from '../services/providerFinance.service.js';

// Devuelve el saldo del proveedor logueado.
export async function myBalance(req, res, next) {
  try { res.json(await finance.getBalance(req.user.id)); } catch (err) { next(err); }
}

// Movimientos (créditos por pagos confirmados).
export async function myLedger(req, res, next) {
  try { res.json(await finance.listLedger(req.user.id, { limit: Number(req.query.limit) || 30 })); } catch (err) { next(err); }
}

// Pide un retiro del saldo disponible.
export async function requestWithdrawal(req, res, next) {
  try { res.status(201).json(await finance.requestWithdrawal(req.user.id, req.body)); } catch (err) { next(err); }
}

// Lista tus retiros.
export async function myWithdrawals(req, res, next) {
  try { res.json(await finance.listMyWithdrawals(req.user.id)); } catch (err) { next(err); }
}

// Admin: solicitudes de retiro de todos los proveedores.
export async function allWithdrawals(req, res, next) {
  try { res.json(await finance.listAllWithdrawals({ status: req.query.status || 'pending' })); } catch (err) { next(err); }
}

// Admin: marca un retiro como pagado o rechazado.
export async function resolveWithdrawal(req, res, next) {
  try { res.json(await finance.resolveWithdrawal(Number(req.params.id), req.body)); } catch (err) { next(err); }
}
