// src/controllers/admin.controller.js
import * as aiService   from '../services/ai.service.js';
import * as userRepo    from '../repositories/user.repository.js';
import * as provRepo    from '../repositories/provider.repository.js';
import * as offerService from '../services/offer.service.js';
import { queryOne }     from '../db.js';
import { parsePagination, paginatedResponse } from '../utils/paginate.js';
import { Errors } from '../utils/errors.js';

export async function getWeights(req, res, next) {
  try {
    res.json(await aiService.getWeights());
  } catch (err) { next(err); }
}

export async function listWeights(req, res, next) {
  try {
    res.json(await aiService.listWeights());
  } catch (err) { next(err); }
}

export async function upsertWeights(req, res, next) {
  try {
    res.json(await aiService.upsertWeights(req.body));
  } catch (err) { next(err); }
}

export async function getNews(req, res, next) {
  try {
    res.json(await aiService.getNews());
  } catch (err) { next(err); }
}

// ─── User management ──────────────────────────────────────────────────────────

export async function listUsers(req, res, next) {
  try {
    const { page, perPage, offset } = parsePagination(req.query);
    const filters = { q: req.query.q?.trim() || null, role: req.query.role || null };
    const [items, total] = await Promise.all([
      userRepo.findManyForAdmin({ ...filters, limit: perPage, offset }),
      userRepo.countMany(filters),
    ]);
    res.json(paginatedResponse(items, { page, perPage, total }));
  } catch (err) { next(err); }
}

export async function assignProviderRole(req, res, next) {
  try {
    const userId     = Number(req.params.id);
    const providerId = req.body.provider_id ? Number(req.body.provider_id) : null;
    const role       = req.body.role ?? 'provider_admin';

    const VALID_ROLES = ['user', 'provider_admin', 'admin'];
    if (!VALID_ROLES.includes(role)) throw Errors.badRequest(`Rol inválido. Valores válidos: ${VALID_ROLES.join(', ')}`);

    if (providerId !== null) {
      const provider = await provRepo.findById(providerId);
      if (!provider) throw Errors.notFound('Proveedor no encontrado.');
    }

    const user = await userRepo.setRoleAndProvider(userId, role, providerId);
    if (!user) throw Errors.notFound('Usuario no encontrado.');
    res.json(user);
  } catch (err) { next(err); }
}

export async function patchUser(req, res, next) {
  try {
    const userId = Number(req.params.id);
    const { role, is_banned } = req.body;

    if (role !== undefined) {
      const VALID_ROLES = ['user', 'provider_admin', 'admin'];
      if (!VALID_ROLES.includes(role)) throw Errors.badRequest(`Rol inválido.`);
      await userRepo.updateRole(userId, role);
    }
    if (is_banned !== undefined) {
      await userRepo.setBanned(userId, Boolean(is_banned));
    }

    const user = await userRepo.findById(userId);
    if (!user) throw Errors.notFound('Usuario no encontrado.');
    res.json(user);
  } catch (err) { next(err); }
}

export async function patchProvider(req, res, next) {
  try {
    const id = Number(req.params.id);
    const VALID_STATUS = ['active', 'suspended', 'pending'];
    if (req.body.status && !VALID_STATUS.includes(req.body.status)) {
      throw Errors.badRequest(`Estado inválido. Valores válidos: ${VALID_STATUS.join(', ')}`);
    }
    const provider = await provRepo.update(id, req.body);
    if (!provider) throw Errors.notFound('Proveedor no encontrado.');
    const actCount = await queryOne(`SELECT COUNT(*) AS total FROM activities WHERE provider_id = ?`, [id]);
    res.json({ ...provider, activity_count: actCount?.total ?? 0 });
  } catch (err) { next(err); }
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getStats(req, res, next) {
  try {
    const [users, providers, activities, totalEnrollments, pendingOffers, revenue] = await Promise.all([
      queryOne(`SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL`),
      queryOne(`SELECT COUNT(*) AS total FROM providers`),
      queryOne(`SELECT COUNT(*) AS total FROM activities`),
      queryOne(`SELECT COUNT(*) AS total FROM enrollments`),
      queryOne(`SELECT COUNT(*) AS total FROM offers WHERE status = 'pending'`),
      queryOne(`SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE status = 'completed'`),
    ]);
    res.json({
      total_users:       users?.total            ?? 0,
      total_providers:   providers?.total        ?? 0,
      total_activities:  activities?.total       ?? 0,
      total_enrollments: totalEnrollments?.total ?? 0,
      pending_offers:    pendingOffers?.total    ?? 0,
      total_revenue:     Number(revenue?.total   ?? 0) / 100,
    });
  } catch (err) { next(err); }
}

// ─── Providers ────────────────────────────────────────────────────────────────

export async function listProviders(req, res, next) {
  try {
    const { page, perPage, offset } = parsePagination(req.query);
    const filters = { q: req.query.q?.trim() || null, kind: req.query.kind || null };
    const [items, total] = await Promise.all([
      provRepo.findManyForAdmin({ ...filters, limit: perPage, offset }),
      provRepo.countMany(filters),
    ]);
    res.json(paginatedResponse(items, { page, perPage, total }));
  } catch (err) { next(err); }
}

// ─── Offers ───────────────────────────────────────────────────────────────────

export async function listAdminOffers(req, res, next) {
  try {
    res.json(await offerService.listAdmin(req.query));
  } catch (err) { next(err); }
}

export async function approveOffer(req, res, next) {
  try {
    res.json(await offerService.approve(Number(req.params.id)));
  } catch (err) { next(err); }
}

export async function rejectOffer(req, res, next) {
  try {
    res.json(await offerService.reject(Number(req.params.id), req.body.reason ?? null));
  } catch (err) { next(err); }
}
