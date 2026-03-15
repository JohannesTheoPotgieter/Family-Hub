import { useState } from 'react';
import type { User } from '../../lib/family-hub/constants';
import type { UserSetupProfile } from '../../lib/family-hub/storage';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Progress } from '../../ui/Progress';
import { Confetti } from '../../ui/Confetti';
import { useToasts } from '../../ui/useToasts';

type Props = { user: User; onFinish: (pin: string, profile: UserSetupProfile) => void };

export const SetupWizard = ({ user, onFinish }: Props) => {
  const [step, setStep] = useState(1);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [avatarName, setAvatarName] = useState('');
  const [celebrate, setCelebrate] = useState(false);
  const [error, setError] = useState('');
  const { push } = useToasts();

  const finish = () => {
    if (pin.length !== 4 || pin !== confirmPin) {
      setError('PIN step is required and must match.');
      return;
    }
    onFinish(pin, { openingBalance: 0, monthlyIncome: 0, recurringPayments: [], budgetCategories: [], avatarName: avatarName || undefined });
    push('Setup complete! Home base unlocked 🏡✨');
    setCelebrate(true);
  };

  return (
    <main className="login-shell">
      <Confetti active={celebrate} />
      <Card className="login-card setup-card stack">
        <p className="eyebrow">Quest setup</p>
        <h1>Let's set up your home base 🏡</h1>
        <Progress value={(step / 4) * 100} label="Setup progress" />
        <p className="muted">Step {step} of 4</p>

        {step === 1 ? <p>Welcome, <strong>{user.name}</strong>! Ready to personalize your family dashboard?</p> : null}
        {step === 2 ? <input className="pin-input" type="password" inputMode="numeric" maxLength={4} value={pin} placeholder="Create 4-digit PIN" onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /> : null}
        {step === 3 ? <input className="pin-input" type="password" inputMode="numeric" maxLength={4} value={confirmPin} placeholder="Confirm PIN" onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))} /> : null}
        {step === 4 ? (
          <div className="stack-sm">
            <p className="muted">Give your avatar a nickname (optional). It reacts live ✨</p>
            <input value={avatarName} placeholder="Captain Cozy" onChange={(e) => setAvatarName(e.target.value)} />
            <p aria-live="polite">Preview: {avatarName || user.name}'s buddy 😄</p>
          </div>
        ) : null}

        {error ? <p className="error-banner">{error}</p> : null}

        <div className="wizard-actions">
          <Button variant="ghost" disabled={step === 1} onClick={() => setStep((s) => s - 1)}>Back</Button>
          {step < 4 ? <Button onClick={() => setStep((s) => s + 1)}>Continue</Button> : <Button onClick={finish}>Finish setup</Button>}
        </div>
        {step === 4 ? <Button variant="ghost" onClick={finish}>Skip for now</Button> : null}
      </Card>
    </main>
  );
};
