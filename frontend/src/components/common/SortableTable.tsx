import type { ReactNode } from "react";
import { TableCell, TableSortLabel, type TableCellProps } from "@mui/material";

export type TableSortDirection = "asc" | "desc";
export type TableSortState = {
  scope: string;
  key: string;
  direction: TableSortDirection;
} | null;

export type TableSortAccessors<T> = Record<string, (row: T) => unknown>;

function parseDateValue(value: string) {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime();
  }
  const tr = value.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (tr) {
    return new Date(Number(tr[3]), Number(tr[2]) - 1, Number(tr[1])).getTime();
  }
  return null;
}

function normalizeComparable(value: unknown): string | number | boolean | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (value instanceof Date) return value.getTime();
  const text = String(value).trim();
  if (!text || text === "-" || text === "—") return null;
  const date = parseDateValue(text);
  if (date !== null) return date;
  return text;
}

function compareValues(left: unknown, right: unknown) {
  const a = normalizeComparable(left);
  const b = normalizeComparable(right);
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), "tr-TR", {
    numeric: true,
    sensitivity: "base",
  });
}

export function nextTableSort(
  current: TableSortState,
  scope: string,
  key: string
): TableSortState {
  if (!current || current.scope !== scope || current.key !== key) {
    return { scope, key, direction: "asc" };
  }
  if (current.direction === "asc") {
    return { scope, key, direction: "desc" };
  }
  return null;
}

export function sortRowsBy<T>(
  rows: readonly T[],
  sortState: TableSortState,
  scope: string,
  accessors: TableSortAccessors<T>
): T[] {
  if (!sortState || sortState.scope !== scope) return [...rows];
  const accessor = accessors[sortState.key];
  if (!accessor) return [...rows];

  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const result = compareValues(accessor(left.row), accessor(right.row));
      if (result === 0) return left.index - right.index;
      return result * (sortState.direction === "asc" ? 1 : -1);
    })
    .map(({ row }) => row);
}

type SortableTableCellProps = Omit<TableCellProps, "onClick"> & {
  label: ReactNode;
  scope: string;
  sortKey: string;
  sortState: TableSortState;
  onSort: (scope: string, key: string) => void;
};

export function SortableTableCell({
  label,
  scope,
  sortKey,
  sortState,
  onSort,
  ...cellProps
}: SortableTableCellProps) {
  const active = sortState?.scope === scope && sortState.key === sortKey;
  return (
    <TableCell {...cellProps}>
      <TableSortLabel
        active={active}
        direction={active ? sortState.direction : "asc"}
        onClick={() => onSort(scope, sortKey)}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
}
