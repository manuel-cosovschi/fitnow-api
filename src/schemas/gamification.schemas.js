// src/schemas/gamification.schemas.js
import { z } from 'zod';

export const claimXpSchema = z.object({
  user_id: z.coerce.number().int().positive(),
  xp:      z.coerce.number().int().min(1).max(10000),
  source:  z.string().trim().max(40).optional().default('manual'),
  note:    z.string().trim().max(200).optional().nullable(),
});
