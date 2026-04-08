// src/schemas/trainingPlan.schemas.js
import { z } from 'zod';

export const generatePlanSchema = z.object({
  goal:           z.string().trim().min(1).max(200),
  duration_weeks: z.coerce.number().int().min(1).max(24),
  difficulty:     z.enum(['baja', 'media', 'alta']).optional().default('media'),
});
