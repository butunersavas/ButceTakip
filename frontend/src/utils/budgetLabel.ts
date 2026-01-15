import { formatBudgetItemMeta, type BudgetMeta } from "./budgetItem";

type BudgetLabelItem = BudgetMeta & {
  code?: string | null;
  name?: string | null;
};

export const stripBudgetCode = (text: string | null | undefined): string => {
  if (!text) return "";
  return text.replace(/^SK\d+\s*[-—–]\s*/i, "").trim();
};

export const formatBudgetItemLabel = (
  item?: BudgetLabelItem | null,
  showCode: boolean = false
): string => {
  if (!item) return "-";
  const cleanName = stripBudgetCode(item.name ?? "") || "-";
  const meta = formatBudgetItemMeta(item);
  if (showCode) {
    const code = item.code?.toString().trim();
    const withCode = code ? `${code} — ${cleanName}` : cleanName;
    return meta ? `${withCode} (${meta})` : withCode;
  }
  return meta ? `${cleanName} (${meta})` : cleanName;
};
