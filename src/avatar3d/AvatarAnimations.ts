export type AvatarAnimation = 'idle' | 'wave' | 'happyJump' | 'sleepyIdle' | 'sadSlump' | 'curiousLook' | 'proudSparkle';

export const getAnimationFrame = (animation: AvatarAnimation, t: number) => {
  const wave = Math.sin(t * 4) * 0.6;
  switch (animation) {
    case 'wave':
      return { bodyY: Math.sin(t * 2) * 0.03, armR: -1.2 + wave, armL: -0.3 };
    case 'happyJump':
      return { bodyY: Math.abs(Math.sin(t * 4)) * 0.24, armR: -0.5, armL: 0.5 };
    case 'sleepyIdle':
      return { bodyY: Math.sin(t * 1.2) * 0.02, armR: -0.2, armL: 0.2, headTilt: 0.12 };
    case 'sadSlump':
      return { bodyY: -0.05, armR: -0.1, armL: 0.1, torsoTilt: -0.15 };
    case 'curiousLook':
      return { bodyY: Math.sin(t * 2) * 0.03, headYaw: Math.sin(t * 1.4) * 0.4 };
    case 'proudSparkle':
      return { bodyY: Math.sin(t * 3) * 0.05, armR: -0.7, armL: 0.7, sparkle: true };
    case 'idle':
    default:
      return { bodyY: Math.sin(t * 2.4) * 0.02, armR: -0.45, armL: 0.45 };
  }
};
