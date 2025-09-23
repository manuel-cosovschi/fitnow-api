// src/app.js
import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth.routes.js';
import activitiesRoutes from './routes/activities.routes.js';
import enrollmentsRoutes from './routes/enrollments.routes.js';
import sessionsRoutes from './routes/sessions.routes.js';
import providersRoutes from './routes/providers.routes.js';
import runRoutes from './routes/run.routes.js';
import hazardsRoutes from './routes/hazards.routes.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/enrollments', enrollmentsRoutes);
app.use('/api', sessionsRoutes);
app.use('/api', providersRoutes);
app.use('/api/run', runRoutes);
app.use('/api/hazards', hazardsRoutes);

export default app;

