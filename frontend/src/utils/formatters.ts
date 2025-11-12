export function formatMapAttribute(value?: string | null) {
  if (typeof value !== "string") {
    return "-";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "-";
  }

  const normalized = trimmed.toLowerCase();
  const dictionary: Record<string, string> = {
    opex: "Opex",
    capex: "Capex"
  };

  if (dictionary[normalized]) {
    return dictionary[normalized];
  }

  return trimmed
    .split(/[\s_-]+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

export function formatCapexOpex(value?: string | null) {
  if (typeof value !== "string") {
    return "-";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "-";
  }

  const normalized = trimmed.toLowerCase();
  if (normalized.includes("capex")) {
    return "CAPEX";
  }
  if (normalized.includes("opex")) {
    return "OPEX";
  }

  return trimmed
    .split(/[\s_-]+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

export function formatAssetType(value?: string | null) {
  if (typeof value !== "string") {
    return "-";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "-";
  }

  return trimmed
    .split(/[\s_-]+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}
