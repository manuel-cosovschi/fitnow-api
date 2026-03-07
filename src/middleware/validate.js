// src/middleware/validate.js
import { ZodError } from 'zod';
import { Errors } from '../utils/errors.js';

/**
 * Returns an Express middleware that validates req.body against a Zod schema.
 * On success, replaces req.body with the parsed (coerced) value.
 * On failure, forwards a 400 AppError with field-level details.
 */
export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(formatZodError(result.error));
    req.body = result.data;
    next();
  };
}

/**
 * Like validateBody but validates req.query.
 */
export function validateQuery(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(formatZodError(result.error));
    req.query = result.data;
    next();
  };
}

function formatZodError(error) {
  const fields = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] = issue.message;
  }
  const firstMessage = error.issues[0]?.message ?? 'Datos inválidos.';
  const err = Errors.badRequest(firstMessage);
  err.fields = fields;
  return err;
}
