// src/routes/news.routes.js
import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, icon, title, subtitle, color
      FROM news
      ORDER BY id DESC
      LIMIT 50
    `);
    res.json(rows);
  } catch (e) {
    console.error('news list error', e);
    res.status(500).json({ error: 'news_list_failed' });
  }
});

export default router;