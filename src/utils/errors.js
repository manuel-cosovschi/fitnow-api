// src/utils/errors.js

export class AppError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code   = code;
    this.status = status;
    this.name   = 'AppError';
  }
}

export const Errors = {
  badRequest:   (msg = 'Bad request', fields = null) => {
    const e = new AppError('BAD_REQUEST', msg, 400);
    if (fields) e.fields = fields;
    return e;
  },
  unauthorized: (msg = 'No autenticado')         => new AppError('UNAUTHORIZED',   msg, 401),
  forbidden:    (msg = 'Acceso denegado')         => new AppError('FORBIDDEN',      msg, 403),
  notFound:     (msg = 'Recurso no encontrado')   => new AppError('NOT_FOUND',      msg, 404),
  conflict:     (code, msg)                       => new AppError(code,             msg, 409),
  internal:     (msg = 'Error interno del servidor') => new AppError('INTERNAL_ERROR', msg, 500),
};
