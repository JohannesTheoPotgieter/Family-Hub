import { useMemo, useState } from 'react';
import type { UserId } from '../../lib/family-hub/constants';
import type { TaskItem } from '../../lib/family-hub/storage';
import { ScreenIntro } from './BaselineScaffold';

type TasksScreenProps = {
  tasks: TaskItem[];
  activeUserId: UserId;
  onAddTask: (task: Omit<TaskItem, 'id' | 'completed'>) => void;
  onUpdateTask: (id: string, update: Omit<TaskItem, 'id' | 'completed'>) => void;
  onToggleTask: (id: string) => void;
};

type GroupKey = 'today' | 'upcoming' | 'waiting' | 'done';
type FilterKey = 'mine' | 'shared' | 'all';

type DraftTask = {
  title: string;
  dueDate: string;
  shared: boolean;
  notes: string;
};

const emptyDraft: DraftTask = { title: '', dueDate: '', shared: false, notes: '' };

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
  if (group === 'today') return due <= today;
  if (group === 'upcoming') return due > today;
  return false;
};

const filterMatch = (task: TaskItem, filter: FilterKey, activeUserId: UserId) => {
  if (filter === 'all') return true;
  if (filter === 'shared') return task.shared;
  return task.ownerId === activeUserId;
};

const GROUP_ICONS: Record<GroupKey, string> = {
  today: '🔥', upcoming: '📅', waiting: '⏳', done: '✅'
};

export const TasksScreen = ({ tasks, activeUserId, onAddTask, onUpdateTask, onToggleTask }: TasksScreenProps) => {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftTask>(emptyDraft);

  const groups = useMemo(() => [
    { key: 'today' as const, label: 'Today', hint: 'Do these first' },
    { key: 'upcoming' as const, label: 'Upcoming', hint: 'Next up' },
    { key: 'waiting' as const, label: 'Waiting', hint: 'No date yet' },
    { key: 'done' as const, label: 'Done', hint: 'Nice work' }
  ], []);

  const filteredTasks = useMemo(
    () => tasks.filter((task) => filterMatch(task, filter, activeUserId)),
    [tasks, filter, activeUserId]
  );

  const groupedTasks = useMemo(
    () => groups.map((group) => ({
      ...group,
      items: filteredTasks.filter((task) => belongsToGroup(task, group.key))
    })).filter((group) => group.items.length > 0),
    [filteredTasks, groups]
  );

  const openAdd = () => {
    setEditingTaskId(null);
    setDraft(emptyDraft);
    setComposerOpen(true);
  };

  const openEdit = (task: TaskItem) => {
    setEditingTaskId(task.id);
    setDraft({ title: task.title, dueDate: task.dueDate ?? '', shared: task.shared, notes: task.notes });
    setComposerOpen(true);
  };

  const submitTask = () => {
    if (!draft.title.trim()) return;
    const payload = {
      title: draft.title.trim(),
      dueDate: draft.dueDate || null,
      shared: draft.shared,
      notes: draft.notes.trim(),
      ownerId: activeUserId
    };
    if (editingTaskId) {
      onUpdateTask(editingTaskId, payload);
    } else {
      onAddTask(payload);
    }
    setComposerOpen(false);
    setEditingTaskId(null);
    setDraft(emptyDraft);
  };

  return (
    <section className="tasks-screen stack-lg">
      <ScreenIntro badge="Tasks" title="Family to-dos" subtitle="Keep everyone in sync with shared and personal tasks." />

      <section className="glass-panel tasks-toolbar" aria-label="Task filters and actions">
        <div className="tasks-filter-row" role="tablist" aria-label="Task filters">
          {(['mine', 'shared', 'all'] as const).map((f) => (
            <button
              key={f}
              className={`tasks-filter-chip ${filter === f ? 'is-active' : ''}`}
              data-testid={`filter-${f}`}
              onClick={() => setFilter(f)}
              type="button"
            >
              {f === 'mine' ? '👤 Mine' : f === 'shared' ? '👥 Shared' : '📋 All'}
            </button>
          ))}
        </div>
        <button className="btn btn-primary tasks-add-btn" data-testid="btn-add-task" onClick={openAdd} type="button">
          + Add task
        </button>
      </section>

      {composerOpen && (
        <section className="glass-panel task-composer stack" aria-label={editingTaskId ? 'Edit task' : 'Add task'}>
          <h3>{editingTaskId ? '✏️ Edit task' : '✨ New task'}</h3>
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
              disabled={!draft.title.trim()}
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
          <h3>All clear</h3>
          <p className="muted">No tasks here yet. Start small — one task at a time.</p>
          <button className="btn btn-primary" data-testid="btn-add-first-task" type="button" onClick={openAdd}>
            Add first task
          </button>
        </section>
      ) : (
        <div className="stack tasks-groups" aria-label="Task groups">
          {groupedTasks.map((group) => (
            <section key={group.key} className="glass-panel task-group stack-sm" aria-label={group.label}>
              <header className="section-head">
                <h3>{GROUP_ICONS[group.key]} {group.label}</h3>
                <span className="section-tip">{group.items.length} {group.items.length === 1 ? 'task' : 'tasks'}</span>
              </header>
              {group.items.map((task) => (
                <article
                  key={task.id}
                  className={`task-item ${task.completed ? 'is-done' : ''}`}
                  data-testid={`task-item-${task.id}`}
                >
                  <button
                    type="button"
                    className={`task-check ${task.completed ? 'is-done' : ''}`}
                    onClick={() => onToggleTask(task.id)}
                    aria-label={task.completed ? `Mark "${task.title}" incomplete` : `Complete "${task.title}"`}
                  >
                    {task.completed ? '✓' : ''}
                  </button>
                  <div className="task-main">
                    <p className="task-title">{task.title}</p>
                    <div className="task-meta">
                      <span className="route-pill">{labelForTask(task)}</span>
                      {task.shared && <span className="route-pill">👥 Shared</span>}
                    </div>
                    {task.notes ? <p className="muted">{task.notes}</p> : null}
                  </div>
                  {!task.completed && (
                    <button
                      className="btn btn-ghost task-edit-btn"
                      data-testid={`btn-edit-task-${task.id}`}
                      type="button"
                      onClick={() => openEdit(task)}
                    >
                      Edit
                    </button>
                  )}
                </article>
              ))}
            </section>
          ))}
        </div>
      )}
    </section>
  );
};
