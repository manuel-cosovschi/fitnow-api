// src/middleware/aiRateLimit.js
// Per-user rate limiter for AI endpoints. Separate from the global /api limiter
// so that AI quota abuse cannot be hidden inside the noise of normal traffic.
//
// Tunable via env so prod can clamp down without redeploy:
//   AI_RATE_LIMIT_WINDOW_MS  default 60_000  (1 min)
//   AI_RATE_LIMIT_MAX        default 10      (per user per window)
//   AI_HEAVY_RATE_LIMIT_MAX  default 4       (per user per window for expensive
//                                              endpoints: gym session create + reroute)
//
// Keying: req.user.id when authenticated, otherwise the IP. This sits AFTER
// requireAuth in the router chain so user-id is always present in practice.

import rateLimit from 'express-rate-limit';

function keyByUser(req) {
  return req.user?.id ? `u:${req.user.id}` : `ip:${req.ip}`;
}

const commonOpts = {
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:    keyByUser,
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code:    'AI_RATE_LIMIT',
        message: 'Demasiadas solicitudes a la IA. Esperá unos segundos e intentá de nuevo.',
        status:  429,
      },
    });
  },
};

export const aiLimiter = rateLimit({
  ...commonOpts,
  windowMs: parseInt(process.env.AI_RATE_LIMIT_WINDOW_MS, 10) || 60_000,
  max:      parseInt(process.env.AI_RATE_LIMIT_MAX,        10) || 10,
});

export const aiHeavyLimiter = rateLimit({
  ...commonOpts,
  windowMs: parseInt(process.env.AI_RATE_LIMIT_WINDOW_MS, 10) || 60_000,
  max:      parseInt(process.env.AI_HEAVY_RATE_LIMIT_MAX,  10) || 4,
});
