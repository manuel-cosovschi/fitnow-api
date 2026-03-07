// src/middleware/roles.middleware.js
import { Errors } from '../utils/errors.js';

/**
 * Exige que el usuario autenticado tenga uno de los roles indicados.
 * Usar DESPUÉS de authMiddleware.
 *
 * @param {...string} roles  Ej: requireRole('admin'), requireRole('admin','provider_admin')
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(Errors.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(Errors.forbidden(`Se requiere rol: ${roles.join(' o ')}.`));
    }
    next();
  };
}
