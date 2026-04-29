// src/schemas/ai.schemas.js
import { z } from 'zod';

// ── Coach ─────────────────────────────────────────────────────────────────────

export const coachContextSchema = z.object({
  streak_days:     z.number().int().nonnegative().optional(),
  recent_run_km:   z.number().nonnegative().optional(),
  recent_gym_sets: z.number().int().nonnegative().optional(),
  level:           z.number().int().nonnegative().optional(),
}).passthrough();

export const coachRequestSchema = z.object({
  // Cap message length so a malicious client can't blow up the prompt budget.
  message: z.string().trim().min(1, 'message es requerido.').max(2000, 'message no puede exceder 2000 caracteres.'),
  context: coachContextSchema.optional(),
});

export const coachHistoryQuerySchema = z.object({
  limit:  z.coerce.number().int().min(1).max(100).default(50),
  before: z.coerce.number().int().positive().optional(), // pagination cursor: id of last seen row
});

// ── Form Check ────────────────────────────────────────────────────────────────

export const FORM_EXERCISES = ['squat', 'pushup', 'plank', 'deadlift'];

export const formCheckSubmitSchema = z.object({
  exercise: z.enum(FORM_EXERCISES),
  score:    z.number().int().min(0).max(100),
  feedback: z.string().trim().min(1).max(500),
  // joints: optional dictionary of joint name → {x,y} for replay/visualization.
  joints:   z.record(z.string(), z.object({
    x: z.number(),
    y: z.number(),
  })).optional(),
});

export const formCheckListQuerySchema = z.object({
  limit:    z.coerce.number().int().min(1).max(100).default(20),
  exercise: z.enum(FORM_EXERCISES).optional(),
});

// ── Gym sessions (AI-generated) ───────────────────────────────────────────────

export const gymCreateSchema = z.object({
  activity_id:         z.coerce.number().int().positive().optional(),
  goal:                z.string().trim().max(200).optional(),
  time_available_min:  z.coerce.number().int().min(5).max(240).optional(),
  equipment_available: z.string().trim().max(500).optional(),
  muscle_groups:       z.array(z.string().trim().min(1).max(40)).max(12).optional(),
});

export const gymRerouteSchema = z.object({
  completed_exercises: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
  remaining_time_min:  z.coerce.number().int().min(1).max(180).optional(),
});
