// src/middleware/entitlements.js
import { AppError } from '../utils/errors.js';
import { getEntitlement } from '../services/subscription.service.js';
import { planLimits } from '../config/plans.js';

/**
 * Error de paywall. Va con 402 Payment Required para que la app lo distinga de
 * un 403 por rol y abra la pantalla de suscripción en vez de un cartel de error.
 */
export function premiumRequired(feature, message = 'Esta función es parte de FitNow+.') {
  const err = new AppError('PREMIUM_REQUIRED', message, 402);
  err.fields = { feature };
  return err;
}

/**
 * Deja el plan del usuario en `req.entitlement`. Usar DESPUÉS de requireAuth
 * (o de optionalAuth: un anónimo queda como free).
 */
export async function attachEntitlement(req, _res, next) {
  try {
    req.entitlement = req.user?.id
      ? await getEntitlement(req.user.id)
      : { plan: 'free', status: 'none', ...planLimits('free') };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Corta el paso si el usuario no tiene premium.
 * Usar DESPUÉS de requireAuth.
 *
 *   router.post('/coach', requireAuth, requirePremium(PREMIUM_FEATURES.AI_COACH), ctrl.coach)
 *
 * @param {string} feature clave de PREMIUM_FEATURES, para que la app sepa qué se bloqueó
 * @param {string} [message] texto que ve el usuario en el paywall
 */
export function requirePremium(feature, message) {
  return async (req, _res, next) => {
    try {
      const entitlement = req.entitlement ?? await getEntitlement(req.user?.id);
      req.entitlement = entitlement;

      if (entitlement.plan !== 'premium') {
        return next(premiumRequired(feature, message));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
