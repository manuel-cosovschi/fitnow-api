// src/routes/ai.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/aiRateLimit.js';
import {
  coachRequestSchema,
  coachHistoryQuerySchema,
  formCheckSubmitSchema,
  formCheckListQuerySchema,
} from '../schemas/ai.schemas.js';
import * as ctrl from '../controllers/ai.controller.js';

const router = Router();

// Streaming coach — rate-limited, validated, persisted.
router.post('/coach',
  requireAuth,
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
  validateBody(formCheckSubmitSchema),
  ctrl.formCheckCreate,
);

router.get('/form-check/mine',
  requireAuth,
  validateQuery(formCheckListQuerySchema),
  ctrl.formCheckList,
);

export default router;
