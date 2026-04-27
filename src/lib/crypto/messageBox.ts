// Authenticated symmetric encryption for chat messages (Phase 3.8).
//
// libsodium's secretbox = XSalsa20-Poly1305. 24-byte nonce per message,
// 32-byte key derived from the family secret.
//
// Wire format (base64url):  [24B nonce][ciphertext]
//
// Object threads are NOT encrypted — the routes accept plaintext
// `bodyText` for them. This module is only invoked when sending into a
// family or direct thread (threads.e2e_encrypted = true).

import sodiumPkg from 'libsodium-wrappers';

const sodium = sodiumPkg as typeof import('libsodium-wrappers');

let readyPromise: Promise<void> | null = null;
const ready = (): Promise<void> => {
  if (!readyPromise) readyPromise = sodium.ready;
  return readyPromise;
};

/**
 * Encrypt a UTF-8 plaintext under `familyKey`. Returns base64url payload
 * suitable for the `bodyCiphertextBase64` field on POST messages.
 */
export const encryptForThread = async (familyKey: Uint8Array, plaintext: string): Promise<string> => {
  await ready();
  if (familyKey.length !== sodium.crypto_secretbox_KEYBYTES) {
    throw new Error('familyKey must be 32 bytes');
  }
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(
    sodium.from_string(plaintext),
    nonce,
    familyKey
  );
  // Concatenate nonce + ciphertext into one base64url blob so the server
  // stores a single bytea column and the client doesn't need a second
  // field on every message row.
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, nonce.length);
  return sodium.to_base64(combined, sodium.base64_variants.URLSAFE_NO_PADDING);
};

/**
 * Decrypt a base64url-encoded combined nonce+ciphertext blob. Returns
 * null on auth-tag mismatch / tampering / wrong key.
 */
export const decryptFromThread = async (
  familyKey: Uint8Array,
  base64url: string
): Promise<string | null> => {
  await ready();
  let combined: Uint8Array;
  try {
    combined = sodium.from_base64(base64url, sodium.base64_variants.URLSAFE_NO_PADDING);
  } catch {
    return null;
  }
  if (combined.length < sodium.crypto_secretbox_NONCEBYTES + sodium.crypto_secretbox_MACBYTES) {
    return null;
  }
  const nonce = combined.slice(0, sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = combined.slice(sodium.crypto_secretbox_NONCEBYTES);
  try {
    const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, familyKey);
    return sodium.to_string(plaintext);
  } catch {
    return null;
  }
};
