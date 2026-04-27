import test from 'node:test';
import assert from 'node:assert/strict';
import { mintTicket, verifyTicket } from '../../server/realtime/ticket.mjs';

const setSecret = (value) => {
  if (value === undefined) delete process.env.REALTIME_TICKET_SECRET;
  else process.env.REALTIME_TICKET_SECRET = value;
};

test('mintTicket / verifyTicket round-trip a valid payload (single-use)', async () => {
  setSecret('a'.repeat(48));
  const ticket = mintTicket({ familyId: 'f1', memberId: 'm1' });
  const verified = await verifyTicket(ticket);
  assert.deepEqual(
    { familyId: verified.familyId, memberId: verified.memberId },
    { familyId: 'f1', memberId: 'm1' }
  );
  // Single-use: a second verify of the same ticket fails.
  const second = await verifyTicket(ticket);
  assert.equal(second, null);
  setSecret(undefined);
});

test('verifyTicket rejects a tampered MAC', async () => {
  setSecret('a'.repeat(48));
  const ticket = mintTicket({ familyId: 'f1', memberId: 'm1' });
  const tampered = `${ticket.slice(0, -2)}xx`;
  assert.equal(await verifyTicket(tampered), null);
  setSecret(undefined);
});

test('verifyTicket rejects a stale secret', async () => {
  setSecret('first-secret-32-bytes-ok-for-test12');
  const ticket = mintTicket({ familyId: 'f1', memberId: 'm1' });
  setSecret('second-secret-32-bytes-ok-for-test12');
  assert.equal(await verifyTicket(ticket), null);
  setSecret(undefined);
});
