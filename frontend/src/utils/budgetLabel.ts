import { formatBudgetItemMeta, type BudgetMeta } from "./budgetItem";

type BudgetLabelItem = BudgetMeta & {
  code?: string | null;
  name?: string | null;
};

export const stripBudgetCode = (text: string | null | undefined): string => {
  if (!text) return "";
  return text.replace(/^SK\d+\s*[-—–]\s*/i, "").trim();
};

export const formatBudgetItemLabel = (item?: BudgetLabelItem | null): string => {
  if (!item) return "-";
  const cleanName = stripBudgetCode(item.name ?? "") || "-";
  const meta = formatBudgetItemMeta(item);
  return meta ? `${cleanName} (${meta})` : cleanName;
};
