// src/routes/ai.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as ctrl from '../controllers/ai.controller.js';

const router = Router();

router.post('/coach', requireAuth, ctrl.coach);

export default router;
