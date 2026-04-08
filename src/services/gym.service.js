// src/services/gym.service.js
import * as gymRepo from '../repositories/gym.repository.js';
import * as gymAi from './gymAi.service.js';
import * as gamificationService from './gamification.service.js';
import { parsePagination, paginatedResponse } from '../utils/paginate.js';
import { Errors } from '../utils/errors.js';
import logger from '../utils/logger.js';

// ─── Start Session ────────────────────────────────────────────────────────────

export async function startSession(userId, { goal, time_available_min, equipment_available, muscle_groups, activity_id }) {
  const active = await gymRepo.findActiveSession(userId);
  if (active) throw Errors.conflict('SESSION_ACTIVE', 'Ya tenés una sesión de gym activa.');

  const recentSessions = await gymRepo.getRecentSessions(userId, 3);
  const historySummary = recentSessions.length > 0
    ? recentSessions.map(s => {
        const setsStr = s.sets?.map(st => `${st.exercise_name}: ${st.actual_reps}x${st.actual_weight}kg`).join(', ') || 'Sin sets';
        return `Sesión (${s.goal || 'sin objetivo'}): ${setsStr}`;
      }).join('\n')
    : null;

  const aiPlan = await gymAi.generateWorkoutPlan({
    goal,
    time_available_min,
    equipment_available,
    muscle_groups,
    user_history_summary: historySummary,
  });

  const session = await gymRepo.createSession({
    user_id: userId,
    activity_id: activity_id ?? null,
    goal,
    time_available_min,
    equipment_available,
    muscle_groups,
    ai_plan: aiPlan,
  });

  // Pre-create sets from AI plan
  const preSets = [];
  if (aiPlan?.exercises) {
    for (const ex of aiPlan.exercises) {
      for (let s = 1; s <= (ex.sets || 3); s++) {
        const set = await gymRepo.createSet({
          session_id: session.id,
          exercise_name: ex.name,
          muscle_group: ex.muscle_group ?? null,
          set_number: s,
          planned_reps: ex.reps ?? null,
          planned_weight: ex.suggested_weight_kg ?? null,
        });
        preSets.push(set);
      }
    }
  }

  return { ...session, sets: preSets, ai_plan: aiPlan };
}

// ─── Log Set ──────────────────────────────────────────────────────────────────

export async function logSet(sessionId, userId, { exercise_name, set_number, actual_reps, actual_weight, rpe, rest_s, notes }) {
  const session = await gymRepo.findSessionById(sessionId);
  if (!session) throw Errors.notFound('Sesión no encontrada.');
  if (session.user_id !== userId) throw Errors.forbidden('No podés modificar esta sesión.');
  if (session.status !== 'active') throw Errors.badRequest('La sesión no está activa.');

  let existing = await gymRepo.findSet(sessionId, exercise_name, set_number);
  let set;

  if (existing) {
    set = await gymRepo.updateSet(existing.id, {
      actual_reps, actual_weight, rpe: rpe ?? null, rest_s: rest_s ?? null,
      notes: notes ?? null, completed: true,
    });
  } else {
    set = await gymRepo.createSet({
      session_id: sessionId,
      exercise_name,
      muscle_group: null,
      set_number,
      planned_reps: actual_reps,
      planned_weight: actual_weight,
    });
    set = await gymRepo.updateSet(set.id, {
      actual_reps, actual_weight, rpe: rpe ?? null, rest_s: rest_s ?? null,
      notes: notes ?? null, completed: true,
    });
  }

  // Update session totals
  const volume = (actual_reps || 0) * (actual_weight || 0);
  await gymRepo.updateSession(sessionId, {
    total_sets: session.total_sets + 1,
    total_reps: session.total_reps + (actual_reps || 0),
    total_volume_kg: parseFloat(session.total_volume_kg) + volume,
  });

  return set;
}

// ─── Reroute ──────────────────────────────────────────────────────────────────

export async function reroute(sessionId, userId, { instruction }) {
  const session = await gymRepo.findSessionById(sessionId);
  if (!session) throw Errors.notFound('Sesión no encontrada.');
  if (session.user_id !== userId) throw Errors.forbidden('No podés modificar esta sesión.');
  if (session.status !== 'active') throw Errors.badRequest('La sesión no está activa.');
  if (session.reroute_count >= 10) throw Errors.conflict('MAX_REROUTES', 'Máximo 10 reroutes por sesión.');

  const completedSets = await gymRepo.findSetsBySession(sessionId);
  const completed = completedSets.filter(s => s.completed);

  const elapsedMs = Date.now() - new Date(session.started_at).getTime();
  const elapsedMin = Math.floor(elapsedMs / 60000);
  const timeRemaining = Math.max(0, (session.time_available_min || 60) - elapsedMin);

  const newPlan = await gymAi.rerouteWorkout({
    current_plan: session.ai_plan,
    completed_sets: completed.map(s => ({
      exercise_name: s.exercise_name,
      set_number: s.set_number,
      actual_reps: s.actual_reps,
      actual_weight: s.actual_weight,
      rpe: s.rpe,
    })),
    instruction,
    time_remaining_min: timeRemaining,
  });

  // Remove uncompleted sets and create new ones
  await gymRepo.deleteUncompletedSets(sessionId);
  if (newPlan?.remaining_exercises) {
    for (const ex of newPlan.remaining_exercises) {
      for (let s = 1; s <= (ex.sets || 3); s++) {
        await gymRepo.createSet({
          session_id: sessionId,
          exercise_name: ex.name,
          muscle_group: ex.muscle_group ?? null,
          set_number: s,
          planned_reps: ex.reps ?? null,
          planned_weight: ex.suggested_weight_kg ?? null,
        });
      }
    }
  }

  await gymRepo.updateSession(sessionId, {
    ai_plan: newPlan,
    reroute_count: session.reroute_count + 1,
  });

  return newPlan;
}

// ─── Finish Session ───────────────────────────────────────────────────────────

export async function finishSession(sessionId, userId) {
  const session = await gymRepo.findSessionById(sessionId);
  if (!session) throw Errors.notFound('Sesión no encontrada.');
  if (session.user_id !== userId) throw Errors.forbidden('No podés finalizar esta sesión.');
  if (session.status !== 'active') throw Errors.badRequest('La sesión ya fue finalizada.');

  const durationS = Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000);

  const updated = await gymRepo.updateSession(sessionId, {
    status: 'completed',
    finished_at: new Date().toISOString(),
    duration_s: durationS,
  });

  let xpResult = null;
  try {
    const xp = gamificationService.XP_TABLE.gym_session_base +
      (updated.total_sets || 0) * gamificationService.XP_TABLE.gym_session_per_set;
    xpResult = await gamificationService.awardXp(userId, {
      xp,
      source: 'gym_session',
      ref_type: 'gym_session',
      ref_id: sessionId,
      note: `Sesión de gym: ${updated.total_sets || 0} sets, ${updated.total_volume_kg || 0}kg`,
    });
  } catch (err) {
    logger.warn(`Gamification error (gym finish ${sessionId}): ${err.message}`);
  }

  return {
    ...updated,
    xp_earned: xpResult?.xp_gained ?? 0,
    xp_result: xpResult,
  };
}

// ─── Abandon Session ──────────────────────────────────────────────────────────

export async function abandonSession(sessionId, userId) {
  const session = await gymRepo.findSessionById(sessionId);
  if (!session) throw Errors.notFound('Sesión no encontrada.');
  if (session.user_id !== userId) throw Errors.forbidden('No podés abandonar esta sesión.');
  if (session.status !== 'active') throw Errors.badRequest('La sesión ya fue finalizada.');

  return gymRepo.updateSession(sessionId, {
    status: 'abandoned',
    finished_at: new Date().toISOString(),
  });
}

// ─── Get / List ───────────────────────────────────────────────────────────────

export async function getSession(sessionId, userId) {
  const session = await gymRepo.findSessionById(sessionId);
  if (!session) throw Errors.notFound('Sesión no encontrada.');
  if (session.user_id !== userId) throw Errors.forbidden('No podés ver esta sesión.');

  const sets = await gymRepo.findSetsBySession(sessionId);
  return { ...session, sets };
}

export async function listMySessions(userId, queryParams) {
  const { page, perPage, offset } = parsePagination(queryParams);
  const status = queryParams.status || null;

  const [items, total] = await Promise.all([
    gymRepo.findSessionsByUser(userId, { status, limit: perPage, offset }),
    gymRepo.countSessionsByUser(userId, { status }),
  ]);

  return paginatedResponse(items, { page, perPage, total });
}
