// src/schemas/gym.schemas.js
import { z } from 'zod';

export const startGymSessionSchema = z.object({
  goal:                z.string().trim().min(1).max(500),
  time_available_min:  z.coerce.number().int().min(10).max(180),
  equipment_available: z.string().trim().max(500).optional().nullable(),
  muscle_groups:       z.array(z.string().trim().max(50)).min(1).max(10),
  activity_id:         z.coerce.number().int().positive().optional().nullable(),
});

export const logSetSchema = z.object({
  exercise_name:  z.string().trim().min(1).max(120),
  set_number:     z.coerce.number().int().min(1).max(50),
  actual_reps:    z.coerce.number().int().min(0).max(200),
  actual_weight:  z.coerce.number().min(0).max(1000),
  rpe:            z.coerce.number().int().min(1).max(10).optional().nullable(),
  rest_s:         z.coerce.number().int().min(0).max(600).optional().nullable(),
  notes:          z.string().trim().max(300).optional().nullable(),
});

export const rerouteGymSchema = z.object({
  instruction: z.string().trim().min(1).max(500),
});
