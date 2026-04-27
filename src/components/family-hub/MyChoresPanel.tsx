// MyChoresPanel — chore-mode UI for the active member (Phase 5 tasks
// cutover). Renders the active member's open tasks with inline complete
// + reward-points total. Returns null in guest mode so the existing
// prototype TasksScreen below stays unchanged.
//
// Plan §2.4 calls for a kid-focused TasksScreen variant when the role
// is child_limited; this component is the cutover-friendly equivalent
// that works for every role and stacks above the prototype list.

import { useState } from 'react';
import { useSession } from '../../lib/auth/SessionProvider.tsx';
import { useMyTasks } from '../../hooks/useMyTasks.ts';
import { completeTask, type TaskRow } from '../../lib/api/tasks.ts';

const formatDue = (iso: string | null) => {
  if (!iso) return 'no due date';
  const day = iso.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (day === today) return 'today';
  if (day < today) return 'overdue';
  return new Date(iso).toLocaleDateString('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
};

const priorityChip = (priority: TaskRow['priority']) => {
  switch (priority) {
    case 'high':
      return { label: 'high', bg: 'rgba(220,53,69,0.12)', fg: '#a31d2c' };
    case 'low':
      return { label: 'low', bg: 'rgba(0,0,0,0.06)', fg: 'rgba(0,0,0,0.55)' };
    default:
      return null;
  }
};

export const MyChoresPanel = () => {
  const session = useSession();
  const enabled = session.kind === 'authenticated';
  const memberId = session.kind === 'authenticated' ? session.session.member.id : undefined;
  const tasks = useMyTasks({ enabled, memberId });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!enabled) return null;
  if (tasks.kind === 'loading') return <Shell>Loading your chores…</Shell>;
  if (tasks.kind === 'guest') return null;
  if (tasks.kind === 'error') return <Shell tone="error">Couldn't load chores: {tasks.message}</Shell>;

  const live = tasks.tasks.filter((t) => !t.completed);

  if (live.length === 0) {
    return (
      <Shell tone="ok">
        <strong>All done.</strong>{' '}
        <span style={{ opacity: 0.75 }}>
          {tasks.pointsTotal > 0 ? `${tasks.pointsTotal} points earned to date.` : 'Nothing on your list right now.'}
        </span>
      </Shell>
    );
  }

  const onComplete = async (taskId: string) => {
    setBusyId(taskId);
    setFeedback(null);
    try {
      const result = await completeTask(taskId);
      const earned = result.pointsAwarded;
      setFeedback(
        earned > 0
          ? `+${earned} ${earned === 1 ? 'point' : 'points'}${result.newDueDate ? ` · next time ${formatDue(result.newDueDate)}` : ''}`
          : result.newDueDate
            ? `Done — next time ${formatDue(result.newDueDate)}`
            : 'Done.'
      );
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Could not complete.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Shell>
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 12
        }}
      >
        <strong style={{ fontSize: 16 }}>Your chores</strong>
        <span style={{ fontSize: 12, opacity: 0.65 }}>
          {tasks.pointsTotal} {tasks.pointsTotal === 1 ? 'point' : 'points'} earned
        </span>
      </header>

      {feedback && (
        <div style={{ marginBottom: 12, fontSize: 13, opacity: 0.85 }}>{feedback}</div>
      )}

      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}
      >
        {live.map((task) => {
          const chip = priorityChip(task.priority);
          return (
            <li
              key={task.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 12px',
                background: '#fff',
                borderRadius: 12,
                boxShadow: '0 1px 0 rgba(0,0,0,0.04)'
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{task.title}</div>
                <div style={{ fontSize: 12, opacity: 0.65, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span>due {formatDue(task.dueDate)}</span>
                  {task.rewardPoints > 0 ? <span>· +{task.rewardPoints}</span> : null}
                  {task.recurrence !== 'none' ? <span>· {task.recurrence}</span> : null}
                  {chip ? (
                    <span
                      style={{
                        marginLeft: 4,
                        fontSize: 11,
                        padding: '2px 6px',
                        borderRadius: 999,
                        background: chip.bg,
                        color: chip.fg
                      }}
                    >
                      {chip.label}
                    </span>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onComplete(task.id)}
                disabled={busyId === task.id}
                style={primaryButton}
              >
                Done
              </button>
            </li>
          );
        })}
      </ul>
    </Shell>
  );
};

const Shell = ({
  children,
  tone
}: {
  children: React.ReactNode;
  tone?: 'ok' | 'error';
}) => (
  <section
    aria-label="My chores"
    style={{
      padding: 16,
      borderRadius: 16,
      marginBottom: 16,
      background:
        tone === 'error'
          ? 'rgba(220,53,69,0.08)'
          : tone === 'ok'
            ? 'rgba(0,150,80,0.08)'
            : 'rgba(0,0,0,0.03)'
    }}
  >
    {children}
  </section>
);

const primaryButton: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 8,
  border: 'none',
  background: '#1a1a1a',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 13
};
