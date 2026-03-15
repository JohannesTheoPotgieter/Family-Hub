import type {
  AvatarActivityEvent,
  AvatarCompanion,
  AvatarGrowthStage,
  AvatarMoodState,
  AvatarStats,
  FamilyChallenge,
  FamilyChallengeProgress,
  FamilyRewardTrack
} from './avatarTypes';

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const XP_PER_LEVEL = 100;

export const shouldGrantRewardForActionId = (avatar: AvatarCompanion, actionId: string) => !avatar.rewardedActionIds.includes(actionId);

export const getRewardForEvent = (event: AvatarActivityEvent) => {
  const base: { xp: number; coins: number; stars: number; stats: Partial<AvatarStats>; label: string } = { xp: 0, coins: 0, stars: 0, stats: {}, label: 'A cozy progress moment!' };
  switch (event.type) {
    case 'APP_TASK_COMPLETED':
      return { ...base, xp: 18, coins: 4, stats: { confidence: 5, happiness: 3 }, label: 'Task complete! Your companion feels proud.' };
    case 'APP_SHARED_TASK_COMPLETED':
      return { ...base, xp: 24, coins: 6, stars: 1, stats: { confidence: 6, happiness: 5, calm: 2 }, label: 'Shared task complete! Team magic grows.' };
    case 'APP_PAYMENT_PAID_ON_TIME':
      return { ...base, xp: 20, coins: 10, stars: 1, stats: { confidence: 8, calm: 3 }, label: 'On-time bill paid. Cozy confidence boost!' };
    case 'APP_PAYMENT_MARKED_PAID':
      return { ...base, xp: 12, coins: 5, stats: { confidence: 5 }, label: 'Bill logged and tidy.' };
    case 'APP_CALENDAR_EVENT_ADDED':
      return { ...base, xp: 10, coins: 3, stats: { calm: 4, happiness: 2 }, label: 'Plans added! Your companion feels prepared.' };
    case 'APP_CALENDAR_WEEK_PLANNED':
      return { ...base, xp: 26, coins: 7, stars: 1, stats: { calm: 8, confidence: 4 }, label: 'Week planned. The whole home feels steady.' };
    case 'APP_PROFILE_COMPLETED':
      return { ...base, xp: 35, coins: 20, stars: 2, stats: { confidence: 8, happiness: 8 }, label: 'Starter pack unlocked!' };
    case 'APP_DAILY_CHECKIN':
      return { ...base, xp: 8, coins: 2, stats: { happiness: 2, calm: 2 }, label: 'Daily spark bonus collected.' };
    case 'APP_FAMILY_CHALLENGE_COMPLETED':
      return { ...base, xp: 28, coins: 10, stars: 3, stats: { happiness: 10, confidence: 6, calm: 6 }, label: 'Challenge complete! Home feels brighter.' };
    default:
      return { ...base, xp: 6, coins: 1, stats: { happiness: 1 }, label: 'Small cozy progress.' };
  }
};

export const getMoodFromStats = (stats: AvatarStats): AvatarMoodState => {
  if (stats.energy < 30) return 'sleepy';
  if (stats.hunger < 35) return 'hungry';
  if (stats.happiness < 35) return 'sad';
  if (stats.confidence > 80) return 'proud';
  if (stats.calm > 80) return 'calm';
  if (stats.happiness > 82) return 'sparkly';
  if (stats.energy > 70 && stats.happiness > 70) return 'playful';
  return 'happy';
};

export const getGrowthStage = (level: number, streakDays: number, completedHouseholdActions: number): AvatarGrowthStage => {
  if (level >= 16 && streakDays >= 14 && completedHouseholdActions >= 120) return 'grown';
  if (level >= 10 && streakDays >= 8 && completedHouseholdActions >= 70) return 'teen';
  if (level >= 4 && completedHouseholdActions >= 20) return 'child';
  return 'baby';
};

export const applyActivityReward = (avatar: AvatarCompanion, event: AvatarActivityEvent): AvatarCompanion => {
  if (!shouldGrantRewardForActionId(avatar, event.actionId)) return avatar;
  const reward = getRewardForEvent(event);
  const rewardStats = reward.stats as Partial<AvatarStats>;
  const stats: AvatarStats = {
    energy: clamp(avatar.stats.energy + (rewardStats.energy ?? 0)),
    hunger: clamp(avatar.stats.hunger + (rewardStats.hunger ?? 0)),
    hygiene: clamp(avatar.stats.hygiene + (rewardStats.hygiene ?? 0)),
    happiness: clamp(avatar.stats.happiness + (rewardStats.happiness ?? 0)),
    confidence: clamp(avatar.stats.confidence + (rewardStats.confidence ?? 0)),
    calm: clamp(avatar.stats.calm + (rewardStats.calm ?? 0)),
    health: clamp(avatar.stats.health + (rewardStats.health ?? 0) + 1)
  };

  const totalXp = avatar.xp + reward.xp;
  const levelGain = Math.floor(totalXp / XP_PER_LEVEL);
  const level = avatar.level + levelGain;
  const growthStage = getGrowthStage(level, avatar.streakDays, avatar.completedHouseholdActions + 1);

  return {
    ...avatar,
    xp: totalXp % XP_PER_LEVEL,
    level,
    growthStage,
    coins: avatar.coins + reward.coins,
    stars: avatar.stars + reward.stars,
    completedHouseholdActions: avatar.completedHouseholdActions + 1,
    rewardedActionIds: [...avatar.rewardedActionIds.slice(-250), event.actionId],
    stats,
    mood: getMoodFromStats(stats),
    lastInteractionAtIso: event.createdAtIso
  };
};

export const applyStatDecay = (avatar: AvatarCompanion, elapsedMs: number): AvatarCompanion => {
  if (elapsedMs <= 0) return avatar;
  const hours = elapsedMs / (1000 * 60 * 60);
  const stats: AvatarStats = {
    energy: clamp(avatar.stats.energy - hours * 2.4),
    hunger: clamp(avatar.stats.hunger - hours * 3.2),
    hygiene: clamp(avatar.stats.hygiene - hours * 1.8),
    happiness: clamp(avatar.stats.happiness - hours * 1.1),
    confidence: clamp(avatar.stats.confidence - hours * 0.2),
    calm: clamp(avatar.stats.calm - hours * 0.7),
    health: clamp(avatar.stats.health - hours * 0.4)
  };
  return {
    ...avatar,
    stats,
    mood: getMoodFromStats(stats),
    lastDecayProcessedAtIso: new Date(new Date(avatar.lastDecayProcessedAtIso).getTime() + elapsedMs).toISOString()
  };
};

export const applyFamilyChallengeReward = (
  track: FamilyRewardTrack,
  challenge: FamilyChallenge
): FamilyRewardTrack => {
  if (challenge.rewardType === 'stars') return { ...track, familyStars: track.familyStars + Math.max(1, Math.floor(challenge.targetValue / 2)) };
  if (challenge.rewardType === 'coins') return { ...track, familyCoins: track.familyCoins + challenge.targetValue * 2 };
  if (challenge.rewardType === 'room_unlock' || challenge.rewardType === 'family_theme') {
    const payload = typeof challenge.rewardPayload === 'string' ? challenge.rewardPayload : `theme-${challenge.id}`;
    return { ...track, unlockedRoomThemes: [...new Set([...track.unlockedRoomThemes, payload])] };
  }
  const payload = typeof challenge.rewardPayload === 'string' ? challenge.rewardPayload : `reward-${challenge.id}`;
  return { ...track, unlockedDecor: [...new Set([...track.unlockedDecor, payload])] };
};

export const applyChallengeContribution = (
  challenge: FamilyChallenge,
  progress: FamilyChallengeProgress,
  userId: string,
  actionId: string,
  amount = 1
) => {
  if (challenge.completed || progress.contributingActionIds.includes(actionId)) {
    return { challenge, progress, completedNow: false };
  }
  const nextProgress = {
    ...progress,
    contributingActionIds: [...progress.contributingActionIds, actionId],
    contributionsByUserId: {
      ...progress.contributionsByUserId,
      [userId]: (progress.contributionsByUserId[userId] ?? 0) + amount
    }
  };
  const progressValue = challenge.progressValue + amount;
  const completed = progressValue >= challenge.targetValue;
  return {
    challenge: {
      ...challenge,
      progressValue,
      completed,
      completedAtIso: completed ? new Date().toISOString() : undefined
    },
    progress: nextProgress,
    completedNow: completed
  };
};
