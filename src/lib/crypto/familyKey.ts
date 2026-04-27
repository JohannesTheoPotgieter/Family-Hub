// Family E2E key management (Phase 3.8 client side).
//
// Each family has one 32-byte secret used to derive symmetric keys for
// encrypting message bodies in family + direct threads. The secret:
//   - is generated client-side by the family creator on owner setup
//   - is shared with invitees via the URL fragment of the invite link
//     (HTTP fragments never traverse the network, so the server never
//     sees the secret)
//   - lives only in IndexedDB on each member's devices
//
// Server NEVER stores the secret. If a user clears their browser they
// regain access by being re-shared the secret out-of-band (a 24-word
// recovery phrase printable from Settings — Phase 5 work).
//
// Object threads (entity_kind != null) are intentionally NOT encrypted,
// per the plan privacy posture: AI parse + activity cards need to read
// them. Only family + direct threads use this module.

import sodiumPkg from 'libsodium-wrappers';

const sodium = sodiumPkg as typeof import('libsodium-wrappers');

const DB_NAME = 'family-hub-keys';
const STORE = 'keys';
const KEY_NAME = (familyId: string) => `family:${familyId}`;

let readyPromise: Promise<void> | null = null;
const ready = (): Promise<void> => {
  if (!readyPromise) readyPromise = sodium.ready;
  return readyPromise;
};

// --- IndexedDB helpers ---------------------------------------------------

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const dbGet = async (key: string): Promise<Uint8Array | null> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result ?? null) as Uint8Array | null);
    req.onerror = () => reject(req.error);
  });
};

const dbPut = async (key: string, value: Uint8Array): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

const dbDelete = async (key: string): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

// --- Public API ----------------------------------------------------------

/**
 * Generate a fresh 32-byte family secret. Called once per family by the
 * owner (on first login post-Clerk-signup) before any encrypted message
 * is ever sent. Caller is responsible for persisting via
 * storeFamilyKey + sharing via mintShareableSecret.
 */
export const generateFamilyKey = async (): Promise<Uint8Array> => {
  await ready();
  return sodium.randombytes_buf(32);
};

export const storeFamilyKey = async (familyId: string, key: Uint8Array): Promise<void> => {
  await dbPut(KEY_NAME(familyId), key);
};

export const loadFamilyKey = async (familyId: string): Promise<Uint8Array | null> => {
  return dbGet(KEY_NAME(familyId));
};

export const forgetFamilyKey = async (familyId: string): Promise<void> => {
  await dbDelete(KEY_NAME(familyId));
};

/**
 * Encode the secret as a base64url string suitable for the fragment of an
 * invite URL (e.g. `/invite?token=abc#fkey=...`). Decode with
 * `decodeShareableSecret` after the recipient signs in.
 */
export const encodeShareableSecret = async (key: Uint8Array): Promise<string> => {
  await ready();
  return sodium.to_base64(key, sodium.base64_variants.URLSAFE_NO_PADDING);
};

export const decodeShareableSecret = async (encoded: string): Promise<Uint8Array> => {
  await ready();
  return sodium.from_base64(encoded, sodium.base64_variants.URLSAFE_NO_PADDING);
};

/**
 * Read the family secret out of `location.hash` if the page was opened
 * from an invite-acceptance URL. Strips the hash after consumption so a
 * stray reload or share doesn't accidentally leak the key.
 */
export const consumeFamilyKeyFromUrl = async (familyId: string): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash ?? '';
  const match = hash.match(/(?:^|[#&])fkey=([^&]+)/);
  if (!match) return false;
  try {
    const key = await decodeShareableSecret(decodeURIComponent(match[1]));
    await storeFamilyKey(familyId, key);
    // Strip the fragment (replaceState avoids a navigation) so reloads
    // don't expose the key in the URL bar.
    const cleaned = window.location.pathname + window.location.search;
    window.history.replaceState(null, '', cleaned);
    return true;
  } catch {
    return false;
  }
};

/**
 * Recovery phrase: 32 bytes encoded as 24 BIP39-ish words is the
 * conventional UX. We defer the wordlist to Phase 5; for now we expose
 * the raw base64url so the test suite can round-trip and Settings can
 * render "copy this string somewhere safe."
 */
export const exportRecoveryString = async (key: Uint8Array): Promise<string> =>
  encodeShareableSecret(key);

export const importRecoveryString = async (recovery: string): Promise<Uint8Array> =>
  decodeShareableSecret(recovery.trim());
