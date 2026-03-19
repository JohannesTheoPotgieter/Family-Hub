import type { FamilyHubState } from './storage';
import type { User } from './constants';
import { hasPermission } from './permissions';
import { getTodayIso } from './date';

export type HomeInsight = {
  title: string;
  detail: string;
  tone: 'calm' | 'warn' | 'celebrate';
};

export const buildHomeInsights = (state: FamilyHubState, activeUser: User | null): HomeInsight[] => {
  const openTasks = state.tasks.items.filter((task) => !task.completed);
  const childOwnedTasks = activeUser ? openTasks.filter((task) => task.ownerId === activeUser.id) : [];
  const overdueBills = state.money.bills.filter((bill) => !bill.paid && bill.dueDateIso < getTodayIso());
  const sharedTasks = openTasks.filter((task) => task.shared);
  const upcomingEvents = [...state.calendar.events, ...state.calendar.externalEvents].length;

  const insights: HomeInsight[] = [];

  insights.push({
    title: childOwnedTasks.length > 0 ? 'Your next step' : 'Steady home rhythm',
    detail: childOwnedTasks.length > 0 ? `${childOwnedTasks.length} task${childOwnedTasks.length === 1 ? '' : 's'} are waiting for you.` : 'You are caught up on your personal task list.',
    tone: childOwnedTasks.length > 0 ? 'warn' : 'celebrate'
  });

  insights.push({
    title: 'Family teamwork',
    detail: sharedTasks.length > 0 ? `${sharedTasks.length} shared task${sharedTasks.length === 1 ? '' : 's'} can be finished together.` : 'No shared tasks are waiting right now.',
    tone: sharedTasks.length > 0 ? 'calm' : 'celebrate'
  });

  if (hasPermission(activeUser, 'money_view')) {
    insights.push({
      title: overdueBills.length > 0 ? 'Money check-in' : 'Money is on track',
      detail: overdueBills.length > 0 ? `${overdueBills.length} bill${overdueBills.length === 1 ? '' : 's'} need attention.` : 'No overdue bills right now.',
      tone: overdueBills.length > 0 ? 'warn' : 'calm'
    });
  } else {
    insights.push({
      title: 'Plan ahead',
      detail: `${upcomingEvents} calendar item${upcomingEvents === 1 ? '' : 's'} are helping your week stay organised.`,
      tone: 'calm'
    });
  }

  return insights;
};
