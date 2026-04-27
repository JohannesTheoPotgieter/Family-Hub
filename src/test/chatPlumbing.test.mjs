import test from 'node:test';
import assert from 'node:assert/strict';
import { mintActionToken, verifyActionToken } from '../../server/chat/actionTokens.mjs';
import { localProfanityHit, moderateText } from '../../server/chat/moderation.mjs';

const setSecret = (value) => {
  if (value === undefined) delete process.env.PUSH_ACTION_TOKEN_SECRET;
  else process.env.PUSH_ACTION_TOKEN_SECRET = value;
};

test('mintActionToken / verifyActionToken round-trip a valid payload', () => {
  setSecret('a'.repeat(48));
  const token = mintActionToken({
    proposalId: 'p1',
    memberId: 'm1',
    familyId: 'f1'
  });
  const verified = verifyActionToken(token);
  assert.deepEqual(verified, { proposalId: 'p1', memberId: 'm1', familyId: 'f1' });
  setSecret(undefined);
});

test('verifyActionToken rejects a tampered MAC', () => {
  setSecret('a'.repeat(48));
  const token = mintActionToken({ proposalId: 'p1', memberId: 'm1', familyId: 'f1' });
  const tampered = `${token.slice(0, -2)}xx`;
  assert.equal(verifyActionToken(tampered), null);
  setSecret(undefined);
});

test('verifyActionToken rejects an expired token', () => {
  setSecret('a'.repeat(48));
  const token = mintActionToken({
    proposalId: 'p1',
    memberId: 'm1',
    familyId: 'f1',
    ttlSeconds: -10 // already expired
  });
  assert.equal(verifyActionToken(token), null);
  setSecret(undefined);
});

test('verifyActionToken rejects when secret rotates', () => {
  setSecret('original-secret-32-bytes-ok-x12345');
  const token = mintActionToken({ proposalId: 'p1', memberId: 'm1', familyId: 'f1' });
  setSecret('a-different-secret-32-bytes-ok-x12345');
  assert.equal(verifyActionToken(token), null);
  setSecret(undefined);
});

test('localProfanityHit catches the seed sentinel and ignores normal text', () => {
  assert.equal(localProfanityHit('hello mom'), null);
  assert.equal(localProfanityHit('this contains bannedtestword'), 'bannedtestword');
});

test('moderateText returns ok when MODERATION_DISABLED is set', async () => {
  process.env.MODERATION_DISABLED = 'true';
  const result = await moderateText('anything');
  assert.equal(result.ok, true);
  delete process.env.MODERATION_DISABLED;
});

test('moderateText returns ok when no API key is configured (fail-soft)', async () => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.MODERATION_DISABLED;
  const result = await moderateText('hello');
  assert.equal(result.ok, true);
});

test('moderateText catches the local safe-list sentinel before hitting the API', async () => {
  delete process.env.OPENAI_API_KEY;
  const result = await moderateText('this contains bannedtestword');
  assert.equal(result.ok, false);
  assert.ok(result.reasons[0].startsWith('safe_list:'));
});
