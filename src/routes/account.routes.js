// src/routes/account.routes.js
// Alias routes for mobile clients that use /api/account instead of /api/auth
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { updateMeSchema } from '../schemas/auth.schemas.js';
import { me, updateMe } from '../controllers/auth.controller.js';

const router = Router();

router.get('/me', requireAuth, me);
router.put('/me', requireAuth, validateBody(updateMeSchema), updateMe);

export default router;
