import { Router } from 'express';
import { createEnrollment, listMyEnrollments, cancelEnrollment } from '../controllers/enrollments.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/', authMiddleware, createEnrollment);
router.get('/mine', authMiddleware, listMyEnrollments);
router.delete('/:id', authMiddleware, cancelEnrollment); // <— nuevo

export default router;


