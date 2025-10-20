// src/routes/auth.routes.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import appleSignin from 'apple-signin-auth';
import { OAuth2Client } from 'google-auth-library';

const router = Router();

/* ===================== Helpers ===================== */
function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role || 'user' };
}
function signToken(u) {
  const secret = process.env.JWT_SECRET || 'dev_secret_change_me';
  return jwt.sign(
    { id: u.id, email: u.email, name: u.name, role: u.role || 'user' },
    secret,
    { expiresIn: '30d' }
  );
}

/* ================ EMAIL / PASSWORD ================= */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password too short (min 6)' });
    }

    const [dup] = await pool.query('SELECT id FROM users WHERE email=? LIMIT 1', [email]);
    if (dup.length) return res.status(409).json({ error: 'Email already registered' });

    const password_hash = await bcrypt.hash(password, 10);
    const [ins] = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, provider, created_at, updated_at)
       VALUES (?, ?, ?, 'user', 'email', NOW(), NOW())`,
      [name, email, password_hash]
    );

    const [rows] = await pool.query(
      'SELECT id, name, email, role FROM users WHERE id=?',
      [ins.insertId]
    );
    const u = rows[0];
    const token = signToken(u);
    return res.status(201).json({ user: publicUser(u), token });
  } catch (err) {
    console.error('register error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });

    const [rows] = await pool.query(
      'SELECT id, name, email, role, password_hash FROM users WHERE email=? LIMIT 1',
      [email]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash || '');
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(u);
    return res.json({ user: publicUser(u), token });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/* ======================== /me ====================== */
router.get('/me', requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, name, email, role, phone, units, language, photo_url
       FROM users WHERE id=? LIMIT 1`,
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  return res.json(rows[0]); // iOS decodifica UserProfile directo
});

router.put('/me', requireAuth, async (req, res) => {
  try {
    const { name, email, phone, units, language } = req.body || {};
    if (!name || !email) return res.status(400).json({ error: 'Missing name or email' });

    await pool.query(
      `UPDATE users
         SET name=?, email=?, phone=?, units=?, language=?, updated_at=NOW()
       WHERE id=?`,
      [name, email, phone ?? null, units ?? null, language ?? null, req.user.id]
    );

    const [rows] = await pool.query(
      `SELECT id, name, email, role, phone, units, language, photo_url
         FROM users WHERE id=? LIMIT 1`,
      [req.user.id]
    );
    return res.json(rows[0]);
  } catch (err) {
    console.error('update /me error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    if (String(new_password).length < 6) {
      return res.status(400).json({ error: 'Password too short (min 6)' });
    }

    const [rows] = await pool.query(
      'SELECT id, password_hash FROM users WHERE id=? LIMIT 1',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const u = rows[0];
    const ok = await bcrypt.compare(current_password, u.password_hash || '');
    if (!ok) return res.status(401).json({ error: 'Incorrect password' });

    const newHash = await bcrypt.hash(new_password, 10);
    await pool.query(
      'UPDATE users SET password_hash=?, updated_at=NOW() WHERE id=?',
      [newHash, req.user.id]
    );
    return res.sendStatus(204);
  } catch (err) {
    console.error('change-password error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/* ================== Apple Sign In ================== */
router.post('/apple', async (req, res) => {
  try {
    const { id_token, email, name } = req.body || {};
    if (!id_token) return res.status(400).json({ error: 'Missing id_token' });

    const payload = await appleSignin.verifyIdToken(id_token, {
      audience: process.env.APPLE_SERVICE_ID,
      ignoreExpiration: false,
    });

    const sub = payload.sub;
    const mail = email ?? payload.email ?? null;
    const displayName = name ?? 'Usuario';

    const [rows] = await pool.query(
      'SELECT id, name, email, role FROM users WHERE provider="apple" AND apple_sub=? LIMIT 1',
      [sub]
    );
    let userRow;
    if (rows.length) userRow = rows[0];
    else {
      const [ins] = await pool.query(
        `INSERT INTO users (name, email, role, provider, apple_sub, created_at, updated_at)
         VALUES (?, ?, 'user', 'apple', ?, NOW(), NOW())`,
        [displayName, mail, sub]
      );
      const [sel] = await pool.query(
        'SELECT id, name, email, role FROM users WHERE id=?',
        [ins.insertId]
      );
      userRow = sel[0];
    }

    const token = signToken(userRow);
    return res.json({ user: publicUser(userRow), token });
  } catch (err) {
    console.error('apple sign-in error', err);
    return res.status(401).json({ error: 'Invalid Apple token' });
  }
});

/* =============== Google Sign-In (id_token nativo iOS) =============== */
const gClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Verificación robusta del id_token
async function verifyGoogleIdToken(idToken) {
  // 1) Intento con google-auth-library
  try {
    const ticket = await gClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (payload?.aud !== process.env.GOOGLE_CLIENT_ID) {
      throw new Error('aud mismatch');
    }
    return payload;
  } catch (_) {
    // 2) Fallback al endpoint oficial
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('tokeninfo 401');
    const payload = await r.json();
    if (payload.aud !== process.env.GOOGLE_CLIENT_ID) {
      throw new Error('aud mismatch (tokeninfo)');
    }
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      aud: payload.aud,
    };
  }
}

router.post('/google', async (req, res) => {
  try {
    const { id_token } = req.body || {};
    if (!id_token) return res.status(400).json({ error: 'Missing id_token' });

    const payload = await verifyGoogleIdToken(id_token);
    const sub = payload.sub;
    const mail = payload.email ?? null;
    const displayName = payload.name || 'Usuario Google';

    const [rows] = await pool.query(
      'SELECT id, name, email, role FROM users WHERE provider="google" AND google_sub=? LIMIT 1',
      [sub]
    );

    let userRow;
    if (rows.length) {
      userRow = rows[0];
    } else {
      const [ins] = await pool.query(
        `INSERT INTO users (name, email, role, provider, google_sub, created_at, updated_at)
         VALUES (?, ?, 'user', 'google', ?, NOW(), NOW())`,
        [displayName, mail, sub]
      );
      const [sel] = await pool.query(
        'SELECT id, name, email, role FROM users WHERE id=?',
        [ins.insertId]
      );
      userRow = sel[0];
    }

    const token = signToken(userRow);
    return res.json({ user: publicUser(userRow), token });
  } catch (err) {
    console.error('google sign-in error:', err);
    return res.status(401).json({ error: 'Invalid Google token' });
  }
});

/* ======== Google Web Fallback (OAuth + deep link, OPCIONAL) ======== */
/*
   Se habilita solo si configurás GOOGLE_CLIENT_SECRET y GOOGLE_REDIRECT_URI.
   Para iOS con SDK nativo NO es necesario.
*/
const hasWebFallback =
  Boolean(process.env.GOOGLE_CLIENT_SECRET) &&
  Boolean(process.env.GOOGLE_REDIRECT_URI);

let webOauth2Client = null;
if (hasWebFallback) {
  webOauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// 1) Redirige al consentimiento (si está habilitado)
router.get('/google/web-login', (_req, res) => {
  if (!hasWebFallback || !webOauth2Client) {
    return res.status(501).send('Google web OAuth no está habilitado en este servidor.');
  }
  const url = webOauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['openid', 'email', 'profile'],
  });
  return res.redirect(url);
});

// 2) Callback -> emite tu JWT -> deep link a la app (si está habilitado)
router.get('/google/callback', async (req, res) => {
  if (!hasWebFallback || !webOauth2Client) {
    return res.status(501).send('Google web OAuth no está habilitado en este servidor.');
  }
  try {
    const { code } = req.query;
    const { tokens } = await webOauth2Client.getToken(code);
    webOauth2Client.setCredentials(tokens);

    const ticket = await webOauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const sub = payload.sub;
    const mail = payload.email;
    const displayName = payload.name || 'Usuario Google';

    const [rows] = await pool.query(
      'SELECT id, name, email, role FROM users WHERE provider="google" AND google_sub=? LIMIT 1',
      [sub]
    );
    let userRow;
    if (rows.length) userRow = rows[0];
    else {
      const [ins] = await pool.query(
        `INSERT INTO users (name, email, role, provider, google_sub, created_at, updated_at)
         VALUES (?, ?, 'user', 'google', ?, NOW(), NOW())`,
        [displayName, mail, sub]
      );
      const [sel] = await pool.query(
        'SELECT id, name, email, role FROM users WHERE id=?',
        [ins.insertId]
      );
      userRow = sel[0];
    }

    const token = signToken(userRow);
    const deepLink = `fitnow://auth/callback?jwt=${token}`;
    return res.redirect(deepLink);
  } catch (err) {
    console.error('google callback error', err);
    return res.status(500).send('Error autenticando con Google.');
  }
});

/* =============== Refresh de JWT (opcional) =============== */
router.post('/refresh', (req, res) => {
  try {
    const header = req.headers['authorization'] || '';
    const token = header.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Missing token' });

    const payload = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
    delete payload.iat; delete payload.exp;

    const newToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token: newToken });
  } catch (_) {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

router.post('/forgot', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Missing email' });
  console.log('FORGOT REQUEST for:', email);
  // Aquí luego: nodemailer o SendGrid. Por ahora solo 204.
  return res.sendStatus(204);
});

export default router;
