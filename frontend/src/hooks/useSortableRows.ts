import { useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";
export type SortState<T> = { key: keyof T; direction: SortDirection } | null;

function compareValues(left: unknown, right: unknown): number {
  if (left == null) return right == null ? 0 : 1;
  if (right == null) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  const leftDate = typeof left === "string" ? Date.parse(left) : Number.NaN;
  const rightDate = typeof right === "string" ? Date.parse(right) : Number.NaN;
  if (!Number.isNaN(leftDate) && !Number.isNaN(rightDate) && /^\d{4}-\d{2}-\d{2}/.test(String(left))) {
    return leftDate - rightDate;
  }
  return String(left).localeCompare(String(right), "tr-TR", { numeric: true, sensitivity: "base" });
}

export default function useSortableRows<T>(rows: T[], initial: SortState<T> = null) {
  const [sort, setSort] = useState<SortState<T>>(initial);
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    return rows.map((row, index) => ({ row, index })).sort((left, right) => {
      const result = compareValues(left.row[sort.key], right.row[sort.key]);
      return (result || left.index - right.index) * (sort.direction === "asc" ? 1 : -1);
    }).map(({ row }) => row);
  }, [rows, sort]);
  const toggleSort = (key: keyof T) => setSort((current) => ({
    key,
    direction: current?.key === key && current.direction === "asc" ? "desc" : "asc",
  }));
  return { sortedRows, sort, toggleSort };
}
