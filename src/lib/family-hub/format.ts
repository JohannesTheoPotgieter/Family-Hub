export const formatCurrency = (amount: number) => {
  const formatted = new Intl.NumberFormat('en-ZA', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Math.abs(amount));
  return `R ${amount < 0 ? '-' : ''}${formatted}`;
};

export const formatCurrencyInputHint = (amount: number) => `(${formatCurrency(amount)})`;
