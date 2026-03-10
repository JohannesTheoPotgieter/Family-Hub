import { useMemo, useState } from 'react';
import { FoundationBlock, ScreenIntro } from './BaselineScaffold';
import { formatCurrency } from '../../lib/family-hub/format';
import { getTodayIso } from '../../lib/family-hub/date';
import type { PaymentItem, UserSetupProfile } from '../../lib/family-hub/storage';

type Props = {
  profile?: UserSetupProfile;
  payments: PaymentItem[];
  onSaveProfile: (next: UserSetupProfile) => void;
  onAddPayment: (payment: Omit<PaymentItem, 'id' | 'paid'>) => void;
  onTogglePaymentPaid: (id: string) => void;
};

type ComposerMode = 'opening' | 'income' | 'payment' | 'budget' | null;

const getMonthStamp = (iso: string) => iso.slice(0, 7);

export const MoneyScreen = ({ profile, payments, onSaveProfile, onAddPayment, onTogglePaymentPaid }: Props) => {
  const [mode, setMode] = useState<ComposerMode>(null);
  const [amountInput, setAmountInput] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [dueDateInput, setDueDateInput] = useState(getTodayIso());

  const currentMonth = getMonthStamp(getTodayIso());
  const monthlyPayments = useMemo(
    () => payments.filter((item) => getMonthStamp(item.dueDate) === currentMonth),
    [payments, currentMonth]
  );

  const income = profile?.monthlyIncome ?? 0;
  const recurringExpenses =
    profile?.recurringPayments.reduce((total, payment) => total + payment.amount, 0) ?? 0;
  const scheduledExpenses = monthlyPayments.reduce((total, payment) => total + payment.amount, 0);
  const expenses = recurringExpenses + scheduledExpenses;
  const netThisMonth = income - expenses;
  const dueCount = monthlyPayments.filter((item) => !item.paid).length;

  const recentActivity = [...payments]
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
    .slice(0, 4);

  const hasAnyMoneyData = Boolean(
    profile?.openingBalance ||
      profile?.monthlyIncome ||
      profile?.budgetCategories.length ||
      profile?.recurringPayments.length ||
      payments.length
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

    setAmountInput('');
    setLabelInput('');
    setDueDateInput(getTodayIso());
    setMode(null);
  };

  return (
    <section className="stack-lg money-overview">
      <ScreenIntro
        badge="Money"
        title="Money cockpit"
        subtitle="A quick, family-friendly overview of what is coming in, going out, and due next."
      />

      <article className="glass-panel money-hero stack-sm">
        <p className="eyebrow">Net this month</p>
        <h3 className={`money-net ${netThisMonth < 0 ? 'is-negative' : ''}`}>{formatCurrency(netThisMonth)}</h3>
        <div className="money-kpi-grid">
          <div className="money-kpi">
            <span>Income</span>
            <strong>{formatCurrency(income)}</strong>
          </div>
          <div className="money-kpi">
            <span>Expenses</span>
            <strong>{formatCurrency(expenses)}</strong>
          </div>
          <div className="money-kpi">
            <span>Payments due</span>
            <strong>{dueCount}</strong>
          </div>
        </div>
      </article>

      <FoundationBlock title="Quick actions" description="Keep things updated in a tap.">
        <div className="quick-actions">
          <button className="chip-action" onClick={() => setMode('opening')}>Add opening balance</button>
          <button className="chip-action" onClick={() => setMode('income')}>Add monthly income</button>
          <button className="chip-action" onClick={() => setMode('payment')}>Add first payment</button>
          <button className="chip-action" onClick={() => setMode('budget')}>Create first budget</button>
        </div>
      </FoundationBlock>

      {mode ? (
        <article className="glass-panel money-composer stack-sm">
          <p className="eyebrow">{mode === 'budget' ? 'Add budget' : `Add ${mode}`}</p>
          {mode === 'payment' || mode === 'budget' ? (
            <input value={labelInput} placeholder={mode === 'payment' ? 'Payment name' : 'Budget category'} onChange={(event) => setLabelInput(event.target.value)} />
          ) : null}
          <input
            value={amountInput}
            inputMode="decimal"
            placeholder="Amount"
            onChange={(event) => setAmountInput(event.target.value)}
          />
          {mode === 'payment' ? (
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
          <p className="money-empty-icon">✨</p>
          <h3>Start your family money flow</h3>
          <p className="muted">Set up the basics once, then use quick actions to keep this overview fresh.</p>
          <div className="empty-actions">
            <button className="btn btn-primary" onClick={() => setMode('opening')}>Add opening balance</button>
            <button className="btn btn-ghost" onClick={() => setMode('income')}>Add monthly income</button>
            <button className="btn btn-ghost" onClick={() => setMode('payment')}>Add first payment</button>
            <button className="btn btn-ghost" onClick={() => setMode('budget')}>Create first budget</button>
          </div>
        </article>
      ) : (
        <FoundationBlock title="Recent activity" description="Latest payments and what still needs attention.">
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
                    <span className={`item-tag ${item.paid ? 'is-soft' : 'is-warn'}`}>{item.paid ? 'Paid' : 'Due'}</span>
                  </div>
                </button>
              ))
            ) : (
              <p className="muted">No activity yet. Add your first payment to get started.</p>
            )}
          </div>
        </FoundationBlock>
      )}
    </section>
  );
};
