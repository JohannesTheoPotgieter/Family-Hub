import { formatCurrencyZAR } from '../../../lib/family-hub/money';

type Props = { category: string; spentCents: number; limitCents: number; onEdit?: () => void; onDelete?: () => void };

export const BudgetProgressCard = ({ category, spentCents, limitCents, onEdit, onDelete }: Props) => {
  const remainingCents = limitCents - spentCents;
  const percent = limitCents > 0 ? Math.min(100, Math.round((spentCents / limitCents) * 100)) : 0;
  const statusLabel = remainingCents < 0 ? 'Over budget' : percent >= 85 ? 'Almost used' : 'On track';
  const plainSummary = remainingCents < 0
    ? `${formatCurrencyZAR(Math.abs(remainingCents))} over the limit.`
    : `${formatCurrencyZAR(remainingCents)} left for this month.`;

  return (
    <article className="budget-category-card">
      <div className="budget-category-head">
        <div>
          <p className="budget-category-title">{category}</p>
          <p className="muted">{plainSummary}</p>
        </div>
        <strong>{formatCurrencyZAR(limitCents)}</strong>
      </div>
      <div className="budget-category-meta">
        <span>Spent {formatCurrencyZAR(spentCents)}</span>
        <span>{percent}% used</span>
      </div>
      <div className="budget-progress-track"><div className={`budget-progress-fill ${remainingCents < 0 ? 'is-over' : ''}`} style={{ width: `${percent}%` }} /></div>
      <div className="money-payment-meta">
        <span className={`item-tag ${remainingCents < 0 ? 'is-warn' : percent >= 85 ? 'is-task' : 'is-soft'}`}>{statusLabel}</span>
        {onEdit ? <button className="money-inline-btn" onClick={onEdit}>Edit</button> : null}
        {onDelete ? <button className="money-inline-btn" onClick={onDelete}>Delete</button> : null}
      </div>
    </article>
  );
};
