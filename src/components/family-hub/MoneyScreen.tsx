import { type ChangeEvent, useMemo, useState } from 'react';
import { FoundationBlock, ScreenIntro } from './BaselineScaffold';
import { formatCurrency } from '../../lib/family-hub/format';
import { getTodayIso } from '../../lib/family-hub/date';
import type { ActualTransaction, PaymentItem, UserSetupProfile } from '../../lib/family-hub/storage';

type Props = {
  profile?: UserSetupProfile;
  payments: PaymentItem[];
  actualTransactions: ActualTransaction[];
  onSaveProfile: (next: UserSetupProfile) => void;
  onAddPayment: (payment: Omit<PaymentItem, 'id' | 'paid' | 'proofFileName' | 'linkedTransactionId' | 'paidDate'>) => void;
  onMarkPaymentPaid: (id: string, proofFileName: string) => void;
  onAddTransaction: (transaction: Omit<ActualTransaction, 'id'>) => void;
  onUpdateTransaction: (id: string, transaction: Omit<ActualTransaction, 'id'>) => void;
};

type MoneyTab = 'overview' | 'cashflow' | 'budget' | 'transactions' | 'payments';
type PaymentFilter = 'upcoming' | 'paid' | 'overdue';
type TxFilter = 'all' | 'income' | 'expense';

const PAYMENT_CATEGORIES = ['Housing', 'Utilities', 'School', 'Subscriptions', 'Insurance', 'Health', 'Other'];
const tabOptions: { key: MoneyTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'cashflow', label: 'Cashflow' },
  { key: 'budget', label: 'Budget' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'payments', label: 'Payments' }
];

const getPaymentStatus = (payment: PaymentItem, todayIso: string): PaymentFilter => {
  if (payment.paid) return 'paid';
  if (payment.dueDate < todayIso) return 'overdue';
  return 'upcoming';
};

const formatDueDate = (isoDate: string) =>
  new Intl.DateTimeFormat('en-ZA', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(isoDate));

const parseAmount = (value: string) => Number.parseFloat(value.replace(',', '.'));

export const MoneyScreen = ({ profile, payments, actualTransactions, onSaveProfile, onAddPayment, onMarkPaymentPaid, onAddTransaction, onUpdateTransaction }: Props) => {
  const [tab, setTab] = useState<MoneyTab>('overview');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('upcoming');
  const [txFilter, setTxFilter] = useState<TxFilter>('all');
  const [paymentFeedback, setPaymentFeedback] = useState('');

  const [quickPaymentTitle, setQuickPaymentTitle] = useState('');
  const [quickPaymentAmount, setQuickPaymentAmount] = useState('');
  const [quickPaymentDate, setQuickPaymentDate] = useState(getTodayIso());
  const [quickPaymentCategory, setQuickPaymentCategory] = useState(PAYMENT_CATEGORIES[0]);
  const [autoCreateTransaction, setAutoCreateTransaction] = useState(true);

  const [txIdEditing, setTxIdEditing] = useState<string | null>(null);
  const [txTitle, setTxTitle] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txDate, setTxDate] = useState(getTodayIso());
  const [txCategory, setTxCategory] = useState('Other');
  const [txKind, setTxKind] = useState<'inflow' | 'outflow'>('outflow');
  const [txReceiptFileName, setTxReceiptFileName] = useState<string | undefined>(undefined);

  const todayIso = getTodayIso();
  const openingBalance = profile?.openingBalance ?? 0;
  const monthlyIncome = profile?.monthlyIncome ?? 0;

  const paymentCounts = useMemo(() => {
    return payments.reduce(
      (acc, payment) => {
        acc[getPaymentStatus(payment, todayIso)] += 1;
        return acc;
      },
      { upcoming: 0, paid: 0, overdue: 0 } as Record<PaymentFilter, number>
    );
  }, [payments, todayIso]);

  const visiblePayments = useMemo(
    () => [...payments].filter((payment) => getPaymentStatus(payment, todayIso) === paymentFilter).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [payments, paymentFilter, todayIso]
  );

  const txVisible = useMemo(() => {
    if (txFilter === 'all') return actualTransactions;
    if (txFilter === 'income') return actualTransactions.filter((tx) => tx.kind === 'inflow');
    return actualTransactions.filter((tx) => tx.kind === 'outflow');
  }, [actualTransactions, txFilter]);

  const totalIncome = actualTransactions.filter((tx) => tx.kind === 'inflow').reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpense = actualTransactions.filter((tx) => tx.kind === 'outflow').reduce((sum, tx) => sum + tx.amount, 0);
  const unpaidPlanned = payments.filter((payment) => !payment.paid).reduce((sum, payment) => sum + payment.amount, 0);
  const forecastClosing = openingBalance + monthlyIncome + totalIncome - totalExpense - unpaidPlanned;

  const cashflowItems = useMemo(() => {
    const planned = payments
      .filter((payment) => !payment.paid)
      .map((payment) => ({ id: payment.id, date: payment.dueDate, title: payment.title, amount: -payment.amount, kind: 'planned' as const }));
    const actual = actualTransactions.map((tx) => ({
      id: tx.id,
      date: tx.date,
      title: tx.title,
      amount: tx.kind === 'inflow' ? tx.amount : -tx.amount,
      kind: 'actual' as const
    }));
    return [...planned, ...actual].sort((a, b) => a.date.localeCompare(b.date));
  }, [payments, actualTransactions]);

  const budgetRows = profile?.budgetCategories ?? [];
  const budgetActualByCategory = useMemo(() => {
    return actualTransactions.reduce<Record<string, number>>((acc, tx) => {
      if (tx.kind !== 'outflow') return acc;
      const category = tx.category ?? 'Other';
      acc[category] = (acc[category] ?? 0) + tx.amount;
      return acc;
    }, {});
  }, [actualTransactions]);

  const addPlannedPayment = () => {
    const amount = parseAmount(quickPaymentAmount);
    if (Number.isNaN(amount) || amount <= 0 || !quickPaymentTitle.trim()) return;
    onAddPayment({ title: quickPaymentTitle.trim(), amount, dueDate: quickPaymentDate, category: quickPaymentCategory, autoCreateTransaction });
    setQuickPaymentTitle('');
    setQuickPaymentAmount('');
    setQuickPaymentDate(getTodayIso());
    setQuickPaymentCategory(PAYMENT_CATEGORIES[0]);
    setAutoCreateTransaction(true);
    setPaymentFeedback('Payment added to your plan.');
  };

  const handleProofPicked = (paymentId: string) => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    onMarkPaymentPaid(paymentId, file.name);
    setPaymentFeedback(`Payment confirmed with proof: ${file.name}`);
  };

  const handleReceiptPick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setTxReceiptFileName(file.name);
    if (!txTitle.trim()) {
      const prefill = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      setTxTitle(prefill);
    }
  };

  const saveTransaction = () => {
    const amount = parseAmount(txAmount);
    if (Number.isNaN(amount) || amount <= 0 || !txTitle.trim()) return;
    const payload: Omit<ActualTransaction, 'id'> = {
      title: txTitle.trim(),
      amount,
      date: txDate,
      category: txCategory,
      kind: txKind,
      receiptFileName: txReceiptFileName
    };
    if (txIdEditing) onUpdateTransaction(txIdEditing, payload);
    else onAddTransaction(payload);

    setTxIdEditing(null);
    setTxTitle('');
    setTxAmount('');
    setTxDate(getTodayIso());
    setTxCategory('Other');
    setTxKind('outflow');
    setTxReceiptFileName(undefined);
  };

  return (
    <section className="stack-lg money-overview">
      <ScreenIntro badge="Money" title="Family Money" subtitle="A calm financial cockpit for everyday household flow." />

      <div className="money-filter-row" role="tablist" aria-label="Money tabs">
        {tabOptions.map((item) => (
          <button key={item.key} className={`filter-pill ${tab === item.key ? 'is-active' : ''}`} onClick={() => setTab(item.key)}>{item.label}</button>
        ))}
      </div>

      {tab === 'overview' ? (
        <>
          <article className="glass-panel money-hero stack-sm">
            <p className="eyebrow">This month</p>
            <h3 className={`money-net ${forecastClosing < 0 ? 'is-negative' : ''}`}>{formatCurrency(forecastClosing)}</h3>
            <div className="money-kpi-grid">
              <div className="money-kpi"><span>Income</span><strong>{formatCurrency(monthlyIncome + totalIncome)}</strong></div>
              <div className="money-kpi"><span>Expenses</span><strong>{formatCurrency(totalExpense + unpaidPlanned)}</strong></div>
              <div className="money-kpi"><span>Payments due</span><strong>{paymentCounts.upcoming + paymentCounts.overdue}</strong></div>
            </div>
          </article>
          <FoundationBlock title="Quick actions" description="Start from the essentials.">
            <div className="money-kpi-grid">
              <button className="btn btn-ghost" onClick={() => setTab('payments')}>Add first payment</button>
              <button className="btn btn-ghost" onClick={() => setTab('transactions')}>Add transaction</button>
              <button className="btn btn-ghost" onClick={() => setTab('budget')}>Create first budget</button>
            </div>
          </FoundationBlock>
        </>
      ) : null}

      {tab === 'cashflow' ? (
        <FoundationBlock title="Cashflow" description="Planned and actual are separated so nothing is double counted.">
          <p>Opening balance: <strong>{formatCurrency(openingBalance)}</strong></p>
          <p>Monthly income: <strong>{formatCurrency(monthlyIncome)}</strong></p>
          <p>Planned outflows: <strong>{formatCurrency(unpaidPlanned)}</strong></p>
          <p>Forecast closing: <strong>{formatCurrency(forecastClosing)}</strong></p>
          <div className="stack-sm">
            {cashflowItems.length ? cashflowItems.map((item) => (
              <article key={item.id} className="money-payment-card">
                <div className="money-payment-head">
                  <div>
                    <p className="money-activity-title">{item.title}</p>
                    <p className="muted">{formatDueDate(item.date)}</p>
                  </div>
                  <strong>{formatCurrency(item.amount)}</strong>
                </div>
                <span className={`item-tag ${item.kind === 'planned' ? 'is-task' : 'is-soft'}`}>{item.kind === 'planned' ? 'Planned' : 'Actual'}</span>
              </article>
            )) : <p className="muted">No cashflow items yet.</p>}
          </div>
        </FoundationBlock>
      ) : null}

      {tab === 'budget' ? (
        <FoundationBlock title="Budget" description="Simple monthly categories with actual spend from transactions.">
          {budgetRows.length ? budgetRows.map((row) => {
            const actual = budgetActualByCategory[row.label] ?? 0;
            const remaining = row.amount - actual;
            const percent = row.amount > 0 ? Math.min(100, Math.round((actual / row.amount) * 100)) : 0;
            return (
              <article className="money-payment-card" key={row.id}>
                <div className="money-payment-head">
                  <p className="money-activity-title">{row.label}</p>
                  <strong>{formatCurrency(row.amount)}</strong>
                </div>
                <p className="muted">Actual {formatCurrency(actual)} · Remaining {formatCurrency(remaining)}</p>
                <progress max={100} value={percent} />
              </article>
            );
          }) : (
            <article className="glass-panel money-empty stack-sm">
              <h3>No budget yet</h3>
              <button className="btn btn-primary" onClick={() => onSaveProfile({ ...(profile ?? { openingBalance: 0, monthlyIncome: 0, recurringPayments: [], budgetCategories: [] }), budgetCategories: [{ id: crypto.randomUUID(), label: 'Groceries', amount: 0 }] })}>Create first budget</button>
            </article>
          )}
        </FoundationBlock>
      ) : null}

      {tab === 'transactions' ? (
        <>
          <FoundationBlock title="Capture transaction" description="Upload receipt, confirm details, save.">
            <div className="money-editor-grid">
              <input value={txTitle} placeholder="Description" onChange={(event) => setTxTitle(event.target.value)} />
              <input value={txAmount} inputMode="decimal" placeholder="Amount" onChange={(event) => setTxAmount(event.target.value)} />
            </div>
            <div className="money-editor-grid">
              <input type="date" value={txDate} onChange={(event) => setTxDate(event.target.value)} />
              <input value={txCategory} placeholder="Category" onChange={(event) => setTxCategory(event.target.value)} />
            </div>
            <div className="money-filter-row">
              <button className={`filter-pill ${txKind === 'inflow' ? 'is-active' : ''}`} onClick={() => setTxKind('inflow')}>Income</button>
              <button className={`filter-pill ${txKind === 'outflow' ? 'is-active' : ''}`} onClick={() => setTxKind('outflow')}>Expense</button>
              <label className="btn btn-ghost money-upload-btn">Upload receipt<input type="file" accept="image/*" onChange={handleReceiptPick} /></label>
            </div>
            {txReceiptFileName ? <p className="muted">Receipt: {txReceiptFileName}</p> : null}
            <button className="btn btn-primary" onClick={saveTransaction}>{txIdEditing ? 'Save edit' : 'Save transaction'}</button>
          </FoundationBlock>

          <FoundationBlock title="Transactions" description="All entries in one clear list.">
            <div className="money-filter-row">
              <button className={`filter-pill ${txFilter === 'all' ? 'is-active' : ''}`} onClick={() => setTxFilter('all')}>All</button>
              <button className={`filter-pill ${txFilter === 'income' ? 'is-active' : ''}`} onClick={() => setTxFilter('income')}>Income</button>
              <button className={`filter-pill ${txFilter === 'expense' ? 'is-active' : ''}`} onClick={() => setTxFilter('expense')}>Expense</button>
            </div>
            <div className="stack-sm">
              {txVisible.length ? txVisible.map((tx) => (
                <article className="money-payment-card" key={tx.id}>
                  <div className="money-payment-head">
                    <div>
                      <p className="money-activity-title">{tx.title}</p>
                      <p className="muted">{formatDueDate(tx.date)} · {tx.category ?? 'Other'}</p>
                    </div>
                    <strong>{formatCurrency(tx.kind === 'inflow' ? tx.amount : -tx.amount)}</strong>
                  </div>
                  <div className="money-payment-meta">
                    <span className={`item-tag ${tx.kind === 'inflow' ? 'is-soft' : 'is-task'}`}>{tx.kind === 'inflow' ? 'Income' : 'Expense'}</span>
                    <span className="route-pill">Receipt: {tx.receiptFileName ?? 'None'}</span>
                    <button className="btn btn-ghost" onClick={() => {
                      setTxIdEditing(tx.id);
                      setTxTitle(tx.title);
                      setTxAmount(String(tx.amount));
                      setTxDate(tx.date);
                      setTxCategory(tx.category ?? 'Other');
                      setTxKind(tx.kind);
                      setTxReceiptFileName(tx.receiptFileName);
                    }}>Edit</button>
                  </div>
                </article>
              )) : <p className="muted">No transactions yet.</p>}
            </div>
          </FoundationBlock>
        </>
      ) : null}

      {tab === 'payments' ? (
        <>
          <FoundationBlock title="Add payment" description="Simple and trusted Pay + proof flow.">
            <div className="money-editor-grid">
              <input value={quickPaymentTitle} placeholder="Payment name" onChange={(event) => setQuickPaymentTitle(event.target.value)} />
              <input value={quickPaymentAmount} inputMode="decimal" placeholder="Amount" onChange={(event) => setQuickPaymentAmount(event.target.value)} />
            </div>
            <div className="money-editor-grid">
              <input type="date" value={quickPaymentDate} onChange={(event) => setQuickPaymentDate(event.target.value)} />
              <select value={quickPaymentCategory} onChange={(event) => setQuickPaymentCategory(event.target.value)}>
                {PAYMENT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
            <label className="task-shared-toggle">
              <input type="checkbox" checked={autoCreateTransaction} onChange={(event) => setAutoCreateTransaction(event.target.checked)} />
              Auto-create linked expense transaction after Pay + proof
            </label>
            <button className="btn btn-primary" onClick={addPlannedPayment}>Add payment</button>
          </FoundationBlock>

          <FoundationBlock title="Payments" description="Upcoming, paid and overdue with proof tracking.">
            <div className="money-filter-row" role="tablist" aria-label="Payment filters">
              <button className={`filter-pill ${paymentFilter === 'upcoming' ? 'is-active' : ''}`} onClick={() => setPaymentFilter('upcoming')}>Upcoming · {paymentCounts.upcoming}</button>
              <button className={`filter-pill ${paymentFilter === 'paid' ? 'is-active' : ''}`} onClick={() => setPaymentFilter('paid')}>Paid · {paymentCounts.paid}</button>
              <button className={`filter-pill ${paymentFilter === 'overdue' ? 'is-active' : ''}`} onClick={() => setPaymentFilter('overdue')}>Overdue · {paymentCounts.overdue}</button>
            </div>

            {paymentFeedback ? <p className="status-banner is-success">{paymentFeedback}</p> : null}
            {visiblePayments.length ? (
              <div className="stack-sm">
                {visiblePayments.map((payment) => {
                  const status = getPaymentStatus(payment, todayIso);
                  const statusLabel = status === 'paid' ? 'Paid' : status === 'overdue' ? 'Overdue' : 'Upcoming';
                  return (
                    <article key={payment.id} className="money-payment-card">
                      <div className="money-payment-head">
                        <div>
                          <p className="money-activity-title">{payment.title}</p>
                          <p className="muted">Due {formatDueDate(payment.dueDate)} · {payment.category}</p>
                        </div>
                        <strong>{formatCurrency(payment.amount)}</strong>
                      </div>
                      <div className="money-payment-meta">
                        <span className={`item-tag ${status === 'paid' ? 'is-soft' : status === 'overdue' ? 'is-warn' : 'is-task'}`}>{statusLabel}</span>
                        <span className="route-pill">Proof: {payment.proofFileName ?? 'Not attached'}</span>
                        <span className="route-pill">Linked tx: {payment.linkedTransactionId ? 'Created' : payment.autoCreateTransaction === false ? 'Disabled' : 'Pending'}</span>
                      </div>
                      {!payment.paid ? (
                        <label className="btn btn-primary money-upload-btn">Pay + proof<input type="file" accept="image/*" onChange={handleProofPicked(payment.id)} /></label>
                      ) : (
                        <p className="muted">Paid confirmation saved{payment.paidDate ? ` on ${payment.paidDate}` : ''}.</p>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : <p className="muted">No entries yet. Add first payment.</p>}
          </FoundationBlock>
        </>
      ) : null}
    </section>
  );
};
