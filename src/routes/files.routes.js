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

// Multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext    = (path.extname(file.originalname) || '.jpg').toLowerCase();
    const userId = req.user?.id ?? 'anon';
    cb(null, `user_${userId}_${Date.now()}${ext}`);
  }
});

const upload = multer({ storage });

// POST /api/files/photo  (campo: "photo")
router.post('/photo', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });

    // Construye URL absoluta accesible desde iOS
    const base = process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
    const url  = `${base}/uploads/${req.file.filename}`;

    // (Opcional) guardar en DB
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