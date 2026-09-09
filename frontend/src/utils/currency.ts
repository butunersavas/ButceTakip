const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export function formatCurrency(value?: number | null): string {
  return usdFormatter.format(Number(value ?? 0));
}
