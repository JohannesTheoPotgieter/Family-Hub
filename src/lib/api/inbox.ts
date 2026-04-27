// Typed Decision Inbox client (Phase 5 cutover, pillar 1).
//
// Wraps the three Phase 4.5 read endpoints + the proposal decision route
// so the React UI never builds URLs by hand.

import { apiGet, apiSend } from './client.ts';

export type InboxProposal = {
  id: string;
  threadId: string;
  proposedByMemberId: string;
  kind: string;
  entityKind: string;
  entityId: string;
  change: Record<string, unknown>;
  expiresAt: string;
  createdAt: string;
};

export type InboxBill = {
  id: string;
  title: string;
  amountCents: number;
  currency: string;
  dueDate: string;
  category: string;
};

export type InboxTask = {
  id: string;
  title: string;
  dueDate: string | null;
  priority: 'low' | 'normal' | 'high';
  rewardPoints: number;
  ownerMemberId: string;
};

export type InboxConflict = {
  a: { id: string; title?: string; start: { iso: string }; end: { iso: string } };
  b: { id: string; title?: string; start: { iso: string }; end: { iso: string } };
  sharedAttendeeIds: string[];
};

export type InboxPayload = {
  generatedAt: string;
  proposals: InboxProposal[];
  bills: InboxBill[];
  tasks: InboxTask[];
  conflicts: InboxConflict[];
};

export type InboxCounts = {
  proposals: number;
  bills: number;
  tasks: number;
  conflicts: number;
  total: number;
};

export type AuditMatch = {
  id: string;
  action: string;
  entityKind: string;
  entityId: string | null;
  diff: unknown;
  actorMemberId: string | null;
  createdAt: string;
};

export const fetchInbox = (horizonDays = 7) =>
  apiGet<InboxPayload>(`/api/v2/inbox?horizonDays=${horizonDays}`);

export const fetchInboxCounts = () => apiGet<InboxCounts>('/api/v2/me/inbox-counts');

export const searchAuditLog = (q: string, limit = 30) =>
  apiGet<{ q: string; results: AuditMatch[] }>(
    `/api/v2/search?q=${encodeURIComponent(q)}&limit=${limit}`
  );

export const decideOnProposal = (proposalId: string, decision: 'agree' | 'decline') =>
  apiSend<{ proposal: { status: string }; diff: unknown }>(
    `/api/proposals/${encodeURIComponent(proposalId)}/decision`,
    'POST',
    { decision }
  );
