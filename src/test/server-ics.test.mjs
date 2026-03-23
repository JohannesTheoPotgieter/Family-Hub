import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('server exposes ICS subscription removal endpoint', () => {
  const content = fs.readFileSync(new URL('../../server/bootstrap/routes.mjs', import.meta.url), 'utf8');
  assert.match(content, /\/api\/ics\/subscriptions\//);
  assert.match(content, /req.method === 'DELETE'/);
});
