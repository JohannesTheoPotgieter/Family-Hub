import { useMemo, useState } from 'react';
import { formatCurrency } from '../../lib/family-hub/format';
import type { User } from '../../lib/family-hub/constants';

type SetupPayload = {
  pin: string;
  openingBalance: number;
  monthlyIncome: number;
  payments: { title: string; dueDate: string; amount: number; category: string }[];
  budgets: { category: string; limit: number }[];
};

type Props = {
  user: User;
  onFinish: (payload: SetupPayload) => void;
};

const steps = ['Create PIN', 'Confirm PIN', 'Opening balance', 'Monthly income', 'Recurring payments', 'First budget', 'Finish'] as const;

export const SetupWizard = ({ user, onFinish }: Props) => {
  const [step, setStep] = useState(0);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [monthlyIncome, setMonthlyIncome] = useState('0');
  const [payments, setPayments] = useState<{ title: string; dueDate: string; amount: string; category: string }[]>([]);
  const [budgets, setBudgets] = useState<{ category: string; limit: string }[]>([]);
  const [error, setError] = useState('');

  const progress = useMemo(() => Math.round(((step + 1) / steps.length) * 100), [step]);

  const next = () => {
    if (step === 0 && pin.length !== 4) return setError('Create a 4-digit PIN to continue.');
    if (step === 1 && pin !== confirmPin) return setError('PIN confirmation does not match.');
    if (step === 2 && Number(openingBalance) < 0) return setError('Opening balance cannot be negative.');
    if (step === 3 && Number(monthlyIncome) < 0) return setError('Monthly income cannot be negative.');
    setError('');
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };

  return (
    <section className="setup-shell">
      <article className="glass-card setup-card stack-lg">
        <div className="list-row compact">
          <div>
            <p className="eyebrow">Setup for {user.name}</p>
            <h2>{steps[step]}</h2>
          </div>
          <strong>{progress}%</strong>
        </div>
        <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>

        {step === 0 && <input className="pin-input" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Create PIN" />}
        {step === 1 && <input className="pin-input" type="password" inputMode="numeric" maxLength={4} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Confirm PIN" />}
        {step === 2 && <input type="number" min="0" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} placeholder="Opening balance" />}
        {step === 3 && <input type="number" min="0" value={monthlyIncome} onChange={(e) => setMonthlyIncome(e.target.value)} placeholder="Monthly income" />}
        {step === 4 && (
          <div className="stack">
            <button className="btn btn-ghost" onClick={() => setPayments((c) => [...c, { title: '', dueDate: '', amount: '', category: 'Household' }])}>Add recurring payment</button>
            {!payments.length ? <div className="empty-state">No recurring payments yet. You can add them later too.</div> : payments.map((payment, index) => (
              <div key={index} className="glass-card stack-sm">
                <input value={payment.title} placeholder="Name" onChange={(e) => setPayments((current) => current.map((item, i) => i === index ? { ...item, title: e.target.value } : item))} />
                <input type="date" value={payment.dueDate} onChange={(e) => setPayments((current) => current.map((item, i) => i === index ? { ...item, dueDate: e.target.value } : item))} />
                <input type="number" min="0" value={payment.amount} placeholder="Amount" onChange={(e) => setPayments((current) => current.map((item, i) => i === index ? { ...item, amount: e.target.value } : item))} />
                <input value={payment.category} placeholder="Category" onChange={(e) => setPayments((current) => current.map((item, i) => i === index ? { ...item, category: e.target.value } : item))} />
              </div>
            ))}
          </div>
        )}
        {step === 5 && (
          <div className="stack">
            <button className="btn btn-ghost" onClick={() => setBudgets((c) => [...c, { category: '', limit: '' }])}>Add budget category</button>
            {!budgets.length ? <div className="empty-state">No budgets yet. Start with essentials and refine later.</div> : budgets.map((budget, index) => (
              <div key={index} className="glass-card stack-sm">
                <input value={budget.category} placeholder="Category" onChange={(e) => setBudgets((current) => current.map((item, i) => i === index ? { ...item, category: e.target.value } : item))} />
                <input type="number" min="0" value={budget.limit} placeholder="Monthly limit" onChange={(e) => setBudgets((current) => current.map((item, i) => i === index ? { ...item, limit: e.target.value } : item))} />
              </div>
            ))}
          </div>
        )}
        {step === 6 && (
          <div className="stack">
            <p className="muted">You are ready to enter Family Hub with your new baseline.</p>
            <div className="list-row"><span>Opening balance</span><strong>{formatCurrency(Number(openingBalance) || 0)}</strong></div>
            <div className="list-row"><span>Monthly income</span><strong>{formatCurrency(Number(monthlyIncome) || 0)}</strong></div>
            <div className="list-row"><span>Recurring payments</span><strong>{payments.filter((p) => p.title && p.dueDate && Number(p.amount) > 0).length}</strong></div>
            <div className="list-row"><span>Budget categories</span><strong>{budgets.filter((b) => b.category && Number(b.limit) > 0).length}</strong></div>
          </div>
        )}

        {error ? <div className="error-banner">{error}</div> : null}

        <div className="wizard-actions">
          <button className="btn btn-ghost" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}>Back</button>
          {step < 6 ? <button className="btn btn-primary" onClick={next}>Next</button> : <button className="btn btn-primary" onClick={() => onFinish({
            pin,
            openingBalance: Number(openingBalance) || 0,
            monthlyIncome: Number(monthlyIncome) || 0,
            payments: payments.filter((p) => p.title.trim() && p.dueDate && Number(p.amount) > 0).map((p) => ({ title: p.title.trim(), dueDate: p.dueDate, amount: Number(p.amount), category: p.category.trim() || 'General' })),
            budgets: budgets.filter((b) => b.category.trim() && Number(b.limit) > 0).map((b) => ({ category: b.category.trim(), limit: Number(b.limit) }))
          })}>Finish setup</button>}
        </div>
      </article>
    </section>
  );
};
