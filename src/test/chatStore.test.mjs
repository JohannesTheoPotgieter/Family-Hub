// Integration tests for chat plumbing (Phase 3). Skipped without
// DATABASE_URL; runs in the migrate-syntax CI job.

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const skip = !process.env.DATABASE_URL ? { skip: 'DATABASE_URL not set; skipping chat integration tests.' } : {};

const importModules = async () => {
  const { getPool, closePool } = await import('../../server/db/pool.mjs');
  const messageStore = await import('../../server/chat/messageStore.mjs');
  const threadStore = await import('../../server/chat/threadStore.mjs');
  const aiQuota = await import('../../server/chat/aiParseQuota.mjs');
  return { getPool, closePool, messageStore, threadStore, aiQuota };
};

const seedFamily = async (pool) => {
  const familyId = randomUUID();
  const momId = randomUUID();
  const dadId = randomUUID();
  const liamId = randomUUID();
  await pool.query(
    `INSERT INTO families (id, name, owner_user_id, locale) VALUES ($1, 'Test family', $2, 'GLOBAL')`,
    [familyId, randomUUID()]
  );
  await pool.query(
    `INSERT INTO family_members (id, family_id, user_id, display_name, role_key, status)
     VALUES ($1, $2, $3, 'Mom', 'parent_admin', 'active'),
            ($4, $2, $5, 'Dad', 'adult_editor', 'active'),
            ($6, $2, $7, 'Liam', 'child_limited', 'active')`,
    [momId, familyId, randomUUID(), dadId, randomUUID(), liamId, randomUUID()]
  );
  // Seed the family thread the way the Clerk webhook would.
  await pool.query(
    `INSERT INTO threads (family_id, kind, e2e_encrypted) VALUES ($1, 'family', true)`,
    [familyId]
  );
  return { familyId, momId, dadId, liamId };
};

const cleanup = async (pool, familyId) => {
  await pool.query(`DELETE FROM families WHERE id = $1`, [familyId]);
};

test('threadStore: ensureDirectThread is idempotent and uses sorted member ids', skip, async () => {
  const { getPool, closePool, threadStore } = await importModules();
  const pool = getPool();
  const { familyId, momId, dadId } = await seedFamily(pool);
  try {
    const first = await threadStore.ensureDirectThread({ familyId, memberA: dadId, memberB: momId });
    const second = await threadStore.ensureDirectThread({ familyId, memberA: momId, memberB: dadId });
    assert.equal(first.id, second.id);
    assert.equal(first.kind, 'direct');
    assert.equal(first.e2eEncrypted, true);
  } finally {
    await cleanup(pool, familyId);
    await closePool();
  }
});

test('messageStore: insert + list round-trips and tracks reactions', skip, async () => {
  const { getPool, closePool, threadStore, messageStore } = await importModules();
  const pool = getPool();
  const { familyId, momId, dadId } = await seedFamily(pool);
  try {
    const thread = await threadStore.ensureDirectThread({ familyId, memberA: momId, memberB: dadId });
    const message = await messageStore.insertMessage({
      familyId,
      threadId: thread.id,
      authorMemberId: momId,
      kind: 'text',
      bodyCiphertext: Buffer.from('whatever-ciphertext')
    });
    assert.equal(message.kind, 'text');

    await messageStore.addReaction({ familyId, messageId: message.id, memberId: dadId, emoji: '👍' });
    await messageStore.addReaction({ familyId, messageId: message.id, memberId: dadId, emoji: '👍' }); // idempotent

    const listed = await messageStore.listMessages({ familyId, threadId: thread.id });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].reactions.length, 1);
    assert.equal(listed[0].reactions[0].emoji, '👍');
  } finally {
    await cleanup(pool, familyId);
    await closePool();
  }
});

test('messageStore: findPushRecipients excludes the author and muted/hidden members', skip, async () => {
  const { getPool, closePool, threadStore, messageStore } = await importModules();
  const pool = getPool();
  const { familyId, momId, dadId, liamId } = await seedFamily(pool);
  try {
    // Family thread fan-out should reach dad + liam by default; muting
    // dad and hiding the thread from liam leaves no recipients.
    const { rows } = await pool.query(
      `SELECT id FROM threads WHERE family_id = $1 AND kind = 'family' LIMIT 1`,
      [familyId]
    );
    const familyThreadId = rows[0].id;

    let recipients = await messageStore.findPushRecipients({
      familyId,
      threadId: familyThreadId,
      authorMemberId: momId
    });
    assert.equal(new Set(recipients).size, 2);

    await messageStore.setThreadMute({
      familyId,
      threadId: familyThreadId,
      memberId: dadId,
      mutedUntilIso: new Date(Date.now() + 60_000).toISOString()
    });
    await messageStore.setThreadKidVisibility({
      familyId,
      threadId: familyThreadId,
      memberId: liamId,
      kidVisible: false
    });
    recipients = await messageStore.findPushRecipients({
      familyId,
      threadId: familyThreadId,
      authorMemberId: momId
    });
    assert.equal(recipients.length, 0);
  } finally {
    await cleanup(pool, familyId);
    await closePool();
  }
});

test('aiParseQuota: reserves up to limit then returns allowed=false', skip, async () => {
  const { getPool, closePool, aiQuota } = await importModules();
  const pool = getPool();
  const familyId = randomUUID();
  await pool.query(
    `INSERT INTO families (id, name, owner_user_id, locale, plan)
     VALUES ($1, 'Test', $2, 'GLOBAL', 'free')`,
    [familyId, randomUUID()]
  );
  try {
    // Free plan = 60/day. Pre-fill to 59.
    await pool.query(
      `INSERT INTO ai_parse_quota (family_id, day_iso, used_count)
       VALUES ($1, current_date, 59)`,
      [familyId]
    );
    const allowed = await aiQuota.reserveAiParse({ familyId, plan: 'free' });
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.used, 60);

    const denied = await aiQuota.reserveAiParse({ familyId, plan: 'free' });
    assert.equal(denied.allowed, false);
    assert.equal(denied.used, 60); // rolled back
    assert.equal(denied.limit, 60);
  } finally {
    await pool.query(`DELETE FROM families WHERE id = $1`, [familyId]);
    await closePool();
  }
});
