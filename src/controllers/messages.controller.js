// src/controllers/messages.controller.js
import { query, queryOne } from '../db.js';
import { Errors } from '../utils/errors.js';

export async function listMessages(req, res, next) {
  try {
    const items = await query(
      `SELECT id, title, body, kind, read, deep_link, created_at
       FROM in_app_messages WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ items });
  } catch (err) { next(err); }
}

export async function markRead(req, res, next) {
  try {
    const { id } = req.params;
    const msg = await queryOne(
      `SELECT id FROM in_app_messages WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );
    if (!msg) throw Errors.notFound('Mensaje no encontrado.');
    await query(`UPDATE in_app_messages SET read = TRUE WHERE id = ?`, [id]);
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
}

export async function markAllRead(req, res, next) {
  try {
    await query(`UPDATE in_app_messages SET read = TRUE WHERE user_id = ?`, [req.user.id]);
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
}

export async function savePushToken(req, res, next) {
  try {
    const { token, platform = 'ios' } = req.body;
    if (!token) throw Errors.badRequest('token requerido.');
    await query(
      `INSERT INTO push_tokens (user_id, token, platform)
       VALUES (?,?,?)
       ON CONFLICT (user_id, token) DO UPDATE SET platform = EXCLUDED.platform`,
      [req.user.id, token, platform]
    );
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
}

export async function deletePushToken(req, res, next) {
  try {
    await query(`DELETE FROM push_tokens WHERE user_id = ?`, [req.user.id]);
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
}
