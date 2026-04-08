// src/services/analytics.service.js
import * as analyticsRepo from '../repositories/analytics.repository.js';

export async function getRunningSummary(userId) {
  return analyticsRepo.getRunningSummary(userId);
}

export async function getRunningWeekly(userId, weeks) {
  const items = await analyticsRepo.getRunningWeekly(userId, weeks);
  return { items };
}

export async function getRunningProgress(userId) {
  const items = await analyticsRepo.getRunningProgress(userId);
  return { items };
}

export async function getGymSummary(userId) {
  return analyticsRepo.getGymSummary(userId);
}

export async function getGymWeekly(userId, weeks) {
  const items = await analyticsRepo.getGymWeekly(userId, weeks);
  return { items };
}

export async function getGymMuscleDistribution(userId) {
  const items = await analyticsRepo.getGymMuscleDistribution(userId);
  return { items };
}

export async function getCombinedStreak(userId) {
  return analyticsRepo.getCombinedStreak(userId);
}
