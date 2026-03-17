// src/repositories/activity.repository.js
import { query, queryOne } from '../db.js';

export async function findMany({ where = [], params = [], orderBy = 'a.date_start ASC', limit = 20, offset = 0 } = {}) {
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await query(
    `SELECT a.id, a.title, a.description, a.modality, a.difficulty, a.kind, a.status,
            a.location, a.lat, a.lng, a.price, a.capacity, a.seats_left,
            a.date_start, a.date_end, a.created_at,
            a.enable_running, a.enable_deposit, a.deposit_percent, a.has_capacity_limit, a.enable_files,
            p.id AS provider_id, p.name AS provider_name, p.logo_url AS provider_logo,
            s.id AS sport_id, s.name AS sport_name
     FROM activities a
     LEFT JOIN providers p ON p.id = a.provider_id
     LEFT JOIN sports    s ON s.id = a.sport_id
     ${whereClause}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return rows;
}

export async function countMany({ where = [], params = [] } = {}) {
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const row = await queryOne(`SELECT COUNT(*) AS total FROM activities a ${whereClause}`, params);
  return row?.total ?? 0;
}

export async function findById(id) {
  const rows = await query(
    `SELECT a.*,
            p.id AS _pid, p.name AS _pname, p.kind AS _pkind,
            p.address AS _paddress, p.city AS _pcity, p.lat AS _plat, p.lng AS _plng,
            s.id AS _sid, s.name AS _sname
     FROM activities a
     LEFT JOIN providers p ON p.id = a.provider_id
     LEFT JOIN sports    s ON s.id = a.sport_id
     WHERE a.id = ?`,
    [id]
  );
  if (!rows.length) return null;
  const r = rows[0];
  const activity = { ...r };
  // Extraer provider y sport anidados
  activity.provider = r._pid ? { id: r._pid, name: r._pname, kind: r._pkind, address: r._paddress, city: r._pcity, lat: r._plat, lng: r._plng } : null;
  activity.sport    = r._sid ? { id: r._sid, name: r._sname } : null;
  // Limpiar columnas temporales
  for (const k of Object.keys(activity)) { if (k.startsWith('_')) delete activity[k]; }
  if (activity.rules && typeof activity.rules === 'string') {
    try { activity.rules = JSON.parse(activity.rules); } catch { /* keep as string */ }
  }
  return activity;
}

export async function findByIdForUpdate(conn, id) {
  const [[row]] = await conn.query(`SELECT * FROM activities WHERE id = ? FOR UPDATE`, [id]);
  return row ?? null;
}

export async function create(fields) {
  const { title, description, modality, difficulty, kind = 'gym', status = 'active',
          location, lat, lng, price, capacity, date_start, date_end, rules,
          provider_id, sport_id,
          enable_running = false, enable_deposit = false, deposit_percent = 50,
          has_capacity_limit = false, enable_files = false } = fields;
  const result = await query(
    `INSERT INTO activities
       (title, description, modality, difficulty, kind, status, location, lat, lng,
        price, capacity, seats_left, date_start, date_end, rules, provider_id, sport_id,
        enable_running, enable_deposit, deposit_percent, has_capacity_limit, enable_files)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [title, description ?? null, modality, difficulty, kind, status,
     location ?? null, lat ?? null, lng ?? null,
     price ?? 0, capacity ?? 20, capacity ?? 20,
     date_start ?? null, date_end ?? null,
     rules ? JSON.stringify(rules) : null,
     provider_id ?? null, sport_id ?? null,
     enable_running, enable_deposit, deposit_percent, has_capacity_limit, enable_files]
  );
  return findById(result.insertId);
}

export async function update(id, fields) {
  const allowed = ['title','description','modality','difficulty','kind','status',
                   'location','lat','lng','price','capacity','date_start','date_end','rules'];
  const payload = Object.fromEntries(Object.entries(fields).filter(([k]) => allowed.includes(k)));
  if (!Object.keys(payload).length) return findById(id);
  if (payload.rules) payload.rules = JSON.stringify(payload.rules);
  const sets = Object.keys(payload).map((k) => `${k} = ?`).join(', ');
  await query(`UPDATE activities SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...Object.values(payload), id]);
  return findById(id);
}

export async function updateSettings(id, fields) {
  const allowed = ['enable_running','enable_deposit','deposit_percent','has_capacity_limit','enable_files'];
  const payload = Object.fromEntries(Object.entries(fields).filter(([k]) => allowed.includes(k)));
  if (!Object.keys(payload).length) return findById(id);
  const sets = Object.keys(payload).map((k) => `${k} = ?`).join(', ');
  await query(`UPDATE activities SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...Object.values(payload), id]);
  return findById(id);
}

export async function decrementSeats(conn, id) {
  await conn.query(`UPDATE activities SET seats_left = seats_left - 1 WHERE id = ? AND seats_left > 0`, [id]);
}

export async function incrementSeats(conn, id) {
  await conn.query(`UPDATE activities SET seats_left = seats_left + 1 WHERE id = ?`, [id]);
}

// Sessions
export async function findSessions(activityId) {
  return query(
    `SELECT * FROM activity_sessions WHERE activity_id = ? ORDER BY start_at ASC`,
    [activityId]
  );
}

export async function findSessionByIdForUpdate(conn, sessionId) {
  const [[row]] = await conn.query(`SELECT * FROM activity_sessions WHERE id = ? FOR UPDATE`, [sessionId]);
  return row ?? null;
}

export async function decrementSessionSeats(conn, sessionId) {
  await conn.query(`UPDATE activity_sessions SET seats_left = seats_left - 1 WHERE id = ? AND seats_left > 0`, [sessionId]);
}

export async function incrementSessionSeats(conn, sessionId) {
  await conn.query(`UPDATE activity_sessions SET seats_left = seats_left + 1 WHERE id = ?`, [sessionId]);
}

// Posts
export async function listPosts(activityId) {
  return query(
    `SELECT * FROM activity_posts WHERE activity_id = ? ORDER BY created_at DESC`,
    [activityId]
  );
}

export async function createPost({ activity_id, provider_id, type, title, body, file_url, file_name }) {
  return queryOne(
    `INSERT INTO activity_posts (activity_id, provider_id, type, title, body, file_url, file_name)
     VALUES (?,?,?,?,?,?,?)
     RETURNING *`,
    [activity_id, provider_id, type, title, body ?? null, file_url ?? null, file_name ?? null]
  );
}

export async function findPost(id) {
  return queryOne(`SELECT * FROM activity_posts WHERE id = ?`, [id]);
}

export async function deletePost(id) {
  return query(`DELETE FROM activity_posts WHERE id = ?`, [id]);
}

// Sessions
export async function createSession(activityId, fields) {
  const { start_at, end_at, capacity, price, level } = fields;
  const result = await query(
    `INSERT INTO activity_sessions (activity_id, start_at, end_at, capacity, seats_left, price, level)
     VALUES (?,?,?,?,?,?,?)`,
    [activityId, start_at, end_at, capacity ?? 20, capacity ?? 20, price ?? 0, level ?? null]
  );
  return queryOne(`SELECT * FROM activity_sessions WHERE id = ?`, [result.insertId]);
}
