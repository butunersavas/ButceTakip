export interface BudgetMeta {
  map_category?: string | null;
  map_attribute?: string | null;
}

const sanitize = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.toString().trim();
  return trimmed.length ? trimmed : null;
};

export const formatBudgetItemMeta = (item?: BudgetMeta | null): string => {
  if (!item) return "";
  const parts = [sanitize(item.map_category), sanitize(item.map_attribute)].filter(
    (part): part is string => Boolean(part)
  );
  return parts.join(" / ");
};

export const formatBudgetItemLabel = <T extends BudgetMeta & { code: string; name: string }>(
  item: T
): string => {
  const meta = formatBudgetItemMeta(item);
  return meta ? `${item.code} — ${item.name} (${meta})` : `${item.code} — ${item.name}`;
};
