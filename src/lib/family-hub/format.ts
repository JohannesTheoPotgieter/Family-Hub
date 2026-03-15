export const formatCurrency = (amount: number) => {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const isNegative = safeAmount < 0;
  const formattedNumber = Math.round(Math.abs(safeAmount)).toLocaleString('en-ZA');
  return `${isNegative ? '-' : ''}R ${formattedNumber}`;
};

export const formatPoints = (points: number) => `${points} pts`;
