// Typed chat client (Phase 5 chat cutover).
//
// Wraps the Phase 3 thread + message + AI-parse + reaction surface.
// Encryption / decryption of message bodies happens in the
// ThreadView component; this module just speaks the wire shape.

import { apiGet, apiSend } from './client.ts';

export type ThreadKind = 'family' | 'direct' | 'object';

export type ThreadRow = {
  id: string;
  familyId: string;
  kind: ThreadKind;
  entityKind: string | null;
  entityId: string | null;
  directMemberA: string | null;
  directMemberB: string | null;
  e2eEncrypted: boolean;
  createdAt: string;
  lastReadAt?: string | null;
  mutedUntil?: string | null;
  kidVisible?: boolean;
};

export type Reaction = { memberId: string; emoji: string };

export type MessageRow = {
  id: string;
  threadId: string;
  authorMemberId: string | null;
  kind: 'text' | 'activity' | 'proposal';
  bodyText: string | null;
  // Server returns ciphertext as base64 when threads.e2eEncrypted=true.
  bodyCiphertext?: string | null;
  proposalId: string | null;
  attachments: unknown[];
  createdAt: string;
  reactions: Reaction[];
};

export const fetchThreads = () => apiGet<{ threads: ThreadRow[] }>('/api/v2/threads');

export const ensureDirectThread = (memberId: string) =>
  apiSend<{ thread: ThreadRow }>('/api/v2/threads/direct', 'POST', { memberId });

export const fetchMessages = (threadId: string, params: { limit?: number; before?: string } = {}) => {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', String(params.limit));
  if (params.before) query.set('before', params.before);
  const suffix = query.toString();
  return apiGet<{ messages: MessageRow[] }>(
    `/api/v2/threads/${encodeURIComponent(threadId)}/messages${suffix ? `?${suffix}` : ''}`
  );
};

export type SendBody =
  | { bodyText: string; attachments?: unknown[] }
  | { bodyCiphertextBase64: string; attachments?: unknown[] };

export const sendMessage = (threadId: string, body: SendBody) =>
  apiSend<{ message: MessageRow }>(
    `/api/v2/threads/${encodeURIComponent(threadId)}/messages`,
    'POST',
    body
  );

export const markRead = (threadId: string) =>
  apiSend<{ ok: true }>(
    `/api/v2/threads/${encodeURIComponent(threadId)}/read`,
    'POST',
    { atIso: new Date().toISOString() }
  );

export const addReaction = (messageId: string, emoji: string) =>
  apiSend<{ ok: true }>(`/api/v2/messages/${encodeURIComponent(messageId)}/reactions`, 'POST', {
    emoji
  });

export const removeReaction = (messageId: string, emoji: string) =>
  apiSend<{ ok: true }>(`/api/v2/messages/${encodeURIComponent(messageId)}/reactions`, 'DELETE', {
    emoji
  });

export type AiParseResult =
  | { ok: false; reason: string; quota?: { used: number; limit: number } }
  | {
      ok: true;
      proposal: Record<string, unknown> | null;
      confidence: number;
      quota?: { used: number; limit: number };
    };

export const parseProposalIntent = (threadId: string, text: string) =>
  apiSend<AiParseResult>('/api/chat/parse', 'POST', { threadId, text });
