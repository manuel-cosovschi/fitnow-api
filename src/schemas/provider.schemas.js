// src/schemas/provider.schemas.js
import { z } from 'zod';

const KINDS = ['gym', 'studio', 'trainer', 'club', 'other'];

export const createProviderSchema = z.object({
  name:        z.string().trim().min(1, 'El nombre es requerido.').max(200),
  kind:        z.enum(KINDS).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  address:     z.string().trim().max(300).optional().nullable(),
  city:        z.string().trim().max(100).optional().nullable(),
  phone:       z.string().trim().max(30).optional().nullable(),
  email:       z.string().trim().email('Email inválido.').max(255).optional().nullable(),
  website:     z.string().trim().url('URL inválida.').max(500).optional().nullable(),
  lat:         z.coerce.number().min(-90).max(90).optional().nullable(),
  lng:         z.coerce.number().min(-180).max(180).optional().nullable(),
  photo_url:   z.string().trim().url().max(500).optional().nullable(),
});

export const updateProviderSchema = createProviderSchema.partial();

const hourSchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  open_time:   z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido.'),
  close_time:  z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido.'),
});

export const setHoursSchema = z.array(hourSchema).max(14);

export const addServiceSchema = z.object({
  sport_id:    z.coerce.number().int().positive('sport_id es requerido.'),
  description: z.string().trim().max(500).optional().nullable(),
});
