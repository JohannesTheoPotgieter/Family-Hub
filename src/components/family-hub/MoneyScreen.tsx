import { useMemo, useState } from 'react';
import { FoundationBlock, ScreenIntro } from './BaselineScaffold';
import { formatCurrency } from '../../lib/family-hub/format';
import { getTodayIso } from '../../lib/family-hub/date';
import type { ActualTransaction, PaymentItem, UserSetupProfile } from '../../lib/family-hub/storage';

type Props = {
  profile?: UserSetupProfile;
  payments: PaymentItem[];
  actualTransactions: ActualTransaction[];
  onSaveProfile: (next: UserSetupProfile) => void;
  onAddPayment: (payment: Omit<PaymentItem, 'id' | 'paid'>) => void;
  onTogglePaymentPaid: (id: string) => void;
  onAddTransaction: (transaction: Omit<ActualTransaction, 'id'>) => void;
};

type ComposerMode = 'opening' | 'income' | 'payment' | 'budget' | 'inflow' | 'outflow' | null;

type TimelineEntry = {
  id: string;
  date: string;
  label: string;
  amount: number;
  type: 'planned' | 'actual' | 'income';
  direction: 'inflow' | 'outflow';
};

const getMonthStamp = (iso: string) => iso.slice(0, 7);

export const MoneyScreen = ({
  profile,
  payments,
  actualTransactions,
  onSaveProfile,
  onAddPayment,
  onTogglePaymentPaid,
  onAddTransaction
}: Props) => {
  const [mode, setMode] = useState<ComposerMode>(null);
  const [amountInput, setAmountInput] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [dueDateInput, setDueDateInput] = useState(getTodayIso());

  const todayIso = getTodayIso();
  const currentMonth = getMonthStamp(todayIso);
  const monthStart = `${currentMonth}-01`;

  const monthlyPayments = useMemo(() => payments.filter((item) => getMonthStamp(item.dueDate) === currentMonth), [payments, currentMonth]);
  const unpaidPlannedPayments = monthlyPayments.filter((item) => !item.paid);
  const monthlyActualTransactions = useMemo(
    () => actualTransactions.filter((item) => getMonthStamp(item.date) === currentMonth),
    [actualTransactions, currentMonth]
  );

  const openingBalance = profile?.openingBalance ?? 0;
  const monthlyIncome = profile?.monthlyIncome ?? 0;
  const recurringOutflows = profile?.recurringPayments.reduce((total, payment) => total + payment.amount, 0) ?? 0;
  const budgetOutflows = profile?.budgetCategories.reduce((total, category) => total + category.amount, 0) ?? 0;
  const plannedPaymentsOutflow = unpaidPlannedPayments.reduce((total, payment) => total + payment.amount, 0);

  const actualOutflows = monthlyActualTransactions
    .filter((item) => item.kind === 'outflow')
    .reduce((total, item) => total + item.amount, 0);
  const actualInflows = monthlyActualTransactions
    .filter((item) => item.kind === 'inflow')
    .reduce((total, item) => total + item.amount, 0);

  const plannedOutflows = recurringOutflows + budgetOutflows + plannedPaymentsOutflow;
  const inflows = monthlyIncome + actualInflows;
  const closingForecast = openingBalance + inflows - plannedOutflows - actualOutflows;

  const timeline = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [
      {
        id: 'base-income',
        date: monthStart,
        label: 'Monthly income baseline',
        amount: monthlyIncome,
        type: 'income',
        direction: 'inflow'
      },
      ...unpaidPlannedPayments.map((payment) => ({
        id: `planned-${payment.id}`,
        date: payment.dueDate,
        label: payment.title,
        amount: payment.amount,
        type: 'planned' as const,
        direction: 'outflow' as const
      })),
      ...monthlyActualTransactions.map((tx) => ({
        id: `actual-${tx.id}`,
        date: tx.date,
        label: tx.title,
        amount: tx.amount,
        type: 'actual' as const,
        direction: tx.kind
      }))
    ];

    return entries.sort((a, b) => a.date.localeCompare(b.date));
  }, [monthStart, monthlyIncome, unpaidPlannedPayments, monthlyActualTransactions]);

  const timelineWithBalance = useMemo(() => {
    let runningBalance = openingBalance;
    return timeline.map((entry) => {
      const delta = entry.direction === 'inflow' ? entry.amount : -entry.amount;
      runningBalance += delta;
      return { ...entry, runningBalance };
    });
  }, [timeline, openingBalance]);

  const recentActivity = [...payments].sort((a, b) => b.dueDate.localeCompare(a.dueDate)).slice(0, 4);

  const hasAnyMoneyData = Boolean(
    profile?.openingBalance ||
      profile?.monthlyIncome ||
      profile?.budgetCategories.length ||
      profile?.recurringPayments.length ||
      payments.length ||
      actualTransactions.length
  );

  const submitComposer = () => {
    const parsedAmount = Number.parseFloat(amountInput.replace(',', '.'));
    if (Number.isNaN(parsedAmount)) return;

    const baseProfile: UserSetupProfile = {
      openingBalance: profile?.openingBalance ?? 0,
      monthlyIncome: profile?.monthlyIncome ?? 0,
      recurringPayments: profile?.recurringPayments ?? [],
      budgetCategories: profile?.budgetCategories ?? [],
      avatarName: profile?.avatarName
    };

    if (mode === 'opening') {
      onSaveProfile({ ...baseProfile, openingBalance: parsedAmount });
    }

    if (mode === 'income') {
      onSaveProfile({ ...baseProfile, monthlyIncome: parsedAmount });
    }

    if (mode === 'budget' && labelInput.trim()) {
      onSaveProfile({
        ...baseProfile,
        budgetCategories: [
          {
            id: crypto.randomUUID(),
            label: labelInput.trim(),
            amount: parsedAmount
          },
          ...baseProfile.budgetCategories
        ]
      });
    }

    if (mode === 'payment' && labelInput.trim()) {
      onAddPayment({
        title: labelInput.trim(),
        amount: parsedAmount,
        dueDate: dueDateInput
      });
    }

    if ((mode === 'inflow' || mode === 'outflow') && labelInput.trim()) {
      onAddTransaction({
        title: labelInput.trim(),
        amount: parsedAmount,
        date: dueDateInput,
        kind: mode
      });
    }

    setAmountInput('');
    setLabelInput('');
    setDueDateInput(getTodayIso());
    setMode(null);
  };

  return (
    <section className="stack-lg money-overview">
      <ScreenIntro
        badge="Cashflow"
        title="Cashflow forecast"
        subtitle="See opening balance, inflows, planned outflows, and due payments in one clean timeline."
      />

      <article className="glass-panel money-hero stack-sm">
        <p className="eyebrow">Forecast closing</p>
        <h3 className={`money-net ${closingForecast < 0 ? 'is-negative' : ''}`}>{formatCurrency(closingForecast)}</h3>
        <div className="money-kpi-grid">
          <div className="money-kpi">
            <span>Opening</span>
            <strong>{formatCurrency(openingBalance)}</strong>
          </div>
          <div className="money-kpi">
            <span>Inflows</span>
            <strong>{formatCurrency(inflows)}</strong>
          </div>
          <div className="money-kpi">
            <span>Planned outflows</span>
            <strong>{formatCurrency(plannedOutflows)}</strong>
          </div>
          <div className="money-kpi">
            <span>Planned due</span>
            <strong>{formatCurrency(plannedPaymentsOutflow)}</strong>
          </div>
          <div className="money-kpi">
            <span>Actual outflows</span>
            <strong>{formatCurrency(actualOutflows)}</strong>
          </div>
          <div className="money-kpi">
            <span>Due count</span>
            <strong>{unpaidPlannedPayments.length}</strong>
          </div>
        </div>
      </article>

      <FoundationBlock title="Quick actions" description="Fast updates with premium, tap-friendly controls.">
        <div className="quick-actions">
          <button className="chip-action" onClick={() => setMode('opening')}>Set opening</button>
          <button className="chip-action" onClick={() => setMode('income')}>Set income</button>
          <button className="chip-action" onClick={() => setMode('payment')}>Plan payment</button>
          <button className="chip-action" onClick={() => setMode('outflow')}>Log outflow</button>
          <button className="chip-action" onClick={() => setMode('inflow')}>Log inflow</button>
          <button className="chip-action" onClick={() => setMode('budget')}>Add budget</button>
        </div>
      </FoundationBlock>

      {mode ? (
        <article className="glass-panel money-composer stack-sm">
          <p className="eyebrow">{mode === 'budget' ? 'Add budget' : `Add ${mode}`}</p>
          {mode === 'payment' || mode === 'budget' || mode === 'inflow' || mode === 'outflow' ? (
            <input
              value={labelInput}
              placeholder={mode === 'payment' ? 'Payment name' : mode === 'budget' ? 'Budget category' : 'Transaction label'}
              onChange={(event) => setLabelInput(event.target.value)}
            />
          ) : null}
          <input value={amountInput} inputMode="decimal" placeholder="Amount" onChange={(event) => setAmountInput(event.target.value)} />
          {mode === 'payment' || mode === 'inflow' || mode === 'outflow' ? (
            <input type="date" value={dueDateInput} onChange={(event) => setDueDateInput(event.target.value)} />
          ) : null}
          <div className="task-composer-actions">
            <button className="btn btn-ghost" onClick={() => setMode(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={submitComposer}>Save</button>
          </div>
        </article>
      ) : null}

      {!hasAnyMoneyData ? (
        <article className="glass-panel money-empty stack-sm">
          <p className="money-empty-icon">🌊</p>
          <h3>Start your cashflow in one minute</h3>
          <p className="muted">Add an opening balance and first planned payment to instantly see your forecast closing figure.</p>
          <div className="empty-actions">
            <button className="btn btn-primary" onClick={() => setMode('opening')}>Add opening balance</button>
            <button className="btn btn-ghost" onClick={() => setMode('income')}>Add monthly income</button>
            <button className="btn btn-ghost" onClick={() => setMode('payment')}>Plan first payment</button>
          </div>
        </article>
      ) : (
        <>
          <FoundationBlock title="Forecast timeline" description="Planned and actual are separated to keep counting accurate.">
            <div className="stack-sm">
              {timelineWithBalance.length ? (
                timelineWithBalance.map((entry) => (
                  <article key={entry.id} className="money-timeline-item">
                    <div>
                      <p className="money-activity-title">{entry.label}</p>
                      <p className="muted">{entry.date}</p>
                    </div>
                    <div className="money-activity-meta">
                      <strong className={entry.direction === 'outflow' ? 'money-negative' : 'money-positive'}>
                        {entry.direction === 'outflow' ? '-' : '+'}
                        {formatCurrency(entry.amount)}
                      </strong>
                      <span className={`item-tag ${entry.type === 'actual' ? 'is-soft' : entry.type === 'planned' ? 'is-warn' : ''}`}>
                        {entry.type}
                      </span>
                      <span className="muted">Bal {formatCurrency(entry.runningBalance)}</span>
                    </div>
                  </article>
                ))
              ) : (
                <p className="muted">Add your first amount to build a live cashflow timeline.</p>
              )}
            </div>
          </FoundationBlock>

          <FoundationBlock title="Planned payments" description="Tap to mark paid and auto-convert into actual transaction.">
            <div className="stack-sm">
              {recentActivity.length ? (
                recentActivity.map((item) => (
                  <button key={item.id} className="money-activity-item" onClick={() => onTogglePaymentPaid(item.id)}>
                    <div>
                      <p className="money-activity-title">{item.title}</p>
                      <p className="muted">Due {item.dueDate}</p>
                    </div>
                    <div className="money-activity-meta">
                      <strong>{formatCurrency(item.amount)}</strong>
                      <span className={`item-tag ${item.paid ? 'is-soft' : 'is-warn'}`}>{item.paid ? 'Paid → Actual' : 'Planned due'}</span>
                    </div>
                  </button>
                ))
              ) : (
                <p className="muted">No planned payments yet. Add one to start forecasting.</p>
              )}
            </div>
          </FoundationBlock>
        </>
      )}
    </section>
  );
};
