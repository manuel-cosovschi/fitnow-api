// src/routes/auth.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { registerSchema, loginSchema, updateMeSchema, changePasswordSchema } from '../schemas/auth.schemas.js';
import * as ctrl from '../controllers/auth.controller.js';

const router = Router();

router.post('/register',        validateBody(registerSchema),        ctrl.register);
router.post('/login',           validateBody(loginSchema),           ctrl.login);
router.get ('/me',  requireAuth,                                     ctrl.me);
router.patch('/me', requireAuth, validateBody(updateMeSchema),       ctrl.updateMe);
router.post('/me/password', requireAuth, validateBody(changePasswordSchema), ctrl.changePassword);

export default router;
