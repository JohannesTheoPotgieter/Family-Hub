import type { Tab } from '../lib/family-hub/constants.ts';
import { APP_ROUTES } from '../config/routes.ts';
import { TABS } from '../lib/family-hub/constants.ts';


export const getRouteDefinition = (tab: Tab) => APP_ROUTES[tab];

export const getVisibleRoutes = (visibleTabs: Tab[]) => TABS.map((tab) => APP_ROUTES[tab]).filter((route) => route.isVisible({ visibleTabs }));

export const resolveActiveTab = (activeTab: Tab, visibleTabs: Tab[]): Tab => {
  if (visibleTabs.includes(activeTab)) return activeTab;
  return visibleTabs[0] ?? 'Home';
};

export const getInitialRouteFromLocation = (search: string): Tab => {
  const raw = new URLSearchParams(search).get('tab');
  return raw && TABS.includes(raw as Tab) ? (raw as Tab) : 'Home';
};
