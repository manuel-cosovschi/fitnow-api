// src/controllers/admin.controller.js
import * as aiService   from '../services/ai.service.js';
import * as userRepo    from '../repositories/user.repository.js';
import * as provRepo    from '../repositories/provider.repository.js';
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
      userRepo.findMany({ ...filters, limit: perPage, offset }),
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
