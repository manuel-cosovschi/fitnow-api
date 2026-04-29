// src/services/gym.service.js
import { query, queryOne } from '../db.js';
import { Errors } from '../utils/errors.js';
import { paginatedResponse } from '../utils/paginate.js';
import { awardXp } from '../utils/xp.js';
import { chatJSON, getModel } from '../utils/openai.js';
import * as aiRepo from '../repositories/ai.repository.js';

function stubPlan({ goal, time_available_min }) {
  const duration = time_available_min ?? 45;
  return {
    exercises: [
      { order: 1, name: 'Calentamiento general', muscle_group: 'full body', sets: 1, reps: null, rest_seconds: 60, notes: '5 min de movimiento articular' },
      { order: 2, name: 'Sentadilla',            muscle_group: 'piernas',   sets: 4, reps: 12,  suggested_weight_kg: null, rest_seconds: 90 },
      { order: 3, name: 'Press de banca',        muscle_group: 'pecho',     sets: 4, reps: 10,  suggested_weight_kg: null, rest_seconds: 90 },
      { order: 4, name: 'Dominadas asistidas',   muscle_group: 'espalda',   sets: 3, reps: 8,   suggested_weight_kg: null, rest_seconds: 90 },
      { order: 5, name: 'Curl de bíceps',        muscle_group: 'brazos',    sets: 3, reps: 12,  suggested_weight_kg: null, rest_seconds: 60 },
    ],
    estimated_duration_min: duration,
    summary:  `Rutina de ${duration} min enfocada en ${goal || 'fuerza general'}.`,
    warmup:   'Movilidad articular y cardio suave 5 minutos.',
    cooldown: 'Elongación estática 5 minutos.',
  };
}

function stubReroute({ remaining_time_min }) {
  return {
    remaining_exercises:     [],
    estimated_remaining_min: remaining_time_min ?? 15,
    reasoning:               'Plan ajustado al tiempo restante disponible.',
    adjustments_made:        'Se simplificó la rutina para completarla en el tiempo disponible.',
  };
}

export async function listMine(userId, { limit, offset, page, perPage }) {
  const [items, total] = await Promise.all([
    query(`SELECT * FROM gym_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?`, [userId, limit, offset]),
    queryOne(`SELECT COUNT(*) AS total FROM gym_sessions WHERE user_id = ?`, [userId]),
  ]);
  return paginatedResponse(items, { page, perPage, total: total?.total ?? 0 });
}

export async function create(userId, { activity_id, goal, time_available_min, equipment_available, muscle_groups }) {
  const aiInput = { goal, time_available_min, equipment_available, muscle_groups };

  const result = await chatJSON({
    jsonMode: true,
    messages: [
      { role: 'system', content: 'You are a professional fitness trainer. Generate a gym workout plan as JSON with keys: exercises (array), estimated_duration_min, summary, warmup, cooldown. Each exercise: order, name, muscle_group, sets, reps, suggested_weight_kg, rest_seconds, notes.' },
      { role: 'user',   content: `Goal: ${goal || 'general fitness'}. Time: ${time_available_min || 45} min. Equipment: ${equipment_available || 'full gym'}. Muscle groups: ${(muscle_groups || []).join(', ') || 'full body'}.` },
    ],
  });

  const aiPlan = result.ok ? result.data : stubPlan(aiInput);
  const aiMode = result.ok ? 'real'      : 'stub';

  // Best-effort usage logging — never let it block the user response.
  aiRepo.logUsage({
    userId, endpoint: 'gym_plan',
    model:  result.ok ? result.model : getModel(),
    usage:  result.usage,
    status: result.ok ? 'ok' : (result.reason === 'no_api_key' ? 'stub' : 'error'),
  }).catch(() => {});

  const insert = await query(
    `INSERT INTO gym_sessions (user_id, activity_id, goal, time_available_min, equipment_available, muscle_groups, ai_plan)
     VALUES (?,?,?,?,?,?,?)`,
    [userId, activity_id ?? null, goal ?? null, time_available_min ?? null,
     equipment_available ?? null, muscle_groups ?? null, JSON.stringify(aiPlan)]
  );
  const session = await getById(userId, insert.insertId);
  return { ...session, ai_mode: aiMode };
}

export async function getById(userId, id) {
  const session = await queryOne(`SELECT * FROM gym_sessions WHERE id = ? AND user_id = ?`, [id, userId]);
  if (!session) throw Errors.notFound('Sesión de gimnasio no encontrada.');
  if (session.ai_plan && typeof session.ai_plan === 'string') {
    try { session.ai_plan = JSON.parse(session.ai_plan); } catch { /* keep as-is */ }
  }
  const sets = await query(`SELECT * FROM gym_sets WHERE session_id = ? ORDER BY set_number ASC`, [id]);
  session.sets = sets;
  return session;
}

export async function addSet(userId, sessionId, fields) {
  const session = await queryOne(`SELECT id FROM gym_sessions WHERE id = ? AND user_id = ?`, [sessionId, userId]);
  if (!session) throw Errors.notFound('Sesión no encontrada.');

  const { exercise_name, muscle_group, set_number, planned_reps, actual_reps, actual_weight, rpe, rest_s, completed, notes } = fields;
  const result = await query(
    `INSERT INTO gym_sets (session_id, exercise_name, muscle_group, set_number, planned_reps, actual_reps, actual_weight, rpe, rest_s, completed, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [sessionId, exercise_name, muscle_group ?? null, set_number ?? 1, planned_reps ?? null,
     actual_reps ?? null, actual_weight ?? null, rpe ?? null, rest_s ?? null,
     completed ?? false, notes ?? null]
  );
  return queryOne(`SELECT * FROM gym_sets WHERE id = ?`, [result.insertId]);
}

export async function finish(userId, sessionId, { total_sets, total_reps, total_volume_kg, duration_s }) {
  const session = await queryOne(`SELECT * FROM gym_sessions WHERE id = ? AND user_id = ?`, [sessionId, userId]);
  if (!session) throw Errors.notFound('Sesión no encontrada.');

  const xp = 30;
  await query(
    `UPDATE gym_sessions SET status='completed', finished_at=NOW(), total_sets=?, total_reps=?, total_volume_kg=?, duration_s=?, xp_earned=? WHERE id=?`,
    [total_sets ?? null, total_reps ?? null, total_volume_kg ?? null, duration_s ?? null, xp, sessionId]
  );
  await awardXp(userId, xp, 'gym_session', { ref_type: 'gym_session', ref_id: sessionId });
  return getById(userId, sessionId);
}

export async function reroute(userId, sessionId, { completed_exercises, remaining_time_min }) {
  const session = await queryOne(`SELECT * FROM gym_sessions WHERE id = ? AND user_id = ?`, [sessionId, userId]);
  if (!session) throw Errors.notFound('Sesión no encontrada.');

  const result = await chatJSON({
    jsonMode: true,
    messages: [
      { role: 'system', content: 'You are a professional fitness trainer. Adjust a mid-session workout. Return JSON with: remaining_exercises (array), estimated_remaining_min, reasoning, adjustments_made.' },
      { role: 'user',   content: `Completed: ${(completed_exercises || []).join(', ')}. Remaining time: ${remaining_time_min} min.` },
    ],
  });

  const payload = result.ok ? result.data : stubReroute({ remaining_time_min });
  const aiMode  = result.ok ? 'real'      : 'stub';

  aiRepo.logUsage({
    userId, endpoint: 'gym_reroute',
    model:  result.ok ? result.model : getModel(),
    usage:  result.usage,
    status: result.ok ? 'ok' : (result.reason === 'no_api_key' ? 'stub' : 'error'),
  }).catch(() => {});

  return { ...payload, ai_mode: aiMode };
}
