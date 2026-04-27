// Proposal-arrival push fan-out (Phase 3.9).
//
// When a proposal lands, every required approver gets a push notification
// with [Agree] / [Decline] action buttons backed by a signed token. Tap
// from the lock screen → /api/push/action → applies the proposal without
// opening the app.

import { listPushSubscriptionsForMember, deleteExpiredSubscription } from '../push/subscriptions.mjs';
import { sendPush } from '../push/webpush.mjs';
import { mintActionToken } from './actionTokens.mjs';

/**
 * @param {{
 *   familyId: string,
 *   proposalId: string,
 *   proposerName: string,
 *   summary: string,
 *   approverIds: string[]
 * }} args
 */
export const fanOutProposalPush = async ({ familyId, proposalId, proposerName, summary, approverIds }) => {
  let delivered = 0;
  for (const memberId of approverIds) {
    const actionToken = mintActionToken({ proposalId, memberId, familyId });
    const subscriptions = await listPushSubscriptionsForMember({ familyId, memberId });
    for (const subscription of subscriptions) {
      const result = await sendPush({
        subscription,
        payload: {
          title: `${proposerName} proposed:`,
          body: summary,
          tag: `proposal-${proposalId}`,
          proposalId,
          actionToken,
          url: `/proposals/${proposalId}`
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
