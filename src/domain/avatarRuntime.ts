export const shouldUseAvatarFallback = (supportsWebgl: boolean, prefersReducedMotion: boolean, lowPowerMode: boolean) =>
  !supportsWebgl || prefersReducedMotion || lowPowerMode;
