export function formatMoney(value: number | null | undefined): string {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) {
    return "0,00$";
  }

  return `${new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(numericValue)}$`;
}

