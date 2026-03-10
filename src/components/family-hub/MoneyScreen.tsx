import { useMemo, useState } from 'react';
import { MONEY_TABS, type MoneyTab } from '../../lib/family-hub/constants';
import { getTodayIso } from '../../lib/family-hub/date';
import { formatCurrency } from '../../lib/family-hub/format';
import type { Budget, CashflowItem, Payment, Transaction } from '../../lib/family-hub/storage';

type Props = {
  payments: Payment[];
  transactions: Transaction[];
  budgets: Budget[];
  cashflowItems: CashflowItem[];
  autoCreateTransaction: boolean;
  onToggleAutoCreate: (value: boolean) => void;
  onAddPayment: (input: { title: string; category: string; amount: number; dueDate: string }) => void;
  onPayWithProof: (paymentId: string, proofFile?: File) => void;
  onCreateTransaction: (input: Omit<Transaction, 'id'>) => void;
};

export const MoneyScreen = (props: Props) => {
  const { payments, transactions, budgets, cashflowItems, autoCreateTransaction, onToggleAutoCreate, onAddPayment, onPayWithProof, onCreateTransaction } = props;
  const [tab, setTab] = useState<MoneyTab>('Overview');
  const [filter, setFilter] = useState<'upcoming' | 'paid' | 'overdue'>('upcoming');
  const [newPayment, setNewPayment] = useState({ title: '', amount: '', dueDate: getTodayIso(), category: 'Household' });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptInputKey, setReceiptInputKey] = useState(0);
  const [receiptForm, setReceiptForm] = useState({ description: '', amount: '', date: getTodayIso(), category: 'Groceries' });

  const overview = useMemo(() => {
    const income = transactions.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0);
    const expenses = transactions.filter((item) => item.amount < 0).reduce((sum, item) => sum + item.amount, 0);
    const due = payments.filter((payment) => !payment.paid).reduce((sum, payment) => sum + payment.amount, 0);
    const linkedPaymentTransactionIds = new Set(payments.filter((payment) => payment.linkedTransactionId).map((payment) => payment.linkedTransactionId));
    const manualExpenses = transactions
      .filter((item) => item.amount < 0 && !linkedPaymentTransactionIds.has(item.id))
      .reduce((sum, item) => sum + item.amount, 0);

    return { income, expenses, due, net: income + expenses, forecastAfterDue: income + manualExpenses - due };
  }, [transactions, payments]);

  const filteredPayments = payments.filter((payment) => {
    const today = getTodayIso();
    if (filter === 'paid') return payment.paid;
    if (filter === 'overdue') return !payment.paid && payment.dueDate < today;
    return !payment.paid && payment.dueDate >= today;
  });

  return (
    <section className="stack-lg">
      <div className="screen-title"><h2>Money</h2><p className="muted">Household finances, bills, and proof tracking.</p></div>
      <div className="segmented-control glass-card">{MONEY_TABS.map((item) => <button key={item} className={item === tab ? 'is-active' : ''} onClick={() => setTab(item)}>{item}</button>)}</div>
      {tab === 'Overview' && <><div className="metrics-grid">
        <article className="glass-card metric-card"><p className="metric-label">Net this month</p><p className="metric-value">{formatCurrency(overview.net)}</p></article>
        <article className="glass-card metric-card"><p className="metric-label">Income</p><p className="metric-value">{formatCurrency(overview.income)}</p></article>
        <article className="glass-card metric-card"><p className="metric-label">Expenses</p><p className="metric-value">{formatCurrency(overview.expenses)}</p></article>
        <article className="glass-card metric-card"><p className="metric-label">Payments due</p><p className="metric-value">{formatCurrency(overview.due)}</p></article>
      </div>
      <article className="glass-card stack"><h3>Recent activity</h3>{!transactions.length ? <div className="glass-card empty-state">No transactions yet.</div> : transactions.slice(-3).reverse().map((item) => <div key={item.id} className="list-row"><span>{item.description}</span><strong>{formatCurrency(item.amount)}</strong></div>)}</article>
      </>}
      {tab === 'Cashflow' && (
        <section className="stack">
          <article className="glass-card stack-sm">
            <p className="field-label">Forecast after unpaid bills</p>
            <strong>{formatCurrency(overview.forecastAfterDue)}</strong>
            <p className="muted">Avoids counting bills twice when a linked transaction already exists.</p>
          </article>
          {!cashflowItems.length ? <div className="glass-card empty-state">No cashflow items yet.</div> : <div className="stack">{cashflowItems.map((item) => <div key={item.id} className="glass-card list-row"><span>{item.title}</span><span>{formatCurrency(item.amount)}</span></div>)}</div>}
        </section>
      )}
      {tab === 'Budget' && (!budgets.length ? <div className="glass-card empty-state">No budget created yet.</div> : <div className="stack">{budgets.map((item) => <div key={item.id} className="glass-card list-row"><span>{item.category}</span><span>{formatCurrency(item.spent)} / {formatCurrency(item.limit)}</span></div>)}</div>)}
      {tab === 'Transactions' && <section className="stack">
        <article className="glass-card stack">
          <h3>Receipt confirmation</h3>
          <input
            key={receiptInputKey}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setReceiptFile(file);
              setReceiptForm((current) => ({ ...current, description: current.description || file.name.replace(/\.[^.]+$/, '') }));
            }}
          />
          {receiptFile ? <>
            <input value={receiptForm.description} onChange={(e) => setReceiptForm((c) => ({ ...c, description: e.target.value }))} placeholder="Description" />
            <input type="number" min="0.01" step="0.01" value={receiptForm.amount} onChange={(e) => setReceiptForm((c) => ({ ...c, amount: e.target.value }))} placeholder="Amount" />
            <input type="date" value={receiptForm.date} onChange={(e) => setReceiptForm((c) => ({ ...c, date: e.target.value }))} />
            <input value={receiptForm.category} onChange={(e) => setReceiptForm((c) => ({ ...c, category: e.target.value }))} placeholder="Category" />
            <button className="btn btn-primary" onClick={() => {
              const amount = Number(receiptForm.amount);
              if (!receiptFile || !receiptForm.description.trim() || !receiptForm.date || Number.isNaN(amount) || amount <= 0) return;
              onCreateTransaction({
                date: receiptForm.date,
                description: receiptForm.description.trim(),
                category: receiptForm.category.trim() || 'General',
                amount: -Math.abs(amount),
                note: `Image: ${receiptFile.name}`
              });
              setReceiptFile(null);
              setReceiptInputKey((k) => k + 1);
              setReceiptForm({ description: '', amount: '', date: getTodayIso(), category: 'Groceries' });
            }}>Confirm transaction</button>
          </> : <p className="muted">Upload image, confirm fields, and save.</p>}
        </article>
        {!transactions.length ? <div className="glass-card empty-state">No transactions yet.</div> : transactions.slice().reverse().map((item) => <div key={item.id} className="glass-card stack-sm"><div className="list-row"><strong>{item.description}</strong><strong>{formatCurrency(item.amount)}</strong></div><div className="muted">{item.date} • {item.category}</div>{item.note ? <div className="muted">{item.note}</div> : null}</div>)}
      </section>}
      {tab === 'Payments' && <section className="stack">
        <article className="glass-card stack">
          <label className="switch-row"><input type="checkbox" checked={autoCreateTransaction} onChange={(e) => onToggleAutoCreate(e.target.checked)} /><span>Auto-create linked transaction after proof upload</span></label>
          <form className="stack" onSubmit={(e) => {
            e.preventDefault();
            const amount = Number(newPayment.amount);
            if (!newPayment.title.trim() || Number.isNaN(amount) || amount <= 0) return;
            onAddPayment({ title: newPayment.title.trim(), amount, dueDate: newPayment.dueDate, category: newPayment.category.trim() || 'General' });
            setNewPayment({ title: '', amount: '', dueDate: getTodayIso(), category: 'Household' });
          }}>
            <input value={newPayment.title} onChange={(e) => setNewPayment((c) => ({ ...c, title: e.target.value }))} placeholder="Add payment" />
            <input value={newPayment.category} onChange={(e) => setNewPayment((c) => ({ ...c, category: e.target.value }))} placeholder="Category" />
            <input type="number" min="0.01" step="0.01" value={newPayment.amount} onChange={(e) => setNewPayment((c) => ({ ...c, amount: e.target.value }))} placeholder="Amount" />
            <input type="date" value={newPayment.dueDate} onChange={(e) => setNewPayment((c) => ({ ...c, dueDate: e.target.value }))} />
            <button className="btn btn-primary" type="submit">Create payment</button>
          </form>
        </article>
        <div className="segmented-control glass-card">{(['upcoming', 'paid', 'overdue'] as const).map((item) => <button key={item} className={filter === item ? 'is-active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>
        {!filteredPayments.length ? <div className="glass-card empty-state">No payments in this view yet.</div> : filteredPayments.map((payment) => <PaymentCard key={payment.id} payment={payment} onPayWithProof={onPayWithProof} />)}
      </section>}
    </section>
  );
};

const PaymentCard = ({ payment, onPayWithProof }: { payment: Payment; onPayWithProof: (paymentId: string, proofFile?: File) => void }) => {
  const [proof, setProof] = useState<File>();
  const [proofError, setProofError] = useState('');

  return (
    <article className="glass-card stack payment-card">
      <div className="list-row"><strong>{payment.title}</strong><strong>{formatCurrency(payment.amount)}</strong></div>
      <p className="muted">Due {payment.dueDate} • {payment.category}</p>
      <p className="muted">Status: {payment.paid ? 'paid' : payment.dueDate < getTodayIso() ? 'overdue' : 'upcoming'}</p>
      {payment.proofFilename ? <p className="muted">Proof: {payment.proofFilename}</p> : null}
      <p className="muted">Linked transaction: {payment.linkedTransactionId ? 'yes' : 'no'}</p>
      {payment.paid ? <div className="paid-banner">Paid on {payment.paidAt}</div> : <>
        <input
          type="file"
          accept="image/*,.pdf"
          onChange={(e) => {
            const file = e.target.files?.[0];
            setProof(file);
            if (proofError) setProofError('');
          }}
        />
        {proofError ? <div className="error-banner">{proofError}</div> : null}
        <button
          className="btn btn-primary"
          onClick={() => {
            if (!proof) {
              setProofError('Attach a file before marking this payment as paid.');
              return;
            }
            onPayWithProof(payment.id, proof);
            setProof(undefined);
            setProofError('');
          }}
        >
          Pay + proof
        </button>
      </>}
    </article>
  );
};
