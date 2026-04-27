// Per-message push fan-out (Phase 3.12).
//
// Called from the messages POST route after a successful insert. For each
// active recipient (computed by findPushRecipients in the messageStore)
// we look up their push subscriptions and send a notification. Encrypted
// threads receive a generic "New message in Family-Hub" preview — the
// payload itself is decrypted by the SW client-side via the family key.
//
// Best-effort: failures never block the send. BullMQ-driven so a slow
// push provider doesn't add latency to the chat insert request.

import { listPushSubscriptionsForMember, deleteExpiredSubscription } from '../push/subscriptions.mjs';
import { sendPush } from '../push/webpush.mjs';
import { findPushRecipients } from './messageStore.mjs';

/**
 * @param {{
 *   familyId: string,
 *   threadId: string,
 *   threadKind: 'family' | 'direct' | 'object',
 *   e2eEncrypted: boolean,
 *   authorMemberId: string,
 *   authorDisplayName: string,
 *   bodyPreview: string | null,
 *   messageId: string
 * }} args
 */
export const fanOutMessagePush = async ({
  familyId,
  threadId,
  threadKind,
  e2eEncrypted,
  authorMemberId,
  authorDisplayName,
  bodyPreview,
  messageId
}) => {
  const recipientIds = await findPushRecipients({ familyId, threadId, authorMemberId });
  if (!recipientIds.length) return { delivered: 0 };

  // Encrypted-thread preview is intentionally generic — payload preview is
  // decrypted client-side by the SW (Phase 3.8 / 3.9 design note in plan).
  const title = e2eEncrypted ? 'New message' : authorDisplayName;
  const body = e2eEncrypted
    ? threadKind === 'family'
      ? 'New message in Family'
      : 'New direct message'
    : bodyPreview ?? '(message)';

  let delivered = 0;
  for (const memberId of recipientIds) {
    const subscriptions = await listPushSubscriptionsForMember({ familyId, memberId });
    for (const subscription of subscriptions) {
      const result = await sendPush({
        subscription,
        payload: {
          title,
          body,
          tag: `thread-${threadId}`,
          url: `/chat?thread=${encodeURIComponent(threadId)}&message=${encodeURIComponent(messageId)}`
        }
      });
      if (result.ok) delivered += 1;
      if (result.reason === 'expired') {
        await deleteExpiredSubscription({ familyId, endpoint: subscription.endpoint });
      }
    }
  }
  return { delivered };
};
