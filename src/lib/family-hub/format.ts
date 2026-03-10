export const formatCurrency = (amount: number) => {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  const value = Math.abs(rounded).toLocaleString('en-ZA');
  return `${sign}R ${value}`;
};

export const formatPoints = (points: number) => `${points} pts`;
