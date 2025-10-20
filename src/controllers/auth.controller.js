import { pool } from '../db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const SALT_ROUNDS = 10;

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role || 'user',
    phone: u.phone || null,
    units: u.units || null,
    language: u.language || null,
    photo_url: u.photo_url || null,
    created_at: u.created_at,
    updated_at: u.updated_at
  };
}

function signToken(u) {
  const secret = process.env.JWT_SECRET || 'dev_secret_change_me';
  return jwt.sign(
    { id: u.id, email: u.email, name: u.name, role: u.role || 'user' },
    secret,
    { expiresIn: '30d' }
  );
}

// =============== helpers de acceso ===================

async function getUserByEmail(email) {
  const [rows] = await pool.query(
    `SELECT * FROM users WHERE email = ? LIMIT 1`, [email]
  );
  return rows[0] || null;
}
async function getUserById(id) {
  const [rows] = await pool.query(
    `SELECT * FROM users WHERE id = ? LIMIT 1`, [id]
  );
  return rows[0] || null;
}

// ================ ENDPOINTS ==========================

// POST /api/auth/register
export async function register(req, res) {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password too short (min 6)' });
    }
    const exists = await getUserByEmail(email);
    if (exists) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const [result] = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES (?, ?, ?, 'user')`,
      [name, email, hash]
    );

    const user = await getUserById(result.insertId);
    const token = signToken(user);
    return res.status(201).json({ user: publicUser(user), token });
  } catch (err) {
    console.error('register error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// POST /api/auth/login
export async function login(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    const u = await getUserByEmail(email);
    if (!u) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(u);
    return res.json({ user: publicUser(u), token });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// GET /api/me  (requireAuth)
export async function me(req, res) {
  try {
    const u = await getUserById(req.user.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    return res.json(publicUser(u));
  } catch (err) {
    console.error('me error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// PUT /api/me  (requireAuth)
export async function updateMe(req, res) {
  try {
    const allowed = ['name','phone','units','language','photo_url','email'];
    const payload = {};
    for (const k of allowed) {
      if (k in (req.body || {})) payload[k] = req.body[k];
    }
    if (Object.keys(payload).length === 0) {
      const u = await getUserById(req.user.id);
      return res.json(publicUser(u));
    }

    // validaciones simples (opcional)
    if (payload.email) {
      const other = await getUserByEmail(payload.email);
      if (other && other.id !== req.user.id) {
        return res.status(409).json({ error: 'Email already in use' });
      }
    }

    const fields = Object.keys(payload).map(k => `${k} = ?`).join(', ');
    const values = Object.values(payload);
    await pool.query(
      `UPDATE users SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...values, req.user.id]
    );

    const u = await getUserById(req.user.id);
    return res.json(publicUser(u));
  } catch (err) {
    console.error('updateMe error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// POST /api/auth/change-password  (requireAuth)
export async function changePassword(req, res) {
  try {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
      return res.status(400).json({ ok: false, error: 'Missing fields' });
    }
    if (String(new_password).length < 6) {
      return res.status(400).json({ ok: false, error: 'Password too short (min 6)' });
    }
    const u = await getUserById(req.user.id);
    if (!u) return res.status(404).json({ ok: false, error: 'User not found' });

    const ok = await bcrypt.compare(current_password, u.password_hash);
    if (!ok) return res.status(401).json({ ok: false, error: 'Incorrect password' });

    const newHash = await bcrypt.hash(new_password, SALT_ROUNDS);
    await pool.query(
      `UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newHash, req.user.id]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('changePassword error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
