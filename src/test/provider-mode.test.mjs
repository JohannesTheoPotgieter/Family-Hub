import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('calendar mode defaults local in integration file', () => {
  const content = fs.readFileSync(new URL('../integrations/calendar/index.ts', import.meta.url), 'utf8');
  assert.match(content, /VITE_CALENDAR_MODE \?\? 'local'/);
});
