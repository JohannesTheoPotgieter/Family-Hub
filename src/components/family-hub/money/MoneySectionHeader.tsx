import type { ReactNode } from 'react';

type Props = { title: string; subtitle?: string; action?: ReactNode };

export const MoneySectionHeader = ({ title, subtitle, action }: Props) => (
  <div className="money-section-header">
    <div>
      <h3>{title}</h3>
      {subtitle ? <p className="muted">{subtitle}</p> : null}
    </div>
    {action}
  </div>
);
