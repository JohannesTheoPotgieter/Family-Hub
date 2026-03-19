import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyChallengeContribution,
  applyStatDecay,
  getGrowthStage,
  getMoodFromStats,
  getRewardForEvent,
  shouldGrantRewardForActionId
} from '../domain/avatarRewards.ts';
import { shouldUseAvatarFallback } from '../domain/avatarRuntime.ts';

test('reward mapping covers household actions', () => {
  assert.equal(getRewardForEvent({ type: 'APP_TASK_COMPLETED' }).xp, 18);
  assert.equal(getRewardForEvent({ type: 'APP_PAYMENT_PAID_ON_TIME' }).xp, 20);
  assert.equal(getRewardForEvent({ type: 'APP_CALENDAR_EVENT_ADDED' }).xp, 10);
});

test('idempotency stops duplicate rewards', () => {
  assert.equal(shouldGrantRewardForActionId({ rewardedActionIds: ['task-1'] }, 'task-1'), false);
  assert.equal(shouldGrantRewardForActionId({ rewardedActionIds: ['task-1'] }, 'task-2'), true);
});

test('stat decay logic is gentle over elapsed time', () => {
  const next = applyStatDecay({
    stats: { energy: 80, hunger: 80, hygiene: 80, happiness: 80, confidence: 80, calm: 80, health: 80 },
    lastDecayProcessedAtIso: '2026-03-01T00:00:00.000Z'
  }, 1000 * 60 * 60 * 5);
  assert.equal(Math.round(next.stats.energy), 68);
  assert.equal(Math.round(next.stats.hunger), 64);
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

test('fallback selection prefers safety and comfort', () => {
  assert.equal(shouldUseAvatarFallback(false, false, false), true);
  assert.equal(shouldUseAvatarFallback(true, true, false), true);
  assert.equal(shouldUseAvatarFallback(true, false, false), false);
});
