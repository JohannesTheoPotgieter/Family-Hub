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

type PaymentFilter = 'upcoming' | 'paid' | 'overdue';

const PAYMENT_CATEGORIES = ['Housing', 'Utilities', 'School', 'Subscriptions', 'Insurance', 'Health', 'Other'];

const getPaymentStatus = (payment: PaymentItem, todayIso: string): PaymentFilter => {
  if (payment.paid) return 'paid';
  if (payment.dueDate < todayIso) return 'overdue';
  return 'upcoming';
};


const formatDueDate = (isoDate: string) =>
  new Intl.DateTimeFormat('en-ZA', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(isoDate));


export const MoneyScreen = ({ profile, payments, actualTransactions, onAddPayment, onMarkPaymentPaid }: Props) => {
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('upcoming');
  const [quickPaymentTitle, setQuickPaymentTitle] = useState('');
  const [quickPaymentAmount, setQuickPaymentAmount] = useState('');
  const [quickPaymentDate, setQuickPaymentDate] = useState(getTodayIso());
  const [quickPaymentCategory, setQuickPaymentCategory] = useState(PAYMENT_CATEGORIES[0]);
  const [autoCreateTransaction, setAutoCreateTransaction] = useState(true);
  const [paymentFeedback, setPaymentFeedback] = useState('');

  const todayIso = getTodayIso();
  const openingBalance = profile?.openingBalance ?? 0;
  const monthlyIncome = profile?.monthlyIncome ?? 0;

  const visiblePayments = useMemo(() => {
    return [...payments]
      .filter((payment) => getPaymentStatus(payment, todayIso) === paymentFilter)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [payments, paymentFilter, todayIso]);

  const paymentCounts = useMemo(() => {
    return payments.reduce(
      (acc, payment) => {
        acc[getPaymentStatus(payment, todayIso)] += 1;
        return acc;
      },
      { upcoming: 0, paid: 0, overdue: 0 } as Record<PaymentFilter, number>
    );
  }, [payments, todayIso]);

  const totalPlanned = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const totalPaid = payments.filter((payment) => payment.paid).reduce((sum, payment) => sum + payment.amount, 0);
  const trustBalance = openingBalance + monthlyIncome - totalPaid;

  const addPlannedPayment = () => {
    const parsedAmount = Number.parseFloat(quickPaymentAmount.replace(',', '.'));
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0 || !quickPaymentTitle.trim()) return;

    onAddPayment({
      title: quickPaymentTitle.trim(),
      amount: parsedAmount,
      dueDate: quickPaymentDate,
      category: quickPaymentCategory,
      autoCreateTransaction
    });

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

  return (
    <section className="stack-lg money-overview">
      <ScreenIntro badge="Money" title="Payments" subtitle="Trusted family payment flow with proof and linked transactions." />

      <article className="glass-panel money-hero stack-sm">
        <p className="eyebrow">Payments health</p>
        <h3 className={`money-net ${trustBalance < 0 ? 'is-negative' : ''}`}>{formatCurrency(trustBalance)}</h3>
        <div className="money-kpi-grid">
          <div className="money-kpi"><span>Planned</span><strong>{formatCurrency(totalPlanned)}</strong></div>
          <div className="money-kpi"><span>Paid</span><strong>{formatCurrency(totalPaid)}</strong></div>
          <div className="money-kpi"><span>Transactions</span><strong>{actualTransactions.length}</strong></div>
        </div>
      </article>

      <FoundationBlock title="Add payment" description="Simple and fast for busy family routines.">
        <div className="money-editor-grid">
          <input value={quickPaymentTitle} placeholder="Payment name" onChange={(event) => setQuickPaymentTitle(event.target.value)} />
          <input value={quickPaymentAmount} inputMode="decimal" placeholder="Amount" onChange={(event) => setQuickPaymentAmount(event.target.value)} />
        </div>
        <div className="money-editor-grid">
          <input type="date" value={quickPaymentDate} onChange={(event) => setQuickPaymentDate(event.target.value)} />
          <select value={quickPaymentCategory} onChange={(event) => setQuickPaymentCategory(event.target.value)}>
            {PAYMENT_CATEGORIES.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>
        <label className="task-shared-toggle">
          <input type="checkbox" checked={autoCreateTransaction} onChange={(event) => setAutoCreateTransaction(event.target.checked)} />
          Auto-create linked expense transaction after Pay + proof
        </label>
        <button className="btn btn-primary" onClick={addPlannedPayment}>Add payment</button>
      </FoundationBlock>

      <FoundationBlock title="Payments" description="Upload proof to mark paid and keep a trusted trail.">
        <div className="money-filter-row" role="tablist" aria-label="Payment filters">
          <button className={`filter-pill ${paymentFilter === 'upcoming' ? 'is-active' : ''}`} onClick={() => setPaymentFilter('upcoming')}>
            Upcoming · {paymentCounts.upcoming}
          </button>
          <button className={`filter-pill ${paymentFilter === 'paid' ? 'is-active' : ''}`} onClick={() => setPaymentFilter('paid')}>
            Paid · {paymentCounts.paid}
          </button>
          <button className={`filter-pill ${paymentFilter === 'overdue' ? 'is-active' : ''}`} onClick={() => setPaymentFilter('overdue')}>
            Overdue · {paymentCounts.overdue}
          </button>
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
                    <label className="btn btn-primary money-upload-btn">
                      Pay + proof
                      <input type="file" accept="image/*" onChange={handleProofPicked(payment.id)} />
                    </label>
                  ) : (
                    <p className="muted">Paid confirmation saved{payment.paidDate ? ` on ${payment.paidDate}` : ''}.</p>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <article className="glass-panel money-empty stack-sm">
            <p className="money-empty-icon">💳</p>
            <h3>No payments yet</h3>
            <p className="muted">Start with your first family payment and keep proof in one trusted place.</p>
            <button className="btn btn-primary" onClick={() => setPaymentFilter('upcoming')}>Switch to upcoming</button>
          </article>
        )}
      </FoundationBlock>
    </section>
  );
};
