import { formatCurrencyZAR } from '../../../lib/family-hub/money';

type Props = { category: string; spentCents: number; limitCents: number; onEdit?: () => void; onDelete?: () => void };

export const BudgetProgressCard = ({ category, spentCents, limitCents, onEdit, onDelete }: Props) => {
  const remainingCents = limitCents - spentCents;
  const percent = limitCents > 0 ? Math.min(100, Math.round((spentCents / limitCents) * 100)) : 0;
  return (
    <article className="budget-category-card">
      <div className="budget-category-head">
        <p className="budget-category-title">{category}</p>
        <strong>{formatCurrencyZAR(limitCents)}</strong>
      </div>
      <p className="muted">Spent {formatCurrencyZAR(spentCents)} · Remaining {formatCurrencyZAR(remainingCents)}</p>
      <div className="budget-progress-track"><div className={`budget-progress-fill ${remainingCents < 0 ? 'is-over' : ''}`} style={{ width: `${percent}%` }} /></div>
      <div className="money-payment-meta">
        {remainingCents < 0 ? <span className="item-tag is-warn">Over budget</span> : <span className="item-tag is-soft">On track</span>}
        {onEdit ? <button className="money-inline-btn" onClick={onEdit}>Edit</button> : null}
        {onDelete ? <button className="money-inline-btn" onClick={onDelete}>Delete</button> : null}
      </div>
    </article>
  );
};
