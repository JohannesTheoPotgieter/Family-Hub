import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptFromThread, encryptForThread } from '../lib/crypto/messageBox.ts';

import sodiumPkg from 'libsodium-wrappers';

const sodium = sodiumPkg;

test('encryptForThread / decryptFromThread round-trips a UTF-8 message', async () => {
  await sodium.ready;
  const key = sodium.randombytes_buf(32);
  const ciphertext = await encryptForThread(key, 'Hello, family — every Wed 4pm 🌟');
  assert.ok(typeof ciphertext === 'string' && ciphertext.length > 0);
  const decrypted = await decryptFromThread(key, ciphertext);
  assert.equal(decrypted, 'Hello, family — every Wed 4pm 🌟');
});

test('decryptFromThread returns null on a tampered payload', async () => {
  await sodium.ready;
  const key = sodium.randombytes_buf(32);
  const ciphertext = await encryptForThread(key, 'secret');
  // Flip a byte near the end (auth tag area).
  const tampered = ciphertext.slice(0, -3) + 'AAA';
  assert.equal(await decryptFromThread(key, tampered), null);
});

test('decryptFromThread returns null with the wrong key', async () => {
  await sodium.ready;
  const key = sodium.randombytes_buf(32);
  const otherKey = sodium.randombytes_buf(32);
  const ciphertext = await encryptForThread(key, 'private');
  assert.equal(await decryptFromThread(otherKey, ciphertext), null);
});

test('encryptForThread refuses a non-32-byte key', async () => {
  await sodium.ready;
  const shortKey = sodium.randombytes_buf(16);
  await assert.rejects(() => encryptForThread(shortKey, 'x'));
});

test('two encryptions of the same plaintext yield different ciphertexts (unique nonces)', async () => {
  await sodium.ready;
  const key = sodium.randombytes_buf(32);
  const a = await encryptForThread(key, 'same plaintext');
  const b = await encryptForThread(key, 'same plaintext');
  assert.notEqual(a, b);
});
