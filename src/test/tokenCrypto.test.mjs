import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptToken, encryptToken } from '../../server/security/tokenCrypto.mjs';

const KEY = 'a'.repeat(32);

test('encryptToken → decryptToken round-trips a JSON payload', () => {
  const payload = JSON.stringify({ accessToken: 'abc', refreshToken: 'def', expiresAt: 1234567890 });
  const ciphertext = encryptToken(payload, KEY);
  assert.ok(Buffer.isBuffer(ciphertext));
  assert.notEqual(ciphertext.toString('utf8'), payload); // actually encrypted
  assert.equal(decryptToken(ciphertext, KEY), payload);
});

test('decryptToken with the wrong key throws', () => {
  const ciphertext = encryptToken('secret', KEY);
  assert.throws(() => decryptToken(ciphertext, 'b'.repeat(32)));
});

test('encryptToken refuses a short key', () => {
  assert.throws(() => encryptToken('x', 'short'));
});

test('decryptToken returns null on null/empty input', () => {
  assert.equal(decryptToken(null, KEY), null);
});

test('decryptToken throws on truncated ciphertext', () => {
  assert.throws(() => decryptToken(Buffer.from('too short'), KEY));
});
