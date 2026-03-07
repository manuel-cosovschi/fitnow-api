// src/routes/files.routes.js
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { requireAuth } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = Router();

// __dirname en ESM y carpeta uploads en la raíz del proyecto
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const uploadDir  = path.join(__dirname, '..', '..', 'uploads');

fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// Multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext    = (path.extname(file.originalname) || '.jpg').toLowerCase();
    const userId = req.user?.id ?? 'anon';
    cb(null, `user_${userId}_${Date.now()}${ext}`);
  }
});

function fileFilter(_req, file, cb) {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(Object.assign(new Error('Tipo de archivo no permitido. Se aceptan: jpg, png, gif, webp.'), { status: 400 }));
  }
}

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_SIZE } });

// POST /api/files/photo  (campo: "photo")
router.post('/photo', requireAuth, (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'El archivo supera el límite de 5 MB.' });
      }
      return res.status(err.status ?? 400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });

    // Construye URL absoluta accesible desde iOS
    const base = process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
    const url  = `${base}/uploads/${req.file.filename}`;

    await pool.query(
      'UPDATE users SET photo_url=?, updated_at=NOW() WHERE id=?',
      [url, req.user.id]
    );

    return res.json({ url });
  } catch (e) {
    console.error('upload photo error:', e);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

export default router;