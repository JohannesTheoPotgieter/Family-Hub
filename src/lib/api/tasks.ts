// Typed tasks client (Phase 5 tasks cutover).
//
// Wraps the /api/v2/tasks + task-lists + complete + avatar-points
// surface introduced in Phase 2. The complete endpoint returns the
// next due_date so chore-mode UI can show "due tomorrow" without a
// refetch.

import { apiGet, apiSend } from './client.ts';

export type TaskRow = {
  id: string;
  familyId: string;
  listId: string | null;
  parentTaskId: string | null;
  title: string;
  notes?: string;
  ownerMemberId: string;
  shared: boolean;
  dueDate: string | null;
  recurrence: 'none' | 'daily' | 'weekly' | 'custom';
  rruleText: string | null;
  priority: 'low' | 'normal' | 'high';
  rewardPoints: number;
  completed: boolean;
  completionCount: number;
  lastCompletedAt: string | null;
  archived: boolean;
  threadId: string | null;
  createdAt: string;
};

export type TaskList = { id: string; name: string; ordinal: number };

export type TaskInput = {
  title: string;
  notes?: string | null;
  listId?: string | null;
  parentTaskId?: string | null;
  ownerMemberId?: string;
  shared?: boolean;
  dueDate?: string | null;
  recurrence?: 'none' | 'daily' | 'weekly' | 'custom';
  rruleText?: string | null;
  priority?: 'low' | 'normal' | 'high';
  rewardPoints?: number;
};

export const fetchTaskLists = () => apiGet<{ lists: TaskList[] }>('/api/v2/task-lists');

export const fetchTasks = (
  params: { listId?: string; ownerMemberId?: string; includeArchived?: boolean } = {}
) => {
  const query = new URLSearchParams();
  if (params.listId) query.set('listId', params.listId);
  if (params.ownerMemberId) query.set('ownerMemberId', params.ownerMemberId);
  if (params.includeArchived) query.set('includeArchived', 'true');
  const suffix = query.toString();
  return apiGet<{ tasks: TaskRow[] }>(`/api/v2/tasks${suffix ? `?${suffix}` : ''}`);
};

export const createTask = (task: TaskInput) =>
  apiSend<{ task: TaskRow }>('/api/v2/tasks', 'POST', task);

export const updateTask = (taskId: string, patch: Partial<TaskInput> & { archived?: boolean }) =>
  apiSend<{ task: TaskRow }>(`/api/v2/tasks/${encodeURIComponent(taskId)}`, 'PATCH', patch);

export const deleteTask = (taskId: string) =>
  apiSend<{ ok: true }>(`/api/v2/tasks/${encodeURIComponent(taskId)}`, 'DELETE');

export const completeTask = (taskId: string) =>
  apiSend<{
    task: TaskRow;
    pointsAwarded: number;
    completionId: string;
    newDueDate: string | null;
  }>(`/api/v2/tasks/${encodeURIComponent(taskId)}/complete`, 'POST');

export const fetchMemberPoints = (memberId?: string, sinceIso?: string) => {
  const query = new URLSearchParams();
  if (memberId) query.set('memberId', memberId);
  if (sinceIso) query.set('since', sinceIso);
  const suffix = query.toString();
  return apiGet<{ memberId: string; total: number; since: string | null }>(
    `/api/v2/avatar/points${suffix ? `?${suffix}` : ''}`
  );
};
