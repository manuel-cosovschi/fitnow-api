// src/routes/trainingPlan.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { generatePlanSchema } from '../schemas/trainingPlan.schemas.js';
import * as ctrl from '../controllers/trainingPlan.controller.js';

const router = Router();

router.post('/generate',    requireAuth, validateBody(generatePlanSchema), ctrl.generate);
router.get('/',             requireAuth, ctrl.listMyPlans);
router.get('/active',       requireAuth, ctrl.getActivePlan);
router.get('/:id',          requireAuth, ctrl.getPlan);
router.patch('/:id/cancel', requireAuth, ctrl.cancelPlan);

export default router;
