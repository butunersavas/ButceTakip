export interface AccrualDistributionRow {
  year: number;
  month: number;
  cents: number;
}

export function buildAccrualDistribution(
  monthlyAmount: number,
  startYear: number,
  startMonth: number,
  monthCount: number
) {
  if (
    !Number.isFinite(monthlyAmount) ||
    monthlyAmount <= 0 ||
    !Number.isInteger(startYear) ||
    !Number.isInteger(startMonth) ||
    startMonth < 1 ||
    startMonth > 12 ||
    !Number.isInteger(monthCount) ||
    monthCount < 1 ||
    monthCount > 36
  ) {
    return { rows: [] as AccrualDistributionRow[], totalCents: 0 };
  }
  const monthlyCents = Math.round(monthlyAmount * 100);
  const totalCents = monthlyCents * monthCount;
  const rows = Array.from({ length: monthCount }, (_, index) => {
    const absoluteMonth = startMonth - 1 + index;
    return {
      year: startYear + Math.floor(absoluteMonth / 12),
      month: (absoluteMonth % 12) + 1,
      cents: monthlyCents
    };
  });
  return { rows, totalCents };
}
