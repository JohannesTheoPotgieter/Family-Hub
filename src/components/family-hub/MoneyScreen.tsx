import { useMemo, useState } from 'react';
import { MONEY_TABS, type MoneyTab } from '../../lib/family-hub/constants';
import { formatCurrency } from '../../lib/family-hub/format';
import type { Budget, CashflowItem, Payment, Transaction } from '../../lib/family-hub/storage';

type Props = {
  payments: Payment[];
  transactions: Transaction[];
  budgets: Budget[];
  cashflowItems: CashflowItem[];
  autoCreateTransaction: boolean;
  onToggleAutoCreate: (value: boolean) => void;
  onAddPayment: (input: { title: string; amount: number; dueDate: string }) => void;
  onPayWithProof: (paymentId: string, proofFile?: File) => void;
};

export const MoneyScreen = ({
  payments,
  transactions,
  budgets,
  cashflowItems,
  autoCreateTransaction,
  onToggleAutoCreate,
  onAddPayment,
  onPayWithProof
}: Props) => {
  const [tab, setTab] = useState<MoneyTab>('Overview');
  const [newPayment, setNewPayment] = useState({ title: '', amount: '', dueDate: '' });

  const overview = useMemo(() => {
    const income = transactions.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0);
    const expenses = transactions.filter((item) => item.amount < 0).reduce((sum, item) => sum + item.amount, 0);
    const due = payments.filter((payment) => !payment.paid).reduce((sum, payment) => sum + payment.amount, 0);
    return {
      income,
      expenses,
      due,
      net: income + expenses
    };
  }, [transactions, payments]);

  return (
    <section className="stack-lg">
      <div className="screen-title">
        <h2>Money</h2>
        <p className="muted">A clean cockpit for shared household finances.</p>
      </div>

      <div className="segmented-control glass-card">
        {MONEY_TABS.map((item) => (
          <button key={item} className={item === tab ? 'is-active' : ''} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="metrics-grid">
          <article className="glass-card metric-card">
            <p className="metric-label">Net</p>
            <p className="metric-value">{formatCurrency(overview.net)}</p>
          </article>
          <article className="glass-card metric-card">
            <p className="metric-label">Income</p>
            <p className="metric-value">{formatCurrency(overview.income)}</p>
          </article>
          <article className="glass-card metric-card">
            <p className="metric-label">Expenses</p>
            <p className="metric-value">{formatCurrency(overview.expenses)}</p>
          </article>
          <article className="glass-card metric-card">
            <p className="metric-label">Payments due</p>
            <p className="metric-value">{formatCurrency(overview.due)}</p>
          </article>
        </div>
      )}

      {tab === 'Cashflow' &&
        (cashflowItems.length ? (
          <div className="stack">
            {cashflowItems.map((item) => (
              <div key={item.id} className="glass-card list-row">
                <span>{item.title}</span>
                <span>{formatCurrency(item.amount)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">No cashflow items yet.</div>
        ))}

      {tab === 'Budget' &&
        (budgets.length ? (
          <div className="stack">
            {budgets.map((item) => (
              <div key={item.id} className="glass-card list-row">
                <span>{item.category}</span>
                <span>
                  {formatCurrency(item.spent)} / {formatCurrency(item.limit)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">No budget created yet.</div>
        ))}

      {tab === 'Transactions' &&
        (transactions.length ? (
          <div className="stack">
            {transactions.map((item) => (
              <div key={item.id} className="glass-card stack-sm">
                <div className="list-row">
                  <strong>{item.description}</strong>
                  <strong>{formatCurrency(item.amount)}</strong>
                </div>
                <div className="muted">{item.date}</div>
                {item.note ? <div className="muted">{item.note}</div> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">No transactions yet.</div>
        ))}

      {tab === 'Payments' && (
        <section className="stack">
          <article className="glass-card stack">
            <label className="switch-row">
              <input
                type="checkbox"
                checked={autoCreateTransaction}
                onChange={(e) => onToggleAutoCreate(e.target.checked)}
              />
              <span>Auto-create linked transaction after payment proof</span>
            </label>

            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                const amount = Number(newPayment.amount);
                if (!newPayment.title.trim() || !newPayment.dueDate || Number.isNaN(amount) || amount <= 0) return;
                onAddPayment({ title: newPayment.title.trim(), amount, dueDate: newPayment.dueDate });
                setNewPayment({ title: '', amount: '', dueDate: '' });
              }}
            >
              <input
                value={newPayment.title}
                onChange={(e) => setNewPayment((current) => ({ ...current, title: e.target.value }))}
                placeholder="Payment title"
              />
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={newPayment.amount}
                onChange={(e) => setNewPayment((current) => ({ ...current, amount: e.target.value }))}
                placeholder="Amount"
              />
              <input
                type="date"
                value={newPayment.dueDate}
                onChange={(e) => setNewPayment((current) => ({ ...current, dueDate: e.target.value }))}
              />
              <button className="btn btn-primary" type="submit">
                Create payment
              </button>
            </form>
          </article>

          {!payments.length ? <div className="empty-state">No payments created yet.</div> : null}
          {payments.map((payment) => (
            <PaymentCard key={payment.id} payment={payment} onPayWithProof={onPayWithProof} />
          ))}
        </section>
      )}
    </section>
  );
};

const PaymentCard = ({
  payment,
  onPayWithProof
}: {
  payment: Payment;
  onPayWithProof: (paymentId: string, proofFile?: File) => void;
}) => {
  const [proof, setProof] = useState<File | undefined>();

  return (
    <article className="glass-card stack payment-card">
      <div className="list-row">
        <strong>{payment.title}</strong>
        <strong>{formatCurrency(payment.amount)}</strong>
      </div>
      <div className="muted">Due {payment.dueDate}</div>

      {payment.paid ? (
        <div className="paid-banner">Paid{payment.proofFilename ? ` • ${payment.proofFilename}` : ''}</div>
      ) : (
        <>
          <input type="file" accept="image/*,.pdf" onChange={(e) => setProof(e.target.files?.[0])} />
          {proof ? <p className="muted">Selected proof: {proof.name}</p> : <p className="muted">Add receipt or payment proof.</p>}
          <button className="btn btn-primary" disabled={!proof} onClick={() => onPayWithProof(payment.id, proof)}>
            Pay + proof
          </button>
        </>
      )}
    </article>
  );
};
