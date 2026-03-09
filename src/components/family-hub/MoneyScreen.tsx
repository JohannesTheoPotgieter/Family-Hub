import { useState } from 'react';
import { formatCurrency } from '../../lib/family-hub/format';
import { MONEY_TABS, type MoneyTab } from '../../lib/family-hub/constants';
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

  return (
    <section className="stack">
      <h2>Money</h2>
      <div className="row wrap">
        {MONEY_TABS.map((item) => (
          <button key={item} className={item === tab ? 'active' : ''} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="grid">
          <div className="card">Open payments: {payments.filter((p) => !p.paid).length}</div>
          <div className="card">Transactions: {transactions.length || 'No transactions yet'}</div>
        </div>
      )}

      {tab === 'Cashflow' &&
        (cashflowItems.length ? (
          <ul className="list">{cashflowItems.map((c) => <li key={c.id}>{c.title}</li>)}</ul>
        ) : (
          <div className="empty">No cashflow items yet</div>
        ))}

      {tab === 'Budget' &&
        (budgets.length ? (
          <ul className="list">{budgets.map((b) => <li key={b.id}>{b.category}</li>)}</ul>
        ) : (
          <div className="empty">No budget created yet</div>
        ))}

      {tab === 'Transactions' &&
        (transactions.length ? (
          <ul className="list">
            {transactions.map((t) => (
              <li key={t.id}>
                {t.date}: {t.description} ({formatCurrency(t.amount)})
                {t.note ? <div className="small">{t.note}</div> : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">No transactions yet</div>
        ))}

      {tab === 'Payments' && (
        <div className="stack">
          <label className="row">
            <input
              type="checkbox"
              checked={autoCreateTransaction}
              onChange={(e) => onToggleAutoCreate(e.target.checked)}
            />
            Auto-create linked transaction on pay
          </label>
          <form
            className="row wrap"
            onSubmit={(e) => {
              e.preventDefault();
              const amount = Number(newPayment.amount);
              if (!newPayment.title.trim() || !newPayment.dueDate || Number.isNaN(amount)) return;
              onAddPayment({ title: newPayment.title.trim(), amount, dueDate: newPayment.dueDate });
              setNewPayment({ title: '', amount: '', dueDate: '' });
            }}
          >
            <input
              placeholder="Payment title"
              value={newPayment.title}
              onChange={(e) => setNewPayment((curr) => ({ ...curr, title: e.target.value }))}
            />
            <input
              placeholder="Amount"
              type="number"
              value={newPayment.amount}
              onChange={(e) => setNewPayment((curr) => ({ ...curr, amount: e.target.value }))}
            />
            <input
              type="date"
              value={newPayment.dueDate}
              onChange={(e) => setNewPayment((curr) => ({ ...curr, dueDate: e.target.value }))}
            />
            <button type="submit">Create payment</button>
          </form>
          {!payments.length ? <div className="empty">No payments due yet</div> : null}
          {payments.map((payment) => (
            <PaymentRow key={payment.id} payment={payment} onPayWithProof={onPayWithProof} />
          ))}
        </div>
      )}
    </section>
  );
};

const PaymentRow = ({
  payment,
  onPayWithProof
}: {
  payment: Payment;
  onPayWithProof: (paymentId: string, proofFile?: File) => void;
}) => {
  const [file, setFile] = useState<File | undefined>();
  return (
    <div className="card stack">
      <div className="row spread">
        <strong>{payment.title}</strong>
        <span>{formatCurrency(payment.amount)}</span>
      </div>
      <div className="small">Due: {payment.dueDate}</div>
      {payment.paid ? (
        <div className="small">Paid{payment.proofFilename ? ` • proof: ${payment.proofFilename}` : ''}</div>
      ) : (
        <>
          <input type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0])} />
          <button onClick={() => onPayWithProof(payment.id, file)}>Pay + proof</button>
        </>
      )}
    </div>
  );
};
