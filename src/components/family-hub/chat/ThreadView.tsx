// ThreadView — renders one thread's messages with E2E decryption,
// inline proposal cards, and a composer that posts encrypted text into
// the family / direct thread (or plaintext into an object thread). The
// AI-parse hook is wired but only fires on object threads — encrypted
// threads never get fed to the model (same posture the server enforces).
//
// Phase 5 chat cutover: this is the connective-chat surface the plan
// promised. All the wire pipework (server enforcement, realtime,
// libsodium) was built earlier; this component is the rendering.

import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../../../lib/auth/SessionProvider.tsx';
import { useThread } from '../../../hooks/useThread.ts';
import {
  addReaction,
  markRead,
  parseProposalIntent,
  sendMessage,
  type MessageRow,
  type ThreadRow
} from '../../../lib/api/chat.ts';
import { decideOnProposal } from '../../../lib/api/inbox.ts';
import { proposeChange } from '../../../lib/api/events.ts';

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });

const tryParseActivity = (raw: string | null): { kind: string; [k: string]: unknown } | null => {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    return typeof obj === 'object' && obj && typeof (obj as { kind?: unknown }).kind === 'string'
      ? (obj as { kind: string })
      : null;
  } catch {
    return null;
  }
};

export const ThreadView = ({ thread }: { thread: ThreadRow }) => {
  const session = useSession();
  const enabled = session.kind === 'authenticated';
  const messages = useThread({ enabled, threadId: thread.id });
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [familyKey, setFamilyKey] = useState<Uint8Array | null>(null);
  const [decrypted, setDecrypted] = useState<Record<string, string>>({});
  const [parsedProposal, setParsedProposal] = useState<Record<string, unknown> | null>(null);

  // Lazy-load the family key when this thread is encrypted.
  useEffect(() => {
    if (!thread.e2eEncrypted || !enabled) return;
    let cancelled = false;
    (async () => {
      const familyId = session.kind === 'authenticated' ? session.session.member.familyId : null;
      if (!familyId) return;
      const { loadFamilyKey } = await import('../../../lib/crypto/familyKey.ts');
      const key = await loadFamilyKey(familyId);
      if (!cancelled) setFamilyKey(key);
    })();
    return () => {
      cancelled = true;
    };
  }, [thread.e2eEncrypted, enabled, session]);

  // Decrypt new ciphertext bodies as they arrive.
  useEffect(() => {
    if (messages.kind !== 'ready' || !familyKey || !thread.e2eEncrypted) return;
    let cancelled = false;
    (async () => {
      const { decryptFromThread } = await import('../../../lib/crypto/messageBox.ts');
      const next: Record<string, string> = { ...decrypted };
      for (const m of messages.messages) {
        if (m.kind !== 'text' || decrypted[m.id] != null || !m.bodyCiphertext) continue;
        const plain = await decryptFromThread(familyKey, m.bodyCiphertext);
        next[m.id] = plain ?? '[unable to decrypt]';
      }
      if (!cancelled) setDecrypted(next);
    })();
    return () => {
      cancelled = true;
    };
    // decrypted intentionally excluded from deps — we mutate it incrementally
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, familyKey, thread.e2eEncrypted]);

  // Mark thread read when messages render.
  useEffect(() => {
    if (messages.kind !== 'ready' || !enabled) return;
    markRead(thread.id).catch(() => {});
  }, [messages.kind, enabled, thread.id]);

  if (!enabled) return null;

  const onSend = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (thread.e2eEncrypted) {
        if (!familyKey) {
          setError('Family key not on this device — ask another adult to share the recovery code.');
          return;
        }
        const { encryptForThread } = await import('../../../lib/crypto/messageBox.ts');
        const ciphertextBase64 = await encryptForThread(familyKey, draft);
        await sendMessage(thread.id, { bodyCiphertextBase64: ciphertextBase64 });
      } else {
        await sendMessage(thread.id, { bodyText: draft });
      }
      setDraft('');
      setParsedProposal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send.');
    } finally {
      setBusy(false);
    }
  };

  const onParse = async () => {
    if (!draft.trim() || thread.kind !== 'object') return;
    setBusy(true);
    setError(null);
    try {
      const result = await parseProposalIntent(thread.id, draft);
      if (result.ok && result.proposal) {
        setParsedProposal(result.proposal);
      } else if (result.ok) {
        setError('Could not extract a clear proposal — try a slash command instead.');
      } else if (result.reason === 'quota_exceeded') {
        setError(`Daily AI parse limit reached (${result.quota?.used}/${result.quota?.limit}).`);
      } else {
        setError(`AI parse unavailable: ${result.reason}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI parse failed.');
    } finally {
      setBusy(false);
    }
  };

  const onSubmitParsedProposal = async () => {
    if (!parsedProposal || !thread.entityId) return;
    setBusy(true);
    setError(null);
    try {
      await proposeChange({
        change: parsedProposal as Parameters<typeof proposeChange>[0]['change'],
        entityId: thread.entityId,
        threadId: thread.id
      });
      setParsedProposal(null);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send proposal.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label={`Thread ${thread.id}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 360,
        background: 'rgba(0,0,0,0.03)',
        borderRadius: 16,
        overflow: 'hidden'
      }}
    >
      <header
        style={{
          padding: '10px 14px',
          background: '#fff',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between'
        }}
      >
        <strong>
          {thread.kind === 'family'
            ? 'Family'
            : thread.kind === 'direct'
              ? 'Direct'
              : `${thread.entityKind ?? 'object'} thread`}
        </strong>
        {thread.e2eEncrypted ? (
          <span style={{ fontSize: 11, opacity: 0.6 }}>end-to-end encrypted</span>
        ) : (
          <span style={{ fontSize: 11, opacity: 0.6 }}>server-readable</span>
        )}
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.kind === 'loading' && <div style={{ opacity: 0.6 }}>Loading messages…</div>}
        {messages.kind === 'error' && (
          <div style={{ color: '#a31d2c' }}>Couldn't load messages: {messages.message}</div>
        )}
        {messages.kind === 'ready' &&
          messages.messages.map((m) => (
            <MessageRowView
              key={m.id}
              message={m}
              decryptedText={decrypted[m.id]}
              isMine={
                session.kind === 'authenticated' &&
                m.authorMemberId === session.session.member.id
              }
              e2e={thread.e2eEncrypted}
            />
          ))}
      </div>

      <footer style={{ padding: 12, borderTop: '1px solid rgba(0,0,0,0.06)', background: '#fff' }}>
        {error && (
          <div style={{ marginBottom: 8, color: '#a31d2c', fontSize: 13 }}>{error}</div>
        )}
        {parsedProposal && (
          <div
            style={{
              marginBottom: 8,
              padding: 10,
              background: 'rgba(0,150,80,0.08)',
              borderRadius: 12,
              fontSize: 13
            }}
          >
            <div style={{ marginBottom: 6 }}>
              Detected proposal:{' '}
              <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 4px', borderRadius: 4 }}>
                {String(parsedProposal.kind ?? '')}
              </code>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" disabled={busy} onClick={onSubmitParsedProposal} style={primaryButton}>
                Send proposal
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setParsedProposal(null)}
                style={ghostButton}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={thread.kind === 'object' ? 'Type or describe a change…' : 'Type a message'}
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid rgba(0,0,0,0.15)',
              fontSize: 14
            }}
          />
          {thread.kind === 'object' && draft.trim() ? (
            <button type="button" disabled={busy} onClick={onParse} style={ghostButton}>
              AI parse
            </button>
          ) : null}
          <button type="button" disabled={busy || !draft.trim()} onClick={onSend} style={primaryButton}>
            Send
          </button>
        </div>
      </footer>
    </section>
  );
};

const MessageRowView = ({
  message,
  decryptedText,
  isMine,
  e2e
}: {
  message: MessageRow;
  decryptedText?: string;
  isMine: boolean;
  e2e: boolean;
}) => {
  if (message.kind === 'activity') {
    const parsed = tryParseActivity(message.bodyText);
    return (
      <div style={{ alignSelf: 'center', fontSize: 12, opacity: 0.75 }}>
        {parsed?.kind === 'task_completed'
          ? `Completed “${String(parsed.taskTitle)}”${
              typeof parsed.pointsAwarded === 'number' && parsed.pointsAwarded > 0
                ? ` (+${parsed.pointsAwarded})`
                : ''
            }`
          : message.bodyText ?? 'Activity'}
      </div>
    );
  }

  if (message.kind === 'proposal' && message.proposalId) {
    return <InlineProposalCard proposalId={message.proposalId} createdAt={message.createdAt} />;
  }

  const text = e2e ? decryptedText ?? '…' : message.bodyText ?? '[hidden]';
  const tone = message.bodyText === '[message hidden by moderation]' ? 'moderated' : 'normal';
  return (
    <div style={{ alignSelf: isMine ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
      <div
        style={{
          padding: '8px 12px',
          borderRadius: 14,
          background: tone === 'moderated' ? 'rgba(220,53,69,0.08)' : isMine ? '#1a1a1a' : '#fff',
          color: tone === 'moderated' ? '#a31d2c' : isMine ? '#fff' : '#1a1a1a',
          boxShadow: isMine ? 'none' : '0 1px 0 rgba(0,0,0,0.04)'
        }}
      >
        {text}
      </div>
      <div
        style={{
          fontSize: 11,
          opacity: 0.55,
          marginTop: 2,
          textAlign: isMine ? 'right' : 'left'
        }}
      >
        {formatTime(message.createdAt)}
        {message.reactions.length > 0 ? ` · ${message.reactions.map((r) => r.emoji).join(' ')}` : ''}
      </div>
    </div>
  );
};

const InlineProposalCard = ({ proposalId, createdAt }: { proposalId: string; createdAt: string }) => {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<'agreed' | 'declined' | null>(null);
  const onDecide = async (decision: 'agree' | 'decline') => {
    setBusy(true);
    try {
      await decideOnProposal(proposalId, decision);
      setOutcome(decision === 'agree' ? 'agreed' : 'declined');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      style={{
        alignSelf: 'center',
        width: '100%',
        padding: 12,
        background: '#fff',
        borderRadius: 14,
        boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12
      }}
    >
      <div style={{ fontSize: 13 }}>
        <strong>Proposal</strong>
        <span style={{ marginLeft: 6, opacity: 0.65 }}>{formatTime(createdAt)}</span>
      </div>
      {outcome ? (
        <span style={{ fontSize: 12, opacity: 0.75 }}>{outcome === 'agreed' ? 'Agreed' : 'Declined'}</span>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" disabled={busy} onClick={() => onDecide('agree')} style={primaryButton}>
            Agree
          </button>
          <button type="button" disabled={busy} onClick={() => onDecide('decline')} style={ghostButton}>
            Decline
          </button>
        </div>
      )}
    </div>
  );
};

const primaryButton: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 8,
  border: 'none',
  background: '#1a1a1a',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 13
};

const ghostButton: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 8,
  border: '1px solid rgba(0,0,0,0.15)',
  background: '#fff',
  color: '#1a1a1a',
  cursor: 'pointer',
  fontSize: 13
};
