import { formatMonthLabel } from '../../../lib/family-hub/money';

type Props = { monthIsoYYYYMM: string; onChange: (next: string) => void };

export const MonthSwitcher = ({ monthIsoYYYYMM, onChange }: Props) => {
  const onStep = (delta: number) => {
    const [year, month] = monthIsoYYYYMM.split('-').map(Number);
    const next = new Date(year, month - 1 + delta, 1);
    onChange(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  };

  return (
    <div className="money-month-switcher">
      <button className="money-inline-btn" onClick={() => onStep(-1)}>←</button>
      <strong>{formatMonthLabel(monthIsoYYYYMM)}</strong>
      <button className="money-inline-btn" onClick={() => onStep(1)}>→</button>
    </div>
  );
};
