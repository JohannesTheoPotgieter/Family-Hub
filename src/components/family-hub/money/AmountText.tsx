import { formatCurrencyZAR } from '../../../lib/family-hub/money';

type Props = { amountCents: number; kind?: 'neutral' | 'positive' | 'negative' };

export const AmountText = ({ amountCents, kind = 'neutral' }: Props) => <strong className={kind === 'positive' ? 'money-positive' : kind === 'negative' ? 'money-negative' : ''}>{formatCurrencyZAR(amountCents)}</strong>;
