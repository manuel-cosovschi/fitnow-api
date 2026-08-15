// src/routes/ai.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePremium } from '../middleware/entitlements.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { aiLimiter, aiHeavyLimiter } from '../middleware/aiRateLimit.js';
import { PREMIUM_FEATURES } from '../config/plans.js';
import {
  coachRequestSchema,
  coachHistoryQuerySchema,
  formCheckSubmitSchema,
  formCheckListQuerySchema,
  runAnalysisRequestSchema,
} from '../schemas/ai.schemas.js';
import * as ctrl from '../controllers/ai.controller.js';

const router = Router();

// Toda la IA es parte de FitNow+. Los GET de historial quedan abiertos a
// cualquier usuario autenticado: si alguien deja de pagar sigue viendo lo que
// ya había generado, solo no puede pedir cosas nuevas.

// Streaming coach — rate-limited, validated, persisted.
router.post('/coach',
  requireAuth,
  requirePremium(PREMIUM_FEATURES.AI_COACH, 'El Coach IA es parte de FitNow+.'),
  aiLimiter,
  validateBody(coachRequestSchema),
  ctrl.coach,
);

// Conversation history — paginated.
router.get('/coach/history',
  requireAuth,
  validateQuery(coachHistoryQuerySchema),
  ctrl.coachHistory,
);

// Form check persistence (Vision pipeline runs on-device; this just records results).
router.post('/form-check',
  requireAuth,
  requirePremium(PREMIUM_FEATURES.AI_FORM_CHECK, 'La corrección de técnica es parte de FitNow+.'),
  validateBody(formCheckSubmitSchema),
  ctrl.formCheckCreate,
);

router.get('/form-check/mine',
  requireAuth,
  validateQuery(formCheckListQuerySchema),
  ctrl.formCheckList,
);

// Post-run analysis — grounded on the real session, LLM output validated.
// Heavy limiter: each call can hit OpenAI.
router.post('/run-analysis',
  requireAuth,
  requirePremium(PREMIUM_FEATURES.AI_RUN_ANALYSIS, 'El análisis de corridas con IA es parte de FitNow+.'),
  aiHeavyLimiter,
  validateBody(runAnalysisRequestSchema),
  ctrl.runAnalysis,
);

export default router;
