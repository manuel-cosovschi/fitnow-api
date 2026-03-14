// src/schemas/activity.schemas.js
import { z } from 'zod';

const DIFFICULTIES = ['baja', 'media', 'alta'];
const MODALITIES   = ['gimnasio', 'outdoor', 'clase', 'torneo'];
const KINDS        = ['class', 'event', 'course', 'membership'];
// 'inactive' is intentionally excluded — not a valid DB ENUM value for activities
const STATUSES     = ['draft', 'active', 'cancelled'];

export const createActivitySchema = z.object({
  title:       z.string().trim().min(1, 'El título es requerido.').max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  location:    z.string().trim().max(300).optional().nullable(),
  difficulty:  z.enum(DIFFICULTIES).optional(),
  modality:    z.enum(MODALITIES).optional(),
  kind:        z.enum(KINDS).optional(),
  price:       z.coerce.number().min(0, 'El precio no puede ser negativo.').optional(),
  capacity:    z.coerce.number().int().min(1).optional().nullable(),
  sport_id:    z.coerce.number().int().positive().optional().nullable(),
  provider_id: z.coerce.number().int().positive().optional().nullable(),
  date_start:  z.string().datetime({ offset: true }).optional().nullable(),
  date_end:    z.string().datetime({ offset: true }).optional().nullable(),
  rules:       z.record(z.unknown()).optional().nullable(),
});

export const updateActivitySchema = createActivitySchema.partial().extend({
  status: z.enum(STATUSES).optional(),
});

export const addSessionSchema = z.object({
  start_at: z.string().datetime({ offset: true }),
  end_at:   z.string().datetime({ offset: true }),
  capacity: z.coerce.number().int().min(1).optional().nullable(),
  price:    z.coerce.number().min(0).optional().nullable(),
  level:    z.string().trim().max(30).optional().nullable(),
});
