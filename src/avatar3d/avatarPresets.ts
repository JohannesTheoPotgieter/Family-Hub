import type { AvatarCompanion } from '../domain/avatarTypes';

export const moodAnimationMap = {
  happy: 'idle',
  playful: 'happyJump',
  proud: 'proudSparkle',
  sleepy: 'sleepyIdle',
  sad: 'sadSlump',
  hungry: 'curiousLook',
  curious: 'curiousLook',
  calm: 'idle',
  sparkly: 'proudSparkle'
} as const;

export const getAvatarScaleByGrowth = (companion: AvatarCompanion) => {
  switch (companion.growthStage) {
    case 'baby': return 0.9;
    case 'child': return 1;
    case 'teen': return 1.08;
    case 'grown': return 1.15;
  }
};
