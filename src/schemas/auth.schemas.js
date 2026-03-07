// src/schemas/auth.schemas.js
import { z } from 'zod';

export const registerSchema = z.object({
  name:     z.string().trim().min(1, 'El nombre es requerido.').max(100),
  email:    z.string().trim().email('Email inválido.').max(255),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.').max(128),
});

export const loginSchema = z.object({
  email:    z.string().trim().min(1, 'El email es requerido.'),
  password: z.string().min(1, 'La contraseña es requerida.'),
});

export const updateMeSchema = z.object({
  name:  z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email('Email inválido.').max(255).optional(),
  phone: z.string().trim().max(30).optional().nullable(),
  bio:   z.string().trim().max(500).optional().nullable(),
}).strict();

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'La contraseña actual es requerida.'),
  new_password:     z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres.').max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Email inválido.'),
});

export const resetPasswordSchema = z.object({
  token:        z.string().min(1, 'Token requerido.'),
  new_password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.').max(128),
});

const PROVIDER_KINDS = ['gym', 'studio', 'trainer', 'club', 'other'];

export const registerProviderSchema = z.object({
  name:                 z.string().trim().min(1, 'El nombre es requerido.').max(100),
  email:                z.string().trim().email('Email inválido.').max(255),
  password:             z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.').max(128),
  provider_name:        z.string().trim().min(1, 'El nombre del proveedor es requerido.').max(200),
  provider_kind:        z.enum(PROVIDER_KINDS).optional(),
  provider_description: z.string().trim().max(2000).optional().nullable(),
  provider_address:     z.string().trim().max(300).optional().nullable(),
  provider_city:        z.string().trim().max(100).optional().nullable(),
  provider_phone:       z.string().trim().max(30).optional().nullable(),
  provider_lat:         z.coerce.number().min(-90).max(90).optional().nullable(),
  provider_lng:         z.coerce.number().min(-180).max(180).optional().nullable(),
});
