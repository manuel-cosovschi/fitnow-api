// src/middleware/error.middleware.js
import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

/**
 * Middleware global de manejo de errores.
 * Debe estar registrado DESPUÉS de todas las rutas en app.js.
 */
// eslint-disable-next-line no-unused-vars
export function errorMiddleware(err, req, res, _next) {
  // Error de negocio conocido
  if (err instanceof AppError) {
    const body = { error: { code: err.code, message: err.message, status: err.status } };
    if (err.fields) body.error.fields = err.fields;
    return res.status(err.status).json(body);
  }

  // Duplicate entry de MySQL
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: { code: 'DUPLICATE_ENTRY', message: 'Ya existe un registro con esos datos.', status: 409 } });
  }

  // Error inesperado — no exponer detalles en producción
  const isDev = process.env.NODE_ENV !== 'production';
  logger.error(`${req.method} ${req.url}`, { message: err.message, stack: err.stack });

  return res.status(500).json({
    error: {
      code:    'INTERNAL_ERROR',
      message: 'Error interno del servidor.',
      status:  500,
      ...(isDev && { detail: err.message, stack: err.stack }),
    },
  });
}
