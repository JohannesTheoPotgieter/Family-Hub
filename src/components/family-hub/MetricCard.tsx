import type { ReactNode } from 'react';

type Props = { label: string; value: string; hint?: ReactNode };

export const MetricCard = ({ label, value, hint }: Props) => (
  <div className="card metric-card">
    <div className="muted">{label}</div>
    <div className="metric-value">{value}</div>
    {hint ? <div className="small">{hint}</div> : null}
  </div>
);
