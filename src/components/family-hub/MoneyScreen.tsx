import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { MoneyServerPanel } from './MoneyServerPanel';
import { FoundationBlock, ScreenIntro } from './BaselineScaffold';
import { AmountText } from './money/AmountText';
import { BillStatusBadge } from './money/BillStatusBadge';
import { BudgetProgressCard } from './money/BudgetProgressCard';
import { EmptyStateCard } from './money/EmptyStateCard';
import { MoneyFilterBar } from './money/MoneyFilterBar';
import { MoneySectionHeader } from './money/MoneySectionHeader';
import { MoneyStatCard } from './money/MoneyStatCard';
import { MonthSwitcher } from './money/MonthSwitcher';
import { PlannerTab } from './money/PlannerTab';
import {
  DEFAULT_MONEY_CATEGORIES,
  formatCurrencyZAR,
  getCashflowPlan,
  formatDueDateFriendly,
  getBudgetStatus,
  getDueSoonBills,
  getMonthBills,
  getMonthIncomeTotal,
  getSafeToSpend,
  getSavingsProgress,
  getMonthSpendingTotal,
  getMonthTransactions,
  getNetBalance,
  getMoneyAccessModel,
  getOverdueBills,
  getRecentMoneyActivity,
  getTopSpendingCategory,
  toCents
} from '../../lib/family-hub/money';
import { buildBillPayload, buildBudgetPayload, buildTransactionPayload, createEmptyBillDraft, createEmptyTransactionDraft } from '../../lib/family-hub/moneyActions';
import { getTodayIso } from '../../lib/family-hub/date';
import {
  buildStatementImportNote,
  buildStatementPreview,
  createEmptyStatementColumnMapping,
  parseStatementText,
  type ParsedStatement,
  type StatementColumnMapping,
  type StatementColumnRole
} from '../../lib/family-hub/statementImport';
import type { Bill, Budget, MoneyState, MoneyTransaction } from '../../lib/family-hub/storage';
import { Modal } from '../../ui/Modal';
import { Progress } from '../../ui/Progress';
import { useToasts } from '../../ui/useToasts';

type Props = {
  money: MoneyState;
  onAddBill: (bill: Omit<Bill, 'id' | 'paid' | 'paidDateIso' | 'proofFileName' | 'linkedTransactionId'>) => void;
  onUpdateBill: (id: string, update: Partial<Bill>) => void;
  onDuplicateBill: (id: string) => void;
  onMarkBillPaid: (id: string, proofFileName: string) => void;
  onAddTransaction: (tx: Omit<MoneyTransaction, 'id'>) => void;
  onUpdateTransaction: (id: string, tx: Omit<MoneyTransaction, 'id'>) => void;
  onImportTransactions: (transactions: Array<Omit<MoneyTransaction, 'id'>>) => void;
  onAddBudget: (budget: Omit<Budget, 'id'>) => void;
  onUpdateBudget: (id: string, update: Partial<Budget>) => void;
  onDeleteBill: (id: string) => void;
  onDeleteTransaction: (id: string) => void;
  onDeleteBudget: (id: string) => void;
  onAddPlannerItem: (item: Omit<import('../../lib/family-hub/storage').PlannerLineItem, 'id'>) => void;
  onUpdatePlannerItem: (id: string, update: Partial<import('../../lib/family-hub/storage').PlannerLineItem>) => void;
  onDeletePlannerItem: (id: string) => void;
  onSetPlannerOpeningBalance: (amountCents: number) => void;
  moneyVisibility?: 'full' | 'summary' | 'hidden';
  canEditMoney?: boolean;
};

type MoneyTab = 'overview' | 'plan' | 'bills' | 'spending' | 'goals';
type StatementRowOverride = { include?: boolean; kind?: 'inflow' | 'outflow'; category?: string };

const tabOptions = [
  { key: 'overview', label: 'Overview' },
  { key: 'plan', label: 'Plan' },
  { key: 'bills', label: 'Bills' },
  { key: 'spending', label: 'Spending' },
  { key: 'goals', label: 'Goals' }
] as const satisfies Array<{ key: MoneyTab; label: string }>;

const statementColumnLabels: Array<{ role: StatementColumnRole; label: string; optional?: boolean }> = [
  { role: 'date', label: 'Date' },
  { role: 'description', label: 'Description' },
  { role: 'amount', label: 'Amount' },
  { role: 'debit', label: 'Debit', optional: true },
  { role: 'credit', label: 'Credit', optional: true },
  { role: 'direction', label: 'Type / direction', optional: true },
  { role: 'reference', label: 'Reference', optional: true },
  { role: 'balance', label: 'Balance', optional: true }
];

const sourceLabel = (source: MoneyTransaction['source']) => source === 'bill' ? 'Linked bill' : source === 'statement' ? 'Statement import' : 'Manual';
const getPreviousMonth = (monthIsoYYYYMM: string) => {
  const [year, month] = monthIsoYYYYMM.split('-').map(Number);
  const previous = new Date(year, (month ?? 1) - 2, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
};
const roundBudgetSuggestion = (amountCents: number) => Math.max(0, Math.ceil(amountCents / 5_000) * 5_000);
const getWeeklyAttentionLabel = (overdueCount: number, dueSoonCount: number, overBudgetCount: number) => {
  if (overdueCount > 0) return `${overdueCount} bill${overdueCount === 1 ? '' : 's'} need attention now.`;
  if (dueSoonCount > 0) return `${dueSoonCount} bill${dueSoonCount === 1 ? '' : 's'} are coming up this week.`;
  if (overBudgetCount > 0) return `${overBudgetCount} budget${overBudgetCount === 1 ? '' : 's'} need a closer look.`;
  return 'Everything looks steady right now.';
};

export const MoneyScreen = ({
  money,
  onAddBill,
  onUpdateBill,
  onDuplicateBill,
  onMarkBillPaid,
  onAddTransaction,
  onUpdateTransaction,
  onImportTransactions,
  onAddBudget,
  onUpdateBudget,
  onDeleteBill,
  onDeleteTransaction,
  onDeleteBudget,
  onAddPlannerItem,
  onUpdatePlannerItem,
  onDeletePlannerItem,
  onSetPlannerOpeningBalance,
  moneyVisibility = 'full',
  canEditMoney = true
}: Props) => {
  const { push } = useToasts();
  const [tab, setTab] = useState<MoneyTab>('overview');
  const [month, setMonth] = useState(getTodayIso().slice(0, 7));
  const [billStatusFilter, setBillStatusFilter] = useState<'all' | 'overdue' | 'dueSoon' | 'upcoming' | 'paid'>('all');
  const [billComposerOpen, setBillComposerOpen] = useState(false);
  const [transactionComposerOpen, setTransactionComposerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [txKindFilter, setTxKindFilter] = useState<'all' | 'inflow' | 'outflow'>('all');
  const [txCategoryFilter, setTxCategoryFilter] = useState('all');
  const [billDraft, setBillDraft] = useState(createEmptyBillDraft);
  const [billEditId, setBillEditId] = useState<string | null>(null);
  const [txEditId, setTxEditId] = useState<string | null>(null);
  const [txDraft, setTxDraft] = useState(createEmptyTransactionDraft);
  const [txDraftSource, setTxDraftSource] = useState<'manual' | 'statement'>('manual');
  const [budgetDraft, setBudgetDraft] = useState({ category: 'Groceries', amount: '' });
  const [statementModalOpen, setStatementModalOpen] = useState(false);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementError, setStatementError] = useState('');
  const [statementInfo, setStatementInfo] = useState('');
  const [statementParsed, setStatementParsed] = useState<ParsedStatement | null>(null);
  const [statementMapping, setStatementMapping] = useState<StatementColumnMapping>(() => createEmptyStatementColumnMapping());
  const [statementOverrides, setStatementOverrides] = useState<Record<string, StatementRowOverride>>({});
  const accessModel = useMemo(() => getMoneyAccessModel(moneyVisibility, canEditMoney), [moneyVisibility, canEditMoney]);
  const visibleTabOptions = useMemo(() => tabOptions.filter((option) => accessModel.allowedTabs.includes(option.key)), [accessModel.allowedTabs]);

  const todayIso = getTodayIso();
  const monthBills = useMemo(() => getMonthBills(money, month), [money, month]);
  const monthTransactions = useMemo(() => getMonthTransactions(money, month), [money, month]);
  const overdueBills = useMemo(() => getOverdueBills(monthBills, todayIso), [monthBills, todayIso]);
  const dueSoonBills = useMemo(() => getDueSoonBills(monthBills, todayIso), [monthBills, todayIso]);
  const paidBills = monthBills.filter((bill) => bill.paid);
  const upcomingBills = monthBills.filter((bill) => !bill.paid && !overdueBills.some((item) => item.id === bill.id) && !dueSoonBills.some((item) => item.id === bill.id));
  const income = getMonthIncomeTotal(money, month);
  const spending = getMonthSpendingTotal(money, month);
  const net = getNetBalance(money, month);
  const budgetStatus = getBudgetStatus(money, month);
  const topCategory = getTopSpendingCategory(money, month);
  const recentActivity = getRecentMoneyActivity(money);
  const cashflowPlan = useMemo(() => getCashflowPlan(money, month, { includePlannerItems: true }), [money, month]);
  const nextBillToPay = overdueBills[0] ?? dueSoonBills[0] ?? upcomingBills[0] ?? null;
  const safeToSpend = getSafeToSpend(money, month);
  const savingsGoals = getSavingsProgress(money);
  const availableAfterBills = income - spending - dueSoonBills.reduce((sum, bill) => sum + bill.amountCents, 0);
  const budgetUsedPercent = budgetStatus.totalLimitCents > 0 ? Math.min(100, Math.round((budgetStatus.totalSpentCents / budgetStatus.totalLimitCents) * 100)) : 0;
  const recurringBillsCount = monthBills.filter((bill) => bill.recurrence === 'monthly').length;
  const unpaidBillsTotal = [...overdueBills, ...dueSoonBills, ...upcomingBills].reduce((sum, bill) => sum + bill.amountCents, 0);
  const recentOutflowAverage = monthTransactions.filter((tx) => tx.kind === 'outflow').reduce((sum, tx) => sum + tx.amountCents, 0);

  const spendCategories = useMemo(
    () => Array.from(new Set([...DEFAULT_MONEY_CATEGORIES, 'Other', ...money.bills.map((bill) => bill.category), ...money.transactions.filter((tx) => tx.kind === 'outflow').map((tx) => tx.category)])),
    [money.bills, money.transactions]
  );
  const transactionCategories = useMemo(
    () => Array.from(new Set([...spendCategories, 'Income', 'Starting balance', ...money.transactions.map((tx) => tx.category)])),
    [money.transactions, spendCategories]
  );
  const currentMonthBudgets = useMemo(() => money.budgets.filter((budget) => budget.monthIsoYYYYMM === month), [money.budgets, month]);
  const starterBudgetSuggestions = useMemo(() => {
    const previousMonth = getPreviousMonth(month);
    const previousMonthTransactions = getMonthTransactions(money, previousMonth);

    return spendCategories
      .filter((category) => category !== 'Income' && category !== 'Starting balance')
      .filter((category) => !currentMonthBudgets.some((budget) => budget.category === category))
      .map((category) => {
        const baseline = Math.max(
          monthTransactions.filter((tx) => tx.kind === 'outflow' && tx.category === category).reduce((sum, tx) => sum + tx.amountCents, 0),
          previousMonthTransactions.filter((tx) => tx.kind === 'outflow' && tx.category === category).reduce((sum, tx) => sum + tx.amountCents, 0)
        );

        return {
          category,
          limitCents: baseline > 0 ? roundBudgetSuggestion(Math.round(baseline * 1.1)) : 0
        };
      })
      .filter((item) => item.limitCents > 0)
      .sort((a, b) => b.limitCents - a.limitCents)
      .slice(0, 6);
  }, [currentMonthBudgets, money, month, monthTransactions, spendCategories]);

  const visibleBills = monthBills.filter((bill) => {
    if (billStatusFilter === 'all') return true;
    if (billStatusFilter === 'paid') return bill.paid;
    if (billStatusFilter === 'overdue') return overdueBills.some((item) => item.id === bill.id);
    if (billStatusFilter === 'dueSoon') return dueSoonBills.some((item) => item.id === bill.id);
    return upcomingBills.some((item) => item.id === bill.id);
  });

  const visibleTransactions = monthTransactions.filter((tx) => {
    const kindOk = txKindFilter === 'all' ? true : tx.kind === txKindFilter;
    const categoryOk = txCategoryFilter === 'all' ? true : tx.category === txCategoryFilter;
    return kindOk && categoryOk && tx.title.toLowerCase().includes(search.toLowerCase());
  });

  const budgetCards = currentMonthBudgets.map((budget) => {
    const spentCents = monthTransactions.filter((tx) => tx.kind === 'outflow' && tx.category === budget.category).reduce((sum, tx) => sum + tx.amountCents, 0);
    return { budget, spentCents };
  });
  const topBudgetPressure = [...budgetCards].sort((a, b) => (b.spentCents - b.budget.limitCents) - (a.spentCents - a.budget.limitCents))[0] ?? null;
  const savingsTotalSaved = savingsGoals.reduce((sum, goal) => sum + goal.savedCents, 0);
  const savingsTotalTarget = savingsGoals.reduce((sum, goal) => sum + goal.targetCents, 0);
  const pressureItems = [
    ...overdueBills.map((bill) => ({ id: `overdue-${bill.id}`, title: bill.title, note: `Overdue · ${formatCurrencyZAR(bill.amountCents)}`, urgency: 'high' as const })),
    ...dueSoonBills.map((bill) => ({ id: `soon-${bill.id}`, title: bill.title, note: `Due ${formatDueDateFriendly(bill.dueDateIso)} · ${formatCurrencyZAR(bill.amountCents)}`, urgency: 'medium' as const })),
    ...(topBudgetPressure && topBudgetPressure.spentCents > topBudgetPressure.budget.limitCents ? [{ id: `budget-${topBudgetPressure.budget.id}`, title: `${topBudgetPressure.budget.category} budget`, note: `${formatCurrencyZAR(topBudgetPressure.spentCents - topBudgetPressure.budget.limitCents)} over plan`, urgency: 'medium' as const }] : [])
  ].slice(0, 4);

  const statementPreview = useMemo(
    () => statementParsed ? buildStatementPreview(statementParsed, statementMapping, money.transactions, transactionCategories) : null,
    [money.transactions, statementMapping, statementParsed, transactionCategories]
  );

  const statementReviewRows = useMemo(() => {
    if (!statementPreview) return [];
    return statementPreview.rows.map((row) => {
      const override = statementOverrides[row.id] ?? {};
      const kind = override.kind ?? row.kind;
      const category = override.category ?? row.category;
      const warnings = row.warnings.filter((warning) => {
        if (override.kind && warning === 'Check whether this was money in or money out.') return false;
        if (override.category && warning === 'Category may need a quick check.') return false;
        return true;
      });
      return { ...row, include: override.include ?? row.includeByDefault, kind, category, warnings, needsFix: !row.dateIso || row.amountCents === null || !kind };
    });
  }, [statementOverrides, statementPreview]);

  const statementImportableRows = statementReviewRows.filter((row) => row.include && !row.needsFix);
  const statementIncludedNeedsFixCount = statementReviewRows.filter((row) => row.include && row.needsFix).length;

  useEffect(() => {
    if (!accessModel.allowedTabs.includes(tab)) {
      setTab((accessModel.allowedTabs[0] ?? 'overview') as MoneyTab);
    }
  }, [accessModel.allowedTabs, tab]);

  const resetTransactionComposer = () => {
    setTxEditId(null);
    setTxDraft(createEmptyTransactionDraft());
    setTxDraftSource('manual');
    setTransactionComposerOpen(false);
  };

  const saveBill = () => {
    const payload = buildBillPayload(billDraft);
    if (!payload) return;
    if (billEditId) {
      onUpdateBill(billEditId, payload);
      push('Bill updated.');
    } else {
      onAddBill(payload);
      push('Bill saved.');
    }
    setBillDraft(createEmptyBillDraft());
    setBillEditId(null);
    setBillComposerOpen(false);
  };

  const saveTransaction = () => {
    const payload = buildTransactionPayload(txDraft, txDraftSource);
    if (!payload) return;
    if (txEditId) {
      onUpdateTransaction(txEditId, payload);
      push('Transaction updated.');
    } else {
      onAddTransaction(payload);
      push('Transaction added.');
    }
    resetTransactionComposer();
  };

  const openStatementImport = () => {
    if (!accessModel.canManage) return;
    setTab('spending');
    setStatementModalOpen(true);
    setStatementError('');
  };

  const resetStatementImport = () => {
    setStatementParsed(null);
    setStatementMapping(createEmptyStatementColumnMapping());
    setStatementOverrides({});
    setStatementError('');
    setStatementInfo('');
  };

  const updateStatementMapping = (role: StatementColumnRole, value: string) => {
    setStatementMapping((current) => {
      const next = { ...current };
      const nextValue = value || null;
      if (nextValue) {
        (Object.keys(next) as StatementColumnRole[]).forEach((key) => {
          if (key !== role && next[key] === nextValue) next[key] = null;
        });
      }
      next[role] = nextValue;
      return next;
    });
  };

  const handleStatementFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setStatementLoading(true);
    setStatementError('');
    try {
      const parsed = parseStatementText(file.name, await file.text());
      setStatementParsed(parsed);
      setStatementMapping(parsed.suggestedMapping);
      setStatementOverrides({});
      setStatementInfo(`Loaded ${parsed.rows.length} row${parsed.rows.length === 1 ? '' : 's'} from ${file.name}.`);
      if (!parsed.rows.length) setStatementError(parsed.warnings[0] ?? 'No transaction rows were found in that file.');
    } catch {
      setStatementError('That file could not be read. Please try a CSV, TSV, OFX, or QFX export from your bank.');
    } finally {
      setStatementLoading(false);
    }
  };

  const importStatementRows = () => {
    if (!accessModel.canManage || !statementParsed) return;
    if (!statementImportableRows.length) {
      setStatementError('Select at least one valid row to import.');
      return;
    }
    if (statementIncludedNeedsFixCount > 0) {
      setStatementError('Some selected rows still need a transaction type before they can be imported.');
      return;
    }
    const batchId = `statement-${Date.now()}`;
    onImportTransactions(statementImportableRows.map((row) => ({
      title: row.title,
      amountCents: row.amountCents as number,
      dateIso: row.dateIso as string,
      kind: row.kind as 'inflow' | 'outflow',
      category: row.category,
      notes: buildStatementImportNote(statementParsed.fileName, row),
      source: 'statement',
      statementImportId: batchId,
      statementFileName: statementParsed.fileName
    })));
    push(`Imported ${statementImportableRows.length} transaction${statementImportableRows.length === 1 ? '' : 's'} from ${statementParsed.fileName}.`);
    setStatementModalOpen(false);
    resetStatementImport();
  };

  if (accessModel.hidden) {
    return (
      <section className="stack-md">
        <ScreenIntro title="Money" subtitle="Money details are hidden for this profile right now." badge="Money" />
        <EmptyStateCard title="Money is hidden" description="A parent can enable a limited summary view for this profile in Settings when needed." />
      </section>
    );
  }

  return (
    <section className="stack-md">
      <ScreenIntro title="Money" subtitle="A calm household money view that shows what is coming in, what is going out, and what needs attention next." badge="Money" />
      <MoneyServerPanel />
      {accessModel.summaryOnly ? <div className="status-banner">This profile can view a household summary only. Parents can unlock the full money workspace from Family settings when needed.</div> : null}
      <MoneyFilterBar options={visibleTabOptions} value={tab} onChange={(next) => setTab(next as MoneyTab)} />
      <div className="money-month-bar glass-panel">
        <span className="eyebrow">Viewing</span>
        <MonthSwitcher monthIsoYYYYMM={month} onChange={setMonth} />
      </div>
      {tab === 'overview' ? (
        <div className="money-overview stack-md">
          <FoundationBlock title="Overview" description="Quick answers for this month so your family can see if money is on track.">
            <div className="money-health-banner">
              <div>
                <p className="eyebrow">Status</p>
                <h3>{net >= 0 ? "You're ahead this month." : 'Month needs attention.'}</h3>
                <p className="muted">{getWeeklyAttentionLabel(overdueBills.length, dueSoonBills.length, budgetStatus.overBudgetCount)}</p>
              </div>
            </div>
            <div className="money-kpi-grid money-kpi-grid--compact">
              <MoneyStatCard label="Money in" value={<AmountText amountCents={income} kind="positive" />} />
              <MoneyStatCard label="Money out" value={<AmountText amountCents={spending} kind="negative" />} />
              <MoneyStatCard label="Safe to spend" value={<AmountText amountCents={safeToSpend} kind={safeToSpend >= 0 ? 'positive' : 'negative'} />} />
            </div>
            <FoundationBlock title="Upcoming pressures" description="Overdue first, then what's due soon.">
              <div className="mini-list">
                {pressureItems.slice(0, 3).length ? pressureItems.slice(0, 3).map((item) => (
                  <div key={item.id} className="mini-list-item">
                    <div>
                      <p className="mini-list-title">{item.title}</p>
                      <p className="muted">{item.note}</p>
                    </div>
                    <span className={`route-pill ${item.urgency === 'high' ? 'route-pill--danger' : ''}`}>{item.urgency === 'high' ? 'Urgent' : 'Soon'}</span>
                  </div>
                )) : <EmptyStateCard title="No urgent pressure" description="No overdue or due-soon bills in this month." />}
              </div>
            </FoundationBlock>
            <div className="money-action-row">
              <button className="btn btn-primary" onClick={() => { setTab('bills'); setBillComposerOpen(true); }} disabled={!accessModel.canManage}>Add bill</button>
              <button className="btn btn-ghost" onClick={() => { setTab('spending'); setTransactionComposerOpen(true); setTxEditId(null); setTxDraft(createEmptyTransactionDraft()); setTxDraftSource('manual'); }} disabled={!accessModel.canManage}>Log spending</button>
              <button className="btn btn-ghost" onClick={() => setTab('plan')}>See plan</button>
            </div>
            <FoundationBlock title="Month forecast" description="A plain-language snapshot of how this month may land.">
              <div className="forecast-equation">
                <div className="forecast-step"><span className="forecast-step-label">Opening Balance</span><span className="forecast-step-value">{formatCurrencyZAR(cashflowPlan.openingBalanceCents)}</span></div>
                <span className="forecast-arrow">→</span>
                <div className="forecast-step"><span className="forecast-step-label">+ Income</span><span className="forecast-step-value">{formatCurrencyZAR(cashflowPlan.recordedIncomeCents)}</span></div>
                <span className="forecast-arrow">→</span>
                <div className="forecast-step"><span className="forecast-step-label">− Expenses</span><span className="forecast-step-value">{formatCurrencyZAR(cashflowPlan.recordedOutflowCents)}</span></div>
                <span className="forecast-arrow">→</span>
                <div className="forecast-step"><span className="forecast-step-label">− Bills Due</span><span className="forecast-step-value">{formatCurrencyZAR(cashflowPlan.scheduledBillOutflowCents)}</span></div>
                <span className="forecast-arrow">→</span>
                <div className={`forecast-step is-result ${cashflowPlan.projectedClosingBalanceCents < 0 ? 'is-deficit' : ''}`}><span className="forecast-step-label">Expected Left</span><span className="forecast-step-value">{formatCurrencyZAR(cashflowPlan.projectedClosingBalanceCents)}</span></div>
              </div>
              <p className="muted">
                {cashflowPlan.projectedClosingBalanceCents >= 0
                  ? `At this pace you'll finish the month with ${formatCurrencyZAR(cashflowPlan.projectedClosingBalanceCents)} to spare.`
                  : `At this pace the month may end ${formatCurrencyZAR(Math.abs(cashflowPlan.projectedClosingBalanceCents))} short — check your plan.`}
              </p>
              <button className="money-inline-btn" onClick={() => setTab('plan')}>See full plan →</button>
            </FoundationBlock>
            <details>
              <summary className="money-inline-btn">See full breakdown →</summary>
              <div className="stack-md">
                <FoundationBlock title="Budget check" description="Simple language, so you can tell if spending is still on plan.">
                  <div className="money-brief-grid">
                    <MoneyStatCard label="Planned" value={<AmountText amountCents={budgetStatus.totalLimitCents} />} />
                    <MoneyStatCard label="Spent" value={<AmountText amountCents={budgetStatus.totalSpentCents} kind="negative" />} />
                    <MoneyStatCard label="Left" value={<AmountText amountCents={budgetStatus.remainingCents} kind={budgetStatus.remainingCents >= 0 ? 'positive' : 'negative'} />} />
                  </div>
                </FoundationBlock>
                <FoundationBlock title="Recent activity" description="The latest money moves in one clean list.">
                  {recentActivity.length && accessModel.canSeeDetails ? (
                    <div className="stack-sm">
                      {recentActivity.map((activity) => (
                        <article key={activity.id} className="money-activity-item">
                          <div><p className="money-activity-title">{activity.title}</p><p className="muted">{formatDueDateFriendly(activity.dateIso)}</p></div>
                          <AmountText amountCents={Math.abs(activity.amountCents)} kind={activity.amountCents >= 0 ? 'positive' : 'negative'} />
                        </article>
                      ))}
                    </div>
                  ) : <EmptyStateCard title="No activity yet" description="Add your first bill or transaction to start tracking activity here." />}
                </FoundationBlock>
              </div>
            </details>
          </FoundationBlock>
        </div>
      ) : null}
      {tab === 'plan' ? (
        <FoundationBlock title="Plan" description="Rolling cashflow planning for the next 12 months.">
          <PlannerTab
            money={money}
            canEdit={canEditMoney}
            onAddItem={onAddPlannerItem}
            onUpdateItem={onUpdatePlannerItem}
            onDeleteItem={onDeletePlannerItem}
            onSetOpeningBalance={onSetPlannerOpeningBalance}
            startMonth={month}
          />
        </FoundationBlock>
      ) : null}
      {tab === 'bills' ? (
        <FoundationBlock title="Bills" description="See upcoming due dates, overdue items, and paid bills without digging through details.">
          <MoneySectionHeader title="Bills" subtitle="What needs to be paid, what is coming next, and what is already done." action={<MonthSwitcher monthIsoYYYYMM={month} onChange={setMonth} />} />
          <div className="money-kpi-grid money-kpi-grid--compact">
            <MoneyStatCard label="Overdue" value={<strong>{overdueBills.length}</strong>} hint={overdueBills.length ? `${formatCurrencyZAR(overdueBills.reduce((sum, bill) => sum + bill.amountCents, 0))} overdue` : 'Nothing overdue'} />
            <MoneyStatCard label="Due this week" value={<strong>{dueSoonBills.length}</strong>} hint={dueSoonBills.length ? `${formatCurrencyZAR(dueSoonBills.reduce((sum, bill) => sum + bill.amountCents, 0))} due soon` : 'Nothing due this week'} />
            <MoneyStatCard label="Repeating bills" value={<strong>{recurringBillsCount}</strong>} hint="Monthly bills this month" />
            <MoneyStatCard label="Already paid" value={<strong>{paidBills.length}</strong>} hint="Bills marked paid this month" />
          </div>
          <div className="money-toolbar">
            <button className="btn btn-primary" onClick={() => { if (billComposerOpen) { setBillComposerOpen(false); setBillEditId(null); setBillDraft(createEmptyBillDraft()); } else { setBillComposerOpen(true); } }} disabled={!accessModel.canManage}>{billComposerOpen ? 'Close' : 'Add bill'}</button>
            <MoneyFilterBar
              options={[{ key: 'all', label: 'All' }, { key: 'overdue', label: `Overdue (${overdueBills.length})` }, { key: 'dueSoon', label: `Due soon (${dueSoonBills.length})` }, { key: 'upcoming', label: `Later (${upcomingBills.length})` }, { key: 'paid', label: `Paid (${paidBills.length})` }]}
              value={billStatusFilter}
              onChange={(next) => setBillStatusFilter(next as typeof billStatusFilter)}
            />
          </div>
          {billComposerOpen && accessModel.canManage ? (
            <article className="money-editor stack-sm">
              <div className="money-editor-head">
                <div>
                  <p className="money-activity-title">{billEditId ? 'Edit bill' : 'Add a bill'}</p>
                  <p className="muted">Keep it short and clear so the whole family understands it.</p>
                </div>
              </div>
              <input value={billDraft.title} placeholder="Bill name" onChange={(event) => setBillDraft((prev) => ({ ...prev, title: event.target.value }))} />
              <div className="money-editor-grid">
                <input value={billDraft.amount} inputMode="decimal" placeholder="Amount" onChange={(event) => setBillDraft((prev) => ({ ...prev, amount: event.target.value }))} />
                <input type="date" value={billDraft.dueDateIso} onChange={(event) => setBillDraft((prev) => ({ ...prev, dueDateIso: event.target.value }))} />
              </div>
              <div className="money-editor-grid">
                <select value={billDraft.category} onChange={(event) => setBillDraft((prev) => ({ ...prev, category: event.target.value }))}>{spendCategories.map((category) => <option key={category}>{category}</option>)}</select>
                <input value={billDraft.notes} placeholder="Notes for the family (optional)" onChange={(event) => setBillDraft((prev) => ({ ...prev, notes: event.target.value }))} />
              </div>
              <label className="task-field">
                <span>Repeats</span>
                <select value={billDraft.recurrence} onChange={(event) => setBillDraft((prev) => ({ ...prev, recurrence: event.target.value as 'none' | 'monthly' }))}>
                  <option value="none">One time</option>
                  <option value="monthly">Every month</option>
                </select>
              </label>
              <label className="task-shared-toggle"><input type="checkbox" checked={billDraft.autoCreateTransaction} onChange={(event) => setBillDraft((prev) => ({ ...prev, autoCreateTransaction: event.target.checked }))} />Add it to transactions when marked paid</label>
              <button className="btn btn-primary" onClick={saveBill}>{billEditId ? 'Save changes' : 'Save bill'}</button>
            </article>
          ) : null}
          {visibleBills.length ? (
            <div className="stack-sm">
              {visibleBills.sort((a, b) => a.dueDateIso.localeCompare(b.dueDateIso)).map((bill) => (
                <article key={bill.id} className={`money-payment-card ${!bill.paid && bill.dueDateIso < todayIso ? 'is-overdue' : !bill.paid && dueSoonBills.some((item) => item.id === bill.id) ? 'is-due-soon' : ''}`}>
                  <div className="money-payment-head">
                    <div>
                      <p className="money-activity-title">{bill.title}</p>
                      <p className="muted">{bill.category} · Due {formatDueDateFriendly(bill.dueDateIso)}</p>
                    </div>
                    <AmountText amountCents={bill.amountCents} />
                  </div>
                  <div className="money-payment-meta">
                    <BillStatusBadge dueDateIso={bill.dueDateIso} paid={bill.paid} />
                    {bill.recurrence === 'monthly' ? <span className="route-pill">Repeats monthly</span> : null}
                    {bill.notes ? <span className="route-pill">{bill.notes}</span> : null}
                  </div>
                  <div className="money-payment-footer">
                    <p className="muted">{bill.paid ? 'Marked as paid.' : bill.dueDateIso < todayIso ? 'This bill is overdue and should be handled first.' : dueSoonBills.some((item) => item.id === bill.id) ? 'Due within the next 7 days.' : 'Scheduled for later this month.'}</p>
                    <div className="money-payment-meta">
                      {!bill.paid ? <button className="money-inline-btn" onClick={() => { onMarkBillPaid(bill.id, 'manual-proof'); push(`${bill.title} marked as paid.`); }} disabled={!accessModel.canManage}>Mark paid</button> : null}
                      <button className="money-inline-btn" onClick={() => onDuplicateBill(bill.id)} disabled={!accessModel.canManage}>Duplicate</button>
                      <button className="money-inline-btn" onClick={() => { setBillEditId(bill.id); setBillDraft({ title: bill.title, amount: String(bill.amountCents / 100), dueDateIso: bill.dueDateIso, category: bill.category, notes: bill.notes ?? '', autoCreateTransaction: bill.autoCreateTransaction !== false, recurrence: bill.recurrence ?? 'none' }); setBillComposerOpen(true); }} disabled={!accessModel.canManage}>Edit</button>
                      <button className="money-inline-btn" onClick={() => onDeleteBill(bill.id)} disabled={!accessModel.canManage}>Delete</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : <EmptyStateCard title="No bills added yet" description="Add your regular household bills here so due dates are easy to spot." action={<button className="btn btn-primary" onClick={() => setBillComposerOpen(true)} disabled={!accessModel.canManage}>Add bill</button>} />}
        </FoundationBlock>
      ) : null}
      {tab === 'spending' ? (
        <FoundationBlock title="Transactions" description="A cleaner money history that is easy to scan on phone or desktop.">
          <MoneySectionHeader title="Transactions" subtitle="Filter by month, category, search, and money in or money out." action={<MonthSwitcher monthIsoYYYYMM={month} onChange={setMonth} />} />
          <div className="money-kpi-grid money-kpi-grid--compact">
            <MoneyStatCard label="Money in" value={<AmountText amountCents={monthTransactions.filter((tx) => tx.kind === 'inflow').reduce((sum, tx) => sum + tx.amountCents, 0)} kind="positive" />} />
            <MoneyStatCard label="Money out" value={<AmountText amountCents={monthTransactions.filter((tx) => tx.kind === 'outflow').reduce((sum, tx) => sum + tx.amountCents, 0)} kind="negative" />} />
            <MoneyStatCard label="Net change" value={<AmountText amountCents={net} kind={net >= 0 ? 'positive' : 'negative'} />} />
            <MoneyStatCard label="Lines this month" value={<strong>{monthTransactions.length}</strong>} hint={recentOutflowAverage > 0 ? `${formatCurrencyZAR(recentOutflowAverage)} total spending recorded` : 'No spending recorded yet'} />
          </div>
          <div className="money-toolbar money-toolbar--stacked">
            <div className="money-action-row">
              <button className="btn btn-primary" onClick={() => {
                if (transactionComposerOpen) resetTransactionComposer();
                else {
                  setTxEditId(null);
                  setTxDraft(createEmptyTransactionDraft());
                  setTxDraftSource('manual');
                  setTransactionComposerOpen(true);
                }
              }} disabled={!accessModel.canManage}>{transactionComposerOpen ? 'Close' : 'Add transaction'}</button>
              <button className="btn btn-ghost" onClick={openStatementImport} disabled={!accessModel.canManage}>Advanced import</button>
            </div>
            <div className="money-search-row">
              <input value={search} placeholder="Search transactions" onChange={(event) => setSearch(event.target.value)} />
              <select value={txCategoryFilter} onChange={(event) => setTxCategoryFilter(event.target.value)}><option value="all">All categories</option>{transactionCategories.map((category) => <option key={category}>{category}</option>)}</select>
            </div>
            <MoneyFilterBar options={[{ key: 'all', label: 'All' }, { key: 'inflow', label: 'Money in' }, { key: 'outflow', label: 'Money out' }]} value={txKindFilter} onChange={(next) => setTxKindFilter(next as typeof txKindFilter)} />
          </div>
          {transactionComposerOpen && accessModel.canManage ? (
            <article className="money-editor stack-sm">
              <div className="money-editor-head">
                <div>
                  <p className="money-activity-title">{txEditId ? 'Edit transaction' : 'Add a transaction'}</p>
                  <p className="muted">Keep titles short so they are easy to scan later.</p>
                </div>
              </div>
              <input value={txDraft.title} placeholder="What was it for?" onChange={(event) => setTxDraft((prev) => ({ ...prev, title: event.target.value }))} />
              <div className="money-editor-grid">
                <input value={txDraft.amount} inputMode="decimal" placeholder="Amount" onChange={(event) => setTxDraft((prev) => ({ ...prev, amount: event.target.value }))} />
                <input type="date" value={txDraft.dateIso} onChange={(event) => setTxDraft((prev) => ({ ...prev, dateIso: event.target.value }))} />
              </div>
              <div className="money-editor-grid">
                <select value={txDraft.kind} onChange={(event) => setTxDraft((prev) => ({ ...prev, kind: event.target.value as 'inflow' | 'outflow' }))}><option value="inflow">Money in</option><option value="outflow">Money out</option></select>
                <select value={txDraft.category} onChange={(event) => setTxDraft((prev) => ({ ...prev, category: event.target.value }))}>{transactionCategories.map((category) => <option key={category}>{category}</option>)}</select>
              </div>
              <input value={txDraft.notes} placeholder="Note (optional)" onChange={(event) => setTxDraft((prev) => ({ ...prev, notes: event.target.value }))} />
              <button className="btn btn-primary" onClick={saveTransaction}>{txEditId ? 'Save changes' : 'Add transaction'}</button>
            </article>
          ) : null}
          {visibleTransactions.length ? (
            <div className="stack-sm">
              {[...visibleTransactions].sort((a, b) => b.dateIso.localeCompare(a.dateIso)).map((tx) => (
                <article key={tx.id} className="money-transaction-item">
                  <div className="money-transaction-main">
                    <div>
                      <p className="money-activity-title">{tx.title}</p>
                      <p className="muted">{formatDueDateFriendly(tx.dateIso)} · {tx.category}</p>
                    </div>
                    <div className="money-payment-meta">
                      <span className={`item-tag ${tx.kind === 'inflow' ? 'is-soft' : 'is-task'}`}>{tx.kind === 'inflow' ? 'Money in' : 'Money out'}</span>
                      <span className="route-pill">{sourceLabel(tx.source)}</span>
                    </div>
                    {tx.notes ? <p className="muted">{tx.notes}</p> : null}
                  </div>
                  <div className="money-activity-meta">
                    <AmountText amountCents={tx.amountCents} kind={tx.kind === 'inflow' ? 'positive' : 'negative'} />
                    <div className="money-payment-meta money-payment-meta--actions">
                      {tx.source !== 'bill' ? <button className="money-inline-btn" onClick={() => {
                        setTxEditId(tx.id);
                        setTxDraft({ title: tx.title, amount: String(tx.amountCents / 100), dateIso: tx.dateIso, kind: tx.kind, category: tx.category, notes: tx.notes ?? '' });
                        setTxDraftSource(tx.source === 'statement' ? 'statement' : 'manual');
                        setTransactionComposerOpen(true);
                      }} disabled={!accessModel.canManage}>Edit</button> : null}
                      <button className="money-inline-btn" onClick={() => onDeleteTransaction(tx.id)} disabled={!accessModel.canManage}>Delete</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : <EmptyStateCard title="No transactions yet" description="Add a transaction or import a statement to see your money flow here." action={<button className="btn btn-primary" onClick={() => setTransactionComposerOpen(true)} disabled={!accessModel.canManage}>Add transaction</button>} />}
        </FoundationBlock>
      ) : null}
      {tab === 'goals' ? (
        <FoundationBlock title="Goals & savings" description="A simple place to see how savings goals are moving forward.">
          <MoneySectionHeader title="Goals & savings" subtitle="Progress that feels motivating, not complicated." action={<MonthSwitcher monthIsoYYYYMM={month} onChange={setMonth} />} />
          <div className="money-kpi-grid money-kpi-grid--compact">
            <MoneyStatCard label="Saved so far" value={<AmountText amountCents={savingsTotalSaved} kind="positive" />} />
            <MoneyStatCard label="Goal target" value={<AmountText amountCents={savingsTotalTarget} />} />
            <MoneyStatCard label="Still to go" value={<AmountText amountCents={Math.max(0, savingsTotalTarget - savingsTotalSaved)} kind="negative" />} />
            <MoneyStatCard label="Goals" value={<strong>{savingsGoals.length}</strong>} hint="Active household savings goals" />
          </div>
          {savingsGoals.length ? (
            <div className="budget-category-list">
              {savingsGoals.map((goal) => (
                <article key={goal.id} className="money-goal-card">
                  <div className="budget-category-head">
                    <div>
                      <p className="budget-category-title">{goal.title}</p>
                      <p className="muted">Saved {formatCurrencyZAR(goal.savedCents)} of {formatCurrencyZAR(goal.targetCents)}</p>
                    </div>
                    <strong>{Math.round(goal.progress * 100)}%</strong>
                  </div>
                  <Progress value={Math.round(goal.progress * 100)} />
                  <div className="money-goal-meta">
                    <span className="route-pill">{formatCurrencyZAR(goal.remainingCents)} left</span>
                    <span className="route-pill">{goal.progress >= 1 ? 'Goal reached' : 'Keep going'}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : <EmptyStateCard title="No savings goals yet" description="When your household adds savings goals, progress will show here in a cleaner, more motivating way." />}
        </FoundationBlock>
      ) : null}
      <Modal open={statementModalOpen && accessModel.canManage} title="Import bank statement" onClose={() => setStatementModalOpen(false)}>
        <div className="stack-sm">
          {statementError ? <div className="error-banner">{statementError}</div> : null}
          {statementLoading ? <div className="status-banner">Reading and validating your statement…</div> : null}
          {statementInfo ? <div className="status-banner is-success">{statementInfo}</div> : null}
          {!statementParsed ? (
            <article className="money-editor stack-sm">
              <p className="muted">Advanced tool: upload a CSV, TSV, OFX, or QFX export from your bank. Family Hub will map it into transactions and flag anything that needs review.</p>
              <label className="btn btn-primary money-upload-btn">
                {statementLoading ? 'Reading statement...' : 'Choose statement file'}
                <input type="file" accept=".csv,.tsv,.txt,.ofx,.qfx" onChange={(event) => void handleStatementFileChange(event)} />
              </label>
              <p className="muted">PDF statements are not supported yet, so the cleanest path is to export CSV or OFX/QFX from your bank.</p>
            </article>
          ) : (
            <>
              <article className="money-editor stack-sm">
                <div className="money-editor-head">
                  <div>
                    <p className="money-activity-title">{statementParsed.fileName}</p>
                    <p className="muted">{statementParsed.rows.length} detected row{statementParsed.rows.length === 1 ? '' : 's'}.</p>
                  </div>
                  <div className="money-payment-meta">
                    <label className="money-inline-btn money-upload-btn">
                      Replace file
                      <input type="file" accept=".csv,.tsv,.txt,.ofx,.qfx" onChange={(event) => void handleStatementFileChange(event)} />
                    </label>
                    <button className="money-inline-btn" onClick={resetStatementImport}>Start over</button>
                  </div>
                </div>
                <div className={`status-banner ${statementPreview?.requiresMappingReview ? 'is-error' : 'is-success'}`}>
                  {statementPreview?.requiresMappingReview ? 'This statement needs a quick mapping review before import. Confirm the columns and any highlighted rows.' : 'Mapping looks good. Review any highlighted rows, then import the approved ones.'}
                </div>
                {statementParsed.warnings.map((warning) => <p key={warning} className="muted">{warning}</p>)}
                <div className="statement-import-summary">
                  <MoneyStatCard label="Ready" value={<strong>{statementPreview?.readyCount ?? 0}</strong>} />
                  <MoneyStatCard label="Needs review" value={<strong>{statementPreview?.needsAttentionCount ?? 0}</strong>} />
                  <MoneyStatCard label="Duplicates" value={<strong>{statementPreview?.duplicateCount ?? 0}</strong>} />
                  <MoneyStatCard label="Missing info" value={<strong>{statementPreview?.missingRequiredCount ?? 0}</strong>} />
                </div>
              </article>
              <article className="money-editor stack-sm">
                <p className="money-activity-title">Column mapping</p>
                <div className="statement-mapping-grid">
                  {statementColumnLabels.map((item) => (
                    <label key={item.role} className="stack-sm">
                      <span className="muted">{item.label}{item.optional ? ' (optional)' : ''}</span>
                      <select value={statementMapping[item.role] ?? ''} onChange={(event) => updateStatementMapping(item.role, event.target.value)}>
                        <option value="">Not used</option>
                        {statementParsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              </article>
              <div className="statement-preview-list">
                {statementReviewRows.length ? statementReviewRows.map((row) => (
                  <article key={row.id} className={`statement-preview-row ${row.include ? 'is-selected' : ''} ${row.duplicate ? 'is-duplicate' : ''}`}>
                    <div className="statement-preview-head">
                      <label className="statement-toggle">
                        <input type="checkbox" checked={row.include} onChange={(event) => setStatementOverrides((current) => ({ ...current, [row.id]: { ...(current[row.id] ?? {}), include: event.target.checked } }))} />
                        Import
                      </label>
                      <div className="statement-preview-meta">
                        <p className="money-activity-title">{row.title || 'Untitled transaction'}</p>
                        <p className="muted">{row.dateIso ? formatDueDateFriendly(row.dateIso) : 'Unknown date'}{row.reference ? ` · Ref ${row.reference}` : ''}</p>
                      </div>
                      <AmountText amountCents={row.amountCents ?? 0} kind={row.kind === 'outflow' ? 'negative' : row.kind === 'inflow' ? 'positive' : 'neutral'} />
                    </div>
                    <div className="statement-preview-controls">
                      <select value={row.kind ?? ''} onChange={(event) => setStatementOverrides((current) => ({ ...current, [row.id]: { ...(current[row.id] ?? {}), kind: event.target.value as 'inflow' | 'outflow' } }))}>
                        <option value="">Needs type review</option>
                        <option value="inflow">Money in</option>
                        <option value="outflow">Money out</option>
                      </select>
                      <select value={row.category} onChange={(event) => setStatementOverrides((current) => ({ ...current, [row.id]: { ...(current[row.id] ?? {}), category: event.target.value } }))}>
                        {transactionCategories.map((category) => <option key={category}>{category}</option>)}
                      </select>
                    </div>
                    <div className="statement-badge-row">
                      {row.warnings.length ? row.warnings.map((warning) => <span key={warning} className="route-pill">{warning}</span>) : <span className="route-pill">Ready to import</span>}
                    </div>
                  </article>
                )) : <EmptyStateCard title="No rows found" description="Try a different export file from your bank." />}
              </div>
              <div className="task-composer-actions">
                <button className="btn btn-ghost" onClick={() => setStatementModalOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={importStatementRows}>Import {statementImportableRows.length} approved transaction{statementImportableRows.length === 1 ? '' : 's'}</button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </section>
  );
};
