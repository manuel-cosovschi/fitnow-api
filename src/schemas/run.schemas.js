// src/schemas/run.schemas.js
import { z } from 'zod';

export const startSessionSchema = z.object({
  route_id: z.coerce.number().int().positive().optional().nullable(),
  notes:    z.string().trim().max(500).optional().nullable(),
});

const telemetryPointSchema = z.object({
  lat:          z.number().min(-90).max(90),
  lng:          z.number().min(-180).max(180),
  altitude:     z.number().optional().nullable(),
  speed:        z.number().min(0).optional().nullable(),
  heart_rate:   z.number().int().min(0).max(300).optional().nullable(),
  recorded_at:  z.string().datetime({ offset: true }),
});

export const pushTelemetrySchema = z.object({
  points: z.array(telemetryPointSchema).min(1, 'Se requiere al menos un punto.').max(500),
});

export const finishSessionSchema = z.object({
  distance_m: z.coerce.number().min(0).optional().nullable(),
  duration_s: z.coerce.number().int().min(0).optional().nullable(),
  calories:   z.coerce.number().min(0).optional().nullable(),
  avg_pace:   z.coerce.number().min(0).optional().nullable(),
  notes:      z.string().trim().max(500).optional().nullable(),
});

export const submitFeedbackSchema = z.object({
  rating:  z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().nullable(),
});

export const generateRoutesSchema = z.object({
  origin_lat:  z.number().min(-90).max(90),
  origin_lng:  z.number().min(-180).max(180),
  distance_m:  z.number().int().min(500).max(100000),
});
