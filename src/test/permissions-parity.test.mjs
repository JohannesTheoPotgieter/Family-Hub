import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_PERMISSIONS, memberHasPermission } from '../../server/auth/permissions.mjs';

test('server permissions module includes the expected role keys', () => {
  assert.deepEqual(Object.keys(ROLE_PERMISSIONS).sort(), [
    'adult_editor',
    'child_limited',
    'parent_admin'
  ]);
});

test('parent admins can approve money proposals; kids cannot', () => {
  assert.equal(memberHasPermission('parent_admin', 'proposal_approve_money'), true);
  assert.equal(memberHasPermission('child_limited', 'proposal_approve_money'), false);
});

test('kids can propose event + task changes but not money', () => {
  assert.equal(memberHasPermission('child_limited', 'proposal_create_event'), true);
  assert.equal(memberHasPermission('child_limited', 'proposal_create_task'), true);
  assert.equal(memberHasPermission('child_limited', 'proposal_create_money'), false);
});

test('memberHasPermission returns false for unknown roles or null inputs', () => {
  assert.equal(memberHasPermission(null, 'task_edit'), false);
  // @ts-expect-error - intentional invalid role
  assert.equal(memberHasPermission('grandparent', 'task_edit'), false);
});
