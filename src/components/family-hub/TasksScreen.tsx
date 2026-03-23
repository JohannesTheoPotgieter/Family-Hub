import { useEffect, useMemo, useState } from 'react';
import { USERS, type UserId } from '../../lib/family-hub/constants';
import type { TaskItem } from '../../lib/family-hub/storage';
import type { AvatarGameState } from '../../domain/avatarTypes.ts';
import { ScreenIntro } from './BaselineScaffold';

type TasksScreenProps = {
  tasks: TaskItem[];
  users?: typeof USERS;
  activeUserId: UserId;
  avatarGame: AvatarGameState;
  onAddTask: (task: Omit<TaskItem, 'id' | 'completed'>) => void;
  onUpdateTask: (id: string, update: Omit<TaskItem, 'id' | 'completed'>) => void;
  onToggleTask: (id: string) => void;
  canAssignTasks?: boolean;
  canEditTasks?: boolean;
};

type GroupKey = 'overdue' | 'today' | 'upcoming' | 'waiting' | 'done';
type FilterKey = 'ready' | 'mine' | 'shared' | 'done' | 'all';

type DraftTask = {
  title: string;
  dueDate: string;
  shared: boolean;
  notes: string;
  ownerId: UserId;
  recurrence: 'none' | 'daily' | 'weekly';
};

const createEmptyDraft = (ownerId: UserId): DraftTask => ({ title: '', dueDate: '', shared: false, notes: '', ownerId, recurrence: 'none' });

const startOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const labelForTask = (task: TaskItem) => {
  if (!task.dueDate) return 'No date';
  const due = startOfDay(new Date(task.dueDate));
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (due.getTime() === today.getTime()) return 'Today';
  if (due.getTime() === tomorrow.getTime()) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-ZA', { month: 'short', day: 'numeric' }).format(due);
};

const belongsToGroup = (task: TaskItem, group: GroupKey) => {
  if (group === 'done') return task.completed;
  if (task.completed) return false;
  if (!task.dueDate) return group === 'waiting';
  const due = startOfDay(new Date(task.dueDate));
  const today = startOfDay(new Date());
  if (group === 'overdue') return due < today;
  if (group === 'today') return due.getTime() === today.getTime();
  if (group === 'upcoming') return due > today;
  return false;
};

const filterMatch = (task: TaskItem, filter: FilterKey, activeUserId: UserId) => {
  if (filter === 'all') return true;
  if (filter === 'shared') return task.shared;
  return task.ownerId === activeUserId;
};

const GROUP_ICONS: Record<GroupKey, string> = {
  overdue: '🚨', today: '🔥', upcoming: '📅', waiting: '⏳', done: '✅'
};

const getTaskEnergyLabel = (task: TaskItem, activeUserId: UserId) => {
  if (task.completed) return 'Completed';
  if (task.ownerId === activeUserId && (!task.dueDate || belongsToGroup(task, 'today') || belongsToGroup(task, 'overdue'))) return 'Best next move';
  if (task.shared) return 'Do together';
  if (belongsToGroup(task, 'overdue')) return 'Needs rescue';
  if (belongsToGroup(task, 'today')) return 'Ready today';
  if (belongsToGroup(task, 'upcoming')) return 'Coming up';
  return 'Can wait';
};

const getTaskActionLabel = (task: TaskItem, activeUserId: UserId) => {
  if (task.completed) return 'Done';
  if (task.shared) return 'Finish together';
  if (task.ownerId === activeUserId) return 'Mark done';
  return 'Help out';
};

export const TasksScreen = ({ tasks, users = USERS, activeUserId, avatarGame, onAddTask, onUpdateTask, onToggleTask, canAssignTasks = true, canEditTasks = true }: TasksScreenProps) => {
  const [filter, setFilter] = useState<FilterKey>('ready');
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftTask>(() => createEmptyDraft(activeUserId));
  const [celebration, setCelebration] = useState<{ title: string; detail: string } | null>(null);

  const activeUser = users.find((user) => user.id === activeUserId);
  const openTasks = useMemo(() => tasks.filter((task) => !task.completed), [tasks]);
  const myOpenTasks = useMemo(() => openTasks.filter((task) => task.ownerId === activeUserId), [openTasks, activeUserId]);
  const sharedOpenTasks = useMemo(() => openTasks.filter((task) => task.shared), [openTasks]);
  const taskChallenge = useMemo(() => avatarGame.familyChallenges.find((challenge) => challenge.category === 'tasks' && !challenge.completed) ?? avatarGame.familyChallenges.find((challenge) => challenge.category === 'tasks') ?? null, [avatarGame.familyChallenges]);
  const companion = avatarGame.companionsByUserId[activeUserId];

  const groups = useMemo(() => [
    { key: 'overdue' as const, label: 'Overdue', hint: 'Clear these first' },
    { key: 'today' as const, label: 'Today', hint: 'Do these first' },
    { key: 'upcoming' as const, label: 'Upcoming', hint: 'Next up' },
    { key: 'waiting' as const, label: 'Waiting', hint: 'No date yet' },
    { key: 'done' as const, label: 'Done', hint: 'Nice work' }
  ], []);

  const filteredTasks = useMemo(
    () => tasks.filter((task) => {
      if (filter === 'ready') return !task.completed && (belongsToGroup(task, 'overdue') || belongsToGroup(task, 'today') || (!task.dueDate && task.ownerId === activeUserId));
      if (filter === 'done') return task.completed;
      return filterMatch(task, filter, activeUserId);
    }),
    [tasks, filter, activeUserId]
  );

  const groupedTasks = useMemo(
    () => groups.map((group) => ({
      ...group,
      items: filteredTasks.filter((task) => belongsToGroup(task, group.key))
    })).filter((group) => group.items.length > 0),
    [filteredTasks, groups]
  );

  const stats = useMemo(() => ({
    today: filteredTasks.filter((task) => belongsToGroup(task, 'today') || belongsToGroup(task, 'overdue')).length,
    overdue: filteredTasks.filter((task) => belongsToGroup(task, 'overdue')).length,
    upcoming: filteredTasks.filter((task) => belongsToGroup(task, 'upcoming')).length,
    shared: filteredTasks.filter((task) => task.shared && !task.completed).length,
    done: filteredTasks.filter((task) => task.completed).length
  }), [filteredTasks]);

  useEffect(() => {
    if (!celebration) return;
    const timeout = window.setTimeout(() => setCelebration(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [celebration]);

  const openAdd = () => {
    setEditingTaskId(null);
    setDraft(createEmptyDraft(activeUserId));
    setComposerOpen(true);
  };

  const openEdit = (task: TaskItem) => {
    setEditingTaskId(task.id);
    setDraft({ title: task.title, dueDate: task.dueDate ?? '', shared: task.shared, notes: task.notes, ownerId: task.ownerId, recurrence: task.recurrence ?? 'none' });
    setComposerOpen(true);
  };

  const submitTask = () => {
    if (!draft.title.trim()) return;
    const payload = {
      title: draft.title.trim(),
      dueDate: draft.dueDate || null,
      shared: draft.shared,
      notes: draft.notes.trim(),
      ownerId: draft.ownerId,
      recurrence: draft.recurrence as 'none' | 'daily' | 'weekly',
      archived: false,
      completionCount: 0,
      completionHistory: []
    };
    if (editingTaskId) {
      onUpdateTask(editingTaskId, payload);
    } else {
      onAddTask(payload);
    }
    setComposerOpen(false);
    setEditingTaskId(null);
    setDraft(createEmptyDraft(activeUserId));
  };

  const handleToggleTask = (task: TaskItem) => {
    onToggleTask(task.id);
    if (task.completed) return;
    const rewardLabel = task.shared ? '+1 family star · +6 coins' : '+4 coins';
    setCelebration({
      title: task.shared ? 'Family win unlocked ✨' : 'Nice work! 🎉',
      detail: `${task.title} complete. ${rewardLabel} and your companion feels the momentum.`
    });
  };

  return (
    <section className="tasks-screen stack-lg">
      <ScreenIntro badge="Tasks" title="Family to-dos" subtitle="Fast, friendly task lists for what needs attention now, later, and together." />

      <section className="glass-panel tasks-toolbar" aria-label="Task filters and actions">
        <div className="tasks-toolbar-top">
          <div>
            <p className="eyebrow">Task snapshot</p>
            <h3>{activeUser ? `${activeUser.name}'s next wins` : 'Stay on top of home routines'}</h3>
            <p className="muted">Lead with the few tasks that matter right now, then let the rest stay quietly organized.</p>
          </div>
          <button className="btn btn-primary tasks-add-btn" data-testid="btn-add-task" onClick={openAdd} type="button" disabled={!canEditTasks}>
            + Add task
          </button>
        </div>
        <div className="tasks-focus-grid" aria-label="Task focus highlights">
          <article className="tasks-focus-card tasks-focus-card--primary">
            <span className="metric-label">Up next for you</span>
            <strong>{myOpenTasks[0]?.title ?? 'You are caught up'}</strong>
            <p className="muted">
              {myOpenTasks[0]
                ? `${labelForTask(myOpenTasks[0])} · ${myOpenTasks[0].shared ? 'Shared family win' : 'Personal win'}`
                : 'No personal chores are waiting right now.'}
            </p>
          </article>
          <article className="tasks-focus-card">
            <span className="metric-label">Family quest</span>
            <strong>{taskChallenge ? `${taskChallenge.progressValue}/${taskChallenge.targetValue}` : 'No quest yet'}</strong>
            <p className="muted">{taskChallenge ? `${taskChallenge.title} · reward: ${taskChallenge.rewardType.replace('_', ' ')}` : 'Shared progress will appear here.'}</p>
          </article>
          <article className="tasks-focus-card">
            <span className="metric-label">Companion boost</span>
            <strong>{companion ? `Lv ${companion.level} · ${companion.mood}` : 'Ready to cheer'}</strong>
            <p className="muted">{companion ? `${companion.name} has ${companion.coins} coins and ${companion.stars} stars.` : 'Task wins feed visible momentum.'}</p>
          </article>
        </div>
        <div className="tasks-summary-grid">
          <article className="tasks-summary-card">
            <span className="metric-label">Due now</span>
            <strong>{stats.today}</strong>
          </article>
          <article className="tasks-summary-card">
            <span className="metric-label">Overdue</span>
            <strong>{stats.overdue}</strong>
          </article>
          <article className="tasks-summary-card">
            <span className="metric-label">Upcoming</span>
            <strong>{stats.upcoming}</strong>
          </article>
          <article className="tasks-summary-card">
            <span className="metric-label">Shared</span>
            <strong>{stats.shared}</strong>
          </article>
        </div>
        <div className="tasks-filter-row" role="tablist" aria-label="Task filters">
          {(['ready', 'mine', 'shared', 'done', 'all'] as const).map((f) => (
            <button
              key={f}
              className={`tasks-filter-chip ${filter === f ? 'is-active' : ''}`}
              data-testid={`filter-${f}`}
              onClick={() => setFilter(f)}
              type="button"
            >
              {f === 'ready' ? '⚡ Ready now' : f === 'mine' ? '👤 Mine' : f === 'shared' ? '👥 Shared' : f === 'done' ? '✅ Done' : '📋 All'}
            </button>
          ))}
        </div>
        <div className="tasks-management-row">
          <span className="route-pill">{sharedOpenTasks.length} shared open</span>
          <span className="route-pill">{myOpenTasks.length} for you</span>
          <span className="route-pill">{canAssignTasks ? 'Adults can reassign' : 'Child-friendly view'}</span>
        </div>
      </section>

      {celebration ? (
        <section className="glass-panel task-celebration-banner" aria-label="Task completion feedback">
          <div>
            <p className="eyebrow">Completion moment</p>
            <h3>{celebration.title}</h3>
            <p className="muted">{celebration.detail}</p>
          </div>
          <span className="task-celebration-emoji" aria-hidden="true">🎊</span>
        </section>
      ) : null}

      {composerOpen && (
        <section className="glass-panel task-composer stack" aria-label={editingTaskId ? 'Edit task' : 'Add task'}>
          <h3>{editingTaskId ? 'Edit task' : 'New task'}</h3>
          <p className="muted">Keep it lightweight: a title, an owner, and only the details the family really needs.</p>
          <input
            aria-label="Task title"
            placeholder="What needs to happen?"
            value={draft.title}
            autoFocus
            data-testid="input-task-title"
            onChange={(event) => setDraft((c) => ({ ...c, title: event.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && submitTask()}
          />
          <div className="task-composer-row">
            <label className="task-field">
              <span>Due date</span>
              <input
                type="date"
                value={draft.dueDate}
                data-testid="input-task-date"
                onChange={(event) => setDraft((c) => ({ ...c, dueDate: event.target.value }))}
              />
            </label>
            {draft.dueDate && (
              <button
                className="btn btn-ghost task-no-date"
                type="button"
                onClick={() => setDraft((c) => ({ ...c, dueDate: '' }))}
              >
                Clear
              </button>
            )}
          </div>
          <label className="task-field">
            <span>Owner</span>
            <select
              value={draft.ownerId}
              data-testid="select-task-owner"
              disabled={!canAssignTasks}
              onChange={(event) => setDraft((c) => ({ ...c, ownerId: event.target.value as UserId }))}
            >
              {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </label>
          {!canAssignTasks ? <p className="muted">Tasks stay assigned to you here so finishing them stays frictionless.</p> : <p className="muted">Adults can assign directly while keeping titles short and easy for kids to scan.</p>}
          <label className="task-field">
            <span>Repeats</span>
            <select value={draft.recurrence} onChange={(event) => setDraft((c) => ({ ...c, recurrence: event.target.value as DraftTask['recurrence'] }))}>
              <option value="none">One time</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          <textarea
            className="task-notes"
            aria-label="Task notes"
            placeholder="Notes (optional)"
            value={draft.notes}
            data-testid="input-task-notes"
            onChange={(event) => setDraft((c) => ({ ...c, notes: event.target.value }))}
          />
          <label className="task-shared-toggle">
            <input
              type="checkbox"
              checked={draft.shared}
              data-testid="toggle-task-shared"
              onChange={(event) => setDraft((c) => ({ ...c, shared: event.target.checked }))}
            />
            <span>Share with everyone</span>
          </label>
          <div className="task-composer-actions">
            <button className="btn btn-ghost" type="button" onClick={() => setComposerOpen(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!draft.title.trim() || !canEditTasks}
              data-testid="btn-submit-task"
              onClick={submitTask}
            >
              {editingTaskId ? 'Save changes' : 'Add task'}
            </button>
          </div>
        </section>
      )}

      {filteredTasks.length === 0 ? (
        <section className="glass-panel tasks-empty stack" aria-label="Empty tasks">
          <p className="tasks-empty-emoji" aria-hidden="true">🫧</p>
          <h3>Nothing here yet</h3>
          <p className="muted">This is where your household keeps track of chores, errands, and shared responsibilities.</p>
          <button className="btn btn-primary" data-testid="btn-add-first-task" type="button" onClick={openAdd}>
            Add first task
          </button>
        </section>
      ) : (
        <div className="stack tasks-groups" aria-label="Task groups">
          {groupedTasks.map((group) => (
            <section key={group.key} className="glass-panel task-group stack-sm" aria-label={group.label}>
              <header className="section-head">
                <div>
                  <h3>{GROUP_ICONS[group.key]} {group.label}</h3>
                  <p className="muted">{group.hint}</p>
                </div>
                <span className="section-tip">{group.items.length} {group.items.length === 1 ? 'task' : 'tasks'}</span>
              </header>
              {group.items.map((task) => {
                const owner = users.find((user) => user.id === task.ownerId);
                return (
                  <article
                    key={task.id}
                    className={`task-item ${task.completed ? 'is-done' : ''} ${task.ownerId === activeUserId ? 'is-owned' : ''} ${task.shared ? 'is-shared' : ''}`}
                    data-testid={`task-item-${task.id}`}
                  >
                    <button
                      type="button"
                      className={`task-check ${task.completed ? 'is-done' : ''}`}
                      onClick={() => handleToggleTask(task)}
                      aria-label={task.completed ? `Mark "${task.title}" incomplete` : `Complete "${task.title}"`}
                    >
                      {task.completed ? '✓' : ''}
                    </button>
                    <div className="task-main">
                      <div className="task-title-row">
                        <div>
                          <p className="task-kicker">{getTaskEnergyLabel(task, activeUserId)}</p>
                          <p className="task-title">{task.title}</p>
                        </div>
                        {owner ? <span className="route-pill">{task.ownerId === activeUserId ? 'For you' : owner.name}</span> : null}
                      </div>
                      <div className="task-meta">
                        <span className="route-pill">{labelForTask(task)}</span>
                        {task.shared && <span className="route-pill">👥 Shared</span>}
                        {task.recurrence && task.recurrence !== 'none' && <span className="route-pill">🔁 {task.recurrence}</span>}
                        {(task.completionCount ?? 0) > 0 && <span className="route-pill">🏅 {task.completionCount} done</span>}
                      </div>
                      {task.notes ? <p className="muted">{task.notes}</p> : null}
                      {!task.completed ? <p className="task-card-tip">{getTaskActionLabel(task, activeUserId)}</p> : null}
                    </div>
                    {!task.completed && (
                      <button
                        className="btn btn-ghost task-edit-btn"
                        data-testid={`btn-edit-task-${task.id}`}
                        type="button"
                        onClick={() => openEdit(task)}
                      >
                        Open
                      </button>
                    )}
                  </article>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </section>
  );
};
