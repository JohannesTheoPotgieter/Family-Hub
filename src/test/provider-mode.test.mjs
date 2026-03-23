import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isPrivateIpAddress, sanitizeReturnTo, server } from '../../server/index.mjs';

test('calendar mode defaults local in integration file', () => {
  const content = fs.readFileSync(new URL('../integrations/calendar/index.ts', import.meta.url), 'utf8');
  assert.match(content, /VITE_CALENDAR_MODE \?\? 'local'/);
});

test('server calendar storage requires an explicit encryption key', () => {
  const indexContent = fs.readFileSync(new URL('../../server/index.mjs', import.meta.url), 'utf8');
  const startupContent = fs.readFileSync(new URL('../../server/bootstrap/startup-maintenance.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(indexContent, /padEnd\(32, 'x'\)/);
  assert.match(startupContent, /TOKEN_ENC_KEY/);
});

test('server reset path is maintenance-only and normal boot stays read-only', () => {
  const routeContent = fs.readFileSync(new URL('../../server/bootstrap/routes.mjs', import.meta.url), 'utf8');
  const startupContent = fs.readFileSync(new URL('../../server/bootstrap/startup-maintenance.mjs', import.meta.url), 'utf8');
  const storageContent = fs.readFileSync(new URL('../../server/storage.mjs', import.meta.url), 'utf8');
  assert.match(startupContent, /FAMILY_HUB_MAINTENANCE_MODE === '1'/);
  assert.match(routeContent, /assertMaintenanceModeEnabled/);
  assert.match(storageContent, /Keep boot read-only/);
});

test('server sanitizes OAuth return targets and ICS subscription urls', () => {
  const indexContent = fs.readFileSync(new URL('../../server/index.mjs', import.meta.url), 'utf8');
  const authContent = fs.readFileSync(new URL('../../server/bootstrap/auth.mjs', import.meta.url), 'utf8');
  const routeContent = fs.readFileSync(new URL('../../server/bootstrap/routes.mjs', import.meta.url), 'utf8');
  assert.match(indexContent, /sanitizeReturnTo/);
  assert.match(routeContent, /validateIcsSubscriptionUrl/);
  assert.match(authContent, /common\/oauth2\/v2\.0\/authorize/);
});

test('server helper exports keep unsafe return urls on the allowed origin only', () => {
  const allowed = sanitizeReturnTo('google', 'http://localhost:5000/calendar');
  const blocked = sanitizeReturnTo('google', 'https://evil.example/steal');
  assert.match(allowed, /^http:\/\/localhost:5000/);
  assert.match(blocked, /^http:\/\/localhost:5000/);
});

test('server helper marks private addresses as unsafe', () => {
  assert.equal(isPrivateIpAddress('127.0.0.1'), true);
  assert.equal(isPrivateIpAddress('192.168.1.1'), true);
  assert.equal(isPrivateIpAddress('8.8.8.8'), false);
});

test('importing the server module does not auto-listen during tests', () => {
  assert.equal(server.listening, false);
});
