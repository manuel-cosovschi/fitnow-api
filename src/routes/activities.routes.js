import { Router } from 'express';
import { listActivities, getActivityById } from '../controllers/activities.controller.js';

const router = Router();

// GET /api/activities
router.get('/', listActivities);

// GET /api/activities/:id
router.get('/:id', getActivityById);

export default router;
