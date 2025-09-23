// src/controllers/activities.controller.js
import pool from '../db.js';

export async function listActivities(req, res) {
  try {
    let limit  = parseInt(req.query.limit  ?? '50', 10);
    let offset = parseInt(req.query.offset ?? '0', 10);
    if (!Number.isFinite(limit)  || limit <= 0 || limit > 100) limit = 50;
    if (!Number.isFinite(offset) || offset < 0)                offset = 0;

    const {
      q, difficulty, modality, min_price, max_price,
      provider_id, kind, sport_id, include_sports
    } = req.query;

    const showSports = include_sports === '1' || kind === 'club_sport';

    let sql = `
      SELECT a.id, a.title, a.description, a.modality, a.difficulty, a.location, a.price,
             a.date_start, a.date_end, a.capacity, a.seats_left,
             a.kind, a.provider_id, p.name AS provider_name,
             a.sport_id, s.name AS sport_name
      FROM activities a
      LEFT JOIN providers p ON p.id = a.provider_id
      LEFT JOIN sports    s ON s.id = a.sport_id
      WHERE 1=1`;
    const params = [];

    if (!showSports) {
      // Por defecto ocultamos las actividades de deporte del club
      sql += ` AND (a.kind IS NULL OR a.kind <> 'club_sport')`;
    }

    if (q && q.trim()) {
      sql += ' AND (a.title LIKE ? OR a.description LIKE ? OR a.location LIKE ?)';
      const like = `%${q.trim()}%`;
      params.push(like, like, like);
    }
    if (difficulty && difficulty.trim()) { sql += ' AND a.difficulty = ?'; params.push(difficulty.trim()); }
    if (modality   && modality.trim())   { sql += ' AND a.modality   = ?'; params.push(modality.trim());   }
    if (min_price && !Number.isNaN(Number(min_price))) { sql += ' AND a.price >= ?'; params.push(Number(min_price)); }
    if (max_price && !Number.isNaN(Number(max_price))) { sql += ' AND a.price <= ?'; params.push(Number(max_price)); }
    if (provider_id && Number.isFinite(+provider_id))  { sql += ' AND a.provider_id = ?'; params.push(+provider_id); }
    if (sport_id && Number.isFinite(+sport_id))        { sql += ' AND a.sport_id    = ?'; params.push(+sport_id);    }
    if (kind && kind.trim())                           { sql += ' AND a.kind        = ?'; params.push(kind.trim());  }

    sql += ` ORDER BY a.date_start ASC LIMIT ${limit} OFFSET ${offset}`;
    const [rows] = await pool.query(sql, params);
    return res.json({ items: rows, limit, offset });
  } catch (e) {
    console.error('listActivities error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

export async function getActivityById(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT a.*,
              JSON_OBJECT(
                'id', p.id, 'name', p.name, 'kind', p.kind,
                'address', p.address, 'city', p.city, 'lat', p.lat, 'lng', p.lng
              ) AS provider,
              JSON_OBJECT('id', s.id, 'name', s.name) AS sport
       FROM activities a
       LEFT JOIN providers p ON p.id = a.provider_id
       LEFT JOIN sports    s ON s.id = a.sport_id
       WHERE a.id = ?`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    const row = rows[0];
    let provider = null, sport = null;
    try { provider = row.provider ? JSON.parse(row.provider) : null; } catch {}
    try { sport    = row.sport    ? JSON.parse(row.sport)    : null; } catch {}
    delete row.provider; delete row.sport;

    if (row.rules && typeof row.rules === 'string') {
      try { row.rules = JSON.parse(row.rules); } catch {}
    }

    return res.json({ activity: row, provider, sport });
  } catch (e) {
    console.error('getActivityById error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}







