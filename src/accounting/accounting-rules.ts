export type JournalLineAmount = { debit: number; credit: number };

export function isBalanced(lines: JournalLineAmount[]) {
  const debit = lines.reduce((sum, line) => sum + line.debit, 0);
  const credit = lines.reduce((sum, line) => sum + line.credit, 0);
  return lines.length >= 2 && Math.abs(debit - credit) < 0.005;
}

export function profitSummary(grossRevenue: number, discountsAndRefunds: number, directCosts: number, operatingExpenses: number, completedOrders: number) {
  const netRevenue = grossRevenue - discountsAndRefunds;
  const grossProfit = netRevenue - directCosts;
  const operatingProfit = grossProfit - operatingExpenses;
  return {
    netRevenue,
    grossProfit,
    operatingProfit,
    averageRevenuePerOrder: completedOrders ? netRevenue / completedOrders : 0,
    averageCostPerOrder: completedOrders ? directCosts / completedOrders : 0,
    operatingProfitMargin: netRevenue ? (operatingProfit / netRevenue) * 100 : 0,
  };
}

export function budgetVariance(kind: 'revenue' | 'expense', budget: number, actual: number) {
  const variance = kind === 'revenue' ? actual - budget : budget - actual;
  return { variance, favourable: variance >= 0, percentage: budget ? (variance / budget) * 100 : 0 };
}

export function ageingGroup(dueDate: string, today: string) {
  const days = Math.max(0, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86400000));
  if (today <= dueDate) return 'current';
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  return '60+';
}

export function accountingIdempotencyKey(sourceType: string, sourceId: string, eventType: string, version: string) {
  return [sourceType, sourceId, eventType, version].map((value) => value.trim().toLowerCase()).join(':');
}
