import { useMemo, useState } from 'react';
import { MONEY_TABS, type MoneyTab } from '../../lib/family-hub/constants';
import { getTodayIso } from '../../lib/family-hub/date';
import { formatCurrency } from '../../lib/family-hub/format';
import type { FamilyHubState, Payment } from '../../lib/family-hub/storage';

type Props = {
  state: FamilyHubState;
  onAddPayment: (payment: { title: string; amount: number; dueDate: string; category: string }) => void;
  onPayWithProof: (paymentId: string, proofFile?: File) => void;
  onCreateTransaction: (payload: { date: string; description: string; amount: number; category: string; note?: string }) => void;
  onToggleAutoCreate: (value: boolean) => void;
};

export const MoneyScreen = ({ state, onAddPayment, onPayWithProof, onCreateTransaction, onToggleAutoCreate }: Props) => {
  const [tab, setTab] = useState<MoneyTab>('Overview');
  const [filter, setFilter] = useState<'upcoming' | 'paid' | 'overdue'>('upcoming');
  const [newPayment, setNewPayment] = useState({ title: '', amount: '', dueDate: getTodayIso(), category: 'Household' });
  const [receipt, setReceipt] = useState({ description: '', amount: '', date: getTodayIso(), category: 'General' });

  const me = state.activeUserId ? state.usersProfile[state.activeUserId] : null;
  const plannedPayments = state.payments.filter((p) => !p.paid).reduce((a, p) => a + p.amount, 0);
  const actualExpenses = state.transactions.filter((t) => t.amount < 0).reduce((a, t) => a + Math.abs(t.amount), 0);
  const income = (me?.monthlyIncome ?? 0) + state.transactions.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
  const net = income - actualExpenses;
  const forecastClosing = (me?.openingBalance ?? 0) + income - actualExpenses - plannedPayments;

  const filteredPayments = useMemo(() => state.payments.filter((p) => {
    if (filter === 'paid') return p.paid;
    if (filter === 'overdue') return !p.paid && p.dueDate < getTodayIso();
    return !p.paid && p.dueDate >= getTodayIso();
  }), [state.payments, filter]);

  return <section className="stack-lg">
    <div className="screen-title"><h2>Money cockpit</h2><p className="muted">Trusted household cashflow planning in Rand.</p></div>
    <div className="segmented-control glass-card">{MONEY_TABS.map((item) => <button key={item} className={tab === item ? 'is-active' : ''} onClick={() => setTab(item)}>{item}</button>)}</div>

    {tab === 'Overview' && <article className="glass-card stack">
      <div className="list-row"><span>Net this month</span><strong>{formatCurrency(net)}</strong></div>
      <div className="list-row"><span>Income</span><strong>{formatCurrency(income)}</strong></div>
      <div className="list-row"><span>Expenses</span><strong>{formatCurrency(actualExpenses)}</strong></div>
      <div className="list-row"><span>Payments due</span><strong>{state.payments.filter((p) => !p.paid).length}</strong></div>
      <div className="list-row"><span>Forecast closing</span><strong>{formatCurrency(forecastClosing)}</strong></div>
    </article>}

    {tab === 'Cashflow' && <article className="glass-card stack">
      <div className="list-row"><span>Opening balance</span><strong>{formatCurrency(me?.openingBalance ?? 0)}</strong></div>
      <div className="list-row"><span>Planned inflows</span><strong>{formatCurrency(income)}</strong></div>
      <div className="list-row"><span>Planned outflows</span><strong>{formatCurrency(actualExpenses + plannedPayments)}</strong></div>
      <div className="list-row"><span>Planned payments not yet paid</span><strong>{formatCurrency(plannedPayments)}</strong></div>
      <div className="list-row"><span>Forecast closing</span><strong>{formatCurrency(forecastClosing)}</strong></div>
    </article>}

    {tab === 'Budget' && (!state.budgets.length ? <div className="glass-card empty-state">No budget created yet.</div> : state.budgets.map((b) => <div key={b.id} className="glass-card list-row"><span>{b.category}</span><strong>{formatCurrency(b.limit)}</strong></div>))}

    {tab === 'Transactions' && <article className="glass-card stack">
      <input type="file" accept="image/*" onChange={(e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setReceipt((c) => ({ ...c, description: c.description || file.name.replace(/\.[^.]+$/, '') }));
      }} />
      <input value={receipt.description} onChange={(e) => setReceipt((c) => ({ ...c, description: e.target.value }))} placeholder="Description" />
      <input type="number" value={receipt.amount} onChange={(e) => setReceipt((c) => ({ ...c, amount: e.target.value }))} placeholder="Amount" />
      <input type="date" value={receipt.date} onChange={(e) => setReceipt((c) => ({ ...c, date: e.target.value }))} />
      <input value={receipt.category} onChange={(e) => setReceipt((c) => ({ ...c, category: e.target.value }))} placeholder="Category" />
      <button className="btn btn-primary" onClick={() => {
        const amount = Number(receipt.amount);
        if (!receipt.description.trim() || !receipt.date || Number.isNaN(amount) || amount <= 0) return;
        onCreateTransaction({ date: receipt.date, description: receipt.description.trim(), category: receipt.category.trim() || 'General', amount: -Math.abs(amount) });
      }}>Confirm transaction</button>
      {!state.transactions.length ? <div className="empty-state">No transactions yet.</div> : state.transactions.slice().reverse().map((t) => <div key={t.id} className="list-row"><span>{t.description}</span><strong>{formatCurrency(t.amount)}</strong></div>)}
    </article>}

    {tab === 'Payments' && <section className="stack">
      <article className="glass-card stack">
        <label className="switch-row"><input type="checkbox" checked={state.settings.autoCreateTransactionFromPayment} onChange={(e) => onToggleAutoCreate(e.target.checked)} /><span>Auto create linked transaction</span></label>
        <input value={newPayment.title} onChange={(e) => setNewPayment((c) => ({ ...c, title: e.target.value }))} placeholder="Payment" />
        <input value={newPayment.category} onChange={(e) => setNewPayment((c) => ({ ...c, category: e.target.value }))} placeholder="Category" />
        <input type="number" value={newPayment.amount} onChange={(e) => setNewPayment((c) => ({ ...c, amount: e.target.value }))} placeholder="Amount" />
        <input type="date" value={newPayment.dueDate} onChange={(e) => setNewPayment((c) => ({ ...c, dueDate: e.target.value }))} />
        <button className="btn btn-primary" onClick={() => { const amount = Number(newPayment.amount); if (!newPayment.title.trim() || Number.isNaN(amount) || amount <= 0) return; onAddPayment({ title: newPayment.title.trim(), amount, dueDate: newPayment.dueDate, category: newPayment.category }); }}>Create payment</button>
      </article>
      <div className="segmented-control glass-card">{(['upcoming', 'paid', 'overdue'] as const).map((f) => <button key={f} className={filter === f ? 'is-active' : ''} onClick={() => setFilter(f)}>{f}</button>)}</div>
      {!filteredPayments.length ? <div className="glass-card empty-state">No payments yet.</div> : filteredPayments.map((payment) => <PaymentCard key={payment.id} payment={payment} onPayWithProof={onPayWithProof} />)}
    </section>}
  </section>;
};

const PaymentCard = ({ payment, onPayWithProof }: { payment: Payment; onPayWithProof: (paymentId: string, proofFile?: File) => void }) => {
  const [proof, setProof] = useState<File>();
  return <article className="glass-card payment-card stack">
    <div className="list-row"><strong>{payment.title}</strong><strong>{formatCurrency(payment.amount)}</strong></div>
    <p className="muted">Due {payment.dueDate} · {payment.category}</p>
    <p className="muted">Status: {payment.paid ? 'paid' : payment.dueDate < getTodayIso() ? 'overdue' : 'upcoming'}</p>
    <p className="muted">Proof: {payment.proofFilename || 'none yet'}</p>
    <p className="muted">Linked transaction: {payment.linkedTransactionId ? 'yes' : 'no'}</p>
    {!payment.paid && <><input type="file" accept="image/*" onChange={(e) => setProof(e.target.files?.[0])} /><button className="btn btn-primary" disabled={!proof} onClick={() => onPayWithProof(payment.id, proof)}>Pay + proof</button></>}
  </article>;
};
