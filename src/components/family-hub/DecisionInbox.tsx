// Decision Inbox (Phase 5 cutover, pillar 1).
//
// The home-screen "3 things waiting on you" surface. Renders four
// stacked sections — proposals to approve, tasks due today, bills due
// this week, calendar conflicts. Tap a proposal → agree/decline inline
// (calls /api/proposals/:id/decision).
//
// Dual-mode parent: when the session isn't authenticated yet, the
// component returns null so the prototype HomeScreen renders unchanged.
// This is the first piece of UI to actually call the auth-gated /api/v2
// surface — every other client path still goes through localStorage
// until each pillar is cut over.

import { useState } from 'react';
import { useSession } from '../../lib/auth/SessionProvider.tsx';
import { useInbox } from '../../hooks/useInbox.ts';
import { decideOnProposal, type InboxProposal } from '../../lib/api/inbox.ts';

const formatRelative = (iso: string | null) => {
  if (!iso) return 'no due date';
  const day = iso.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (day === today) return 'today';
  if (day < today) return 'overdue';
  return new Date(iso).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
};

const formatMoney = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency }).format(cents / 100);

const proposalSummary = (p: InboxProposal) => {
  const c = p.change as Record<string, unknown>;
  switch (p.kind) {
    case 'event_move':
      return `Move event to ${(c.newStartIso as string)?.slice(0, 16) ?? 'a new time'}`;
    case 'event_cancel':
      return 'Cancel this event';
    case 'task_assignee_swap':
      return 'Swap chore ownership';
    case 'task_reschedule_due':
      return c.newDueDate ? `Reschedule to ${c.newDueDate}` : 'Clear due date';
    case 'budget_category_shift':
      return `Move ${formatMoney((c.amountCents as number) ?? 0, (c.currency as string) ?? 'ZAR')} between categories`;
    case 'bill_extra_payment':
      return `Add extra ${formatMoney((c.extraAmountCents as number) ?? 0, (c.currency as string) ?? 'ZAR')} payment`;
    case 'debt_acceleration':
      return `Accelerate debt by ${formatMoney((c.monthlyExtraCents as number) ?? 0, (c.currency as string) ?? 'ZAR')}/mo`;
    case 'goal_contribution':
      return `Contribute ${formatMoney((c.amountCents as number) ?? 0, (c.currency as string) ?? 'ZAR')}`;
    case 'goal_create':
      return `New goal: ${(c.title as string) ?? 'Savings goal'}`;
    default:
      return p.kind.replace(/_/g, ' ');
  }
};

export const DecisionInbox = () => {
  const session = useSession();
  const enabled = session.kind === 'authenticated';
  const inbox = useInbox({ enabled });
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!enabled) return null;
  if (inbox.kind === 'loading') {
    return (
      <section
        aria-label="Decision inbox"
        style={{
          padding: 16,
          borderRadius: 16,
          background: 'rgba(0,0,0,0.03)',
          marginBottom: 16
        }}
      >
        Loading what needs you…
      </section>
    );
  }
  if (inbox.kind === 'error') {
    return (
      <section
        aria-label="Decision inbox"
        style={{
          padding: 16,
          borderRadius: 16,
          background: 'rgba(220,53,69,0.08)',
          marginBottom: 16
        }}
      >
        Couldn't load your inbox: {inbox.message}
      </section>
    );
  }
  if (inbox.kind === 'guest') return null;

  const { proposals, tasks, bills, conflicts } = inbox.payload;
  const total = proposals.length + tasks.length + bills.length + conflicts.length;
  if (total === 0) {
    return (
      <section
        aria-label="Decision inbox"
        style={{
          padding: 16,
          borderRadius: 16,
          background: 'rgba(0,150,80,0.08)',
          marginBottom: 16
        }}
      >
        <strong>You're all clear.</strong>{' '}
        <span style={{ opacity: 0.7 }}>Nothing waiting on you right now.</span>
      </section>
    );
  }

  const onDecide = async (proposalId: string, decision: 'agree' | 'decline') => {
    setBusyId(proposalId);
    try {
      await decideOnProposal(proposalId, decision);
      // Realtime broadcast from the server will refresh the inbox; in the
      // meantime the busy state suppresses double-clicks.
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      aria-label="Decision inbox"
      style={{
        padding: 16,
        borderRadius: 16,
        background: 'rgba(0,0,0,0.03)',
        marginBottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between'
        }}
      >
        <strong style={{ fontSize: 16 }}>Waiting on you</strong>
        <span style={{ fontSize: 13, opacity: 0.65 }}>
          {total} {total === 1 ? 'item' : 'items'}
        </span>
      </header>

      {proposals.length > 0 && (
        <ul style={listStyle}>
          {proposals.map((p) => (
            <li key={p.id} style={rowStyle}>
              <div>
                <div style={{ fontWeight: 600 }}>{proposalSummary(p)}</div>
                <div style={{ fontSize: 12, opacity: 0.65 }}>
                  expires {formatRelative(p.expiresAt)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => onDecide(p.id, 'agree')}
                  style={primaryButton}
                >
                  Agree
                </button>
                <button
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => onDecide(p.id, 'decline')}
                  style={secondaryButton}
                >
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {tasks.length > 0 && (
        <ul style={listStyle}>
          {tasks.map((t) => (
            <li key={t.id} style={rowStyle}>
              <div>
                <div style={{ fontWeight: 600 }}>{t.title}</div>
                <div style={{ fontSize: 12, opacity: 0.65 }}>
                  due {formatRelative(t.dueDate)}
                  {t.rewardPoints > 0 ? ` · +${t.rewardPoints} points` : ''}
                </div>
              </div>
              <span style={pillStyle}>chore</span>
            </li>
          ))}
        </ul>
      )}

      {bills.length > 0 && (
        <ul style={listStyle}>
          {bills.map((b) => (
            <li key={b.id} style={rowStyle}>
              <div>
                <div style={{ fontWeight: 600 }}>{b.title}</div>
                <div style={{ fontSize: 12, opacity: 0.65 }}>
                  {formatMoney(b.amountCents, b.currency)} · due {formatRelative(b.dueDate)}
                </div>
              </div>
              <span style={pillStyle}>bill</span>
            </li>
          ))}
        </ul>
      )}

      {conflicts.length > 0 && (
        <ul style={listStyle}>
          {conflicts.map((c, i) => (
            <li key={`${c.a.id}-${c.b.id}-${i}`} style={rowStyle}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {c.a.title ?? 'Event'} · {c.b.title ?? 'Event'}
                </div>
                <div style={{ fontSize: 12, opacity: 0.65 }}>
                  overlap on {new Date(c.a.start.iso).toLocaleDateString('en-ZA')}
                  {c.sharedAttendeeIds.length > 0 ? ' · same person' : ''}
                </div>
              </div>
              <span style={pillStyle}>conflict</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 8
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '10px 12px',
  background: '#fff',
  borderRadius: 12,
  boxShadow: '0 1px 0 rgba(0,0,0,0.04)'
};

const pillStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  padding: '4px 8px',
  borderRadius: 999,
  background: 'rgba(0,0,0,0.06)',
  color: 'rgba(0,0,0,0.7)'
};

const primaryButton: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 8,
  border: 'none',
  background: '#1a1a1a',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 13
};

const secondaryButton: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid rgba(0,0,0,0.15)',
  background: '#fff',
  color: '#1a1a1a',
  cursor: 'pointer',
  fontSize: 13
};
