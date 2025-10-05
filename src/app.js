// src/app.js
import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth.routes.js';
import activitiesRoutes from './routes/activities.routes.js';
import enrollmentsRoutes from './routes/enrollments.routes.js';
import sessionsRoutes from './routes/sessions.routes.js';      // reservas de clases
import providersRoutes from './routes/providers.routes.js';
import runRoutes from './routes/run.routes.js';                 // planner/preview de rutas
import hazardsRoutes from './routes/hazards.routes.js';
import runTelemetryRoutes from './routes/run.telemetry.routes.js'; // <-- NUEVO

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/enrollments', enrollmentsRoutes);
app.use('/api', sessionsRoutes);        // /api/sessions/... (clases)
app.use('/api', providersRoutes);
app.use('/api/run', runRoutes);         // /api/run/routes, /api/run/feedback
app.use('/api/hazards', hazardsRoutes);
app.use('/api/run', runTelemetryRoutes); // /api/run/sessions/start|progress|finish  ✅

export default app;

