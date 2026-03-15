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

const emptyDraft: DraftTask = {
  title: '',
  dueDate: '',
  shared: false,
  notes: ''
};

const startOfDay = (date: Date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const labelForTask = (task: TaskItem) => {
  if (!task.dueDate) return 'No due date';
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

export const TasksScreen = ({ tasks, activeUserId, onAddTask, onUpdateTask, onToggleTask }: TasksScreenProps) => {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftTask>(emptyDraft);

  const groups = useMemo(
    () => [
      { key: 'today' as const, label: 'Today', hint: 'Do these first' },
      { key: 'upcoming' as const, label: 'Upcoming', hint: 'Next up' },
      { key: 'waiting' as const, label: 'Waiting', hint: 'No date yet' },
      { key: 'done' as const, label: 'Done', hint: 'Nice work' }
    ],
    []
  );

  const filteredTasks = useMemo(() => tasks.filter((task) => filterMatch(task, filter, activeUserId)), [tasks, filter, activeUserId]);

  const groupedTasks = useMemo(
    () =>
      groups.map((group) => ({
        ...group,
        items: filteredTasks.filter((task) => belongsToGroup(task, group.key))
      })),
    [filteredTasks, groups]
  );

  const openAdd = () => {
    setEditingTaskId(null);
    setDraft(emptyDraft);
    setComposerOpen(true);
  };

  const openEdit = (task: TaskItem) => {
    setEditingTaskId(task.id);
    setDraft({
      title: task.title,
      dueDate: task.dueDate ?? '',
      shared: task.shared,
      notes: task.notes
    });
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

  const hasAnyTasks = filteredTasks.length > 0;

  return (
    <section className="tasks-screen stack-lg">
      <ScreenIntro badge="Flow" title="Tasks" subtitle="Keep family to-dos clear, calm, and easy to complete." />

      <section className="glass-panel tasks-toolbar" aria-label="Task filters and actions">
        <div className="tasks-filter-row" role="tablist" aria-label="Task filters">
          <button className={`tasks-filter-chip ${filter === 'mine' ? 'is-active' : ''}`} onClick={() => setFilter('mine')} type="button">
            Mine
          </button>
          <button className={`tasks-filter-chip ${filter === 'shared' ? 'is-active' : ''}`} onClick={() => setFilter('shared')} type="button">
            Shared
          </button>
          <button className={`tasks-filter-chip ${filter === 'all' ? 'is-active' : ''}`} onClick={() => setFilter('all')} type="button">
            All
          </button>
        </div>
        <button className="btn btn-primary tasks-add-btn" onClick={openAdd} type="button">
          + Add task
        </button>
      </section>

      {composerOpen ? (
        <section className="glass-panel task-composer stack" aria-label={editingTaskId ? 'Edit task' : 'Add task'}>
          <h3>{editingTaskId ? 'Edit task' : 'New task'}</h3>
          <input
            aria-label="Task title"
            placeholder="What needs to happen?"
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          />
          <div className="task-composer-row">
            <label className="task-field">
              <span>Due date</span>
              <input
                type="date"
                value={draft.dueDate}
                onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
              />
            </label>
            <button
              className={`btn btn-ghost task-no-date ${draft.dueDate === '' ? 'is-active' : ''}`}
              type="button"
              onClick={() => setDraft((current) => ({ ...current, dueDate: '' }))}
            >
              No due date
            </button>
          </div>
          <textarea
            className="task-notes"
            aria-label="Task notes"
            placeholder="Notes for the family (optional)"
            value={draft.notes}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
          />
          <label className="task-shared-toggle">
            <input
              type="checkbox"
              checked={draft.shared}
              onChange={(event) => setDraft((current) => ({ ...current, shared: event.target.checked }))}
            />
            <span>Share with everyone</span>
          </label>
          <div className="task-composer-actions">
            <button className="btn btn-ghost" type="button" onClick={() => setComposerOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" type="button" onClick={submitTask}>
              {editingTaskId ? 'Save task' : 'Add task'}
            </button>
          </div>
        </section>
      ) : null}

      {!hasAnyTasks ? (
        <section className="glass-panel tasks-empty stack" aria-label="Empty tasks">
          <p className="tasks-empty-emoji" aria-hidden="true">🫧</p>
          <h3>No tasks here yet</h3>
          <p className="muted">Start small and keep everyone in sync with one simple task.</p>
          <button className="btn btn-primary" type="button" onClick={openAdd}>
            Add first task
          </button>
        </section>
      ) : (
        <div className="stack tasks-groups" aria-label="Task groups">
          {groupedTasks.map((group) => (
            <section key={group.key} className="glass-panel task-group stack-sm" aria-label={group.label}>
              <header className="section-head">
                <h3>{group.label}</h3>
                <span className="section-tip">{group.hint}</span>
              </header>
              {group.items.length ? (
                group.items.map((task) => (
                  <article key={task.id} className={`task-item ${task.completed ? 'is-done' : ''}`}>
                    <button
                      type="button"
                      className={`task-check ${task.completed ? 'is-done' : ''}`}
                      onClick={() => onToggleTask(task.id)}
                      aria-label={task.completed ? `Mark ${task.title} as incomplete` : `Mark ${task.title} complete`}
                    >
                      {task.completed ? '✓' : ''}
                    </button>
                    <div className="task-main">
                      <p className="task-title">{task.title}</p>
                      <div className="task-meta">
                        <span className="route-pill">{labelForTask(task)}</span>
                        {task.shared ? <span className="route-pill">Shared</span> : <span className="route-pill">Mine</span>}
                      </div>
                      {task.notes ? <p className="muted">{task.notes}</p> : null}
                    </div>
                    {!task.completed ? (
                      <button className="btn btn-ghost task-edit-btn" type="button" onClick={() => openEdit(task)}>
                        Edit
                      </button>
                    ) : null}
                  </article>
                ))
              ) : (
                <p className="muted">Nothing in {group.label.toLowerCase()} right now.</p>
              )}
            </section>
          ))}
        </div>
      )}
    </section>
  );
};
