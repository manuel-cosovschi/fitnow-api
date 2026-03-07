/**
 * demo.js — Servidor de demostración FitNow
 * Usa storage en memoria puro (sin MySQL ni SQLite).
 * Arranca con: node demo.js
 */

import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = 'demo_secret_fitnow';
const PORT = 3000;

// ─── Store en memoria ─────────────────────────────────────────────────────────
let nextId = { users: 10, activities: 10, enrollments: 10, routes: 10, hazards: 10 };
function uid(table) { return nextId[table]++; }

const store = {
  users: [],
  activities: [],
  enrollments: [],
  routes: [],
  hazards: [],
};

// ─── Seed ─────────────────────────────────────────────────────────────────────
async function seed() {
  const hash = await bcrypt.hash('demo1234', 10);
  store.users.push({ id: uid('users'), name: 'Demo Admin', email: 'demo@fitnow.com', password_hash: hash, role: 'admin', provider: 'email', created_at: new Date().toISOString() });

  const now = Date.now();
  const acts = [
    ['CrossFit Matutino',     'Entreno funcional de alta intensidad con pesas y movimientos olímpicos.', 'gimnasio', 'alta',  'Box CrossFit Palermo, CABA',       3500, 20, 16],
    ['Yoga al Aire Libre',    'Sesión de yoga relajante en el parque. Todos los niveles bienvenidos.',   'outdoor',  'baja',  'Parque Rivadavia, CABA',           800,  15, 12],
    ['Ciclismo Grupal',       'Salida en bicicleta por los senderos de la costanera. 25 km aprox.',      'outdoor',  'media', 'Costanera Norte, CABA',            0,    25, 20],
    ['Pilates Terapéutico',   'Clase de pilates con énfasis en la postura y el core.',                   'clase',    'baja',  'Studio Fit, Belgrano',             2200, 10,  8],
    ['Torneo de Pádel',       'Torneo amateur mixto, dobles. 4 canchas disponibles.',                    'torneo',   'media', 'Club Náutico, San Isidro',         5000, 16, 10],
    ['Natación Adultos',      'Técnica y resistencia para nadadores intermedios y avanzados.',            'clase',    'media', 'Club Atlético, Caballito',         1800, 12,  9],
  ];
  for (const [title, description, modality, difficulty, location, price, capacity, seats_left] of acts) {
    const date_start = new Date(now + Math.random() * 7 * 86400000).toISOString();
    const date_end   = new Date(new Date(date_start).getTime() + 90 * 60000).toISOString();
    store.activities.push({ id: uid('activities'), title, description, modality, difficulty, location, price, date_start, date_end, capacity, seats_left, created_at: new Date().toISOString() });
  }

  const routes = [
    ['Parque Tres de Febrero', 'Buenos Aires', 5200, 1560, 18, -34.5756, -58.4170],
    ['Costanera Sur',          'Buenos Aires', 8100, 2340,  5, -34.6142, -58.3572],
    ['Reserva Ecológica',      'Buenos Aires', 6300, 1890, 12, -34.6189, -58.3522],
    ['Palermo Chico Loop',     'Buenos Aires', 3800, 1140,  8, -34.5733, -58.4033],
  ];
  for (const [title, city, distance_m, duration_s, elevation_up_m, center_lat, center_lng] of routes) {
    store.routes.push({ id: uid('routes'), title, city, distance_m, duration_s, elevation_up_m, center_lat, center_lng, created_at: new Date().toISOString() });
  }
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────
function signToken(u) {
  return jwt.sign({ id: u.id, email: u.email, name: u.name, role: u.role }, JWT_SECRET, { expiresIn: '30d' });
}
function requireAuth(req, res, next) {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'Invalid token' }); }
}
function pub(u) { return { id: u.id, name: u.name, email: u.email, role: u.role }; }

// ─── App ──────────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', mode: 'demo-memory' }));

// ── Auth ──────────────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  if (password.length < 6) return res.status(400).json({ error: 'Password too short (min 6)' });
  if (store.users.find(u => u.email === email)) return res.status(409).json({ error: 'Email already registered' });
  const u = { id: uid('users'), name, email, password_hash: await bcrypt.hash(password, 10), role: 'user', provider: 'email', created_at: new Date().toISOString() };
  store.users.push(u);
  return res.status(201).json({ user: pub(u), token: signToken(u) });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  const u = store.users.find(u => u.email === email);
  if (!u || !(await bcrypt.compare(password, u.password_hash))) return res.status(401).json({ error: 'Invalid credentials' });
  return res.json({ user: pub(u), token: signToken(u) });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const u = store.users.find(u => u.id === req.user.id);
  if (!u) return res.status(404).json({ error: 'Not found' });
  return res.json(pub(u));
});

// ── Activities ────────────────────────────────────────────────────────────────
app.get('/api/activities', (_req, res) =>
  res.json({ items: [...store.activities].sort((a, b) => a.date_start.localeCompare(b.date_start)) })
);
app.get('/api/activities/:id', (req, res) => {
  const a = store.activities.find(a => a.id === Number(req.params.id));
  return a ? res.json(a) : res.status(404).json({ error: 'Not found' });
});

// ── Enrollments ───────────────────────────────────────────────────────────────
app.post('/api/enrollments', requireAuth, (req, res) => {
  const { activity_id } = req.body || {};
  const a = store.activities.find(a => a.id === Number(activity_id));
  if (!a) return res.status(404).json({ error: 'Activity not found' });
  if (a.seats_left <= 0) return res.status(409).json({ error: 'No seats left' });
  if (store.enrollments.find(e => e.user_id === req.user.id && e.activity_id === a.id))
    return res.status(409).json({ error: 'Already enrolled' });
  const e = { id: uid('enrollments'), user_id: req.user.id, activity_id: a.id, created_at: new Date().toISOString() };
  store.enrollments.push(e);
  a.seats_left--;
  return res.status(201).json({ status: 'ok' });
});

app.get('/api/enrollments/mine', requireAuth, (req, res) => {
  const items = store.enrollments
    .filter(e => e.user_id === req.user.id)
    .map(e => {
      const a = store.activities.find(a => a.id === e.activity_id) || {};
      return { id: e.id, activity_id: a.id, created_at: e.created_at, title: a.title, modality: a.modality, difficulty: a.difficulty, location: a.location, date_start: a.date_start, price: a.price };
    })
    .reverse();
  return res.json({ items });
});

app.delete('/api/enrollments/:id', requireAuth, (req, res) => {
  const idx = store.enrollments.findIndex(e => e.id === Number(req.params.id) && e.user_id === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const [e] = store.enrollments.splice(idx, 1);
  const a = store.activities.find(a => a.id === e.activity_id);
  if (a) a.seats_left++;
  return res.json({ status: 'ok' });
});

// ── Run routes ────────────────────────────────────────────────────────────────
app.get('/api/run/routes', requireAuth, (_req, res) =>
  res.json({ items: [...store.routes].reverse() })
);

// ── Hazards ───────────────────────────────────────────────────────────────────
app.post('/api/hazards', requireAuth, (req, res) => {
  const { lat, lng, type, note = null, severity = 1 } = req.body || {};
  if (!lat || !lng || !type) return res.status(400).json({ error: 'lat, lng y type requeridos' });
  const h = { id: uid('hazards'), user_id: req.user.id, lat, lng, type, note, severity: Math.min(Math.max(Number(severity), 1), 3), votes: 1, created_at: new Date().toISOString() };
  store.hazards.push(h);
  return res.status(201).json({ id: h.id });
});

app.get('/api/hazards/near', requireAuth, (_req, res) =>
  res.json({ items: [...store.hazards].reverse().slice(0, 100) })
);

// ── Stats ─────────────────────────────────────────────────────────────────────
app.get('/api/stats', requireAuth, (req, res) => res.json({
  totalActivities: store.activities.length,
  myEnrollments:   store.enrollments.filter(e => e.user_id === req.user.id).length,
  totalRoutes:     store.routes.length,
  totalHazards:    store.hazards.length,
}));

// ─── Start ────────────────────────────────────────────────────────────────────
await seed();
app.listen(PORT, () => {
  console.log(`\n🏋️  FitNow Demo corriendo en http://localhost:${PORT}`);
  console.log(`   Usuario demo: demo@fitnow.com / demo1234\n`);
});
