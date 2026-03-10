// src/schemas/run.schemas.js
import { z } from 'zod';

export const startSessionSchema = z.object({
  route_id:   z.coerce.number().int().positive().optional().nullable(),
  origin_lat: z.coerce.number().min(-90).max(90).optional().nullable(),
  origin_lng: z.coerce.number().min(-180).max(180).optional().nullable(),
  device:     z.string().trim().max(120).optional().nullable(),
});

// Accepts both client-friendly names (altitude, speed, heart_rate, recorded_at)
// and repo-aligned names (elevation_m, speed_mps, hr_bpm, ts_ms).
// The service layer normalizes to repo field names before writing to DB.
const telemetryPointSchema = z.object({
  lat:          z.number().min(-90).max(90),
  lng:          z.number().min(-180).max(180),
  // Timestamp: client may send recorded_at (ISO string) or ts_ms (epoch ms)
  ts_ms:        z.number().int().optional().nullable(),
  recorded_at:  z.string().datetime({ offset: true }).optional().nullable(),
  // Client-friendly metric names
  altitude:     z.number().optional().nullable(),
  speed:        z.number().min(0).optional().nullable(),
  heart_rate:   z.number().int().min(0).max(300).optional().nullable(),
  // Repo-aligned metric names (also accepted directly)
  elevation_m:  z.number().optional().nullable(),
  speed_mps:    z.number().min(0).optional().nullable(),
  hr_bpm:       z.number().int().min(0).max(300).optional().nullable(),
  pace_s:       z.number().int().min(0).optional().nullable(),
  off_route:    z.boolean().optional(),
  accuracy_m:   z.number().min(0).optional().nullable(),
});

export const pushTelemetrySchema = z.object({
  points: z.array(telemetryPointSchema).min(1, 'Se requiere al menos un punto.').max(500),
});

export const finishSessionSchema = z.object({
  finished_at:     z.string().datetime({ offset: true }).optional().nullable(),
  duration_s:      z.coerce.number().int().min(0).optional().nullable(),
  distance_m:      z.coerce.number().int().min(0).optional().nullable(),
  // avg_pace_s is the canonical field; avg_pace is accepted as a client alias
  avg_pace_s:      z.coerce.number().int().min(0).optional().nullable(),
  avg_pace:        z.coerce.number().min(0).optional().nullable(),
  avg_speed_mps:   z.coerce.number().min(0).optional().nullable(),
  avg_hr_bpm:      z.coerce.number().int().min(0).optional().nullable(),
  deviates_count:  z.coerce.number().int().min(0).optional().nullable(),
  max_elevation_m: z.coerce.number().optional().nullable(),
  min_elevation_m: z.coerce.number().optional().nullable(),
  calories:        z.coerce.number().min(0).optional().nullable(),
  notes:           z.string().trim().max(500).optional().nullable(),
});

export const submitFeedbackSchema = z.object({
  rating:               z.number().int().min(1).max(5),
  notes:                z.string().trim().max(1000).optional().nullable(),
  fatigue_level:        z.coerce.number().int().min(1).max(5).optional().nullable(),
  perceived_difficulty: z.coerce.number().int().min(1).max(5).optional().nullable(),
  session_id:           z.coerce.number().int().positive().optional().nullable(),
});

export const generateRoutesSchema = z.object({
  origin_lat:  z.number().min(-90).max(90),
  origin_lng:  z.number().min(-180).max(180),
  distance_m:  z.number().int().min(500).max(100000),
});
