import { CalendarScreen } from './components/family-hub/CalendarScreen';
import { HomeScreen } from './components/family-hub/HomeScreen';
import { LoginScreen } from './components/family-hub/LoginScreen';
import { MoneyScreen } from './components/family-hub/MoneyScreen';
import { MoreScreen } from './components/family-hub/MoreScreen';
import { SetupWizard } from './components/family-hub/SetupWizard';
import { TasksScreen } from './components/family-hub/TasksScreen';
import { useFamilyHubController } from './lib/family-hub/useFamilyHubController';
import { ToastViewport } from './ui/Toast';
import { ToastProvider } from './ui/useToasts';

const AppInner = () => {
  const controller = useFamilyHubController();
  const { state, activeTab, activeUser, visibleTabs, tabIcons, tabs, permissionBundle } = controller;

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
            <h1>{activeTab}</h1>
            <p className="muted">{activeUser?.name} · {permissionBundle.roleKey?.replace('_', ' ')}</p>
          </div>
          <div className="app-topbar-actions">
            {activeTab !== 'More' ? <button type="button" className="btn btn-ghost" onClick={() => controller.setActiveTab('More')}>Quick tools</button> : null}
            <button type="button" className="btn btn-ghost" onClick={controller.lockApp}>Lock</button>
          </div>
        </header>

        <section className="screen-content">
          {activeTab === 'Home' && <HomeScreen state={state} onCareAction={controller.onCareAction} onLock={controller.lockApp} />}
          {activeTab === 'Calendar' && (
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
          )}
          {activeTab === 'Tasks' && (
            <TasksScreen
              tasks={state.tasks.items}
              users={state.users}
              activeUserId={state.activeUserId}
              onAddTask={controller.addTask}
              onUpdateTask={controller.updateTask}
              onToggleTask={controller.toggleTask}
              canAssignTasks={permissionBundle.canAssignTasks}
              canEditTasks={permissionBundle.canEditTasks}
            />
          )}
          {activeTab === 'Money' && (
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
              moneyVisibility={permissionBundle.moneyVisibility}
              canEditMoney={permissionBundle.canEditMoney}
            />
          )}
          {activeTab === 'More' && (
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
          )}
        </section>

        <nav className="bottom-nav glass-card" aria-label="Primary">
          {tabs.filter((tab) => visibleTabs.includes(tab)).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`nav-item ${activeTab === tab ? 'is-active' : ''}`}
              onClick={() => controller.setActiveTab(tab)}
              aria-current={activeTab === tab ? 'page' : undefined}
            >
              <span className="nav-item-icon">{tabIcons[tab]}</span>
              <span>{tab}</span>
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
