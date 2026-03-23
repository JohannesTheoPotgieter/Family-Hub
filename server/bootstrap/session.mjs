import { createServerStorage } from '../storage.mjs';

export const createSessionBootstrap = ({ dataFile, encKey }) => {
  // Session/bootstrap setup must stay side-effect free during normal boot so restarts
  // only hydrate the last persisted state and never mutate it implicitly.
  const storage = createServerStorage({ dataFile, encKey });
  return { storage };
};
