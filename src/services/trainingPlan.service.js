// src/services/trainingPlan.service.js
import Anthropic from '@anthropic-ai/sdk';
import * as planRepo from '../repositories/trainingPlan.repository.js';
import * as analyticsRepo from '../repositories/analytics.repository.js';
import { parsePagination, paginatedResponse } from '../utils/paginate.js';
import { Errors } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { queryOne } from '../db.js';

let client;
function getClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw Errors.internal('ANTHROPIC_API_KEY no configurada.');
    }
    client = new Anthropic();
  }
  return client;
}

const SYSTEM_PROMPT = `Sos un entrenador personal certificado. Generá un plan de entrenamiento semanal detallado en formato JSON. El plan debe ser progresivo (cada semana un poco más intenso que la anterior).

Estructura del JSON:
{
  "title": "Plan de 8 semanas para 10K",
  "summary": "Plan progresivo...",
  "weeks": [
    {
      "week": 1,
      "focus": "Base aeróbica",
      "days": [
        {
          "day": 1,
          "type": "running",
          "title": "Carrera fácil",
          "description": "Correr a ritmo conversacional",
          "duration_min": 30,
          "distance_km": 4,
          "intensity": "baja",
          "details": {}
        },
        {
          "day": 2,
          "type": "gym",
          "title": "Fuerza de tren inferior",
          "description": "Sentadillas, lunges, peso muerto",
          "duration_min": 45,
          "exercises": [
            { "name": "Sentadilla", "sets": 3, "reps": 12, "weight_suggestion": "moderado" }
          ]
        },
        {
          "day": 3,
          "type": "rest",
          "title": "Descanso activo",
          "description": "Caminata suave o yoga"
        }
      ]
    }
  ],
  "tips": ["Hidratate...", "Dormí 7-8 horas..."]
}

Consideraciones:
- Incluí días de descanso (mínimo 1-2 por semana)
- Alterná running y gym si el objetivo lo requiere
- Para objetivos de running (5K, 10K, maratón): incluí intervalos, tempo runs, y long runs
- Para objetivos de gym (fuerza, hipertrofia): incluí progresión de peso
- Para pérdida de peso: combinar cardio y fuerza
- Adaptá al nivel del usuario (sus stats y preferencias)
- Respondé ÚNICAMENTE con JSON válido, sin texto adicional ni markdown`;

export async function generatePlan(userId, { goal, duration_weeks, difficulty }) {
  // Rate limit: max 3 per day
  const todayCount = await planRepo.countTodayByUser(userId);
  if (todayCount >= 3) {
    throw Errors.conflict('DAILY_LIMIT', 'Máximo 3 planes por día. Intentá mañana.');
  }

  // Get user info for context
  const user = await queryOne(`SELECT pref_goal_km, pref_surface FROM users WHERE id = ?`, [userId]);
  const runningSummary = await analyticsRepo.getRunningSummary(userId);
  const gymSummary = await analyticsRepo.getGymSummary(userId);

  const userPrompt = [
    `Objetivo: ${goal}`,
    `Duración: ${duration_weeks} semanas`,
    `Dificultad: ${difficulty}`,
    user?.pref_surface ? `Superficie preferida: ${user.pref_surface}` : '',
    user?.pref_goal_km ? `Meta de km: ${user.pref_goal_km}` : '',
    runningSummary?.total_sessions > 0
      ? `Stats running: ${runningSummary.total_sessions} sesiones, ${runningSummary.total_distance_m}m total, pace promedio ${runningSummary.avg_pace_s}s/km`
      : 'Sin historial de running',
    gymSummary?.total_sessions > 0
      ? `Stats gym: ${gymSummary.total_sessions} sesiones, ${gymSummary.total_sets} sets total, volumen ${gymSummary.total_volume_kg}kg`
      : 'Sin historial de gym',
  ].filter(Boolean).join('\n');

  let planData;
  try {
    const anthropic = getClient();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }, { signal: AbortSignal.timeout(30000) });

    const text = response.content[0]?.text;
    planData = JSON.parse(text);
  } catch (err) {
    logger.warn(`AI generatePlan failed: ${err.message}`);
    throw Errors.internal('No se pudo generar el plan. Intentá de nuevo.');
  }

  // Cancel any existing active plan
  await planRepo.cancelActiveByUser(userId);

  const plan = await planRepo.create({
    user_id: userId,
    title: planData.title || `Plan de ${duration_weeks} semanas: ${goal}`,
    goal,
    duration_weeks,
    difficulty,
    plan_data: planData,
  });

  return plan;
}

export async function listMyPlans(userId, queryParams) {
  const { page, perPage, offset } = parsePagination(queryParams);
  const [items, total] = await Promise.all([
    planRepo.findByUser(userId, { limit: perPage, offset }),
    planRepo.countByUser(userId),
  ]);
  return paginatedResponse(items, { page, perPage, total });
}

export async function getActivePlan(userId) {
  const plan = await planRepo.findActiveByUser(userId);
  if (!plan) throw Errors.notFound('No tenés un plan activo.');
  return plan;
}

export async function getPlan(planId, userId) {
  const plan = await planRepo.findById(planId);
  if (!plan) throw Errors.notFound('Plan no encontrado.');
  if (plan.user_id !== userId) throw Errors.forbidden('No podés ver este plan.');
  return plan;
}

export async function cancelPlan(planId, userId) {
  const plan = await planRepo.findById(planId);
  if (!plan) throw Errors.notFound('Plan no encontrado.');
  if (plan.user_id !== userId) throw Errors.forbidden('No podés cancelar este plan.');
  if (plan.status !== 'active') throw Errors.badRequest('El plan no está activo.');
  return planRepo.cancelById(planId);
}
