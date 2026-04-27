// Stub — real implementation lands in the invites commit. Routes.mjs imports
// these so the bootstrap module compiles; calling them surfaces a clear error
// rather than a cryptic ReferenceError.

const notImplemented = () => {
  const err = new Error('invite flow is not yet implemented in this build');
  err.status = 501;
  throw err;
};

export const createInvite = notImplemented;
export const acceptInvite = notImplemented;
