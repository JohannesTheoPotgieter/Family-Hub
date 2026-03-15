import test from 'node:test';
import assert from 'node:assert/strict';

const getRewardForEvent = (type) => ({ APP_TASK_COMPLETED: { xp: 18 }, APP_PAYMENT_PAID_ON_TIME: { xp: 20 }, APP_CALENDAR_EVENT_ADDED: { xp: 10 } }[type] ?? { xp: 6 });
const shouldGrantRewardForActionId = (rewardedActionIds, actionId) => !rewardedActionIds.includes(actionId);
const getGrowthStage = (level, streakDays, actions) => (level >= 16 && streakDays >= 14 && actions >= 120 ? 'grown' : level >= 10 && streakDays >= 8 && actions >= 70 ? 'teen' : level >= 4 && actions >= 20 ? 'child' : 'baby');
const getMoodFromStats = (stats) => (stats.energy < 30 ? 'sleepy' : stats.hunger < 35 ? 'hungry' : stats.happiness < 35 ? 'sad' : stats.confidence > 80 ? 'proud' : stats.calm > 80 ? 'calm' : stats.happiness > 82 ? 'sparkly' : stats.energy > 70 && stats.happiness > 70 ? 'playful' : 'happy');
const applyStatDecay = (stats, elapsedMs) => {
  const hours = elapsedMs / (1000 * 60 * 60);
  return { energy: Math.max(0, stats.energy - hours * 2.4), hunger: Math.max(0, stats.hunger - hours * 3.2), hygiene: Math.max(0, stats.hygiene - hours * 1.8) };
};
const applyChallengeContribution = (challenge, progress, userId, actionId) => {
  if (progress.contributingActionIds.includes(actionId)) return { challenge, progress };
  const progressValue = challenge.progressValue + 1;
  return {
    challenge: { ...challenge, progressValue, completed: progressValue >= challenge.targetValue },
    progress: { ...progress, contributingActionIds: [...progress.contributingActionIds, actionId], contributionsByUserId: { ...progress.contributionsByUserId, [userId]: (progress.contributionsByUserId[userId] ?? 0) + 1 } }
  };
};
const shouldUseAvatarFallback = (supportsWebgl, prefersReducedMotion, lowPowerMode) => !supportsWebgl || prefersReducedMotion || lowPowerMode;

const migrateOldAvatar = (old) => ({ level: Math.floor(old.points / 80) + 1, xp: old.points % 100, mood: old.mood === 'excited' ? 'playful' : old.mood === 'silly' ? 'curious' : old.mood });

test('reward mapping covers household actions', () => {
  assert.equal(getRewardForEvent('APP_TASK_COMPLETED').xp, 18);
  assert.equal(getRewardForEvent('APP_PAYMENT_PAID_ON_TIME').xp, 20);
  assert.equal(getRewardForEvent('APP_CALENDAR_EVENT_ADDED').xp, 10);
});

test('idempotency stops duplicate rewards', () => {
  assert.equal(shouldGrantRewardForActionId(['task-1'], 'task-1'), false);
  assert.equal(shouldGrantRewardForActionId(['task-1'], 'task-2'), true);
});

test('stat decay logic is gentle over elapsed time', () => {
  const next = applyStatDecay({ energy: 80, hunger: 80, hygiene: 80 }, 1000 * 60 * 60 * 5);
  assert.equal(Math.round(next.energy), 68);
  assert.equal(Math.round(next.hunger), 64);
});

test('growth stage transitions respect progress milestones', () => {
  assert.equal(getGrowthStage(1, 1, 3), 'baby');
  assert.equal(getGrowthStage(5, 2, 25), 'child');
  assert.equal(getGrowthStage(12, 8, 70), 'teen');
  assert.equal(getGrowthStage(16, 14, 120), 'grown');
});

test('mood derivation stays supportive', () => {
  assert.equal(getMoodFromStats({ energy: 20, hunger: 80, happiness: 80, confidence: 50, calm: 50 }), 'sleepy');
  assert.equal(getMoodFromStats({ energy: 70, hunger: 80, happiness: 85, confidence: 90, calm: 50 }), 'proud');
});

test('family challenge progress tracks contribution by member', () => {
  const result = applyChallengeContribution({ progressValue: 0, targetValue: 2, completed: false }, { contributingActionIds: [], contributionsByUserId: {} }, 'johannes', 'task-1');
  assert.equal(result.challenge.progressValue, 1);
  assert.equal(result.progress.contributionsByUserId.johannes, 1);
});

test('family challenge completion rewards can trigger', () => {
  const result = applyChallengeContribution({ progressValue: 1, targetValue: 2, completed: false }, { contributingActionIds: ['task-1'], contributionsByUserId: { johannes: 1 } }, 'nicole', 'task-2');
  assert.equal(result.challenge.completed, true);
});

test('migration maps old avatar state into new structure', () => {
  const migrated = migrateOldAvatar({ points: 165, mood: 'excited' });
  assert.equal(migrated.level, 3);
  assert.equal(migrated.xp, 65);
  assert.equal(migrated.mood, 'playful');
});

test('fallback selection prefers safety and comfort', () => {
  assert.equal(shouldUseAvatarFallback(false, false, false), true);
  assert.equal(shouldUseAvatarFallback(true, true, false), true);
  assert.equal(shouldUseAvatarFallback(true, false, false), false);
});
