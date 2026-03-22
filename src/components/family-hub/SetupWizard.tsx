import { useMemo, useState } from 'react';
import { formatCurrency } from '../../lib/family-hub/format';
import type { User } from '../../lib/family-hub/constants';
import type { UserSetupProfile } from '../../lib/family-hub/storage';

type Props = {
  user: User;
  onFinish: (pin: string, profile: UserSetupProfile) => Promise<void>;
};

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;
const TOTAL_STEPS = 6;

const stepTitle: Record<WizardStep, string> = {
  1: 'Welcome',
  2: 'Create your PIN',
  3: 'Confirm your PIN',
  4: 'Optional money basics',
  5: 'Optional monthly plan',
  6: 'All done!'
};

type InputRow = {
  id: string;
  label: string;
  value: string;
};

const createRow = () => ({ id: crypto.randomUUID(), label: '', value: '' });
const parseMoney = (value: string) => Number.parseFloat(value.replace(',', '.'));

const PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const;

export const SetupWizard = ({ user, onFinish }: Props) => {
  const [step, setStep] = useState<WizardStep>(1);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [recurringRows, setRecurringRows] = useState<InputRow[]>([createRow()]);
  const [budgetRows, setBudgetRows] = useState<InputRow[]>([createRow()]);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const progress = Math.round((step / TOTAL_STEPS) * 100);

  const recurringValidCount = useMemo(
    () => recurringRows.filter((row) => row.label.trim() && !Number.isNaN(parseMoney(row.value))).length,
    [recurringRows]
  );
  const budgetValidCount = useMemo(
    () => budgetRows.filter((row) => row.label.trim() && !Number.isNaN(parseMoney(row.value))).length,
    [budgetRows]
  );

  const handlePinKey = (key: string, which: 'pin' | 'confirm') => {
    const current = which === 'pin' ? pin : confirmPin;
    const setter = which === 'pin' ? setPin : setConfirmPin;
    if (key === '⌫') {
      setter(current.slice(0, -1));
      setError('');
      return;
    }
    if (current.length < 4) setter(current + key);
  };

  const goNext = () => {
    setError('');
    if (step === 2 && pin.length !== 4) {
      setError('Please enter a 4-digit PIN to continue.');
      return;
    }
    if (step === 3) {
      if (confirmPin.length !== 4) {
        setError('Please confirm your PIN.');
        return;
      }
      if (pin !== confirmPin) {
        setError("PINs don't match. Please try again.");
        setConfirmPin('');
        return;
      }
    }
    if (step === 4) {
      if (openingBalance && Number.isNaN(parseMoney(openingBalance))) {
        setError('Please enter a valid opening balance.');
        return;
      }
      if (monthlyIncome && Number.isNaN(parseMoney(monthlyIncome))) {
        setError('Please enter a valid income amount.');
        return;
      }
    }
    setStep((current) => Math.min(TOTAL_STEPS, current + 1) as WizardStep);
  };

  const goBack = () => {
    setError('');
    setStep((current) => Math.max(1, current - 1) as WizardStep);
  };

  const finish = async () => {
    if (pin.length !== 4) {
      setError('Please choose a valid 4-digit PIN.');
      return;
    }

    const profile: UserSetupProfile = {
      openingBalance: parseMoney(openingBalance) || 0,
      monthlyIncome: parseMoney(monthlyIncome) || 0,
      recurringPayments: recurringRows
        .filter((row) => row.label.trim() && !Number.isNaN(parseMoney(row.value)))
        .map((row) => ({ id: row.id, title: row.label.trim(), amount: parseMoney(row.value) })),
      budgetCategories: budgetRows
        .filter((row) => row.label.trim() && !Number.isNaN(parseMoney(row.value)))
        .map((row) => ({ id: row.id, label: row.label.trim(), amount: parseMoney(row.value) }))
    };

    setIsSaving(true);
    setError('');
    try {
      await onFinish(pin, profile);
    } catch {
      setError('We could not finish setup right now. Please try again.');
      setIsSaving(false);
    }
  };

  return (
    <main className="login-shell">
      <div className="bg-orb bg-orb--top" />
      <div className="bg-orb bg-orb--bottom" />

      <section className="glass-card login-card setup-card stack">
        <div className="login-brand">
          <span className="login-logo">🏡</span>
          <p className="eyebrow">Family Hub setup</p>
        </div>
        <h1>{user.name}, let&apos;s get you set up</h1>

        <div className="wizard-progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="wizard-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="muted">Step {step} of {TOTAL_STEPS} · {stepTitle[step]}</p>

        <div key={step} className="wizard-step fade-in">
          {step === 1 && (
            <div className="setup-summary stack-sm">
              <p className="setup-welcome-emoji">👋</p>
              <p className="muted">You are setting up Family Hub as <strong>{user.name}</strong>.</p>
              <p className="muted">Start with a PIN now. Money details are optional and can be added later after you are inside the app.</p>
            </div>
          )}

          {step === 2 && (
            <div className="stack-sm">
              <p className="muted">Choose a 4-digit PIN to protect your profile.</p>
              <div className="pin-dots">
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className={`pin-dot ${pin.length > index ? 'is-filled' : ''}`} />
                ))}
              </div>
              <div className="pin-pad">
                {PAD_KEYS.map((key, index) => (
                  key === '' ? <div key={index} /> : (
                    <button
                      key={index}
                      className={`pin-pad-key ${key === '⌫' ? 'is-back' : ''}`}
                      type="button"
                      onClick={() => handlePinKey(key, 'pin')}
                      aria-label={key === '⌫' ? 'Delete' : key}
                      disabled={isSaving}
                    >
                      {key}
                    </button>
                  )
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="stack-sm">
              <p className="muted">Enter your PIN once more to confirm.</p>
              <div className="pin-dots">
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className={`pin-dot ${confirmPin.length > index ? 'is-filled' : ''}`} />
                ))}
              </div>
              <div className="pin-pad">
                {PAD_KEYS.map((key, index) => (
                  key === '' ? <div key={index} /> : (
                    <button
                      key={index}
                      className={`pin-pad-key ${key === '⌫' ? 'is-back' : ''}`}
                      type="button"
                      onClick={() => handlePinKey(key, 'confirm')}
                      aria-label={key === '⌫' ? 'Delete' : key}
                      disabled={isSaving}
                    >
                      {key}
                    </button>
                  )
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="stack-sm">
              <p className="muted">Optional — skip this if you just want to enter the app first and set up money later.</p>
              <label className="task-field">
                <span>Opening bank balance (R)</span>
                <input
                  value={openingBalance}
                  inputMode="decimal"
                  placeholder="e.g. 12500"
                  onChange={(event) => setOpeningBalance(event.target.value)}
                  disabled={isSaving}
                />
              </label>
              <label className="task-field">
                <span>Monthly take-home income (R)</span>
                <input
                  value={monthlyIncome}
                  inputMode="decimal"
                  placeholder="e.g. 45000"
                  onChange={(event) => setMonthlyIncome(event.target.value)}
                  disabled={isSaving}
                />
              </label>
            </div>
          )}

          {step === 5 && (
            <div className="stack-sm">
              <p className="muted">Optional — add recurring bills and budget categories now, or leave this for later once the family is already set up.</p>

              <h4>Monthly recurring payments</h4>
              {recurringRows.map((row) => (
                <div className="setup-row" key={row.id}>
                  <input
                    value={row.label}
                    placeholder="e.g. Rent, Netflix"
                    onChange={(event) =>
                      setRecurringRows((current) => current.map((item) => item.id === row.id ? { ...item, label: event.target.value } : item))
                    }
                    disabled={isSaving}
                  />
                  <input
                    value={row.value}
                    inputMode="decimal"
                    placeholder="Amount"
                    onChange={(event) =>
                      setRecurringRows((current) => current.map((item) => item.id === row.id ? { ...item, value: event.target.value } : item))
                    }
                    disabled={isSaving}
                  />
                </div>
              ))}
              <button className="btn btn-ghost" type="button" onClick={() => setRecurringRows((current) => [...current, createRow()])} disabled={isSaving}>
                + Add payment
              </button>

              <h4>Budget categories</h4>
              {budgetRows.map((row) => (
                <div className="setup-row" key={row.id}>
                  <input
                    value={row.label}
                    placeholder="e.g. Groceries, Fuel"
                    onChange={(event) =>
                      setBudgetRows((current) => current.map((item) => item.id === row.id ? { ...item, label: event.target.value } : item))
                    }
                    disabled={isSaving}
                  />
                  <input
                    value={row.value}
                    inputMode="decimal"
                    placeholder="Monthly budget"
                    onChange={(event) =>
                      setBudgetRows((current) => current.map((item) => item.id === row.id ? { ...item, value: event.target.value } : item))
                    }
                    disabled={isSaving}
                  />
                </div>
              ))}
              <button className="btn btn-ghost" type="button" onClick={() => setBudgetRows((current) => [...current, createRow()])} disabled={isSaving}>
                + Add category
              </button>
            </div>
          )}

          {step === 6 && (
            <div className="setup-summary stack-sm">
              <p className="setup-welcome-emoji">🎉</p>
              <p className="muted">You are all set, <strong>{user.name}</strong>. Here is what will be added to Family Hub right away:</p>
              {openingBalance ? <p>Opening balance: {formatCurrency(parseMoney(openingBalance) || 0)}</p> : null}
              {monthlyIncome ? <p>Monthly income: {formatCurrency(parseMoney(monthlyIncome) || 0)}</p> : null}
              {recurringValidCount > 0 ? <p>Recurring bills seeded this month: {recurringValidCount}</p> : null}
              {budgetValidCount > 0 ? <p>Budget categories seeded this month: {budgetValidCount}</p> : null}
              {!openingBalance && !monthlyIncome && !recurringValidCount && !budgetValidCount ? (
                <p className="muted">You can set up your finances anytime in the Money tab.</p>
              ) : null}
            </div>
          )}
        </div>

        {error ? <p className="error-banner">{error}</p> : null}

        <div className="wizard-actions">
          <button className="btn btn-ghost" type="button" onClick={goBack} disabled={step === 1 || isSaving}>
            Back
          </button>
          {step < TOTAL_STEPS ? (
            <div className="wizard-next-group">
              {(step === 4 || step === 5) && (
                <button className="btn btn-ghost" type="button" onClick={goNext} disabled={isSaving}>
                  Skip
                </button>
              )}
              <button className="btn btn-primary" type="button" onClick={goNext} disabled={isSaving}>
                Continue
              </button>
            </div>
          ) : (
            <button className="btn btn-primary" type="button" onClick={() => void finish()} disabled={isSaving}>
              {isSaving ? 'Finishing setup…' : 'Enter Family Hub'}
            </button>
          )}
        </div>
      </section>
    </main>
  );
};
