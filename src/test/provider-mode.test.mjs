import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('calendar mode defaults local in integration file', () => {
  const content = fs.readFileSync(new URL('../integrations/calendar/index.ts', import.meta.url), 'utf8');
  assert.match(content, /VITE_CALENDAR_MODE \?\? 'local'/);
});

test('server calendar storage requires an explicit encryption key', () => {
  const content = fs.readFileSync(new URL('../../server/index.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(content, /padEnd\(32, 'x'\)/);
  assert.match(content, /TOKEN_ENC_KEY must be set to at least 32 characters/);
});

test('server sanitizes OAuth return targets and ICS subscription urls', () => {
  const content = fs.readFileSync(new URL('../../server/index.mjs', import.meta.url), 'utf8');
  assert.match(content, /sanitizeReturnTo/);
  assert.match(content, /validateIcsSubscriptionUrl/);
  assert.match(content, /redirect: 'error'/);
});
