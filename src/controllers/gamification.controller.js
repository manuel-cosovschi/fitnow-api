// src/controllers/gamification.controller.js
import * as gamService from '../services/gamification.service.js';
import { queryOne } from '../db.js';

export async function getMyProfile(req, res, next) {
  try {
    const profile = await gamService.getProfile(req.user.id);
    res.json(profile);
  } catch (err) { next(err); }
}

export async function getMyXpHistory(req, res, next) {
  try {
    res.json(await gamService.getMyXpHistory(req.user.id, req.query));
  } catch (err) { next(err); }
}

export async function getPublicProfile(req, res, next) {
  try {
    const userId = Number(req.params.id);
    const user = await queryOne(
      `SELECT id, name, photo_url, bio FROM users WHERE id = ? AND deleted_at IS NULL`,
      [userId]
    );
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

    const profile = await gamService.getProfile(userId);
    res.json({ user, ...profile });
  } catch (err) { next(err); }
}

export async function getRanking(req, res, next) {
  try {
    const type = req.query.type || 'global';
    res.json(await gamService.getRanking(type, req.query));
  } catch (err) { next(err); }
}

export async function getProviderRanking(req, res, next) {
  try {
    const providerId = Number(req.params.id);
    res.json(await gamService.getProviderRanking(providerId, req.query));
  } catch (err) { next(err); }
}

export async function listBadges(req, res, next) {
  try {
    const userId = req.user?.id ?? null;
    res.json(await gamService.getAllBadges(userId));
  } catch (err) { next(err); }
}

export async function claimXp(req, res, next) {
  try {
    const result = await gamService.claimXp(req.user.id, req.body);
    res.status(201).json(result);
  } catch (err) { next(err); }
}
