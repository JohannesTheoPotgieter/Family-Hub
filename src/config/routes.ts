import type { Tab } from '../lib/family-hub/constants';
export type AppRouteDefinition = {
  tab: Tab;
  label: string;
  subtitle: string;
  icon: string;
  isVisible: (context: { visibleTabs: Tab[] }) => boolean;
};

export const APP_ROUTES: Record<Tab, AppRouteDefinition> = {
  Home: {
    tab: 'Home',
    label: 'Home',
    subtitle: 'Your family command center for today.',
    icon: '🏡',
    isVisible: () => true
  },
  Calendar: {
    tab: 'Calendar',
    label: 'Calendar',
    subtitle: 'Plans, appointments, and shared schedules.',
    icon: '📅',
    isVisible: () => true
  },
  Tasks: {
    tab: 'Tasks',
    label: 'Tasks',
    subtitle: 'Simple chores and to-dos for the household.',
    icon: '✅',
    isVisible: () => true
  },
  Money: {
    tab: 'Money',
    label: 'Money',
    subtitle: 'Bills, budget, and day-to-day spending clarity.',
    icon: '💰',
    isVisible: ({ visibleTabs }) => visibleTabs.includes('Money')
  },
  More: {
    tab: 'More',
    label: 'More',
    subtitle: 'People, reminders, settings, and shared household tools.',
    icon: '⋯',
    isVisible: () => true
  }
};
