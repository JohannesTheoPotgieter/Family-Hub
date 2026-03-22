import { useMemo, useState, type ChangeEvent } from 'react';
import { FoundationBlock, ScreenIntro } from './BaselineScaffold';
import { AmountText } from './money/AmountText';
import { BillStatusBadge } from './money/BillStatusBadge';
import { BudgetProgressCard } from './money/BudgetProgressCard';
import { EmptyStateCard } from './money/EmptyStateCard';
import { MoneyFilterBar } from './money/MoneyFilterBar';
import { MoneySectionHeader } from './money/MoneySectionHeader';
import { MoneyStatCard } from './money/MoneyStatCard';
import { MonthSwitcher } from './money/MonthSwitcher';
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
  moneyVisibility?: 'full' | 'summary' | 'hidden';
  canEditMoney?: boolean;
};

type MoneyTab = 'overview' | 'bills' | 'transactions' | 'budget';
type StatementRowOverride = { include?: boolean; kind?: 'inflow' | 'outflow'; category?: string };

const tabOptions = [
  { key: 'overview', label: 'Overview' },
  { key: 'bills', label: 'Bills' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'budget', label: 'Budget' }
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
  const cashflowPlan = useMemo(() => getCashflowPlan(money, month), [money, month]);
  const nextBillToPay = dueSoonBills[0] ?? overdueBills[0] ?? null;
  const safeToSpend = getSafeToSpend(money, month);
  const savingsGoals = getSavingsProgress(money);

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

  const resetTransactionComposer = () => {
    setTxEditId(null);
    setTxDraft(createEmptyTransactionDraft());
    setTxDraftSource('manual');
    setTransactionComposerOpen(false);
  };

  const saveBill = () => {
    const payload = buildBillPayload(billDraft);
    if (!payload) return;
    if (billEditId) onUpdateBill(billEditId, payload);
    else onAddBill(payload);
    setBillDraft(createEmptyBillDraft());
    setBillEditId(null);
    setBillComposerOpen(false);
  };

  const saveTransaction = () => {
    const payload = buildTransactionPayload(txDraft, txDraftSource);
    if (!payload) return;
    if (txEditId) onUpdateTransaction(txEditId, payload);
    else onAddTransaction(payload);
    resetTransactionComposer();
  };

  const openStatementImport = () => {
    setTab('transactions');
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
    if (!statementParsed) return;
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

  return (
    <section className="stack-md">
      <ScreenIntro title="Money Manager" subtitle="Track bills, money in and money out, and monthly budgets in one clear place." badge="Money" />
      <MoneyFilterBar options={tabOptions} value={tab} onChange={(next) => setTab(next as MoneyTab)} />
      {tab === 'overview' ? (
        <>
          <FoundationBlock title="This month at a glance" description="Quick answers for your household money plan.">
            <MoneySectionHeader title="Monthly snapshot" subtitle="Use the planner below to see what is still coming." action={<MonthSwitcher monthIsoYYYYMM={month} onChange={setMonth} />} />
            <div className="money-kpi-grid">
              <MoneyStatCard label="Money in" value={<AmountText amountCents={income} kind="positive" />} />
              <MoneyStatCard label="Money out" value={<AmountText amountCents={spending} kind="negative" />} />
              <MoneyStatCard label="Left this month" value={<AmountText amountCents={net} kind={net >= 0 ? 'positive' : 'negative'} />} />
            </div>
            <div className="money-kpi-grid">
              <MoneyStatCard label="Due this week" value={<strong>{dueSoonBills.length}</strong>} />
              <MoneyStatCard label="Paid this month" value={<strong>{paidBills.length}</strong>} />
              <MoneyStatCard label="Top spending category" value={<strong>{topCategory ? `${topCategory[0]} · ${formatCurrencyZAR(topCategory[1])}` : '—'}</strong>} />
              <MoneyStatCard label="Left to budget" value={<AmountText amountCents={budgetStatus.remainingCents} kind={budgetStatus.remainingCents >= 0 ? 'positive' : 'negative'} />} />
            </div>
            <div className="money-payment-meta">
              <button className="btn btn-primary" onClick={() => { setTab('bills'); setBillComposerOpen(true); }}>Add bill</button>
              <button className="btn btn-ghost" onClick={() => { setTab('transactions'); setTransactionComposerOpen(true); setTxEditId(null); setTxDraft(createEmptyTransactionDraft()); setTxDraftSource('manual'); }}>Add transaction</button>
              <button className="btn btn-ghost" onClick={openStatementImport}>Import statement</button>
              <button className="btn btn-ghost" disabled={!nextBillToPay} onClick={() => { if (nextBillToPay) onMarkBillPaid(nextBillToPay.id, 'manual-proof'); }}>Mark next bill paid</button>
            </div>
          </FoundationBlock>
          <FoundationBlock title="Cashflow planner" description="See what balance you likely land on after recorded transactions and unpaid bills.">
            <div className="money-kpi-grid">
              <MoneyStatCard label="Opening balance" value={<AmountText amountCents={cashflowPlan.openingBalanceCents} kind={cashflowPlan.openingBalanceCents >= 0 ? 'positive' : 'negative'} />} />
              <MoneyStatCard label="Recorded income" value={<AmountText amountCents={cashflowPlan.recordedIncomeCents} kind="positive" />} />
              <MoneyStatCard label="Bills still due" value={<AmountText amountCents={cashflowPlan.scheduledBillOutflowCents} kind="negative" />} />
              <MoneyStatCard label="Projected closing" value={<AmountText amountCents={cashflowPlan.projectedClosingBalanceCents} kind={cashflowPlan.projectedClosingBalanceCents >= 0 ? 'positive' : 'negative'} />} />
            </div>
            {cashflowPlan.entries.length ? (
              <div className="stack-sm">
                {cashflowPlan.entries.slice(0, 6).map((entry) => (
                  <article key={entry.id} className="money-transaction-item">
                    <div>
                      <p className="money-activity-title">{entry.title}</p>
                      <p className="muted">{formatDueDateFriendly(entry.dateIso)} · {entry.category}</p>
                    </div>
                    <div className="money-activity-meta">
                      <AmountText amountCents={Math.abs(entry.amountCents)} kind={entry.amountCents >= 0 ? 'positive' : 'negative'} />
                      <span className={`item-tag ${entry.status === 'scheduled' ? 'is-warn' : 'is-soft'}`}>{entry.status === 'scheduled' ? 'Planned' : 'Recorded'}</span>
                      <span className="route-pill">Running {formatCurrencyZAR(entry.runningBalanceCents)}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : <EmptyStateCard title="No cashflow items yet" description="Add income, bills, or statement imports to generate a month-by-month forecast." />}
          </FoundationBlock>
          <FoundationBlock title="What needs attention" description={`Overdue: ${overdueBills.length} · Due soon: ${dueSoonBills.length} · Over budget categories: ${budgetStatus.overBudgetCount}`}>
            {recentActivity.length ? (
              <div className="stack-sm">
                {recentActivity.map((activity) => <article key={activity.id} className="money-activity-item"><span>{activity.title}</span><AmountText amountCents={Math.abs(activity.amountCents)} kind={activity.amountCents >= 0 ? 'positive' : 'negative'} /></article>)}
              </div>
            ) : <EmptyStateCard title="No activity yet" description="Add your first bill or transaction to start tracking." />}
          </FoundationBlock>
        </>
      ) : null}
      {tab === 'bills' ? (
        <FoundationBlock title="Bills" description="Plan upcoming bills and confirm what is paid.">
          <MoneySectionHeader title="Bill planner" subtitle="Group by status and filter your month." action={<MonthSwitcher monthIsoYYYYMM={month} onChange={setMonth} />} />
          <div className="money-payment-meta">
            <button className="btn btn-primary" onClick={() => { if (billComposerOpen) { setBillComposerOpen(false); setBillEditId(null); setBillDraft(createEmptyBillDraft()); } else { setBillComposerOpen(true); } }}>{billComposerOpen ? 'Close' : 'Add bill'}</button>
            <MoneyFilterBar
              options={[{ key: 'all', label: 'All' }, { key: 'overdue', label: `Overdue (${overdueBills.length})` }, { key: 'dueSoon', label: `Due soon (${dueSoonBills.length})` }, { key: 'upcoming', label: `Upcoming (${upcomingBills.length})` }, { key: 'paid', label: `Paid (${paidBills.length})` }]}
              value={billStatusFilter}
              onChange={(next) => setBillStatusFilter(next as typeof billStatusFilter)}
            />
          </div>
          {billComposerOpen ? (
            <article className="money-editor stack-sm">
              <input value={billDraft.title} placeholder="Bill title" onChange={(event) => setBillDraft((prev) => ({ ...prev, title: event.target.value }))} />
              <div className="money-editor-grid">
                <input value={billDraft.amount} inputMode="decimal" placeholder="Amount" onChange={(event) => setBillDraft((prev) => ({ ...prev, amount: event.target.value }))} />
                <input type="date" value={billDraft.dueDateIso} onChange={(event) => setBillDraft((prev) => ({ ...prev, dueDateIso: event.target.value }))} />
              </div>
              <div className="money-editor-grid">
                <select value={billDraft.category} onChange={(event) => setBillDraft((prev) => ({ ...prev, category: event.target.value }))}>{spendCategories.map((category) => <option key={category}>{category}</option>)}</select>
                <input value={billDraft.notes} placeholder="Notes (optional)" onChange={(event) => setBillDraft((prev) => ({ ...prev, notes: event.target.value }))} />
              </div>
              <label className="task-shared-toggle"><input type="checkbox" checked={billDraft.autoCreateTransaction} onChange={(event) => setBillDraft((prev) => ({ ...prev, autoCreateTransaction: event.target.checked }))} />Auto-create transaction when paid</label>
              <button className="btn btn-primary" onClick={saveBill}>{billEditId ? 'Save changes' : 'Save bill'}</button>
            </article>
          ) : null}
          {visibleBills.length ? (
            <div className="stack-sm">
              {visibleBills.sort((a, b) => a.dueDateIso.localeCompare(b.dueDateIso)).map((bill) => (
                <article key={bill.id} className="money-payment-card">
                  <div className="money-payment-head">
                    <div>
                      <p className="money-activity-title">{bill.title}</p>
                      <p className="muted">Due {formatDueDateFriendly(bill.dueDateIso)} · {bill.category}</p>
                    </div>
                    <AmountText amountCents={bill.amountCents} />
                  </div>
                  <div className="money-payment-meta">
                    <BillStatusBadge dueDateIso={bill.dueDateIso} paid={bill.paid} />
                    <span className="route-pill">Proof: {bill.proofFileName ?? 'Not attached'}</span>
                    <span className="route-pill">Linked: {bill.linkedTransactionId ? 'Yes' : 'No'}</span>
                    {!bill.paid ? <button className="money-inline-btn" onClick={() => onMarkBillPaid(bill.id, 'manual-proof')}>Mark paid</button> : null}
                    <button className="money-inline-btn" onClick={() => onDuplicateBill(bill.id)}>Duplicate</button>
                    <button className="money-inline-btn" onClick={() => { setBillEditId(bill.id); setBillDraft({ title: bill.title, amount: String(bill.amountCents / 100), dueDateIso: bill.dueDateIso, category: bill.category, notes: bill.notes ?? '', autoCreateTransaction: bill.autoCreateTransaction !== false, recurrence: bill.recurrence ?? 'none' }); setBillComposerOpen(true); }}>Edit</button>
                    <button className="money-inline-btn" onClick={() => onDeleteBill(bill.id)}>Delete</button>
                  </div>
                </article>
              ))}
            </div>
          ) : <EmptyStateCard title="No bills added yet" description="No bills added yet. Add one to start tracking due dates." action={<button className="btn btn-primary" onClick={() => setBillComposerOpen(true)} disabled={!canEditMoney}>Add bill</button>} />}
        </FoundationBlock>
      ) : null}
      {tab === 'transactions' ? (
        <FoundationBlock title="Transactions" description="A clean ledger of money in and money out.">
          <MoneySectionHeader title="Ledger" subtitle="Filter by month, category, type, and search." action={<MonthSwitcher monthIsoYYYYMM={month} onChange={setMonth} />} />
          <div className="money-kpi-grid">
            <MoneyStatCard label="Total inflow" value={<AmountText amountCents={monthTransactions.filter((tx) => tx.kind === 'inflow').reduce((sum, tx) => sum + tx.amountCents, 0)} kind="positive" />} />
            <MoneyStatCard label="Total outflow" value={<AmountText amountCents={monthTransactions.filter((tx) => tx.kind === 'outflow').reduce((sum, tx) => sum + tx.amountCents, 0)} kind="negative" />} />
            <MoneyStatCard label="Net change" value={<AmountText amountCents={net} kind={net >= 0 ? 'positive' : 'negative'} />} />
          </div>
          <div className="money-payment-meta">
            <button className="btn btn-primary" onClick={() => {
              if (transactionComposerOpen) resetTransactionComposer();
              else {
                setTxEditId(null);
                setTxDraft(createEmptyTransactionDraft());
                setTxDraftSource('manual');
                setTransactionComposerOpen(true);
              }
            }}>{transactionComposerOpen ? 'Close' : 'Add transaction'}</button>
            <button className="btn btn-ghost" onClick={openStatementImport}>Import statement</button>
            <input value={search} placeholder="Search title" onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="money-editor-grid">
            <select value={txCategoryFilter} onChange={(event) => setTxCategoryFilter(event.target.value)}><option value="all">All categories</option>{transactionCategories.map((category) => <option key={category}>{category}</option>)}</select>
            <MoneyFilterBar options={[{ key: 'all', label: 'All' }, { key: 'inflow', label: 'Money in' }, { key: 'outflow', label: 'Money out' }]} value={txKindFilter} onChange={(next) => setTxKindFilter(next as typeof txKindFilter)} />
          </div>
          {transactionComposerOpen ? (
            <article className="money-editor stack-sm">
              <input value={txDraft.title} placeholder="Title" onChange={(event) => setTxDraft((prev) => ({ ...prev, title: event.target.value }))} />
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
                  <div>
                    <p className="money-activity-title">{tx.title}</p>
                    <p className="muted">{formatDueDateFriendly(tx.dateIso)} · {tx.category} {tx.notes ? `· ${tx.notes}` : ''}</p>
                    <div className="money-payment-meta">
                      <span className={`item-tag ${tx.kind === 'inflow' ? 'is-soft' : 'is-task'}`}>{tx.kind === 'inflow' ? 'Inflow' : 'Outflow'}</span>
                      <span className="route-pill">Source: {sourceLabel(tx.source)}</span>
                    </div>
                  </div>
                  <div className="money-activity-meta">
                    <AmountText amountCents={tx.amountCents} kind={tx.kind === 'inflow' ? 'positive' : 'negative'} />
                    {tx.source !== 'bill' ? <button className="money-inline-btn" onClick={() => {
                      setTxEditId(tx.id);
                      setTxDraft({ title: tx.title, amount: String(tx.amountCents / 100), dateIso: tx.dateIso, kind: tx.kind, category: tx.category, notes: tx.notes ?? '' });
                      setTxDraftSource(tx.source === 'statement' ? 'statement' : 'manual');
                      setTransactionComposerOpen(true);
                    }}>Edit</button> : null}
                    <button className="money-inline-btn" onClick={() => onDeleteTransaction(tx.id)}>Delete</button>
                  </div>
                </article>
              ))}
            </div>
          ) : <EmptyStateCard title="No transactions yet" description="No transactions yet. Add one or import a statement to see your money flow." action={<button className="btn btn-primary" onClick={() => setTransactionComposerOpen(true)} disabled={!canEditMoney}>Add transaction</button>} />}
        </FoundationBlock>
      ) : null}
      {tab === 'budget' ? (
        <FoundationBlock title="Budget" description="Set category limits and track spending against plan.">
          <MoneySectionHeader title="Monthly budget" subtitle="Set and review category limits." action={<MonthSwitcher monthIsoYYYYMM={month} onChange={setMonth} />} />
          <div className="money-kpi-grid">
            <MoneyStatCard label="Total planned budget" value={<AmountText amountCents={budgetStatus.totalLimitCents} />} />
            <MoneyStatCard label="Total spent" value={<AmountText amountCents={budgetStatus.totalSpentCents} kind="negative" />} />
            <MoneyStatCard label="Remaining" value={<AmountText amountCents={budgetStatus.remainingCents} kind={budgetStatus.remainingCents >= 0 ? 'positive' : 'negative'} />} />
          </div>
          <article className="money-editor stack-sm">
            <div className="money-editor-grid">
              <select value={budgetDraft.category} onChange={(event) => setBudgetDraft((prev) => ({ ...prev, category: event.target.value }))}>{spendCategories.map((category) => <option key={category}>{category}</option>)}</select>
              <input value={budgetDraft.amount} inputMode="decimal" placeholder="Budget amount" onChange={(event) => setBudgetDraft((prev) => ({ ...prev, amount: event.target.value }))} />
            </div>
            <button className="btn btn-primary" onClick={() => {
              const payload = buildBudgetPayload(budgetDraft, month);
              if (!payload) return;
              onAddBudget(payload);
              setBudgetDraft((prev) => ({ ...prev, amount: '' }));
            }}>Save budget</button>
          </article>
          {starterBudgetSuggestions.length ? (
            <article className="money-editor stack-sm">
              <p className="muted">Need a faster start? Build a starter budget from the categories you already spend in.</p>
              <div className="money-payment-meta">
                {starterBudgetSuggestions.slice(0, 3).map((item) => <span key={item.category} className="route-pill">{item.category} · {formatCurrencyZAR(item.limitCents)}</span>)}
              </div>
              <button className="btn btn-ghost" onClick={() => starterBudgetSuggestions.forEach((item) => onAddBudget({ monthIsoYYYYMM: month, category: item.category, limitCents: item.limitCents }))}>
                Create starter budgets
              </button>
            </article>
          ) : null}
          <div className="budget-category-list">
            {currentMonthBudgets.length ? currentMonthBudgets.map((budget) => (
              <BudgetProgressCard key={budget.id} category={budget.category} limitCents={budget.limitCents} spentCents={monthTransactions.filter((tx) => tx.kind === 'outflow' && tx.category === budget.category).reduce((sum, tx) => sum + tx.amountCents, 0)} onEdit={() => setBudgetDraft({ category: budget.category, amount: String(budget.limitCents / 100) })} onDelete={() => onDeleteBudget(budget.id)} />
            )) : <EmptyStateCard title="No budgets yet" description="Set a budget for groceries, transport, and more." />}
          </div>
        </FoundationBlock>
      ) : null}
      <Modal open={statementModalOpen} title="Import bank statement" onClose={() => setStatementModalOpen(false)}>
        <div className="stack-sm">
          {statementError ? <div className="error-banner">{statementError}</div> : null}
          {statementLoading ? <div className="status-banner">Reading and validating your statement…</div> : null}
          {statementInfo ? <div className="status-banner is-success">{statementInfo}</div> : null}
          {!statementParsed ? (
            <article className="money-editor stack-sm">
              <p className="muted">Upload a CSV, TSV, OFX, or QFX export from your bank. We will map it into transactions, update cashflow automatically, and ask you to review anything that looks uncertain.</p>
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
