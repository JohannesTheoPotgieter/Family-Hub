import { CalendarScreen } from './components/family-hub/CalendarScreen';
import { HomeScreen } from './components/family-hub/HomeScreen';
import { LoginScreen } from './components/family-hub/LoginScreen';
import { MoneyScreen } from './components/family-hub/MoneyScreen';
import { MoreScreen } from './components/family-hub/MoreScreen';
import { SetupWizard } from './components/family-hub/SetupWizard';
import { TasksScreen } from './components/family-hub/TasksScreen';
import { getRouteDefinition, getVisibleRoutes } from './routing/routeHelpers';
import { RoleGuard } from './routing/RoleGuard';
import { useFamilyHubController } from './lib/family-hub/useFamilyHubController';
import { ToastViewport } from './ui/Toast';
import { ToastProvider } from './ui/useToasts';

const AppInner = () => {
  const controller = useFamilyHubController();
  const { state, activeTab, activeUser, visibleTabs, permissionBundle, tabIcons } = controller;
  const activeRoute = getRouteDefinition(activeTab);
  const visibleRoutes = getVisibleRoutes(visibleTabs);

  if (state.setupUserId) {
    const user = state.users.find((item) => item.id === state.setupUserId);
    if (!user) return null;
    return <SetupWizard user={user} onFinish={(pin, profile) => controller.completeSetup(user.id, pin, profile)} />;
  }

  if (!state.activeUserId) {
    return (
      <LoginScreen
        users={state.users}
        hasPin={(id) => Boolean(state.userPins[id])}
        isSetupComplete={(id) => state.setupCompleted[id]}
        onUnlock={controller.unlockUser}
        onStartSetup={controller.startSetup}
        onRestartSetup={controller.restartSetup}
      />
    );
  }

  return (
    <main className="app-shell">
      <div className="bg-orb bg-orb--top" />
      <div className="bg-orb bg-orb--bottom" />
      <div className="app-phone-frame">
        <header className="app-topbar glass-card">
          <div>
            <p className="eyebrow">Family Hub</p>
            <h1>{activeRoute.label}</h1>
            <p className="muted">{activeRoute.subtitle}</p>
            <p className="topbar-meta">{activeUser?.name} · Household profile</p>
          </div>
          <div className="app-topbar-actions">
            <button type="button" className="btn btn-ghost" onClick={controller.lockApp}>Lock</button>
          </div>
        </header>

        <section className="screen-content">
          <RoleGuard allowed={activeTab === 'Home'}>
            <HomeScreen state={state} onCareAction={controller.onCareAction} onLock={controller.lockApp} />
          </RoleGuard>

          <RoleGuard allowed={activeTab === 'Calendar'}>
            <CalendarScreen
              internalEvents={state.calendar.events}
              externalEvents={state.calendar.externalEvents}
              calendars={state.calendar.calendars}
              lastSyncedAtIsoByProvider={state.calendar.lastSyncedAtIsoByProvider}
              onAddEvent={controller.addEvent}
              onSyncProvider={controller.applyCalendarSync}
              onClearProviderData={controller.clearCalendarProviderData}
              canConnectCalendar={permissionBundle.canConnectCalendar}
              canEditCalendar={permissionBundle.canEditCalendar}
            />
          </RoleGuard>

          <RoleGuard allowed={activeTab === 'Tasks'}>
            <TasksScreen
              tasks={state.tasks.items}
              users={state.users}
              activeUserId={state.activeUserId}
              avatarGame={state.avatarGame}
              onAddTask={controller.addTask}
              onUpdateTask={controller.updateTask}
              onToggleTask={controller.toggleTask}
              canAssignTasks={permissionBundle.canAssignTasks}
              canEditTasks={permissionBundle.canEditTasks}
            />
          </RoleGuard>

          <RoleGuard allowed={activeTab === 'Money'}>
            <MoneyScreen
              money={state.money}
              onAddBill={controller.addBill}
              onUpdateBill={controller.updateBill}
              onDuplicateBill={controller.duplicateBill}
              onMarkBillPaid={controller.markBillPaid}
              onAddTransaction={controller.addTransaction}
              onImportTransactions={controller.importTransactions}
              onUpdateTransaction={controller.updateTransaction}
              onAddBudget={controller.saveBudget}
              onUpdateBudget={(id, update) => controller.setState((current) => ({ ...current, money: { ...current.money, budgets: current.money.budgets.map((budget) => (budget.id === id ? { ...budget, ...update } : budget)) } }))}
              onDeleteBill={controller.deleteBill}
              onDeleteTransaction={controller.deleteTransaction}
              onDeleteBudget={controller.deleteBudget}
              onAddPlannerItem={controller.addPlannerItem}
              onUpdatePlannerItem={controller.updatePlannerItem}
              onDeletePlannerItem={controller.deletePlannerItem}
              onSetPlannerOpeningBalance={controller.setPlannerOpeningBalance}
              moneyVisibility={permissionBundle.moneyVisibility}
              canEditMoney={permissionBundle.canEditMoney}
            />
          </RoleGuard>

          <RoleGuard allowed={activeTab === 'More'}>
            <MoreScreen
              users={state.users}
              activeUser={activeUser}
              activeUserId={state.activeUserId}
              canManageSensitiveData={permissionBundle.canExport}
              canResetApp={permissionBundle.canReset}
              canRestartSetup={permissionBundle.canRestartSetup}
              avatarGame={state.avatarGame}
              setupCompleted={state.setupCompleted}
              userPins={state.userPins}
              places={state.places}
              events={state.calendar.events}
              externalEvents={state.calendar.externalEvents}
              tasks={state.tasks.items}
              auditLog={state.auditLog}
              onCareAction={controller.onCareAction}
              onChangePin={controller.changePin}
              onAddPlace={controller.addPlace}
              onUpdatePlace={controller.updatePlace}
              onExportData={controller.exportData}
              onImportData={controller.importData}
              onResetData={controller.resetAppData}
              onUpdateSettings={controller.updateSettings}
              onLock={controller.lockApp}
              onRestartSetup={controller.restartSetup}
            />
          </RoleGuard>
        </section>

        <nav className="bottom-nav glass-card" aria-label="Primary">
          {visibleRoutes.map((route) => (
            <button
              key={route.tab}
              type="button"
              className={`nav-item ${activeTab === route.tab ? 'is-active' : ''}`}
              onClick={() => controller.setActiveTab(route.tab)}
              aria-current={activeTab === route.tab ? 'page' : undefined}
            >
              <span className="nav-item-icon">{tabIcons[route.tab] ?? route.icon}</span>
              <span>{route.label}</span>
            </button>
          ))}
        </nav>
      </div>
      <ToastViewport />
    </main>
  );
};

export const FamilyHubApp = () => (
  <ToastProvider>
    <AppInner />
  </ToastProvider>
);
