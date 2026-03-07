// src/schemas/enrollment.schemas.js
import { z } from 'zod';

export const enrollSchema = z.object({
  activity_id: z.coerce.number().int().positive('activity_id es requerido.'),
  session_id:  z.coerce.number().int().positive().optional().nullable(),
});
