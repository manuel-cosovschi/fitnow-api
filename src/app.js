// src/app.js
import express from 'express';
import cors from 'cors';
import { errorMiddleware } from './middleware/error.middleware.js';
import authRoutes      from './routes/auth.routes.js';
import activitiesRoutes from './routes/activities.routes.js';
import enrollmentsRoutes from './routes/enrollments.routes.js';
import providersRoutes from './routes/providers.routes.js';
import runRoutes       from './routes/run.routes.js';
import hazardsRoutes   from './routes/hazards.routes.js';
import newsRoutes      from './routes/news.routes.js';
import adminRoutes     from './routes/admin.routes.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' })); // allow batch telemetry payloads

app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.use('/api/auth',        authRoutes);
app.use('/api/activities',  activitiesRoutes);
app.use('/api/enrollments', enrollmentsRoutes);
app.use('/api/providers',   providersRoutes);
app.use('/api/run',         runRoutes);
app.use('/api/hazards',     hazardsRoutes);
app.use('/api/news',        newsRoutes);
app.use('/api/admin',       adminRoutes);

// Global error handler — must be last
app.use(errorMiddleware);

export default app;
