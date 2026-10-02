export interface MarketRatesResponse {
  usd_try: number | null;
  eur_try: number | null;
  gram_gold_try: number | null;
  source: string;
  source_url: string;
  rate_type: string;
  rate_date: string | null;
  fetched_at: string;
  stale: boolean;
  warning: string | null;
  gold_note: string;
}

export interface MarketIndicatorCard {
  key: "usd" | "eur" | "gold";
  label: string;
  value: number | null;
  fractionDigits: number;
}

export function formatMarketRate(value: number | null, fractionDigits: number): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatMarketRateDate(value: string | null): string {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return "-";
  return `${day}.${month}.${year}`;
}

export function buildMarketIndicatorCards(
  data?: MarketRatesResponse,
): MarketIndicatorCard[] {
  return [
    { key: "usd", label: "USD / TRY", value: data?.usd_try ?? null, fractionDigits: 4 },
    { key: "eur", label: "EUR / TRY", value: data?.eur_try ?? null, fractionDigits: 4 },
    {
      key: "gold",
      label: "Gram Altın / TRY",
      value: data?.gram_gold_try ?? null,
      fractionDigits: 2,
    },
  ];
}
