export interface DashboardSavingsSource {
  negotiated_saving_total?: number | null;
  other_saving_total?: number | null;
}

export interface DashboardSavingsFallback {
  total_negotiated_saving?: number | null;
  total_other_saving?: number | null;
}

export function calculateDashboardSavings(
  summary?: DashboardSavingsSource | null,
  fallback?: DashboardSavingsFallback | null
) {
  const negotiatedSavingTotal =
    summary?.negotiated_saving_total ?? fallback?.total_negotiated_saving ?? 0;
  const otherSavingTotal = summary?.other_saving_total ?? fallback?.total_other_saving ?? 0;

  return {
    negotiatedSavingTotal,
    otherSavingTotal,
    combinedSavingTotal: negotiatedSavingTotal + otherSavingTotal
  };
}
