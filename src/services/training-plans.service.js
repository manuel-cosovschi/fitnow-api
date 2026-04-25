// src/services/training-plans.service.js
import { query, queryOne } from '../db.js';
import { Errors } from '../utils/errors.js';
import logger from '../utils/logger.js';

async function callOpenAI(messages) {
  const key   = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o';
  if (!key) return null;
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, temperature: 0.7, response_format: { type: 'json_object' } }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return JSON.parse(data.choices[0].message.content);
  } catch { return null; }
}

function stubPlanData({ goal, duration_weeks, difficulty }) {
  const weeks = [];
  for (let w = 1; w <= (duration_weeks ?? 4); w++) {
    weeks.push({
      week:  w,
      focus: w <= 2 ? 'Adaptación' : 'Progresión',
      days: [
        { day: 1, type: 'cardio',   title: 'Carrera suave',    description: 'Trote a ritmo cómodo', duration_min: 30, distance_km: 4, intensity: 'baja',  exercises: [] },
        { day: 2, type: 'strength', title: 'Fuerza tren sup.', description: 'Press, dominadas, remo', duration_min: 45, intensity: 'media', exercises: [{ name: 'Press de banca', sets: 3, reps: 12 }, { name: 'Dominadas', sets: 3, reps: 8 }] },
        { day: 3, type: 'rest',     title: 'Descanso activo',  description: 'Caminata o yoga', duration_min: 30, intensity: 'baja', exercises: [] },
        { day: 4, type: 'cardio',   title: 'Intervalos',       description: 'Series de 400m', duration_min: 35, distance_km: 5, intensity: 'alta', exercises: [] },
        { day: 5, type: 'strength', title: 'Fuerza tren inf.', description: 'Sentadilla, peso muerto', duration_min: 45, intensity: 'media', exercises: [{ name: 'Sentadilla', sets: 4, reps: 10 }, { name: 'Peso muerto', sets: 3, reps: 8 }] },
        { day: 6, type: 'rest',     title: 'Descanso',         description: 'Recuperación completa', duration_min: 0, intensity: 'baja', exercises: [] },
        { day: 7, type: 'long_run', title: 'Carrera larga',    description: 'Ritmo muy suave', duration_min: 60, distance_km: 8, intensity: 'baja', exercises: [] },
      ],
    });
  }
  return {
    title:   `Plan ${goal} — ${duration_weeks} semanas`,
    summary: `Plan estructurado de ${duration_weeks} semanas para lograr: ${goal}.`,
    tips:    ['Hidratate bien', 'Dormí 8 horas', 'Escuchá tu cuerpo'],
    weeks,
  };
}

function deserializePlan(row) {
  if (!row) return null;
  if (row.plan_data && typeof row.plan_data === 'string') {
    try { row.plan_data = JSON.parse(row.plan_data); } catch { /* keep */ }
  }
  return row;
}

export async function list(userId) {
  const items = await query(
    `SELECT * FROM training_plans WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  );
  return { items: items.map(deserializePlan) };
}

export async function listActive(userId) {
  const items = await query(
    `SELECT * FROM training_plans WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC`,
    [userId]
  );
  return { items: items.map(deserializePlan) };
}

export async function generate(userId, { goal, duration_weeks, difficulty }) {
  if (!goal) throw Errors.badRequest('goal es requerido.');

  const aiResult = await callOpenAI([
    { role: 'system', content: 'You are a professional running/fitness coach. Generate a weekly training plan as JSON with: title, summary, tips (array of strings), weeks (array). Each week: week (number), focus, days (array). Each day: day (number 1-7), type (cardio/strength/rest/long_run), title, description, duration_min, distance_km (optional), intensity (baja/media/alta), exercises (array, each: name, sets?, reps?, weight_suggestion?).' },
    { role: 'user',   content: `Goal: ${goal}. Duration: ${duration_weeks ?? 4} weeks. Difficulty: ${difficulty ?? 'media'}.` },
  ]);

  const planData = aiResult ?? stubPlanData({ goal, duration_weeks, difficulty });
  const title = planData.title || `Plan ${goal}`;

  const result = await query(
    `INSERT INTO training_plans (user_id, title, goal, duration_weeks, difficulty, plan_data) VALUES (?,?,?,?,?,?)`,
    [userId, title, goal, duration_weeks ?? 4, difficulty ?? 'media', JSON.stringify(planData)]
  );
  return deserializePlan(await queryOne(`SELECT * FROM training_plans WHERE id = ?`, [result.insertId]));
}

export async function getById(userId, id) {
  const plan = await queryOne(`SELECT * FROM training_plans WHERE id = ? AND user_id = ?`, [id, userId]);
  if (!plan) throw Errors.notFound('Plan no encontrado.');
  return deserializePlan(plan);
}

export async function cancel(userId, id) {
  const plan = await queryOne(`SELECT id FROM training_plans WHERE id = ? AND user_id = ?`, [id, userId]);
  if (!plan) throw Errors.notFound('Plan no encontrado.');
  await query(`UPDATE training_plans SET status = 'cancelled' WHERE id = ?`, [id]);
}
