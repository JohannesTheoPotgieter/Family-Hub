import { formatRelativeDueStatus } from '../../../lib/family-hub/money';

type Props = { dueDateIso: string; paid: boolean };

export const BillStatusBadge = ({ dueDateIso, paid }: Props) => {
  const label = formatRelativeDueStatus(dueDateIso, paid);
  const className = paid ? 'is-soft' : label === 'Overdue' ? 'is-warn' : 'is-task';
  return <span className={`item-tag ${className}`}>{label}</span>;
};
