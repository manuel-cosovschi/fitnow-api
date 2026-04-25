// src/utils/xp.js — central XP/level helper
import { query } from '../db.js';

export function calcLevel(totalXp) {
  return Math.max(1, Math.floor(Math.sqrt(totalXp / 100)) + 1);
}

/**
 * Award XP to a user, update user_gamification (total_xp + level),
 * and insert an xp_log row.
 */
export async function awardXp(userId, xp, source, { ref_type = null, ref_id = null, note = null } = {}) {
  await query(
    `INSERT INTO xp_log (user_id, xp, source, ref_type, ref_id, note) VALUES (?,?,?,?,?,?)`,
    [userId, xp, source, ref_type, ref_id, note]
  );

  // Upsert gamification row and recalculate level atomically
  await query(
    `INSERT INTO user_gamification (user_id, total_xp, level, last_active)
     VALUES (?, ?, ?, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET total_xp    = user_gamification.total_xp + ?,
           level       = GREATEST(1, FLOOR(SQRT((user_gamification.total_xp + ?) / 100.0))::int + 1),
           last_active = NOW(),
           updated_at  = NOW()`,
    [userId, xp, calcLevel(xp), xp, xp]
  );
}
