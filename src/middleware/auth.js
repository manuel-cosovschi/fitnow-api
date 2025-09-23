// src/middleware/auth.js
import jwt from 'jsonwebtoken';

/**
 * Middleware que exige JWT válido y deja el payload en req.user
 */
export function requireAuth(req, res, next) {
  try {
    const header = req.headers['authorization'] || '';
    const parts = header.split(' ');
    const token =
      parts.length === 2 && /^Bearer$/i.test(parts[0]) ? parts[1] : null;

    if (!token) return res.status(401).json({ error: 'Missing token' });

    const secret = process.env.JWT_SECRET || 'dev_secret_change_me';
    const payload = jwt.verify(token, secret);

    const userId = payload.id ?? payload.sub;
    if (!userId) return res.status(401).json({ error: 'Invalid token payload' });

    req.user = {
      id: userId,
      email: payload.email || null,
      name: payload.name || null,
      role: payload.role || 'user',
    };

    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Middleware opcional: si hay JWT válido setea req.user,
 * si no, sigue como anónimo.
 */
export function optionalAuth(req, _res, next) {
  try {
    const header = req.headers['authorization'] || '';
    const parts = header.split(' ');
    const token =
      parts.length === 2 && /^Bearer$/i.test(parts[0]) ? parts[1] : null;

    if (!token) return next();

    const secret = process.env.JWT_SECRET || 'dev_secret_change_me';
    const payload = jwt.verify(token, secret);

    const userId = payload.id ?? payload.sub;
    if (userId) {
      req.user = {
        id: userId,
        email: payload.email || null,
        name: payload.name || null,
        role: payload.role || 'user',
      };
    }
  } catch (_) {
    // Ignoramos error → se sigue sin req.user
  }
  return next();
}

export { requireAuth as authMiddleware };


