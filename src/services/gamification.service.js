// src/services/gamification.service.js
import * as gamRepo from '../repositories/gamification.repository.js';
import { parsePagination, paginatedResponse } from '../utils/paginate.js';
import { Errors } from '../utils/errors.js';
import logger from '../utils/logger.js';

export const XP_TABLE = {
  run_session_base:      50,
  run_session_per_km:    10,
  gym_session_base:      50,
  gym_session_per_set:    5,
  enrollment:            20,
  attendance:            30,
  hazard_report:         15,
  route_feedback:        10,
  challenge_complete:   200,
  streak_daily:          10,
};

function calculateLevel(totalXp) {
  return Math.floor(Math.sqrt(totalXp / 100)) + 1;
}

// ─── Core XP ──────────────────────────────────────────────────────────────────

export async function awardXp(userId, { xp, source, ref_type, ref_id, note }) {
  // 1. Insert XP log entry
  await gamRepo.addXpEntry({ user_id: userId, xp, source, ref_type, ref_id, note });

  // 2. Get or create user level
  let userLevel = await gamRepo.getUserLevel(userId);
  const prevLevel = userLevel?.level ?? 1;
  const newTotalXp = (userLevel?.total_xp ?? 0) + xp;
  const newLevel = calculateLevel(newTotalXp);

  // 3. Update streak
  const today = new Date().toISOString().split('T')[0];
  let streakDays = userLevel?.streak_days ?? 0;
  const lastActive = userLevel?.last_active
    ? new Date(userLevel.last_active).toISOString().split('T')[0]
    : null;

  if (lastActive === today) {
    // Same day — no streak change
  } else {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (lastActive === yesterday) {
      streakDays += 1;
    } else {
      streakDays = 1;
    }
  }

  // 4. Upsert user level
  await gamRepo.upsertUserLevel(userId, {
    total_xp: newTotalXp,
    level: newLevel,
    streak_days: streakDays,
    last_active: today,
  });

  // 5. Check badges
  const newBadges = await checkAndAwardBadges(userId, newLevel, streakDays);

  return {
    xp_gained: xp,
    new_total_xp: newTotalXp,
    new_level: newLevel,
    level_up: newLevel > prevLevel,
    new_badges: newBadges,
  };
}

// ─── Badge Checking ───────────────────────────────────────────────────────────

async function checkAndAwardBadges(userId, level, streakDays) {
  const newBadges = [];

  const checks = [
    { code: 'first_step',     check: async () => (await gamRepo.getTotalSessions(userId)) >= 1 },
    { code: 'first_gym',      check: async () => (await gamRepo.getTotalGymSessions(userId)) >= 1 },
    { code: 'marathoner',     check: async () => (await gamRepo.getTotalRunDistanceM(userId)) >= 42195 },
    { code: 'distance_100km', check: async () => (await gamRepo.getTotalRunDistanceM(userId)) >= 100000 },
    { code: 'centurion',      check: async () => (await gamRepo.getTotalSessions(userId)) >= 100 },
    { code: 'explorer',       check: async () => (await gamRepo.getDistinctRoutesRun(userId)) >= 10 },
    { code: 'guardian',        check: async () => (await gamRepo.getConfirmedHazards(userId)) >= 5 },
    { code: 'on_fire_7',      check: async () => streakDays >= 7 },
    { code: 'on_fire_30',     check: async () => streakDays >= 30 },
    { code: 'gym_rat',        check: async () => (await gamRepo.getTotalGymSessions(userId)) >= 20 },
    { code: 'critic',         check: async () => (await gamRepo.getTotalFeedbacks(userId)) >= 10 },
    { code: 'machine',        check: async () => gamRepo.hasGymSessionWithSets(userId, 20) },
    { code: 'level_10',       check: async () => level >= 10 },
    { code: 'level_25',       check: async () => level >= 25 },
    { code: 'level_50',       check: async () => level >= 50 },
    { code: 'volume_10000',   check: async () => (await gamRepo.getTotalGymVolume(userId)) >= 10000 },
  ];

  for (const { code, check } of checks) {
    try {
      const alreadyHas = await gamRepo.hasUserBadge(userId, code);
      if (alreadyHas) continue;

      const earned = await check();
      if (earned) {
        const badge = await gamRepo.findBadgeByCode(code);
        if (badge) {
          await gamRepo.awardBadge(userId, badge.id);
          newBadges.push({ code: badge.code, name: badge.name, icon: badge.icon });
        }
      }
    } catch (err) {
      logger.warn(`Error checking badge ${code} for user ${userId}: ${err.message}`);
    }
  }

  return newBadges;
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function getProfile(userId) {
  const userLevel = await gamRepo.getUserLevel(userId);
  const badges = await gamRepo.getUserBadges(userId);
  const stats = await gamRepo.getUserStats(userId);

  return {
    level: userLevel?.level ?? 1,
    total_xp: userLevel?.total_xp ?? 0,
    streak_days: userLevel?.streak_days ?? 0,
    last_active: userLevel?.last_active ?? null,
    badges,
    stats,
  };
}

// ─── XP History ───────────────────────────────────────────────────────────────

export async function getMyXpHistory(userId, queryParams) {
  const { page, perPage, offset } = parsePagination(queryParams);
  const [items, total] = await Promise.all([
    gamRepo.getXpHistory(userId, { limit: perPage, offset }),
    gamRepo.countXpHistory(userId),
  ]);
  return paginatedResponse(items, { page, perPage, total });
}

// ─── Rankings ─────────────────────────────────────────────────────────────────

export async function getRanking(type, queryParams) {
  const { page, perPage, offset } = parsePagination(queryParams);

  if (type === 'weekly') {
    const [items, total] = await Promise.all([
      gamRepo.getWeeklyRanking({ limit: perPage, offset }),
      gamRepo.countWeeklyRanking(),
    ]);
    return paginatedResponse(items, { page, perPage, total });
  }

  if (type === 'provider') {
    const providerId = Number(queryParams.provider_id);
    if (!providerId) throw Errors.badRequest('provider_id es requerido para ranking de proveedor.');
    const [items, total] = await Promise.all([
      gamRepo.getProviderRanking(providerId, { limit: perPage, offset }),
      gamRepo.countProviderRanking(providerId),
    ]);
    return paginatedResponse(items, { page, perPage, total });
  }

  // default: global
  const [items, total] = await Promise.all([
    gamRepo.getGlobalRanking({ limit: perPage, offset }),
    gamRepo.countGlobalRanking(),
  ]);
  return paginatedResponse(items, { page, perPage, total });
}

export async function getProviderRanking(providerId, queryParams) {
  const { page, perPage, offset } = parsePagination(queryParams);
  const [items, total] = await Promise.all([
    gamRepo.getProviderRanking(providerId, { limit: perPage, offset }),
    gamRepo.countProviderRanking(providerId),
  ]);
  return paginatedResponse(items, { page, perPage, total });
}

// ─── Badges ───────────────────────────────────────────────────────────────────

export async function getAllBadges(userId) {
  const allBadges = await gamRepo.listAllBadges();
  if (!userId) return allBadges.map(b => ({ ...b, earned: false }));

  const userBadges = await gamRepo.getUserBadges(userId);
  const earnedCodes = new Set(userBadges.map(b => b.code));
  return allBadges.map(b => ({ ...b, earned: earnedCodes.has(b.code) }));
}

// ─── Admin: manual XP ─────────────────────────────────────────────────────────

export async function claimXp(adminUserId, { user_id, xp, source, note }) {
  if (!user_id || !xp) throw Errors.badRequest('user_id y xp son requeridos.');
  return awardXp(user_id, { xp, source: source || 'manual', ref_type: null, ref_id: null, note });
}
