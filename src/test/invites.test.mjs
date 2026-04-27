import test from 'node:test';
import assert from 'node:assert/strict';
import { inviteEmailTemplate, isEmailConfigured } from '../../server/email/resend.mjs';

test('inviteEmailTemplate renders a subject, html, text triple', () => {
  const tpl = inviteEmailTemplate({
    inviterName: 'Sara',
    familyName: 'The Potgieters',
    acceptUrl: 'https://app/invite?token=abc'
  });
  assert.match(tpl.subject, /Sara invited you to join The Potgieters/);
  assert.ok(tpl.text.includes('https://app/invite?token=abc'));
  assert.ok(tpl.html.includes('https://app/invite?token=abc'));
});

test('inviteEmailTemplate escapes HTML in inputs', () => {
  const tpl = inviteEmailTemplate({
    inviterName: '<script>alert(1)</script>',
    familyName: 'A & B',
    acceptUrl: 'https://app/invite?token=xyz'
  });
  assert.equal(tpl.html.includes('<script>'), false);
  assert.ok(tpl.html.includes('&lt;script&gt;'));
  assert.ok(tpl.html.includes('A &amp; B'));
});

test('isEmailConfigured reflects the RESEND_API_KEY env var', () => {
  const before = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  assert.equal(isEmailConfigured(), false);
  process.env.RESEND_API_KEY = 're_test_123';
  assert.equal(isEmailConfigured(), true);
  if (before !== undefined) process.env.RESEND_API_KEY = before;
  else delete process.env.RESEND_API_KEY;
});
