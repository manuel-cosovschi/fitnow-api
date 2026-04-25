// src/routes/messages.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as ctrl from '../controllers/messages.controller.js';

const router = Router();

// In-app messages
router.get ('/me/messages',              requireAuth, ctrl.listMessages);
router.post('/me/messages/:id/read',     requireAuth, ctrl.markRead);
router.post('/me/messages/read-all',     requireAuth, ctrl.markAllRead);

// Push tokens
router.post  ('/me/push-token',          requireAuth, ctrl.savePushToken);
router.delete('/me/push-token',          requireAuth, ctrl.deletePushToken);

export default router;
