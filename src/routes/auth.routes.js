// src/routes/auth.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as ctrl from '../controllers/auth.controller.js';

const router = Router();

router.post('/register',         ctrl.register);
router.post('/login',            ctrl.login);
router.get ('/me',  requireAuth, ctrl.me);
router.patch('/me', requireAuth, ctrl.updateMe);
router.post('/me/password', requireAuth, ctrl.changePassword);

export default router;
