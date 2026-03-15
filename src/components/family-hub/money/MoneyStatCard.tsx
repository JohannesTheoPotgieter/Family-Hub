import type { ReactNode } from 'react';

type Props = { label: string; value: ReactNode; hint?: string };

export const MoneyStatCard = ({ label, value, hint }: Props) => (
  <article className="money-stat-card">
    <p className="muted">{label}</p>
    <div className="money-stat-value">{value}</div>
    {hint ? <p className="muted">{hint}</p> : null}
  </article>
);
