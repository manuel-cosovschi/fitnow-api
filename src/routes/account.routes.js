import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { me, updateMe } from '../controllers/auth.controller.js';

const router = Router();

router.get('/me', requireAuth, me);
router.put('/me', requireAuth, updateMe);

export default router;