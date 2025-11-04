export function formatMapAttributeLabel(value?: string | null): string {
  if (!value) {
    return "-";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "-";
  }

  const normalized = trimmed.toLowerCase();
  if (normalized === "opex") {
    return "Opex";
  }
  if (normalized === "capex") {
    return "Capex";
  }

  return trimmed;
}
