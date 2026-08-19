// src/config/plans.js
//
// Catálogo de planes de FitNow. Es la única fuente de verdad: el middleware de
// entitlements, el límite de running y el paywall de la app leen de acá.
//
//   free    → marketplace completo + running hasta FREE_RUN_LIMIT_M
//   premium → todo lo anterior sin límite de distancia + funciones con IA

/** Metros de carrera que puede hacer un usuario free. Configurable por si cambia la política. */
export const FREE_RUN_LIMIT_M = Number(process.env.FREE_RUN_LIMIT_M || 2000);

/** Productos de tienda que otorgan premium. */
export const PREMIUM_PRODUCT_IDS = Object.freeze([
  'com.fitnow.plus.monthly',
  'com.fitnow.plus.annual',
]);

/**
 * Funciones que exigen premium. El middleware `requirePremium` recibe una de
 * estas claves para poder devolverle a la app qué se intentó usar.
 */
export const PREMIUM_FEATURES = Object.freeze({
  AI_COACH:        'ai_coach',
  AI_RUN_ANALYSIS: 'ai_run_analysis',
  AI_FORM_CHECK:   'ai_form_check',
  AI_GYM_PLAN:     'ai_gym_plan',
  AI_TRAINING_PLAN:'ai_training_plan',
  RUN_UNLIMITED:   'run_unlimited',
});

/** Devuelve true si el producto comprado corresponde al plan premium. */
export function isPremiumProduct(productId) {
  return PREMIUM_PRODUCT_IDS.includes(productId);
}

/**
 * Catálogo que se le muestra al usuario en el paywall. Los precios los pone
 * la tienda (StoreKit / Play Billing), acá solo va el contenido de cada plan.
 */
export function planCatalog() {
  const freeLimitKm = FREE_RUN_LIMIT_M / 1000;

  return [
    {
      id: 'free',
      name: 'FitNow',
      tagline: 'El marketplace completo, gratis',
      product_ids: [],
      features: [
        { key: 'marketplace',   label: 'Gimnasios, entrenadores y clubes',        included: true },
        { key: 'enrollments',   label: 'Inscripciones, pagos y check-in',         included: true },
        { key: 'offers',        label: 'Ofertas y promociones',                   included: true },
        { key: 'run_limited',   label: `Running hasta ${freeLimitKm} km por salida`, included: true },
        { key: 'hazards',       label: 'Reporte de zonas peligrosas',             included: true },
        { key: 'gamification',  label: 'XP, logros y ranking',                    included: true },
        { key: 'run_unlimited', label: 'Running sin límite de distancia',         included: false },
        { key: 'ai_coach',      label: 'Coach IA',                                included: false },
      ],
    },
    {
      id: 'premium',
      name: 'FitNow+',
      tagline: 'Coach IA y running sin límites',
      product_ids: PREMIUM_PRODUCT_IDS,
      features: [
        { key: 'marketplace',     label: 'Todo lo del plan gratis',             included: true },
        { key: 'run_unlimited',   label: 'Running sin límite de distancia',     included: true },
        { key: 'ai_coach',        label: 'Coach IA con tu historial',           included: true },
        { key: 'ai_run_analysis', label: 'Análisis de cada corrida con IA',     included: true },
        { key: 'ai_gym_plan',     label: 'Rutinas de gimnasio generadas con IA',included: true },
        { key: 'ai_form_check',   label: 'Corrección de técnica con IA',        included: true },
        { key: 'ai_training_plan',label: 'Planes de entrenamiento a medida',    included: true },
      ],
    },
  ];
}

/** Límites que la app necesita conocer para no ofrecer lo que el backend va a rechazar. */
export function planLimits(plan) {
  return {
    plan,
    run_max_distance_m: plan === 'premium' ? null : FREE_RUN_LIMIT_M,
    ai_enabled: plan === 'premium',
  };
}
