export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', currencyDisplay: 'narrowSymbol' }).format(amount);
