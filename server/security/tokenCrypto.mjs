// AES-256-GCM token encryption (Phase 0.8).
//
// Lifted out of server/storage.mjs so the calendar_connections store can
// share the exact same crypto. Key comes from TOKEN_ENC_KEY (≥32 bytes).
//
// Wire format (base64): [12B iv][16B auth tag][ciphertext].
// Output of `encryptToken` is a Buffer suitable for a `bytea` column. The
// legacy storage.mjs path continues to read/write the base64-string form;
// `encodeForBytea` / `decodeFromBytea` are the only differences.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

const requireKey = (encKey) => {
  if (!encKey || encKey.length < 32) {
    const err = new Error('TOKEN_ENC_KEY must be set to at least 32 characters.');
    err.status = 500;
    throw err;
  }
  return Buffer.from(encKey).subarray(0, 32);
};

/**
 * Encrypt a plaintext string and return a Buffer ready for a Postgres
 * `bytea` column.
 */
export const encryptToken = (plaintext, encKey) => {
  if (typeof plaintext !== 'string') {
    throw new Error('encryptToken requires a string plaintext.');
  }
  const key = requireKey(encKey);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
};

/**
 * Decrypt a Buffer (or `Uint8Array`) produced by `encryptToken`. Returns the
 * original plaintext string.
 */
export const decryptToken = (ciphertext, encKey) => {
  if (!ciphertext) return null;
  const buf = Buffer.isBuffer(ciphertext) ? ciphertext : Buffer.from(ciphertext);
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('decryptToken: ciphertext too short to be valid.');
  }
  const key = requireKey(encKey);
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const body = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
};
