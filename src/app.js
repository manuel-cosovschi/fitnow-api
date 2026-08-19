// src/app.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import logger from './utils/logger.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import authRoutes           from './routes/auth.routes.js';
import activitiesRoutes     from './routes/activities.routes.js';
import enrollmentsRoutes    from './routes/enrollments.routes.js';
import providersRoutes      from './routes/providers.routes.js';
import runRoutes            from './routes/run.routes.js';
import hazardsRoutes        from './routes/hazards.routes.js';
import newsRoutes           from './routes/news.routes.js';
import adminRoutes          from './routes/admin.routes.js';
import accountRoutes        from './routes/account.routes.js';
import filesRoutes          from './routes/files.routes.js';
import sessionsRoutes       from './routes/sessions.routes.js';
import offersRoutes         from './routes/offers.routes.js';
import paymentsRoutes       from './routes/payments.routes.js';
import { stripeWebhook }    from './controllers/payments.controller.js';
import messagesRoutes       from './routes/messages.routes.js';
import gymRoutes            from './routes/gym.routes.js';
import trainingPlansRoutes  from './routes/training-plans.routes.js';
import analyticsRoutes      from './routes/analytics.routes.js';
import gamificationRoutes   from './routes/gamification.routes.js';
import aiRoutes             from './routes/ai.routes.js';
import subscriptionsRoutes  from './routes/subscriptions.routes.js';

const app = express();

// ── Trust proxy (Railway / Render / etc. sit behind a load balancer) ──────────
app.set('trust proxy', 1);

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

// Los webhooks de App Store y Google Play llegan en ráfagas desde una sola IP
// (la de Apple / Pub/Sub) y se reintentan si no responden 2xx: si el limitador
// los frena, se pierden renovaciones y reembolsos.
const STORE_WEBHOOK_PATHS = new Set([
  '/api/subscriptions/apple/notifications',
  '/api/subscriptions/google/notifications',
]);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  // originalUrl porque req.path viene recortado del prefijo /api al que se
  // monta este limitador.
  skip: (req) => STORE_WEBHOOK_PATHS.has(req.originalUrl.split('?')[0]),
  message: { code: 'RATE_LIMIT', message: 'Demasiadas solicitudes. Intentá en un momento.' },
});

app.use('/api/', apiLimiter);
app.use('/api/auth', authLimiter);

// ── Stripe webhook — must receive raw body BEFORE express.json() parses it ────
app.post('/api/payments/stripe/webhook',
  express.raw({ type: 'application/json' }),
  stripeWebhook
);

// ── Body parsing ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api/auth',            authRoutes);
app.use('/api/activities',      activitiesRoutes);
app.use('/api/enrollments',     enrollmentsRoutes);
app.use('/api/providers',       providersRoutes);
app.use('/api/run',             runRoutes);
app.use('/api/hazards',         hazardsRoutes);
app.use('/api/news',            newsRoutes);
app.use('/api/admin',           adminRoutes);
app.use('/api/offers',          offersRoutes);
app.use('/api/account',         accountRoutes);
app.use('/api/files',           filesRoutes);
app.use('/api/payments',        paymentsRoutes);
app.use('/api/users',           messagesRoutes);
app.use('/api/gym',             gymRoutes);
app.use('/api/training-plans',  trainingPlansRoutes);
app.use('/api/analytics',       analyticsRoutes);
app.use('/api/gamification',    gamificationRoutes);
app.use('/api/ai',              aiRoutes);
app.use('/api/subscriptions',   subscriptionsRoutes);
// Mounted at /api (not a sub-prefix) so it can serve both
// GET  /api/activities/:id/sessions  and
// POST /api/sessions/:sid/book
app.use('/api',                 sessionsRoutes);

// ── Global error handler — must be last ────────────────────────────────────────
app.use(errorMiddleware);

export default app;
