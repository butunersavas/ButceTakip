export const UNUSED_REASON_OPTIONS = [
  { value: "purchase_cancelled", label: "Alımdan Vazgeçildi." },
  { value: "no_longer_needed", label: "İhtiyaç Kalmadı." },
  { value: "other_budget", label: "Başka Bütçeden Karşılandı." },
  { value: "unused", label: "Kullanılmayacak." }
] as const;

const legacyLabels: Record<string, string> = {
  "Alımdan vazgeçildi": "purchase_cancelled",
  "İhtiyaç kalmadı": "no_longer_needed",
  "Başka Bütçe": "other_budget",
  Kullanılmayacak: "unused"
};

export function normalizeUnusedReason(value?: string | null): string {
  if (!value) return "";
  return UNUSED_REASON_OPTIONS.find((option) => option.value === value || option.label === value)?.value
    ?? legacyLabels[value]
    ?? "";
}

export function formatUnusedReason(value?: string | null, fallback = "-"): string {
  const normalized = normalizeUnusedReason(value);
  return UNUSED_REASON_OPTIONS.find((option) => option.value === normalized)?.label ?? fallback;
}
