// src/utils/env.js
/**
 * Validates required environment variables at startup.
 * Throws on first failure so the process exits early with a clear message.
 */

const REQUIRED = ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_NAME'];

const WEAK_SECRETS = new Set([
  'supersecret_dev_key_change_me',
  'dev_secret_change_me',
  'change_me_to_a_random_64_char_secret',
  'secret',
]);

export function validateEnv() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`[ENV] Variables de entorno requeridas no configuradas: ${missing.join(', ')}`);
  }

  if (process.env.NODE_ENV === 'production' && WEAK_SECRETS.has(process.env.JWT_SECRET)) {
    throw new Error('[ENV] JWT_SECRET tiene un valor inseguro. Cambialo antes de ir a producción.');
  }
}
