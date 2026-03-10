import { useMemo, useState } from 'react';
import type { User } from '../../lib/family-hub/constants';
import type { UserSetupProfile } from '../../lib/family-hub/storage';

type Props = {
  user: User;
  onFinish: (pin: string, profile: UserSetupProfile) => void;
};

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const TOTAL_STEPS = 8;

type InputRow = {
  id: string;
  label: string;
  value: string;
};

const createRow = () => ({ id: crypto.randomUUID(), label: '', value: '' });

const parseMoney = (value: string) => Number.parseFloat(value.replace(',', '.'));

export const SetupWizard = ({ user, onFinish }: Props) => {
  const [step, setStep] = useState<WizardStep>(1);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [recurringRows, setRecurringRows] = useState<InputRow[]>([createRow()]);
  const [budgetRows, setBudgetRows] = useState<InputRow[]>([createRow()]);
  const [avatarName, setAvatarName] = useState('');
  const [error, setError] = useState('');

  const progress = Math.round((step / TOTAL_STEPS) * 100);

  const recurringValidCount = useMemo(
    () => recurringRows.filter((row) => row.label.trim() && !Number.isNaN(parseMoney(row.value))).length,
    [recurringRows]
  );
  const budgetValidCount = useMemo(
    () => budgetRows.filter((row) => row.label.trim() && !Number.isNaN(parseMoney(row.value))).length,
    [budgetRows]
  );

  const goNext = () => {
    setError('');

    if (step === 1 && pin.length !== 4) {
      setError('Please create a 4-digit PIN to continue.');
      return;
    }

    if (step === 2) {
      if (confirmPin.length !== 4) {
        setError('Please confirm your 4-digit PIN.');
        return;
      }
      if (pin !== confirmPin) {
        setError('PIN mismatch. Please try again.');
        return;
      }
    }

    if (step === 3 && Number.isNaN(parseMoney(openingBalance))) {
      setError('Please provide a valid opening balance amount.');
      return;
    }

    if (step === 4 && Number.isNaN(parseMoney(monthlyIncome))) {
      setError('Please provide a valid monthly income amount.');
      return;
    }

    if (step === 5 && recurringValidCount === 0) {
      setError('Add at least one recurring payment with a name and amount.');
      return;
    }

    if (step === 6 && budgetValidCount === 0) {
      setError('Add at least one budget category with a value.');
      return;
    }

    setStep((current) => Math.min(TOTAL_STEPS, current + 1) as WizardStep);
  };

  const goBack = () => {
    setError('');
    setStep((current) => Math.max(1, current - 1) as WizardStep);
  };

  const finish = () => {
    if (pin !== confirmPin) {
      setError('PIN mismatch. Please re-check and finish setup again.');
      return;
    }

    const profile: UserSetupProfile = {
      openingBalance: parseMoney(openingBalance),
      monthlyIncome: parseMoney(monthlyIncome),
      recurringPayments: recurringRows
        .filter((row) => row.label.trim() && !Number.isNaN(parseMoney(row.value)))
        .map((row) => ({ id: row.id, title: row.label.trim(), amount: parseMoney(row.value) })),
      budgetCategories: budgetRows
        .filter((row) => row.label.trim() && !Number.isNaN(parseMoney(row.value)))
        .map((row) => ({ id: row.id, label: row.label.trim(), amount: parseMoney(row.value) })),
      avatarName: avatarName.trim() || undefined
    };

    onFinish(pin, profile);
  };

  return (
    <main className="login-shell">
      <div className="bg-orb bg-orb--top" />
      <div className="bg-orb bg-orb--bottom" />

      <section className="glass-card login-card setup-card stack">
        <p className="eyebrow">Family Hub setup</p>
        <h1>{user.name}, let's personalize your space</h1>
        <div className="wizard-progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="wizard-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="muted">
          Step {step} of {TOTAL_STEPS}
        </p>

        {step === 1 ? (
          <input className="pin-input" type="password" inputMode="numeric" maxLength={4} value={pin} placeholder="Create 4-digit PIN" onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} />
        ) : null}

        {step === 2 ? (
          <input className="pin-input" type="password" inputMode="numeric" maxLength={4} value={confirmPin} placeholder="Confirm your PIN" onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 4))} />
        ) : null}

        {step === 3 ? (
          <input value={openingBalance} inputMode="decimal" placeholder="Opening balance" onChange={(event) => setOpeningBalance(event.target.value)} />
        ) : null}

        {step === 4 ? (
          <input value={monthlyIncome} inputMode="decimal" placeholder="Monthly income" onChange={(event) => setMonthlyIncome(event.target.value)} />
        ) : null}

        {step === 5 ? (
          <div className="stack-sm">
            {recurringRows.map((row) => (
              <div className="setup-row" key={row.id}>
                <input
                  value={row.label}
                  placeholder="Payment name"
                  onChange={(event) =>
                    setRecurringRows((current) => current.map((item) => (item.id === row.id ? { ...item, label: event.target.value } : item)))
                  }
                />
                <input
                  value={row.value}
                  inputMode="decimal"
                  placeholder="Amount"
                  onChange={(event) =>
                    setRecurringRows((current) => current.map((item) => (item.id === row.id ? { ...item, value: event.target.value } : item)))
                  }
                />
              </div>
            ))}
            <button className="btn btn-ghost" onClick={() => setRecurringRows((current) => [...current, createRow()])}>
              Add payment
            </button>
          </div>
        ) : null}

        {step === 6 ? (
          <div className="stack-sm">
            {budgetRows.map((row) => (
              <div className="setup-row" key={row.id}>
                <input
                  value={row.label}
                  placeholder="Category"
                  onChange={(event) => setBudgetRows((current) => current.map((item) => (item.id === row.id ? { ...item, label: event.target.value } : item)))}
                />
                <input
                  value={row.value}
                  inputMode="decimal"
                  placeholder="Budget"
                  onChange={(event) => setBudgetRows((current) => current.map((item) => (item.id === row.id ? { ...item, value: event.target.value } : item)))}
                />
              </div>
            ))}
            <button className="btn btn-ghost" onClick={() => setBudgetRows((current) => [...current, createRow()])}>
              Add category
            </button>
          </div>
        ) : null}

        {step === 7 ? (
          <input value={avatarName} placeholder="Optional avatar name" onChange={(event) => setAvatarName(event.target.value)} />
        ) : null}

        {step === 8 ? (
          <div className="setup-summary stack-sm">
            <p className="muted">Review done. Tap finish to save your setup and unlock Family Hub.</p>
            <p>Opening balance: {openingBalance}</p>
            <p>Monthly income: {monthlyIncome}</p>
            <p>Recurring payments: {recurringValidCount}</p>
            <p>Budget categories: {budgetValidCount}</p>
            <p>Avatar: {avatarName.trim() || 'Skipped'}</p>
          </div>
        ) : null}

        {error ? <p className="error-banner">{error}</p> : null}

        <div className="wizard-actions">
          <button className="btn btn-ghost" onClick={goBack} disabled={step === 1}>
            Back
          </button>
          {step < TOTAL_STEPS ? (
            <button className="btn btn-primary" onClick={goNext}>
              Continue
            </button>
          ) : (
            <button className="btn btn-primary" onClick={finish}>
              Finish setup
            </button>
          )}
        </div>
      </section>
    </main>
  );
};
