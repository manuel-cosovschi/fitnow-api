// src/app.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import logger from './utils/logger.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import authRoutes      from './routes/auth.routes.js';
import activitiesRoutes from './routes/activities.routes.js';
import enrollmentsRoutes from './routes/enrollments.routes.js';
import providersRoutes from './routes/providers.routes.js';
import runRoutes       from './routes/run.routes.js';
import hazardsRoutes   from './routes/hazards.routes.js';
import newsRoutes      from './routes/news.routes.js';
import adminRoutes     from './routes/admin.routes.js';
import accountRoutes   from './routes/account.routes.js';
import filesRoutes     from './routes/files.routes.js';
import sessionsRoutes  from './routes/sessions.routes.js';

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── Response compression ──────────────────────────────────────────────────────
app.use(compression());

// ── HTTP request logging ──────────────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMIT', message: 'Demasiados intentos. Intentá en 15 minutos.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMIT', message: 'Demasiadas solicitudes. Intentá en un momento.' },
});

app.use('/api/', apiLimiter);
app.use('/api/auth', authLimiter);

// ── Body parsing ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/activities',  activitiesRoutes);
app.use('/api/enrollments', enrollmentsRoutes);
app.use('/api/providers',   providersRoutes);
app.use('/api/run',         runRoutes);
app.use('/api/hazards',     hazardsRoutes);
app.use('/api/news',        newsRoutes);
app.use('/api/admin',       adminRoutes);
app.use('/api/account',     accountRoutes);
app.use('/api/files',       filesRoutes);
// Mounted at /api (not a sub-prefix) so it can serve both
// GET  /api/activities/:id/sessions  and
// POST /api/sessions/:sid/book
app.use('/api',             sessionsRoutes);

// ── Global error handler — must be last ────────────────────────────────────────
app.use(errorMiddleware);

export default app;
