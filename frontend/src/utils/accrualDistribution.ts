export interface AccrualDistributionRow {
  year: number;
  month: number;
  cents: number;
}

export function buildAccrualDistribution(
  total: number,
  startYear: number,
  startMonth: number,
  monthCount: number
) {
  if (
    !Number.isFinite(total) ||
    total <= 0 ||
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
  const totalCents = Math.round(total * 100);
  const baseCents = Math.floor(totalCents / monthCount);
  const remainder = totalCents - baseCents * monthCount;
  const rows = Array.from({ length: monthCount }, (_, index) => {
    const absoluteMonth = startMonth - 1 + index;
    return {
      year: startYear + Math.floor(absoluteMonth / 12),
      month: (absoluteMonth % 12) + 1,
      cents: baseCents + (index === monthCount - 1 ? remainder : 0)
    };
  });
  return { rows, totalCents };
}
