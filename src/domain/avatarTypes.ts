import type { UserId } from '../lib/family-hub/constants.ts';

export type AvatarMoodState = 'happy' | 'sleepy' | 'playful' | 'proud' | 'hungry' | 'sad' | 'curious' | 'calm' | 'sparkly';
export type AvatarGrowthStage = 'baby' | 'child' | 'teen' | 'grown';
export type AvatarPersonality = 'gentle' | 'brave' | 'bouncy' | 'dreamy' | 'helpful';

export type AvatarStats = {
  energy: number;
  hunger: number;
  hygiene: number;
  happiness: number;
  confidence: number;
  calm: number;
  health: number;
};

export type AvatarAppearance = {
  bodyColor: string;
  eyeStyle: 'round' | 'sparkle' | 'moon';
  earStyle?: 'soft' | 'pointy' | 'leaf';
  hairStyle?: 'curl' | 'tuft' | 'hood';
  outfitId?: string;
  accessoryIds: string[];
  auraColor?: string;
  sparkleStyle?: 'stars' | 'fireflies' | 'dust';
};

export type AvatarInventory = {
  foods: string[];
  toys: string[];
  outfits: string[];
  stickers: string[];
  rewards: string[];
  roomDecor: string[];
  accessories: string[];
};

export type AvatarCompanion = {
  id: string;
  userId: UserId;
  name: string;
  species: 'foxling' | 'mooncat' | 'cloudbear' | 'bunny';
  growthStage: AvatarGrowthStage;
  level: number;
  xp: number;
  coins: number;
  stars: number;
  streakDays: number;
  completedHouseholdActions: number;
  rewardedActionIds: string[];
  lastInteractionAtIso: string;
  lastDecayProcessedAtIso: string;
  mood: AvatarMoodState;
  personality?: AvatarPersonality;
  stats: AvatarStats;
  appearance: AvatarAppearance;
  room: {
    backgroundTheme: string;
    floorTheme: string;
    decorationIds: string[];
    wallpaperId?: string;
    windowStyle?: string;
    plushieIds?: string[];
  };
  inventory: AvatarInventory;
};

export type AvatarActivityEventType =
  | 'APP_TASK_COMPLETED'
  | 'APP_TASK_STREAK_REACHED'
  | 'APP_SHARED_TASK_COMPLETED'
  | 'APP_PAYMENT_MARKED_PAID'
  | 'APP_PAYMENT_PAID_ON_TIME'
  | 'APP_BUDGET_GOAL_MET'
  | 'APP_CALENDAR_EVENT_ADDED'
  | 'APP_CALENDAR_WEEK_PLANNED'
  | 'APP_SHOPPING_ITEM_COMPLETED'
  | 'APP_SHOPPING_LIST_COMPLETED'
  | 'APP_PROFILE_COMPLETED'
  | 'APP_DAILY_CHECKIN'
  | 'APP_FAMILY_GOAL_REACHED'
  | 'APP_FAMILY_CHALLENGE_PROGRESS'
  | 'APP_FAMILY_CHALLENGE_COMPLETED';

export type AvatarActivityEvent = {
  type: AvatarActivityEventType;
  userId: UserId;
  actionId: string;
  createdAtIso: string;
  metadata?: Record<string, unknown>;
};

export type FamilyChallenge = {
  id: string;
  title: string;
  description: string;
  category: 'tasks' | 'planning' | 'money' | 'shopping' | 'mixed';
  cadence: 'daily' | 'weekly' | 'monthly';
  targetType: 'count' | 'points' | 'streak' | 'specific_actions';
  targetValue: number;
  progressValue: number;
  rewardType: 'coins' | 'stars' | 'room_unlock' | 'sticker' | 'outfit' | 'family_theme';
  rewardPayload?: unknown;
  startsAtIso: string;
  endsAtIso: string;
  completed: boolean;
  completedAtIso?: string;
  participantUserIds: UserId[];
};

export type FamilyChallengeProgress = {
  challengeId: string;
  contributionsByUserId: Record<string, number>;
  contributingActionIds: string[];
};

export type FamilyRewardTrack = {
  familyLevel: number;
  familyStars: number;
  familyCoins: number;
  unlockedRoomThemes: string[];
  unlockedDecor: string[];
  unlockedSquadRewards: string[];
};

export type AvatarGameState = {
  version: 2;
  companionsByUserId: Record<UserId, AvatarCompanion>;
  familyRewardTrack: FamilyRewardTrack;
  familyChallenges: FamilyChallenge[];
  challengeProgressById: Record<string, FamilyChallengeProgress>;
  rewardHistory: { id: string; label: string; atIso: string; userId: UserId }[];
};
