import { useMemo, useState } from 'react';
import { AVATAR_ACCESSORIES, AVATAR_BACKGROUNDS, AVATAR_BASES, type User } from '../../lib/family-hub/constants';
import { getTodayIso } from '../../lib/family-hub/date';
import { formatCurrency } from '../../lib/family-hub/format';

type SetupPayload = {
  pin: string;
  openingBalance: number;
  monthlyIncome: number;
  payments: Array<{ title: string; amount: number; dueDate: string; category: string }>;
  budgets: Array<{ category: string; limit: number }>;
  avatar: { base: (typeof AVATAR_BASES)[number]; accessory: (typeof AVATAR_ACCESSORIES)[number]; background: (typeof AVATAR_BACKGROUNDS)[number] };
};

type Props = {
  user: User;
  onFinish: (payload: SetupPayload) => void;
};

const steps = ['Create PIN', 'Confirm PIN', 'Opening balance', 'Monthly income', 'Recurring payments', 'Budget setup', 'Avatar', 'Finish'];

export const SetupWizard = ({ user, onFinish }: Props) => {
  const [step, setStep] = useState(0);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [monthlyIncome, setMonthlyIncome] = useState('0');
  const [paymentDraft, setPaymentDraft] = useState({ title: '', amount: '', dueDate: getTodayIso(), category: 'Household' });
  const [payments, setPayments] = useState<SetupPayload['payments']>([]);
  const [budgetDraft, setBudgetDraft] = useState({ category: '', limit: '' });
  const [budgets, setBudgets] = useState<SetupPayload['budgets']>([]);
  const [avatar, setAvatar] = useState({ base: AVATAR_BASES[0], accessory: AVATAR_ACCESSORIES[0], background: AVATAR_BACKGROUNDS[0] });
  const [error, setError] = useState('');

  const canContinue = useMemo(() => {
    if (step === 0) return pin.length === 4;
    if (step === 1) return confirmPin.length === 4;
    if (step === 2) return !Number.isNaN(Number(openingBalance));
    if (step === 3) return !Number.isNaN(Number(monthlyIncome));
    return true;
  }, [step, pin, confirmPin, openingBalance, monthlyIncome]);

  const next = () => {
    if (step === 1 && pin !== confirmPin) {
      setError('PINs do not match. Please confirm again.');
      return;
    }
    setError('');
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };

  return (
    <main className="login-shell">
      <section className="glass-card login-card">
        <p className="eyebrow">Setup wizard</p>
        <h1>{user.name}, let’s set up Family Hub</h1>
        <p className="muted">Step {step + 1} of {steps.length}: {steps[step]}</p>
        <progress value={step + 1} max={steps.length} className="progress" />

        {step === 0 && <input className="pin-input" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Create 4-digit PIN" />}
        {step === 1 && <input className="pin-input" type="password" inputMode="numeric" maxLength={4} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Confirm 4-digit PIN" />}
        {step === 2 && <input type="number" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} placeholder="Opening balance" />}
        {step === 3 && <input type="number" value={monthlyIncome} onChange={(e) => setMonthlyIncome(e.target.value)} placeholder="Monthly income" />}

        {step === 4 && <article className="stack">
          <div className="list-row"><strong>{paymentDraft.title || 'First recurring payment'}</strong><span>{paymentDraft.amount ? formatCurrency(Number(paymentDraft.amount)) : 'R 0'}</span></div>
          <input value={paymentDraft.title} onChange={(e) => setPaymentDraft((c) => ({ ...c, title: e.target.value }))} placeholder="Payment name" />
          <input value={paymentDraft.category} onChange={(e) => setPaymentDraft((c) => ({ ...c, category: e.target.value }))} placeholder="Category" />
          <input type="number" value={paymentDraft.amount} onChange={(e) => setPaymentDraft((c) => ({ ...c, amount: e.target.value }))} placeholder="Amount" />
          <input type="date" value={paymentDraft.dueDate} onChange={(e) => setPaymentDraft((c) => ({ ...c, dueDate: e.target.value }))} />
          <button className="btn btn-ghost" onClick={() => {
            const amount = Number(paymentDraft.amount);
            if (!paymentDraft.title.trim() || Number.isNaN(amount) || amount <= 0) return;
            setPayments((current) => [...current, { title: paymentDraft.title.trim(), amount, dueDate: paymentDraft.dueDate, category: paymentDraft.category || 'Household' }]);
            setPaymentDraft({ title: '', amount: '', dueDate: getTodayIso(), category: 'Household' });
          }}>Add recurring payment</button>
          {payments.map((item) => <div key={`${item.title}-${item.dueDate}`} className="chip">{item.title} · {formatCurrency(item.amount)}</div>)}
        </article>}

        {step === 5 && <article className="stack">
          <input value={budgetDraft.category} onChange={(e) => setBudgetDraft((c) => ({ ...c, category: e.target.value }))} placeholder="Budget category" />
          <input type="number" value={budgetDraft.limit} onChange={(e) => setBudgetDraft((c) => ({ ...c, limit: e.target.value }))} placeholder="Limit" />
          <button className="btn btn-ghost" onClick={() => {
            const limit = Number(budgetDraft.limit);
            if (!budgetDraft.category.trim() || Number.isNaN(limit) || limit <= 0) return;
            setBudgets((current) => [...current, { category: budgetDraft.category.trim(), limit }]);
            setBudgetDraft({ category: '', limit: '' });
          }}>Add budget</button>
          {budgets.map((item) => <div key={item.category} className="chip">{item.category} · {formatCurrency(item.limit)}</div>)}
        </article>}

        {step === 6 && <article className="stack">
          <select value={avatar.base} onChange={(e) => setAvatar((c) => ({ ...c, base: e.target.value as typeof c.base }))}>{AVATAR_BASES.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={avatar.accessory} onChange={(e) => setAvatar((c) => ({ ...c, accessory: e.target.value as typeof c.accessory }))}>{AVATAR_ACCESSORIES.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={avatar.background} onChange={(e) => setAvatar((c) => ({ ...c, background: e.target.value as typeof c.background }))}>{AVATAR_BACKGROUNDS.map((item) => <option key={item}>{item}</option>)}</select>
        </article>}

        {step === 7 && <article className="empty-state">You’re ready. Your household planning cockpit is now live.</article>}
        {error ? <div className="error-banner">{error}</div> : null}

        <div className="list-row">
          <button className="btn btn-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</button>
          {step < steps.length - 1 ? (
            <button className="btn btn-primary" onClick={next} disabled={!canContinue}>Continue</button>
          ) : (
            <button className="btn btn-primary" onClick={() => onFinish({ pin, openingBalance: Number(openingBalance) || 0, monthlyIncome: Number(monthlyIncome) || 0, payments, budgets, avatar })}>Finish setup</button>
          )}
        </div>
      </section>
    </main>
  );
};
