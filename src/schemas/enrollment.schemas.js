// src/schemas/enrollment.schemas.js
import { z } from 'zod';

export const enrollSchema = z.object({
  activity_id:    z.coerce.number().int().positive('activity_id es requerido.'),
  session_id:     z.coerce.number().int().positive().optional().nullable(),
  plan_name:      z.string().max(100).optional().nullable(),
  plan_price:     z.coerce.number().nonnegative().optional().nullable(),
  payment_type:   z.enum(['full','deposit']).optional().default('full'),
  payment_method: z.enum(['card','transfer']).optional().default('card'),
});
