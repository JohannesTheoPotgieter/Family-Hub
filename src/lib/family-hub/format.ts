export const formatCurrency = (amount: number) => {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(safeAmount);
};

export const formatPoints = (points: number) => `${points} pts`;
