// src/repositories/run.repository.js
import { query, queryOne } from '../db.js';
import { radiusToDeg } from '../utils/geo.js';

// ─── Run Routes ───────────────────────────────────────────────────────────────

export async function findRoutes({ lat, lng, radius_m = 10000, surface, difficulty, status, q, min_dist_m, max_dist_m, limit = 20, offset = 0 } = {}) {
  const where  = [];
  const params = [];

  where.push(`rr.status = ?`);
  params.push(status ?? 'active');

  if (lat != null && lng != null) {
    const deg = radiusToDeg(radius_m);
    where.push(`rr.center_lat BETWEEN ? AND ?`);
    where.push(`rr.center_lng BETWEEN ? AND ?`);
    params.push(lat - deg, lat + deg, lng - deg, lng + deg);
  }
  if (surface)    { where.push(`rr.surface = ?`);      params.push(surface); }
  if (difficulty) { where.push(`rr.difficulty = ?`);   params.push(difficulty); }
  if (q)          { where.push(`rr.title LIKE ?`);     params.push(`%${q}%`); }
  if (min_dist_m) { where.push(`rr.distance_m >= ?`);  params.push(min_dist_m); }
  if (max_dist_m) { where.push(`rr.distance_m <= ?`);  params.push(max_dist_m); }

  const distExpr = (lat != null && lng != null)
    ? `(6371000 * ACOS(LEAST(1.0, COS(RADIANS(${lat})) * COS(RADIANS(rr.center_lat))
        * COS(RADIANS(rr.center_lng) - RADIANS(${lng}))
        + SIN(RADIANS(${lat})) * SIN(RADIANS(rr.center_lat)))))`
    : 'NULL';

  const rows = await query(
    `SELECT rr.id, rr.provider_id, rr.title, rr.description, rr.city,
            rr.surface, rr.difficulty, rr.distance_m, rr.duration_s,
            rr.elevation_up_m, rr.elevation_down_m,
            rr.center_lat, rr.center_lng,
            rr.bbox_min_lat, rr.bbox_min_lng, rr.bbox_max_lat, rr.bbox_max_lng,
            rr.thumbnail_url, rr.created_at,
            ${distExpr} AS distance_from_user_m,
            COALESCE(AVG(f.rating), NULL) AS avg_rating,
            COUNT(DISTINCT f.id)          AS feedback_count,
            COUNT(DISTINCT rs.id)         AS session_count
     FROM run_routes rr
     LEFT JOIN run_feedback f  ON f.route_id  = rr.id
     LEFT JOIN run_sessions rs ON rs.route_id = rr.id AND rs.status = 'completed'
     WHERE ${where.join(' AND ')}
     GROUP BY rr.id
     ORDER BY distance_from_user_m ASC, rr.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return rows;
}

export async function countRoutes({ lat, lng, radius_m = 10000, surface, difficulty, status, q, min_dist_m, max_dist_m } = {}) {
  const where  = [];
  const params = [];

  where.push(`rr.status = ?`);
  params.push(status ?? 'active');

  if (lat != null && lng != null) {
    const deg = radiusToDeg(radius_m);
    where.push(`rr.center_lat BETWEEN ? AND ?`);
    where.push(`rr.center_lng BETWEEN ? AND ?`);
    params.push(lat - deg, lat + deg, lng - deg, lng + deg);
  }
  if (surface)    { where.push(`rr.surface = ?`);     params.push(surface); }
  if (difficulty) { where.push(`rr.difficulty = ?`);  params.push(difficulty); }
  if (q)          { where.push(`rr.title LIKE ?`);    params.push(`%${q}%`); }
  if (min_dist_m) { where.push(`rr.distance_m >= ?`); params.push(min_dist_m); }
  if (max_dist_m) { where.push(`rr.distance_m <= ?`); params.push(max_dist_m); }
  const row = await queryOne(`SELECT COUNT(*) AS total FROM run_routes rr WHERE ${where.join(' AND ')}`, params);
  return row?.total ?? 0;
}

export async function findRouteById(id) {
  return queryOne(
    `SELECT rr.*,
            COALESCE(AVG(f.rating), NULL) AS avg_rating,
            COUNT(DISTINCT f.id)          AS feedback_count,
            COUNT(DISTINCT rs.id)         AS session_count
     FROM run_routes rr
     LEFT JOIN run_feedback f  ON f.route_id  = rr.id
     LEFT JOIN run_sessions rs ON rs.route_id = rr.id AND rs.status = 'completed'
     WHERE rr.id = ?
     GROUP BY rr.id`,
    [id]
  );
}

export async function createRoute(fields) {
  const { title, description, city, surface, difficulty, distance_m, duration_s,
          elevation_up_m, elevation_down_m, polyline, center_lat, center_lng,
          bbox_min_lat, bbox_min_lng, bbox_max_lat, bbox_max_lng, thumbnail_url, provider_id } = fields;
  const result = await query(
    `INSERT INTO run_routes
       (title, description, city, surface, difficulty, distance_m, duration_s,
        elevation_up_m, elevation_down_m, polyline, center_lat, center_lng,
        bbox_min_lat, bbox_min_lng, bbox_max_lat, bbox_max_lng, thumbnail_url, provider_id, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active')`,
    [title, description ?? null, city ?? null, surface ?? 'road', difficulty ?? 'media',
     distance_m, duration_s ?? null, elevation_up_m ?? 0, elevation_down_m ?? 0,
     polyline, center_lat, center_lng, bbox_min_lat, bbox_min_lng, bbox_max_lat, bbox_max_lng,
     thumbnail_url ?? null, provider_id ?? null]
  );
  return findRouteById(result.insertId);
}

export async function getRoutesWithMetrics({ lat, lng, radius_m = 10000 }) {
  const deg = radiusToDeg(radius_m);
  return query(
    `SELECT rr.id, rr.title, rr.city, rr.surface, rr.difficulty,
            rr.distance_m, rr.duration_s, rr.elevation_up_m,
            rr.center_lat, rr.center_lng, rr.thumbnail_url,
            (6371000 * ACOS(LEAST(1.0, COS(RADIANS(?)) * COS(RADIANS(rr.center_lat))
              * COS(RADIANS(rr.center_lng) - RADIANS(?))
              + SIN(RADIANS(?)) * SIN(RADIANS(rr.center_lat))))) AS distance_from_user_m,
            COUNT(DISTINCT h.id)              AS hazard_count,
            COALESCE(AVG(h.severity), 0)      AS avg_hazard_severity,
            COALESCE(AVG(f.rating), 3.0)      AS avg_rating,
            COUNT(DISTINCT f.id)              AS feedback_count,
            COUNT(DISTINCT rs.id)             AS session_count
     FROM run_routes rr
     LEFT JOIN hazards h
       ON h.status = 'active'
       AND h.lat BETWEEN rr.bbox_min_lat AND rr.bbox_max_lat
       AND h.lng BETWEEN rr.bbox_min_lng AND rr.bbox_max_lng
     LEFT JOIN run_feedback f  ON f.route_id  = rr.id
     LEFT JOIN run_sessions rs ON rs.route_id = rr.id AND rs.status = 'completed'
     WHERE rr.status = 'active'
       AND rr.center_lat BETWEEN ? AND ?
       AND rr.center_lng BETWEEN ? AND ?
     GROUP BY rr.id
     HAVING distance_from_user_m < ?`,
    [lat, lng, lat, lat - deg, lat + deg, lng - deg, lng + deg, radius_m]
  );
}

// ─── Run Sessions ─────────────────────────────────────────────────────────────

export async function createSession({ user_id, route_id, origin_lat, origin_lng, device }) {
  const result = await query(
    `INSERT INTO run_sessions (user_id, route_id, origin_lat, origin_lng, device, started_at, status)
     VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(), 'active')`,
    [user_id, route_id ?? null, origin_lat ?? null, origin_lng ?? null, device ?? null]
  );
  return queryOne(`SELECT * FROM run_sessions WHERE id = ?`, [result.insertId]);
}

export async function findSessionById(id) {
  return queryOne(`SELECT * FROM run_sessions WHERE id = ? LIMIT 1`, [id]);
}

export async function finishSession(id, summary) {
  const { finished_at, duration_s, distance_m, avg_pace_s, avg_speed_mps,
          avg_hr_bpm, deviates_count, max_elevation_m, min_elevation_m } = summary;
  await query(
    `UPDATE run_sessions SET
       status = 'completed', finished_at = ?,
       duration_s = ?, distance_m = ?, avg_pace_s = ?,
       avg_speed_mps = ?, avg_hr_bpm = ?,
       deviates_count = ?, max_elevation_m = ?, min_elevation_m = ?
     WHERE id = ?`,
    [finished_at, duration_s, distance_m, avg_pace_s ?? null,
     avg_speed_mps ?? null, avg_hr_bpm ?? null,
     deviates_count ?? 0, max_elevation_m ?? null, min_elevation_m ?? null, id]
  );
  return findSessionById(id);
}

export async function abandonSession(id) {
  await query(`UPDATE run_sessions SET status = 'abandoned', finished_at = UTC_TIMESTAMP() WHERE id = ?`, [id]);
}

export async function insertTelemetryPoints(sessionId, points) {
  if (!points?.length) return;
  // Insertar en lotes de 500 para evitar paquetes MySQL demasiado grandes
  const BATCH = 500;
  for (let i = 0; i < points.length; i += BATCH) {
    const batch = points.slice(i, i + BATCH);
    const values = batch.map((p) => [
      sessionId, p.ts_ms, p.lat, p.lng,
      p.speed_mps ?? null, p.pace_s ?? null,
      p.elevation_m ?? null, p.hr_bpm ?? null,
      p.off_route ? 1 : 0, p.accuracy_m ?? null,
    ]);
    await query(
      `INSERT INTO run_telemetry_points
         (session_id, ts_ms, lat, lng, speed_mps, pace_s, elevation_m, hr_bpm, off_route, accuracy_m)
       VALUES ?`,
      [values]
    );
  }
}

export async function findSessionsByUser(userId, { status = 'completed', limit = 20, offset = 0 } = {}) {
  return query(
    `SELECT rs.id, rs.route_id, rs.started_at, rs.finished_at, rs.status,
            rs.duration_s, rs.distance_m, rs.avg_pace_s, rs.avg_hr_bpm, rs.deviates_count,
            rr.title AS route_title, rr.city AS route_city, rr.surface AS route_surface
     FROM run_sessions rs
     LEFT JOIN run_routes rr ON rr.id = rs.route_id
     WHERE rs.user_id = ? AND rs.status = ?
     ORDER BY rs.started_at DESC
     LIMIT ? OFFSET ?`,
    [userId, status, limit, offset]
  );
}

export async function countSessionsByUser(userId, { status = 'completed' } = {}) {
  const row = await queryOne(
    `SELECT COUNT(*) AS total FROM run_sessions WHERE user_id = ? AND status = ?`,
    [userId, status]
  );
  return row?.total ?? 0;
}

// ─── Run Feedback ─────────────────────────────────────────────────────────────

export async function findFeedbackByUserAndRoute(userId, routeId) {
  return queryOne(`SELECT * FROM run_feedback WHERE user_id = ? AND route_id = ? LIMIT 1`, [userId, routeId]);
}

export async function createFeedback({ route_id, user_id, session_id, rating, notes, fatigue_level, perceived_difficulty }) {
  const result = await query(
    `INSERT INTO run_feedback (route_id, user_id, session_id, rating, notes, fatigue_level, perceived_difficulty)
     VALUES (?,?,?,?,?,?,?)`,
    [route_id, user_id, session_id ?? null, rating, notes ?? null,
     fatigue_level ?? null, perceived_difficulty ?? null]
  );
  return queryOne(`SELECT * FROM run_feedback WHERE id = ?`, [result.insertId]);
}

export async function findFeedbackByRoute(routeId, { limit = 20, offset = 0 } = {}) {
  return query(
    `SELECT f.id, f.rating, f.notes, f.fatigue_level, f.perceived_difficulty, f.created_at,
            u.id AS user_id, u.name AS user_name
     FROM run_feedback f
     JOIN users u ON u.id = f.user_id
     WHERE f.route_id = ?
     ORDER BY f.created_at DESC
     LIMIT ? OFFSET ?`,
    [routeId, limit, offset]
  );
}

export async function countFeedbackByRoute(routeId) {
  const row = await queryOne(`SELECT COUNT(*) AS total FROM run_feedback WHERE route_id = ?`, [routeId]);
  return row?.total ?? 0;
}

export async function avgRatingByRoute(routeId) {
  const row = await queryOne(`SELECT AVG(rating) AS avg_rating FROM run_feedback WHERE route_id = ?`, [routeId]);
  return row?.avg_rating ?? null;
}
