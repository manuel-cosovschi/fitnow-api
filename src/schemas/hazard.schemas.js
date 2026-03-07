// src/schemas/hazard.schemas.js
import { z } from 'zod';

export const createHazardSchema = z.object({
  lat:      z.coerce.number().min(-90,  'lat debe estar entre -90 y 90.')  .max(90),
  lng:      z.coerce.number().min(-180, 'lng debe estar entre -180 y 180.').max(180),
  type:     z.string().trim().min(1, 'type es requerido.').max(50),
  note:     z.string().trim().max(500).optional().nullable(),
  severity: z.coerce.number().int().min(1).max(3).optional(),
});

export const nearQuerySchema = z.object({
  lat:      z.coerce.number().min(-90).max(90),
  lng:      z.coerce.number().min(-180).max(180),
  radius_m: z.coerce.number().int().min(1).max(50000).optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(['active', 'resolved', 'removed']),
});
