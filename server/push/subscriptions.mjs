// Stub — real implementation lands in the PWA commit.
export const savePushSubscription = async () => {
  const err = new Error('push subscription storage is not yet implemented in this build');
  err.status = 501;
  throw err;
};
