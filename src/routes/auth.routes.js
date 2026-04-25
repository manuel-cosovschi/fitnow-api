// src/routes/auth.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  registerSchema,
  loginSchema,
  updateMeSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  registerProviderSchema,
} from '../schemas/auth.schemas.js';
import * as ctrl from '../controllers/auth.controller.js';

const router = Router();

router.post('/register',           validateBody(registerSchema),          ctrl.register);
router.post('/register-provider',  validateBody(registerProviderSchema),  ctrl.registerProvider);
router.post('/login',              validateBody(loginSchema),             ctrl.login);
router.get ('/me',  requireAuth,                                          ctrl.me);
router.patch('/me', requireAuth,   validateBody(updateMeSchema),          ctrl.updateMe);
router.post('/me/password', requireAuth, validateBody(changePasswordSchema), ctrl.changePassword);

// Password reset (public — no auth required)
router.post('/forgot-password',    validateBody(forgotPasswordSchema),  ctrl.forgotPassword);
router.post('/reset-password',     validateBody(resetPasswordSchema),   ctrl.resetPassword);

// Token refresh
router.post('/refresh',            ctrl.refresh);

// Email / magic-link / 2FA / Apple
router.post('/verify-email',       ctrl.verifyEmail);
router.post('/magic-link',         ctrl.magicLink);
router.post('/2fa/verify',         ctrl.verify2fa);
router.post('/apple',              ctrl.appleSignIn);

export default router;
