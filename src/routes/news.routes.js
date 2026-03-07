// src/routes/news.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.middleware.js';
import * as ctrl from '../controllers/admin.controller.js';

const router = Router();

router.get('/', ctrl.getNews);

export default router;
