import { Component, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  CardContent,
  CardHeader,
  Box,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Snackbar,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip
} from "recharts";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { formatUnusedReason } from "../../utils/unusedReason";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import usePersistentState from "../../hooks/usePersistentState";
import { useAuth } from "../../context/AuthContext";
import { formatBudgetItemLabel, stripBudgetCode } from "../../utils/budgetLabel";
import { formatBudgetItemMeta } from "../../utils/budgetItem";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import { SummaryCard } from "./SummaryCard";
import {
  COLOR_ACTUAL,
  COLOR_OVER,
  COLOR_PLANNED,
  COLOR_REMAINING
} from "../../theme/chartColors";
import FiltersBar from "../Filters/FiltersBar";
import SafeChartContainer from "../common/SafeChartContainer";
import OverBudgetDialog, {
  type BudgetStatusCategory,
  type OverBudgetItem,
  type OverBudgetResponse
} from "../common/OverBudgetDialog";

interface DashboardSummary {
  month: number;
  planned: number;
  actual: number;
  saving?: number;
  remaining?: number;
  unused?: number;
  cancelled?: number;
}

interface DashboardKPI {
  total_plan: number;
  total_actual: number;
  total_remaining: number;
  total_saving: number;
  total_overrun: number;
  total_unused: number;
  total_negotiated_saving?: number;
  total_other_saving?: number;
  total_combined_saving?: number;
  total_cancelled?: number;
  capex_total_plan_amount?: number;
  opex_total_plan_amount?: number;
  unclassified_total_plan_amount?: number;
  realized_plan_inside_amount?: number;
  capex_realized_plan_inside_amount?: number;
  opex_realized_plan_inside_amount?: number;
  unclassified_realized_plan_inside_amount?: number;
  remaining_available_amount?: number;
  capex_remaining_available_amount?: number;
  opex_remaining_available_amount?: number;
  unclassified_remaining_available_amount?: number;
  negotiated_saving_amount?: number;
  capex_negotiated_saving_amount?: number;
  opex_negotiated_saving_amount?: number;
  unclassified_negotiated_saving_amount?: number;
  other_saving_amount?: number;
  capex_other_saving_amount?: number;
  opex_other_saving_amount?: number;
  unclassified_other_saving_amount?: number;
  canceled_budget_amount?: number;
  capex_canceled_budget_amount?: number;
  opex_canceled_budget_amount?: number;
  unclassified_canceled_budget_amount?: number;
  overrun_amount?: number;
  capex_overrun_amount?: number;
  opex_overrun_amount?: number;
  unclassified_overrun_amount?: number;
  budget_outside_amount?: number;
  capex_budget_outside_amount?: number;
  opex_budget_outside_amount?: number;
  unclassified_budget_outside_amount?: number;
  reconciliation_total?: number;
  capex_reconciliation_total?: number;
  opex_reconciliation_total?: number;
  unclassified_reconciliation_total?: number;
  reconciliation_difference?: number;
  capex_reconciliation_difference?: number;
  opex_reconciliation_difference?: number;
  unclassified_reconciliation_difference?: number;
}

interface DashboardReconciliation {
  total_plan_amount: number;
  capex_total_plan_amount: number;
  opex_total_plan_amount: number;
  unclassified_total_plan_amount: number;
  realized_plan_inside_amount: number;
  capex_realized_plan_inside_amount: number;
  opex_realized_plan_inside_amount: number;
  unclassified_realized_plan_inside_amount: number;
  remaining_available_amount: number;
  capex_remaining_available_amount: number;
  opex_remaining_available_amount: number;
  unclassified_remaining_available_amount: number;
  negotiated_saving_amount: number;
  capex_negotiated_saving_amount: number;
  opex_negotiated_saving_amount: number;
  unclassified_negotiated_saving_amount: number;
  other_saving_amount: number;
  capex_other_saving_amount: number;
  opex_other_saving_amount: number;
  unclassified_other_saving_amount: number;
  canceled_budget_amount: number;
  capex_canceled_budget_amount: number;
  opex_canceled_budget_amount: number;
  unclassified_canceled_budget_amount: number;
  overrun_amount: number;
  capex_overrun_amount: number;
  opex_overrun_amount: number;
  unclassified_overrun_amount: number;
  budget_outside_amount: number;
  capex_budget_outside_amount: number;
  opex_budget_outside_amount: number;
  unclassified_budget_outside_amount: number;
  reconciliation_total: number;
  capex_reconciliation_total: number;
  opex_reconciliation_total: number;
  unclassified_reconciliation_total: number;
  reconciliation_difference: number;
  capex_reconciliation_difference: number;
  opex_reconciliation_difference: number;
  unclassified_reconciliation_difference: number;
}

interface DashboardResponse {
  kpi: DashboardKPI;
  monthly: DashboardSummary[];
  reconciliation?: DashboardReconciliation | null;
}

interface DashboardExpense {
  id?: number;
  budget_item_id?: number | null;
  scenario_id?: number | null;
  expense_date?: string | null;
  date?: string | null;
  budget_code?: string | null;
  budget_name?: string | null;
  budget_outside_title?: string | null;
  budget_outside_department?: string | null;
  budget_outside_capex_opex?: string | null;
  budget_outside_asset_type?: string | null;
  amount?: number | null;
  plan_amount?: number | null;
  actual_amount?: number | null;
  saving_amount?: number | null;
  scope_remaining_amount?: number | null;
  scope_saving_amount?: number | null;
  scope_overrun_amount?: number | null;
  capex_opex?: string | null;
  map_capex_opex?: string | null;
  asset_type?: string | null;
  map_nitelik?: string | null;
  nitelik?: string | null;
  department?: string | null;
  vendor?: string | null;
  description?: string | null;
  status?: string | null;
  is_cancelled?: boolean | null;
  is_out_of_budget?: boolean | null;
  out_of_budget?: boolean | null;
  created_by_name?: string | null;
  created_by_username?: string | null;
  allocations?: Array<{
    year: number;
    month: number;
    plan_amount?: number | null;
  }>;
}

type UnusedBudgetItem = OverBudgetItem & {
  unused_amount?: number;
  available_amount?: number;
  reason?: string | null;
  note?: string | null;
  unused_updated_at?: string | null;
};

type TrendMonth = {
  month: number;
  planned: number;
  actual: number;
  remaining: number;
  overrun: number;
  overrun_pct: number;
};

type TrendResponse = {
  year: number;
  scenario_id: number | null;
  scope: "all" | "item";
  selected_budget_code: string | null;
  months: TrendMonth[];
};

type DashboardQuarter = "Q1" | "Q2" | "Q3" | "Q4";
type DashboardPeriod = "" | DashboardQuarter;

interface Scenario {
  id: number;
  name: string;
  year: number;
}

interface BudgetItem {
  id: number;
  code: string;
  name: string;
  map_category?: string | null;
  map_attribute?: string | null;
}

type PurchaseAlertItem = {
  id: number;
  title: string;
  department?: string | null;
  amount: number;
  currency?: string | null;
  vendor?: string | null;
  requested: boolean;
  requested_at?: string | null;
};

type PurchaseAlertResponse = {
  year: number;
  month: number;
  total: number;
  pending: number;
  done: number;
  items: PurchaseAlertItem[];
};

type RiskyItem = {
  budget_item_id: number;
  budget_code: string;
  budget_name: string;
  plan: number;
  actual: number;
  ratio: number;
};

type QuarterlySummary = {
  planned: number;
  actual: number;
  remaining: number;
  overrun: number;
  negotiatedSaving: number;
  otherSaving: number;
  cancelled: number;
};

type WarrantyAlertItem = {
  id?: number | string;
  type?: "DEVICE" | "SERVICE" | "DOMAIN_SSL";
  name?: string | null;
  location?: string | null;
  serial_no?: string | null;
  end_date?: string | null;
  days_left?: number | null;
};

const monthLabels = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık"
];

const periodOptions: { value: DashboardPeriod; label: string; months: number[] }[] = [
  { value: "", label: "Tümü", months: [] },
  { value: "Q1", label: "Q1", months: [1, 2, 3] },
  { value: "Q2", label: "Q2", months: [4, 5, 6] },
  { value: "Q3", label: "Q3", months: [7, 8, 9] },
  { value: "Q4", label: "Q4", months: [10, 11, 12] }
];

const dashboardPeriodListboxId = "dashboard-period-filter-listbox";
const dashboardMonthListboxId = "dashboard-month-filter-listbox";

function normalizeMonthSelection(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item >= 1 && item <= 12)
    )
  ).sort((a, b) => a - b);
}

const pieColors: Record<keyof QuarterlySummary, string> = {
  planned: COLOR_PLANNED,
  actual: COLOR_ACTUAL,
  remaining: COLOR_REMAINING,
  overrun: COLOR_OVER,
  negotiatedSaving: "#2e7d32",
  otherSaving: "#ed6c02",
  cancelled: "#d32f2f"
};

type DashboardSectionBoundaryProps = {
  children: ReactNode;
  title?: string;
};

type DashboardSectionBoundaryState = {
  hasError: boolean;
};

class DashboardSectionBoundary extends Component<
  DashboardSectionBoundaryProps,
  DashboardSectionBoundaryState
> {
  state: DashboardSectionBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("Dashboard section error", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert severity="error">
          {this.props.title
            ? `${this.props.title} yüklenirken hata oluştu.`
            : "Bölüm yüklenirken hata oluştu."}
        </Alert>
      );
    }

    return this.props.children;
  }
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);

  return debouncedValue;
}

function formatCurrency(value: number) {
  return `$${new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value ?? 0)}`;
}

function sumUniqueExpensePlanScopes(expenses: DashboardExpense[]) {
  const seen = new Set<string>();
  return expenses.reduce((total, expense) => {
    const scenarioKey = expense.scenario_id ?? "none";
    const budgetKey = expense.budget_item_id ?? "none";
    const allocations = expense.allocations ?? [];
    if (allocations.length > 0) {
      return allocations.reduce((allocationTotal, allocation) => {
        const key = `${budgetKey}-${scenarioKey}-${allocation.year}-${allocation.month}`;
        if (seen.has(key)) return allocationTotal;
        seen.add(key);
        return allocationTotal + toSafeNumber(allocation.plan_amount);
      }, total);
    }

    const rawDate = expense.expense_date ?? expense.date ?? "";
    const date = rawDate ? new Date(rawDate) : null;
    const year = date && !Number.isNaN(date.getTime()) ? date.getFullYear() : "unknown";
    const month = date && !Number.isNaN(date.getTime()) ? date.getMonth() + 1 : "unknown";
    const key = `${budgetKey}-${scenarioKey}-${year}-${month}`;
    if (seen.has(key)) return total;
    seen.add(key);
    return total + toSafeNumber(expense.plan_amount);
  }, 0);
}

function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function allocateTotalByWeights(weights: number[], total: number) {
  const safeTotal = roundMoney(total);
  const safeWeights = weights.map((weight) => Math.max(toSafeNumber(weight), 0));
  const weightTotal = safeWeights.reduce((sum, weight) => sum + weight, 0);
  if (safeWeights.length === 0 || weightTotal <= 0) return safeWeights.map(() => 0);

  let remaining = safeTotal;
  return safeWeights.map((weight, index) => {
    if (index === safeWeights.length - 1) return roundMoney(remaining);
    const value = roundMoney((safeTotal * weight) / weightTotal);
    remaining = roundMoney(remaining - value);
    return value;
  });
}

function buildExpenseAmountSplits<T extends { amount?: number | null }>(
  expenses: T[],
  planInsideTotal: number,
  overrunTotal: number
) {
  const weights = expenses.map((expense) => toSafeNumber(expense.amount));
  const planInsideValues = allocateTotalByWeights(weights, planInsideTotal);
  const overrunValues = allocateTotalByWeights(weights, overrunTotal);
  return expenses.map((expense, index) => ({
    expense,
    amount: weights[index] ?? 0,
    planInside: planInsideValues[index] ?? 0,
    overrun: overrunValues[index] ?? 0
  }));
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value ?? 0);
}

function formatBudgetLabel(name?: string | null, code?: string | null) {
  return stripBudgetCode(name ?? "") || code || "-";
}

function exportRowsToExcel(
  rows: Record<string, unknown>[],
  fileName: string,
  sheetName: string,
  moneyColumns: string[] = []
) {
  if (rows.length === 0) return;
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const headers = Object.keys(rows[0]);
  worksheet["!cols"] = headers.map((header) => {
    const maxLength = rows.reduce(
      (max, row) => Math.max(max, String(row[header] ?? "").length),
      header.length
    );
    return { wch: Math.min(Math.max(maxLength + 2, 14), 42) };
  });
  headers.forEach((_, index) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: index });
    if (worksheet[cellRef]) {
      worksheet[cellRef].s = { font: { bold: true } };
    }
  });
  const moneySet = new Set(moneyColumns);
  headers.forEach((header, colIndex) => {
    if (!moneySet.has(header)) return;
    for (let rowIndex = 1; rowIndex <= rows.length; rowIndex += 1) {
      const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      if (worksheet[cellRef]) {
        worksheet[cellRef].z = '"$"#,##0.00';
      }
    }
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}

function appendRowsToWorkbook(
  workbook: XLSX.WorkBook,
  sheetName: string,
  rows: Record<string, unknown>[],
  moneyColumns: string[] = [],
  dateColumns: string[] = []
) {
  const safeRows = rows.length > 0 ? rows : [{ Bilgi: "Kayıt bulunamadı" }];
  const worksheet = XLSX.utils.json_to_sheet(safeRows);
  const headers = Object.keys(safeRows[0]);
  worksheet["!cols"] = headers.map((header) => {
    const maxLength = safeRows.reduce(
      (max, row) => Math.max(max, String(row[header] ?? "").length),
      header.length
    );
    return { wch: Math.min(Math.max(maxLength + 2, 14), 48) };
  });
  headers.forEach((_, index) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: index });
    if (worksheet[cellRef]) {
      worksheet[cellRef].s = { font: { bold: true } };
    }
  });
  const moneySet = new Set(moneyColumns);
  const dateSet = new Set(dateColumns);
  headers.forEach((header, colIndex) => {
    if (!moneySet.has(header) && !dateSet.has(header)) return;
    for (let rowIndex = 1; rowIndex <= safeRows.length; rowIndex += 1) {
      const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      if (!worksheet[cellRef]) continue;
      if (moneySet.has(header)) {
        worksheet[cellRef].z = '"$"#,##0.00';
      } else if (dateSet.has(header)) {
        worksheet[cellRef].z = 'dd.mm.yyyy';
      }
    }
  });
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
}

function toFileNameSlug(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  const replacements: Record<string, string> = {
    Ç: "C",
    ç: "c",
    Ğ: "G",
    ğ: "g",
    İ: "I",
    ı: "i",
    Ö: "O",
    ö: "o",
    Ş: "S",
    ş: "s",
    Ü: "U",
    ü: "u"
  };
  return String(value)
    .trim()
    .replace(/[ÇçĞğİıÖöŞşÜü]/g, (char) => replacements[char] ?? char)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildExcelFileName(...parts: Array<string | number | null | undefined>) {
  return parts.map(toFileNameSlug).filter(Boolean).join("_");
}

const calcDaysLeft = (endDate?: string | null) => {
  if (!endDate) return null;
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(end.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ms = end.getTime() - today.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
};

const normalizeWarrantyAlerts = (items: WarrantyAlertItem[]) =>
  items.map((item) => {
    const daysLeft =
      typeof item.days_left === "number" ? item.days_left : calcDaysLeft(item.end_date ?? null);
    return { ...item, days_left: daysLeft };
  });

const splitWarrantyAlerts = (items: WarrantyAlertItem[]) => {
  const normalized = normalizeWarrantyAlerts(items);
  const expired = normalized.filter((item) => (item.days_left ?? 0) < 0);
  const near = normalized.filter(
    (item) =>
      typeof item.days_left === "number" && item.days_left >= 0 && item.days_left <= 30
  );
  return { normalized, expired, near };
};

function toSafeNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function asNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

type DetailSummaryItem = {
  label: string;
  value: ReactNode;
  color?: string;
};

function DetailSummaryGrid({ items }: { items: DetailSummaryItem[] }) {
  return (
    <Grid container spacing={1.5} sx={{ mb: 2 }}>
      {items.map((item) => (
        <Grid item xs={12} sm={6} md={3} key={item.label}>
          <Box
            sx={{
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              p: 1.25,
              height: "100%",
              bgcolor: "background.paper"
            }}
          >
            <Typography variant="caption" color="text.secondary">
              {item.label}
            </Typography>
            <Typography variant="subtitle1" fontWeight={800} color={item.color}>
              {item.value}
            </Typography>
          </Box>
        </Grid>
      ))}
    </Grid>
  );
}

function DetailTableWrap({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        maxHeight: 480,
        overflow: "auto",
        border: 1,
        borderColor: "divider",
        borderRadius: 1
      }}
    >
      {children}
    </Box>
  );
}

function buildEmptyTrendResponse(): TrendResponse {
  return {
    year: new Date().getFullYear(),
    scenario_id: null,
    scope: "all",
    selected_budget_code: null,
    months: []
  };
}

function normalizeTrendMonths(raw: unknown) {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as { months?: unknown }).months)) {
    return (raw as { months: unknown[] }).months;
  }
  return [];
}

function normalizeTrendResponse(raw: unknown): TrendResponse {
  const input = (raw as any)?.data ?? raw;
  const rawObject =
    typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const rawMonths = normalizeTrendMonths(input);
  const responseYear =
    typeof rawObject?.year === "number" ? rawObject.year : new Date().getFullYear();
  const responseScenarioId =
    typeof rawObject?.scenario_id === "number" ? rawObject.scenario_id : null;
  const responseScope = rawObject?.scope === "item" ? "item" : "all";
  const responseSelectedBudgetCode =
    typeof rawObject?.selected_budget_code === "string" ? rawObject.selected_budget_code : null;

  const months = rawMonths.map((entry: any, index) => {
    const month = asNumber(entry?.month);
    const planned = entry?.planned ?? entry?.plan_total;
    const actual = entry?.actual ?? entry?.actual_total;
    const remaining = entry?.remaining ?? entry?.remaining_total;
    const overrun = entry?.overrun ?? entry?.over_total;
    const overrunPct = entry?.overrun_pct ?? entry?.over_pct;
    return {
      month: Number.isFinite(month) ? month : index + 1,
      planned: asNumber(planned),
      actual: asNumber(actual),
      remaining: asNumber(remaining),
      overrun: asNumber(overrun),
      overrun_pct: asNumber(overrunPct)
    };
  });

  return {
    year: responseYear,
    scenario_id: responseScenarioId,
    scope: responseScope,
    selected_budget_code: responseSelectedBudgetCode,
    months
  };
}

export default function DashboardView() {
  const theme = useTheme();
  const client = useAuthorizedClient();
  const { user } = useAuth();
  const isViewer = ["viewer", "readonly", "read_only"].includes(
    String(user?.role ?? "").toLowerCase()
  );
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = usePersistentState<number>("dashboard:year", currentYear);
  const [scenarioId, setScenarioId] = usePersistentState<number | null>("dashboard:scenarioId", null);
  const [selectedPeriods, setSelectedPeriods] = usePersistentState<DashboardQuarter[]>(
    "dashboard:periods",
    []
  );
  const [selectedMonths, setSelectedMonths] = usePersistentState<number[]>(
    "dashboard:selectedMonths",
    []
  );
  const [periodFilterOpen, setPeriodFilterOpen] = useState(false);
  const [monthFilterOpen, setMonthFilterOpen] = useState(false);
  const [budgetItemId, setBudgetItemId] = usePersistentState<number | null>("dashboard:budgetItemId", null);
  const [capexOpex, setCapexOpex] = usePersistentState<"" | "capex" | "opex">(
    "dashboard:capexOpex",
    ""
  );
  const [department, setDepartment] = useState<string>("");
  const [purchaseAlert, setPurchaseAlert] = useState<PurchaseAlertResponse | null>(null);
  const [purchaseDepartmentFilter, setPurchaseDepartmentFilter] = useState("");
  const [isAlertsDialogOpen, setIsAlertsDialogOpen] = useState(false);
  const [isPlanDetailDialogOpen, setIsPlanDetailDialogOpen] = useState(false);
  const [isRealizedDialogOpen, setIsRealizedDialogOpen] = useState(false);
  const [isOutOfBudgetDialogOpen, setIsOutOfBudgetDialogOpen] = useState(false);
  const [isUnusedBudgetDialogOpen, setIsUnusedBudgetDialogOpen] = useState(false);
  const [savingPurchaseStatus, setSavingPurchaseStatus] = useState<number | null>(null);
  const [purchaseStatusFeedback, setPurchaseStatusFeedback] = useState<
    { message: string; severity: "success" | "error" } | null
  >(null);
  const [isExportingAllCards, setIsExportingAllCards] = useState(false);
  const [warrantyAlertItems, setWarrantyAlertItems] = useState<WarrantyAlertItem[]>([]);
  const [selectedKpiFilter, setSelectedKpiFilter] = useState<
    | "total_plan"
    | "total_actual"
    | "total_remaining"
    | "total_negotiated_saving"
    | "total_other_saving"
    | "total_combined_saving"
    | "total_overrun"
    | "total_unused"
    | "total_cancelled"
    | "out_of_budget"
    | null
  >(null);
  const [savingDetailDialog, setSavingDetailDialog] = useState<
    "negotiated" | "total" | null
  >(null);
  const [selectedOverrunItem, setSelectedOverrunItem] = useState<{
    budget_code: string;
    budget_name?: string | null;
  } | null>(null);
  const [isCancelledDialogOpen, setIsCancelledDialogOpen] = useState(false);
  const [budgetStatusDialogCategory, setBudgetStatusDialogCategory] =
    useState<BudgetStatusCategory | null>(null);
  const [dashboardReadonlyDetail, setDashboardReadonlyDetail] = useState<{
    title: string;
    summary: DetailSummaryItem[];
    fields: Array<[string, ReactNode]>;
  } | null>(null);
  const [forceShowOverBudget, setForceShowOverBudget] = useState(false);
  const [highlightOverBudget, setHighlightOverBudget] = useState(false);
  const overBudgetRef = useRef<HTMLDivElement | null>(null);
  const trendSectionRef = useRef<HTMLDivElement | null>(null);
  const periodFilterRef = useRef<HTMLDivElement | null>(null);
  const monthFilterRef = useRef<HTMLDivElement | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const hasLoggedTrendResponse = useRef(false);

  const monthOptions = [
    { value: 1, label: "Ocak" },
    { value: 2, label: "Şubat" },
    { value: 3, label: "Mart" },
    { value: 4, label: "Nisan" },
    { value: 5, label: "Mayıs" },
    { value: 6, label: "Haziran" },
    { value: 7, label: "Temmuz" },
    { value: 8, label: "Ağustos" },
    { value: 9, label: "Eylül" },
    { value: 10, label: "Ekim" },
    { value: 11, label: "Kasım" },
    { value: 12, label: "Aralık" }
  ];

  const formatBudgetPeriod = (item: Pick<UnusedBudgetItem, "months"> & { month?: number | null }) => {
    const sourceMonths = item.months?.length ? item.months : item.month ? [item.month] : [];
    const labels = Array.from(new Set(sourceMonths))
      .filter((monthValue) => monthValue >= 1 && monthValue <= 12)
      .sort((a, b) => a - b)
      .map((monthValue) => monthOptions.find((option) => option.value === monthValue)?.label ?? String(monthValue));
    return labels.join(", ") || "-";
  };

  const selectedMonthList = useMemo(
    () => normalizeMonthSelection(selectedMonths),
    [selectedMonths]
  );
  const selectedMonthKey = selectedMonthList.join(",");
  const selectedPeriodOptions = useMemo(
    () =>
      periodOptions.filter(
        (option) => option.value && selectedPeriods.includes(option.value as DashboardQuarter)
      ),
    [selectedPeriods]
  );
  const selectedPeriodLabel =
    selectedPeriodOptions.length > 0
      ? selectedPeriodOptions.map((option) => option.label).join(", ")
      : "Tümü";
  const selectedMonthsLabel =
    selectedMonthList.length > 0
      ? selectedMonthList
          .map((monthValue) => monthLabels[monthValue - 1] ?? `Ay ${monthValue}`)
          .join(", ")
      : "Tüm Aylar";
  const handlePeriodChange = (values: DashboardPeriod[]) => {
    const lastValue = values[values.length - 1] ?? "";
    const nextQuarters = values.filter(Boolean) as DashboardQuarter[];
    if (lastValue === "" || nextQuarters.length === 0) {
      setSelectedPeriods([]);
      setSelectedMonths([]);
      return;
    }

    const uniqueQuarters = Array.from(new Set(nextQuarters));
    setSelectedPeriods(uniqueQuarters);
    const monthSet = new Set<number>();
    uniqueQuarters.forEach((quarter) => {
      const months = periodOptions.find((option) => option.value === quarter)?.months ?? [];
      months.forEach((month) => monthSet.add(month));
    });
    setSelectedMonths(normalizeMonthSelection(Array.from(monthSet)));
  };

  useEffect(() => {
    if (!periodFilterOpen && !monthFilterOpen) {
      return;
    }

    const isInsideFilter = (
      target: EventTarget | null,
      filterRoot: HTMLDivElement | null,
      listboxId: string
    ) => {
      if (!(target instanceof Node)) {
        return false;
      }
      const listbox = document.getElementById(listboxId);
      return Boolean(filterRoot?.contains(target) || listbox?.contains(target));
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (
        periodFilterOpen &&
        !isInsideFilter(event.target, periodFilterRef.current, dashboardPeriodListboxId)
      ) {
        setPeriodFilterOpen(false);
      }
      if (
        monthFilterOpen &&
        !isInsideFilter(event.target, monthFilterRef.current, dashboardMonthListboxId)
      ) {
        setMonthFilterOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPeriodFilterOpen(false);
        setMonthFilterOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [monthFilterOpen, periodFilterOpen]);

  const debouncedFilters = useDebouncedValue(
    useMemo(
      () => ({
        year,
        scenarioId,
        selectedMonthKey,
        budgetItemId,
        department,
        capexOpex
      }),
      [year, scenarioId, selectedMonthKey, budgetItemId, department, capexOpex]
    ),
    300
  );

  const { data: scenarios } = useQuery<Scenario[]>({
    queryKey: ["scenarios"],
    queryFn: async () => {
      const { data } = await client.get<Scenario[]>("/scenarios");
      return data;
    }
  });

  const { data: budgetItems } = useQuery<BudgetItem[]>({
    queryKey: ["budget-items"],
    queryFn: async () => {
      const { data } = await client.get<BudgetItem[]>("/budget-items");
      return data;
    }
  });

  const { data: departments = [] } = useQuery<string[]>({
    queryKey: ["departments", debouncedFilters.year, debouncedFilters.scenarioId],
    queryFn: async () => {
      const { data } = await client.get<string[]>("/plans/departments", {
        params: {
          year: debouncedFilters.year,
          scenario_id: debouncedFilters.scenarioId || undefined
        },
        suppressGlobalError: true
      });
      return data ?? [];
    }
  });

  useEffect(() => {
    let isMounted = true;

    const fetchWarrantyAlerts = async () => {
      const { data } = await client.get("/warranty-items", { suppressGlobalError: true });
      return Array.isArray(data)
        ? data
        : (data as { items?: WarrantyAlertItem[] } | null)?.items ?? [];
    };

    const loadAlerts = async () => {
      const today = new Date();
      const [purchaseResult, warrantyResult] = await Promise.allSettled([
        client.get<PurchaseAlertResponse>("/dashboard/purchase-alert", {
          suppressGlobalError: true,
          params: {
            year: today.getFullYear(),
            month: today.getMonth() + 1
          }
        }),
        fetchWarrantyAlerts()
      ]);

      if (!isMounted) return;

      const purchaseData =
        purchaseResult.status === "fulfilled" ? purchaseResult.value.data ?? null : null;
      const warrantyList = warrantyResult.status === "fulfilled" ? warrantyResult.value : [];
      const { normalized } = splitWarrantyAlerts(warrantyList);

      setPurchaseAlert(purchaseData);
      setWarrantyAlertItems(normalized);
    };

    loadAlerts();

    return () => {
      isMounted = false;
    };
  }, [client]);

  const handleCloseAlertsDialog = () => {
    setIsAlertsDialogOpen(false);
  };

  const warrantyAlerts = useMemo(
    () => splitWarrantyAlerts(warrantyAlertItems),
    [warrantyAlertItems]
  );

  const purchaseItems = purchaseAlert?.items ?? [];

  const purchaseDepartments = useMemo(() => {
    const unique = new Set<string>();
    purchaseItems.forEach((item) => {
      if (item.department) {
        unique.add(item.department);
      }
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b, "tr"));
  }, [purchaseItems]);

  const filteredPurchaseItems = useMemo(() => {
    if (!purchaseDepartmentFilter) {
      return purchaseItems;
    }
    return purchaseItems.filter((item) => item.department === purchaseDepartmentFilter);
  }, [purchaseItems, purchaseDepartmentFilter]);

  useEffect(() => {
    if (purchaseDepartmentFilter && !purchaseDepartments.includes(purchaseDepartmentFilter)) {
      setPurchaseDepartmentFilter("");
    }
  }, [purchaseDepartmentFilter, purchaseDepartments]);

  const handleSetPurchaseRequested = async (item: PurchaseAlertItem) => {
    if (isViewer) {
      setPurchaseStatusFeedback({
        message: "Bu kullanıcı yalnızca görüntüleme yetkisine sahiptir.",
        severity: "error"
      });
      return;
    }
    const nextRequested = !item.requested;
    try {
      setSavingPurchaseStatus(item.id);
      await client.patch(`/plan-items/${item.id}/purchase-requested`, { requested: nextRequested });
      setPurchaseAlert((prev) => {
        if (!prev) return prev;
        const nextItems = nextRequested
          ? prev.items.filter((currentItem) => currentItem.id !== item.id)
          : prev.items.map((currentItem) =>
              currentItem.id === item.id
                ? {
                    ...currentItem,
                    requested: false,
                    requested_at: null
                  }
                : currentItem
            );
        return {
          ...prev,
          items: nextItems,
          done: 0,
          pending: nextItems.length,
          total: nextItems.length
        };
      });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      setPurchaseStatusFeedback({
        message: nextRequested
          ? "Kayıt Talep Oluşturuldu durumuna alındı."
          : "Kayıt yeniden Bekleyen durumuna alındı.",
        severity: "success"
      });
    } catch (error) {
      console.error(error);
      setPurchaseStatusFeedback({
        message: "Satın alma takip durumu güncellenemedi.",
        severity: "error"
      });
    } finally {
      setSavingPurchaseStatus(null);
    }
  };

  const { data: riskyItems = [] } = useQuery<RiskyItem[]>({
    queryKey: [
      "dashboard",
      "risky-items",
      debouncedFilters.year,
      debouncedFilters.selectedMonthKey,
      debouncedFilters.department,
      debouncedFilters.capexOpex
    ],
    queryFn: async () => {
      const params: Record<string, number | string> = { year: debouncedFilters.year };

      if (debouncedFilters.selectedMonthKey) {
        params.month_list = debouncedFilters.selectedMonthKey;
      }

      if (debouncedFilters.department) {
        params.department = debouncedFilters.department;
      }

      if (debouncedFilters.capexOpex) {
        params.capex_opex = debouncedFilters.capexOpex;
      }

      const { data } = await client.get<RiskyItem[]>("/dashboard/risky-items", {
        params,
        suppressGlobalError: true
      });

      return data ?? [];
    }
  });

  useEffect(() => {
    if (!scenarios?.length) return;
    const selectedScenario = scenarios.find(
      (scenario) => scenario.id === scenarioId && scenario.year === year
    );
    if (selectedScenario) return;
    const matchingScenario = scenarios.find((scenario) => scenario.year === year);
    setScenarioId(matchingScenario?.id ?? null);
  }, [scenarios, scenarioId, setScenarioId, year]);

  const { data: dashboard, isLoading } = useQuery<DashboardResponse>({
    queryKey: [
      "dashboard",
      debouncedFilters.year,
      debouncedFilters.scenarioId,
      debouncedFilters.selectedMonthKey,
      debouncedFilters.budgetItemId,
      debouncedFilters.department,
      debouncedFilters.capexOpex
    ],
    queryFn: async () => {
      const params: Record<string, number | string> = { year: debouncedFilters.year };
      if (debouncedFilters.scenarioId) params.scenario_id = debouncedFilters.scenarioId;
      if (debouncedFilters.selectedMonthKey) params.month_list = debouncedFilters.selectedMonthKey;
      if (debouncedFilters.budgetItemId) params.budget_item_id = debouncedFilters.budgetItemId;
      if (debouncedFilters.department) params.department = debouncedFilters.department;
      if (debouncedFilters.capexOpex) params.capex_opex = debouncedFilters.capexOpex;
      const { data } = await client.get<DashboardResponse>("/dashboard", { params });
      return data;
    }
  });

  const selectedBudgetCode = useMemo(() => {
    if (!debouncedFilters.budgetItemId) return undefined;
    return budgetItems?.find((item) => item.id === debouncedFilters.budgetItemId)?.code;
  }, [budgetItems, debouncedFilters.budgetItemId]);

  const selectedOverrunBudgetItemId = useMemo(() => {
    if (!selectedOverrunItem?.budget_code || !budgetItems?.length) return null;
    return budgetItems.find((item) => item.code === selectedOverrunItem.budget_code)?.id ?? null;
  }, [budgetItems, selectedOverrunItem?.budget_code]);

  const { data: overBudget } = useQuery<OverBudgetResponse>({
    queryKey: [
      "dashboard",
      "overbudget",
      debouncedFilters.year,
      debouncedFilters.scenarioId,
      debouncedFilters.selectedMonthKey,
      debouncedFilters.budgetItemId,
      selectedBudgetCode,
      debouncedFilters.department,
      debouncedFilters.capexOpex
    ],
    queryFn: async () => {
      const params: Record<string, number | string> = {
        year: debouncedFilters.year
      };
      if (debouncedFilters.scenarioId) params.scenario_id = debouncedFilters.scenarioId;
      if (debouncedFilters.selectedMonthKey) params.month_list = debouncedFilters.selectedMonthKey;
      if (debouncedFilters.budgetItemId) {
        params.budget_item_id = debouncedFilters.budgetItemId;
      }
      if (debouncedFilters.department) params.department = debouncedFilters.department;
      if (debouncedFilters.capexOpex) params.capex_opex = debouncedFilters.capexOpex;
      if (!debouncedFilters.budgetItemId && selectedBudgetCode) {
        params.budget_code = selectedBudgetCode;
      }
      const { data } = await client.get<OverBudgetResponse>("/dashboard/overbudget", {
        params,
        suppressGlobalError: true
      });
      return data;
    },
    enabled: Boolean(debouncedFilters.year)
  });

  const { data: outOfBudgetExpenses = [] } = useQuery<DashboardExpense[]>({
    queryKey: [
      "dashboard",
      "out-of-budget-expenses",
      debouncedFilters.year,
      debouncedFilters.scenarioId,
      debouncedFilters.selectedMonthKey,
      debouncedFilters.budgetItemId,
      debouncedFilters.department,
      debouncedFilters.capexOpex
    ],
    queryFn: async () => {
      const params: Record<string, number | string | boolean> = {
        year: debouncedFilters.year,
        status_filter: "recorded",
        include_out_of_budget: true,
        show_out_of_budget: true,
        only_out_of_budget: true,
        show_cancelled: false
      };
      if (debouncedFilters.scenarioId) params.scenario_id = debouncedFilters.scenarioId;
      if (debouncedFilters.budgetItemId) params.budget_item_id = debouncedFilters.budgetItemId;
      if (debouncedFilters.department) params.department = debouncedFilters.department;
      if (debouncedFilters.capexOpex) params.capex_opex = debouncedFilters.capexOpex;
      if (debouncedFilters.selectedMonthKey) params.month_list = debouncedFilters.selectedMonthKey;
      const { data } = await client.get<DashboardExpense[]>("/expenses", {
        params,
        suppressGlobalError: true
      });
      return data.filter((expense) => Boolean(expense.is_out_of_budget ?? expense.out_of_budget));
    }
  });

  const { data: cancelledExpenses = [] } = useQuery<DashboardExpense[]>({
    queryKey: [
      "dashboard",
      "cancelled-expenses",
      debouncedFilters.year,
      debouncedFilters.scenarioId,
      debouncedFilters.selectedMonthKey,
      debouncedFilters.budgetItemId,
      debouncedFilters.department,
      debouncedFilters.capexOpex
    ],
    queryFn: async () => {
      const params: Record<string, number | string | boolean> = {
        year: debouncedFilters.year,
        status_filter: "cancelled",
        include_out_of_budget: true,
        show_out_of_budget: true,
        show_cancelled: true
      };
      if (debouncedFilters.scenarioId) params.scenario_id = debouncedFilters.scenarioId;
      if (debouncedFilters.budgetItemId) params.budget_item_id = debouncedFilters.budgetItemId;
      if (debouncedFilters.department) params.department = debouncedFilters.department;
      if (debouncedFilters.capexOpex) params.capex_opex = debouncedFilters.capexOpex;
      if (debouncedFilters.selectedMonthKey) params.month_list = debouncedFilters.selectedMonthKey;
      const { data } = await client.get<DashboardExpense[]>("/expenses", {
        params,
        suppressGlobalError: true
      });
      return data.filter((expense) => expense.status === "cancelled" || expense.is_cancelled);
    },
    enabled: Boolean(debouncedFilters.year)
  });

  const {
    data: realizedExpenses = [],
    isFetching: isRealizedExpensesFetching
  } = useQuery<DashboardExpense[]>({
    queryKey: [
      "dashboard",
      "realized-expenses",
      debouncedFilters.year,
      debouncedFilters.scenarioId,
      debouncedFilters.selectedMonthKey,
      debouncedFilters.budgetItemId,
      debouncedFilters.department,
      debouncedFilters.capexOpex
    ],
    enabled: isRealizedDialogOpen,
    queryFn: async () => {
      const params: Record<string, number | string | boolean> = {
        year: debouncedFilters.year,
        status_filter: "recorded",
        include_out_of_budget: false,
        show_out_of_budget: false,
        show_cancelled: false
      };
      if (debouncedFilters.scenarioId) params.scenario_id = debouncedFilters.scenarioId;
      if (debouncedFilters.budgetItemId) params.budget_item_id = debouncedFilters.budgetItemId;
      if (debouncedFilters.department) params.department = debouncedFilters.department;
      if (debouncedFilters.capexOpex) params.capex_opex = debouncedFilters.capexOpex;
      if (debouncedFilters.selectedMonthKey) params.month_list = debouncedFilters.selectedMonthKey;
      const { data } = await client.get<DashboardExpense[]>("/expenses", { params });
      return data;
    }
  });

  const {
    data: trendData = buildEmptyTrendResponse(),
    isLoading: isTrendLoading,
    isError: isTrendError,
    refetch: refetchTrend
  } = useQuery<TrendResponse>({
    queryKey: [
      "dashboard",
      "trend",
      debouncedFilters.year,
      debouncedFilters.scenarioId,
      debouncedFilters.selectedMonthKey,
      selectedOverrunBudgetItemId ?? debouncedFilters.budgetItemId,
      debouncedFilters.department,
      debouncedFilters.capexOpex,
      selectedOverrunItem?.budget_code ?? null
    ],
    queryFn: async () => {
      const params: Record<string, number | string> = { year: debouncedFilters.year };
      if (debouncedFilters.scenarioId) params.scenario_id = debouncedFilters.scenarioId;
      if (debouncedFilters.selectedMonthKey) params.month_list = debouncedFilters.selectedMonthKey;
      const trendBudgetItemId = selectedOverrunBudgetItemId ?? debouncedFilters.budgetItemId;
      if (trendBudgetItemId) params.budget_item_id = trendBudgetItemId;
      if (selectedOverrunItem?.budget_code) {
        params.budget_code = selectedOverrunItem.budget_code;
      }
      if (debouncedFilters.department) params.department = debouncedFilters.department;
      if (debouncedFilters.capexOpex) params.capex_opex = debouncedFilters.capexOpex;
      const { data } = await client.get("/dashboard/trend", {
        params,
        suppressGlobalError: true
      });
      if (import.meta.env.DEV && !hasLoggedTrendResponse.current) {
        console.debug("[Dashboard] Trend response", data);
        hasLoggedTrendResponse.current = true;
      }
      return normalizeTrendResponse(data);
    },
    enabled: Boolean(debouncedFilters.year)
  });

  const budgetFilterOptions = useMemo(
    () =>
      createFilterOptions<BudgetItem>({
        stringify: (option) => {
          const name = stripBudgetCode(option.name ?? "");
          const meta = formatBudgetItemMeta(option);
          return `${option.code ?? ""} ${name} ${meta}`;
        }
      }),
    []
  );

  const handleResetFilters = () => {
    setYear(currentYear);
    setScenarioId(null);
    setSelectedPeriods([]);
    setSelectedMonths([]);
    setBudgetItemId(null);
    setCapexOpex("");
    setDepartment("");
    setSelectedKpiFilter(null);
    setIsPlanDetailDialogOpen(false);
    setForceShowOverBudget(false);
    setHighlightOverBudget(false);
    setSelectedOverrunItem(null);
    setBudgetStatusDialogCategory(null);
    setIsCancelledDialogOpen(false);
  };

  const trendMonths = Array.isArray(trendData.months) ? trendData.months : [];
  const hasTrendMonths = trendMonths.length > 0;
  const monthlyData = useMemo(() => {
    return trendMonths.map((entry) => {
      const planned = asNumber(entry?.planned ?? entry?.plan_total);
      const actual = asNumber(entry?.actual ?? entry?.actual_total);
      const remaining = asNumber(entry?.remaining ?? entry?.remaining_total);
      const overrun = asNumber(entry?.overrun ?? entry?.over_total);
      const overrunPct = asNumber(entry?.overrun_pct ?? entry?.over_pct);
      const month = asNumber(entry?.month ?? 0);
      const monthLabel = monthLabels[month - 1] ?? `Ay ${month}`;
      return {
        month,
        name: monthLabel,
        monthLabel,
        planned,
        actual,
        remaining,
        overrun,
        overrunPct,
        over_pct: planned > 0 ? overrun / planned : 0,
        overrun_pct: overrunPct
      };
    });
  }, [trendMonths]);

  const dashboardMonthlyData = useMemo(
    () =>
      (dashboard?.monthly ?? []).map((entry) => ({
        month: asNumber(entry.month),
        planned: toSafeNumber(entry.planned),
        actual: toSafeNumber(entry.actual),
        remaining: toSafeNumber(entry.remaining),
        overrun: Math.max(toSafeNumber(entry.actual) - toSafeNumber(entry.planned), 0),
        negotiatedSaving: toSafeNumber(entry.saving),
        otherSaving: toSafeNumber(entry.unused),
        cancelled: toSafeNumber(entry.cancelled)
      })),
    [dashboard?.monthly]
  );

  const quarterlyTotals = useMemo(() => {
    const quarters = [
      { label: "Q1", months: [1, 2, 3] },
      { label: "Q2", months: [4, 5, 6] },
      { label: "Q3", months: [7, 8, 9] },
      { label: "Q4", months: [10, 11, 12] }
    ];

    return quarters.map((quarter) => {
      const totals = dashboardMonthlyData.reduce<QuarterlySummary>(
        (acc, entry) => {
          if (!quarter.months.includes(entry.month)) {
            return acc;
          }
          acc.planned += toSafeNumber(entry.planned);
          acc.actual += toSafeNumber(entry.actual);
          acc.remaining += toSafeNumber(entry.remaining);
          acc.negotiatedSaving += toSafeNumber(entry.negotiatedSaving);
          acc.otherSaving += toSafeNumber(entry.otherSaving);
          acc.cancelled += toSafeNumber(entry.cancelled);
          return acc;
        },
        {
          planned: 0,
          actual: 0,
          remaining: 0,
          overrun: 0,
          negotiatedSaving: 0,
          otherSaving: 0,
          cancelled: 0
        }
      );
      totals.overrun = Math.max(totals.actual - totals.planned, 0);

      const totalValue = totals.actual + totals.overrun + totals.remaining;
      const pieData = [
        { name: "Gerçekleşen", value: totals.actual, color: pieColors.actual },
        { name: "Aşım", value: totals.overrun, color: pieColors.overrun },
        { name: "Kalan", value: totals.remaining, color: pieColors.remaining }
      ];

      return { ...quarter, totals, pieData, totalValue };
    });
  }, [dashboardMonthlyData]);

  const normalizedKpi = useMemo(() => {
    const reconciliation = dashboard?.reconciliation ?? null;
    const totalPlan = reconciliation?.total_plan_amount ?? dashboard?.kpi.total_plan ?? 0;
    const totalActual =
      reconciliation?.realized_plan_inside_amount ?? dashboard?.kpi.total_actual ?? 0;
    const negotiatedSaving =
      reconciliation?.negotiated_saving_amount ??
      dashboard?.kpi.total_negotiated_saving ??
      dashboard?.kpi.total_saving ??
      0;
    const otherSaving =
      reconciliation?.other_saving_amount ??
      dashboard?.kpi.total_other_saving ??
      dashboard?.kpi.total_unused ??
      0;

    return {
      total_plan: totalPlan,
      total_actual: totalActual,
      total_remaining:
        reconciliation?.remaining_available_amount ?? dashboard?.kpi.total_remaining ?? 0,
      total_saving: negotiatedSaving,
      total_overrun: reconciliation?.overrun_amount ?? dashboard?.kpi.total_overrun ?? 0,
      total_unused: otherSaving,
      total_negotiated_saving: negotiatedSaving,
      total_other_saving: otherSaving,
      total_combined_saving: negotiatedSaving + otherSaving,
      total_cancelled:
        reconciliation?.canceled_budget_amount ?? dashboard?.kpi.total_cancelled ?? 0,
      capex_total_plan_amount:
        reconciliation?.capex_total_plan_amount ?? dashboard?.kpi.capex_total_plan_amount ?? 0,
      opex_total_plan_amount:
        reconciliation?.opex_total_plan_amount ?? dashboard?.kpi.opex_total_plan_amount ?? 0,
      unclassified_total_plan_amount:
        reconciliation?.unclassified_total_plan_amount ??
        dashboard?.kpi.unclassified_total_plan_amount ??
        0,
      realized_plan_inside_amount: totalActual,
      capex_realized_plan_inside_amount:
        reconciliation?.capex_realized_plan_inside_amount ??
        dashboard?.kpi.capex_realized_plan_inside_amount ??
        0,
      opex_realized_plan_inside_amount:
        reconciliation?.opex_realized_plan_inside_amount ??
        dashboard?.kpi.opex_realized_plan_inside_amount ??
        0,
      unclassified_realized_plan_inside_amount:
        reconciliation?.unclassified_realized_plan_inside_amount ??
        dashboard?.kpi.unclassified_realized_plan_inside_amount ??
        0,
      remaining_available_amount:
        reconciliation?.remaining_available_amount ?? dashboard?.kpi.total_remaining ?? 0,
      capex_remaining_available_amount:
        reconciliation?.capex_remaining_available_amount ??
        dashboard?.kpi.capex_remaining_available_amount ??
        0,
      opex_remaining_available_amount:
        reconciliation?.opex_remaining_available_amount ??
        dashboard?.kpi.opex_remaining_available_amount ??
        0,
      unclassified_remaining_available_amount:
        reconciliation?.unclassified_remaining_available_amount ??
        dashboard?.kpi.unclassified_remaining_available_amount ??
        0,
      negotiated_saving_amount: negotiatedSaving,
      capex_negotiated_saving_amount:
        reconciliation?.capex_negotiated_saving_amount ??
        dashboard?.kpi.capex_negotiated_saving_amount ??
        0,
      opex_negotiated_saving_amount:
        reconciliation?.opex_negotiated_saving_amount ??
        dashboard?.kpi.opex_negotiated_saving_amount ??
        0,
      unclassified_negotiated_saving_amount:
        reconciliation?.unclassified_negotiated_saving_amount ??
        dashboard?.kpi.unclassified_negotiated_saving_amount ??
        0,
      other_saving_amount: otherSaving,
      capex_other_saving_amount:
        reconciliation?.capex_other_saving_amount ??
        dashboard?.kpi.capex_other_saving_amount ??
        0,
      opex_other_saving_amount:
        reconciliation?.opex_other_saving_amount ??
        dashboard?.kpi.opex_other_saving_amount ??
        0,
      unclassified_other_saving_amount:
        reconciliation?.unclassified_other_saving_amount ??
        dashboard?.kpi.unclassified_other_saving_amount ??
        0,
      canceled_budget_amount:
        reconciliation?.canceled_budget_amount ?? dashboard?.kpi.total_cancelled ?? 0,
      capex_canceled_budget_amount:
        reconciliation?.capex_canceled_budget_amount ??
        dashboard?.kpi.capex_canceled_budget_amount ??
        0,
      opex_canceled_budget_amount:
        reconciliation?.opex_canceled_budget_amount ??
        dashboard?.kpi.opex_canceled_budget_amount ??
        0,
      unclassified_canceled_budget_amount:
        reconciliation?.unclassified_canceled_budget_amount ??
        dashboard?.kpi.unclassified_canceled_budget_amount ??
        0,
      overrun_amount: reconciliation?.overrun_amount ?? dashboard?.kpi.total_overrun ?? 0,
      capex_overrun_amount:
        reconciliation?.capex_overrun_amount ?? dashboard?.kpi.capex_overrun_amount ?? 0,
      opex_overrun_amount:
        reconciliation?.opex_overrun_amount ?? dashboard?.kpi.opex_overrun_amount ?? 0,
      unclassified_overrun_amount:
        reconciliation?.unclassified_overrun_amount ??
        dashboard?.kpi.unclassified_overrun_amount ??
        0,
      budget_outside_amount:
        reconciliation?.budget_outside_amount ?? dashboard?.kpi.budget_outside_amount ?? 0,
      capex_budget_outside_amount:
        reconciliation?.capex_budget_outside_amount ??
        dashboard?.kpi.capex_budget_outside_amount ??
        0,
      opex_budget_outside_amount:
        reconciliation?.opex_budget_outside_amount ??
        dashboard?.kpi.opex_budget_outside_amount ??
        0,
      unclassified_budget_outside_amount:
        reconciliation?.unclassified_budget_outside_amount ??
        dashboard?.kpi.unclassified_budget_outside_amount ??
        0,
      reconciliation_total:
        reconciliation?.reconciliation_total ?? dashboard?.kpi.reconciliation_total ?? 0,
      capex_reconciliation_total:
        reconciliation?.capex_reconciliation_total ??
        dashboard?.kpi.capex_reconciliation_total ??
        0,
      opex_reconciliation_total:
        reconciliation?.opex_reconciliation_total ??
        dashboard?.kpi.opex_reconciliation_total ??
        0,
      unclassified_reconciliation_total:
        reconciliation?.unclassified_reconciliation_total ??
        dashboard?.kpi.unclassified_reconciliation_total ??
        0,
      reconciliation_difference:
        reconciliation?.reconciliation_difference ??
        dashboard?.kpi.reconciliation_difference ??
        0,
      capex_reconciliation_difference:
        reconciliation?.capex_reconciliation_difference ??
        dashboard?.kpi.capex_reconciliation_difference ??
        0,
      opex_reconciliation_difference:
        reconciliation?.opex_reconciliation_difference ??
        dashboard?.kpi.opex_reconciliation_difference ??
        0,
      unclassified_reconciliation_difference:
        reconciliation?.unclassified_reconciliation_difference ??
        dashboard?.kpi.unclassified_reconciliation_difference ??
        0
    } satisfies DashboardKPI;
  }, [dashboard]);

  const formattedTotalPlan = formatCurrency(normalizedKpi.total_plan);
  const formattedActual = formatCurrency(normalizedKpi.total_actual);
  const formattedRemaining = formatCurrency(normalizedKpi.total_remaining);
  const formattedNegotiatedSaving = formatCurrency(
    normalizedKpi.total_negotiated_saving ?? 0
  );
  const formattedOtherSaving = formatCurrency(normalizedKpi.total_other_saving ?? 0);
  const formattedCombinedSaving = formatCurrency(
    normalizedKpi.total_combined_saving ?? 0
  );
  const outOfBudgetDetailTotal = useMemo(
    () => outOfBudgetExpenses.reduce((sum, expense) => sum + toSafeNumber(expense.amount), 0),
    [outOfBudgetExpenses]
  );
  const outOfBudgetTotal =
    dashboard?.reconciliation || dashboard?.kpi.budget_outside_amount !== undefined
      ? toSafeNumber(normalizedKpi.budget_outside_amount)
      : outOfBudgetDetailTotal;
  const formattedOutOfBudget = formatCurrency(outOfBudgetTotal);
  const cancelledExpensesTotal = useMemo(
    () => cancelledExpenses.reduce((sum, expense) => sum + toSafeNumber(expense.amount), 0),
    [cancelledExpenses]
  );
  const cancelledTotal =
    dashboard?.reconciliation || dashboard?.kpi.canceled_budget_amount !== undefined
      ? toSafeNumber(normalizedKpi.total_cancelled)
      : Math.max(toSafeNumber(normalizedKpi.total_cancelled), cancelledExpensesTotal);
  const formattedCancelled = formatCurrency(cancelledTotal);
  const realizedExpensesPlanTotal = useMemo(
    () => sumUniqueExpensePlanScopes(realizedExpenses),
    [realizedExpenses]
  );
  const realizedPlanInsideTotal = toSafeNumber(normalizedKpi.realized_plan_inside_amount);
  const realizedOverrunTotal = toSafeNumber(normalizedKpi.overrun_amount);
  const realizedTotalSpend = realizedPlanInsideTotal + realizedOverrunTotal;
  const realizedExpenseRows = useMemo(
    () => buildExpenseAmountSplits(realizedExpenses, realizedPlanInsideTotal, realizedOverrunTotal),
    [realizedExpenses, realizedOverrunTotal, realizedPlanInsideTotal]
  );
  const realizedExpenseAmountTotal = realizedExpenseRows.reduce(
    (sum, row) => sum + toSafeNumber(row.amount),
    0
  );
  const realizedPlanInsideDetailTotal = realizedExpenseRows.length
    ? realizedExpenseRows.reduce((sum, row) => sum + toSafeNumber(row.planInside), 0)
    : realizedPlanInsideTotal;
  const realizedOverrunDetailTotal = realizedExpenseRows.length
    ? realizedExpenseRows.reduce((sum, row) => sum + toSafeNumber(row.overrun), 0)
    : realizedOverrunTotal;
  const realizedSpendDetailTotal = realizedExpenseRows.length
    ? realizedExpenseAmountTotal
    : realizedTotalSpend;
  const rawOverBudgetItems = overBudget?.items ?? [];
  const overBudgetItems = useMemo(() => {
    return rawOverBudgetItems
      .map((item) => {
        const plan = toSafeNumber(item.plan);
        const actual = toSafeNumber(item.actual);
        const over = Math.max(toSafeNumber(item.over), 0);
        const overPct = plan > 0 ? (over / plan) * 100 : 0;
        return { ...item, plan, actual, over, over_pct: overPct };
      })
      .filter((item) => item.over > 0)
      .sort((a, b) => b.over - a.over);
  }, [rawOverBudgetItems]);
  const overBudgetSummary = useMemo(() => {
    const fallbackOverTotal = overBudgetItems.reduce((sum, item) => sum + item.over, 0);
    return {
      over_total:
        overBudget?.summary?.over_total !== undefined
          ? Math.max(toSafeNumber(overBudget.summary.over_total), 0)
          : fallbackOverTotal,
      over_item_count: overBudget?.summary?.over_item_count ?? overBudgetItems.length
    };
  }, [overBudget?.summary?.over_item_count, overBudget?.summary?.over_total, overBudgetItems]);
  const savingsSummary = overBudget?.summary as
    | (NonNullable<typeof overBudget>["summary"] & {
        negotiated_saving_item_count?: number;
        other_saving_item_count?: number;
      })
    | undefined;
  const overBudgetTopItems = useMemo(() => overBudgetItems.slice(0, 10), [overBudgetItems]);
  const negotiatedSavingItems = overBudget?.saving_items ?? [];
  const unusedBudgetItems = (overBudget?.unused_items ?? []) as UnusedBudgetItem[];
  const combinedSavingItems = useMemo(
    () => [
      ...negotiatedSavingItems.map((item) => ({
        type: "Pazarlıklı Tasarruf",
        item,
        amount: toSafeNumber(item.over),
        unusedAmount: 0
      })),
      ...unusedBudgetItems.map((item) => ({
        type: "Diğer Tasarruf",
        item,
        amount: toSafeNumber(item.unused_amount ?? item.over),
        unusedAmount: toSafeNumber(item.unused_amount ?? item.over)
      }))
    ],
    [negotiatedSavingItems, unusedBudgetItems]
  );
  const negotiatedSavingTotals = useMemo(
    () =>
      negotiatedSavingItems.reduce(
        (totals, item) => ({
          plan: totals.plan + toSafeNumber(item.plan),
          actual: totals.actual + toSafeNumber(item.actual),
          saving: totals.saving + toSafeNumber(item.over)
        }),
        { plan: 0, actual: 0, saving: 0 }
      ),
    [negotiatedSavingItems]
  );
  const unusedBudgetTotals = useMemo(
    () =>
      unusedBudgetItems.reduce(
        (totals, item) => ({
          plan: totals.plan + toSafeNumber(item.plan),
          unused: totals.unused + toSafeNumber(item.unused_amount ?? item.over),
          available: totals.available + toSafeNumber(item.available_amount)
        }),
        { plan: 0, unused: 0, available: 0 }
      ),
    [unusedBudgetItems]
  );
  const formattedOver = formatCurrency(normalizedKpi.total_overrun);
  const selectedBudgetOverrun = debouncedFilters.budgetItemId
    ? overBudgetItems[0]
    : null;
  const overBudgetSubtitle = debouncedFilters.budgetItemId
    ? selectedBudgetOverrun
      ? `Plan: ${formatCurrency(selectedBudgetOverrun.plan)} • Gerçekleşen: ${formatCurrency(
          selectedBudgetOverrun.actual
        )}`
      : "Seçili kalem için veri yok"
    : `${overBudgetSummary?.over_item_count ?? 0} kalemde aşım`;

  const showPlanned =
    !selectedKpiFilter ||
    selectedKpiFilter === "total_plan" ||
    selectedKpiFilter === "total_negotiated_saving" ||
    selectedKpiFilter === "total_combined_saving";
  const showActual =
    !selectedKpiFilter ||
    selectedKpiFilter === "total_actual" ||
    selectedKpiFilter === "total_negotiated_saving" ||
    selectedKpiFilter === "total_combined_saving";
  const showRemaining = !selectedKpiFilter || selectedKpiFilter === "total_remaining";
  const showOverrun = !selectedKpiFilter || selectedKpiFilter === "total_overrun";
  const showOverBudgetSection = !budgetItemId || forceShowOverBudget;
  const hasTrendData = hasTrendMonths && monthlyData.some(
    (entry) => entry.planned > 0 || entry.actual > 0 || entry.remaining > 0 || entry.overrun > 0
  );
  const hasQuarterlyData = quarterlyTotals.some(
    (quarter) =>
      quarter.totals.planned > 0 ||
      quarter.totals.actual > 0 ||
      quarter.totals.remaining > 0 ||
      quarter.totals.negotiatedSaving > 0 ||
      quarter.totals.otherSaving > 0 ||
      quarter.totals.cancelled > 0
  );
  const selectedOverrunSummary = useMemo(() => {
    if (!selectedOverrunItem) {
      return null;
    }
    return (
      overBudgetItems.find((item) => item.budget_code === selectedOverrunItem.budget_code) ??
      null
    );
  }, [overBudgetItems, selectedOverrunItem]);
  const hasSelectedOverrun =
    selectedOverrunItem && toSafeNumber(selectedOverrunSummary?.over) > 0;

  useEffect(() => {
    if (!selectedOverrunItem) {
      return;
    }
    const stillExists = overBudgetItems.some(
      (item) => item.budget_code === selectedOverrunItem.budget_code
    );
    if (!stillExists) {
      setSelectedOverrunItem(null);
    }
  }, [overBudgetItems, selectedOverrunItem]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  const handleSummaryCardClick = (filterKey: string) => {
    if (filterKey === "total_plan") {
      setSelectedKpiFilter("total_plan");
      setIsPlanDetailDialogOpen(true);
      setIsRealizedDialogOpen(false);
      setIsOutOfBudgetDialogOpen(false);
      setSavingDetailDialog(null);
      setIsUnusedBudgetDialogOpen(false);
      setBudgetStatusDialogCategory(null);
      setIsCancelledDialogOpen(false);
      setSelectedOverrunItem(null);
      return;
    }
    if (filterKey === "total_actual") {
      setSelectedKpiFilter("total_actual");
      setIsPlanDetailDialogOpen(false);
      setIsRealizedDialogOpen(true);
      setSavingDetailDialog(null);
      setIsUnusedBudgetDialogOpen(false);
      setBudgetStatusDialogCategory(null);
      setIsCancelledDialogOpen(false);
      return;
    }
    if (filterKey === "out_of_budget") {
      setSelectedKpiFilter("out_of_budget");
      setIsPlanDetailDialogOpen(false);
      setIsOutOfBudgetDialogOpen(true);
      setSavingDetailDialog(null);
      setIsUnusedBudgetDialogOpen(false);
      setBudgetStatusDialogCategory(null);
      setIsCancelledDialogOpen(false);
      return;
    }
    if (filterKey === "total_cancelled") {
      setSelectedKpiFilter("total_cancelled");
      setIsPlanDetailDialogOpen(false);
      setIsRealizedDialogOpen(false);
      setIsOutOfBudgetDialogOpen(false);
      setSavingDetailDialog(null);
      setIsUnusedBudgetDialogOpen(false);
      setBudgetStatusDialogCategory(null);
      setSelectedOverrunItem(null);
      setIsCancelledDialogOpen(true);
      return;
    }
    if (filterKey === "total_other_saving") {
      setSelectedKpiFilter("total_other_saving");
      setIsPlanDetailDialogOpen(false);
      setIsUnusedBudgetDialogOpen(true);
      setSavingDetailDialog(null);
      setBudgetStatusDialogCategory(null);
      setIsCancelledDialogOpen(false);
      return;
    }
    if (filterKey === "total_negotiated_saving") {
      setSelectedKpiFilter("total_negotiated_saving");
      setIsPlanDetailDialogOpen(false);
      setSavingDetailDialog("negotiated");
      setIsUnusedBudgetDialogOpen(false);
      setBudgetStatusDialogCategory(null);
      setSelectedOverrunItem(null);
      setIsCancelledDialogOpen(false);
      return;
    }
    if (filterKey === "total_combined_saving") {
      setSelectedKpiFilter("total_combined_saving");
      setIsPlanDetailDialogOpen(false);
      setSavingDetailDialog("total");
      setIsUnusedBudgetDialogOpen(false);
      setBudgetStatusDialogCategory(null);
      setSelectedOverrunItem(null);
      setIsCancelledDialogOpen(false);
      return;
    }
    const isSameFilter = selectedKpiFilter === filterKey;
    setSelectedKpiFilter((prev) => (prev === filterKey ? null : filterKey));
    setIsPlanDetailDialogOpen(false);
    setSavingDetailDialog(null);
    setIsUnusedBudgetDialogOpen(false);
    setIsCancelledDialogOpen(false);
    if (filterKey === "total_remaining") {
      setBudgetStatusDialogCategory("remaining");
      setSelectedOverrunItem(null);
      return;
    }
    if (filterKey === "total_overrun") {
      setBudgetStatusDialogCategory("overrun");
      setForceShowOverBudget(true);
      setHighlightOverBudget(true);
      const top = overBudgetItems.reduce<OverBudgetItem | null>((best, item) => {
        const over = toSafeNumber(item.over);
        if (over <= 0) {
          return best;
        }
        if (!best || over > toSafeNumber(best.over)) {
          return item;
        }
        return best;
      }, null);
      if (top) {
        if (isSameFilter) {
          setSelectedOverrunItem(null);
        } else {
          setSelectedOverrunItem({
            budget_code: top.budget_code,
            budget_name: top.budget_name
          });
        }
      }
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
      highlightTimeoutRef.current = window.setTimeout(() => {
        setHighlightOverBudget(false);
      }, 2000);
      window.setTimeout(() => {
        overBudgetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        trendSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    } else {
      setSelectedOverrunItem(null);
    }
  };

  const handleOverBudgetRowClick = (item: OverBudgetItem) => {
    if (toSafeNumber(item.over) <= 0) {
      return;
    }
    setSelectedOverrunItem({
      budget_code: item.budget_code,
      budget_name: item.budget_name
    });
    window.setTimeout(() => {
      trendSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const handleOpenRealizedExpensesPage = () => {
    const searchParams = new URLSearchParams({
      filter: "actual",
      statusFilter: "ACTIVE",
      year: String(year)
    });
    if (scenarioId) searchParams.set("scenario_id", String(scenarioId));
    if (selectedMonthKey) searchParams.set("months", selectedMonthKey);
    if (budgetItemId) searchParams.set("budget_item_id", String(budgetItemId));
    if (capexOpex) searchParams.set("capex_opex", capexOpex);
    navigate(`/expenses?${searchParams.toString()}`, {
      state: {
        filter: "actual",
        statusFilter: "ACTIVE",
        year,
        scenarioId,
        budgetItemId,
        capexOpex,
        months: selectedMonthList
      }
    });
  };

  const handleOpenOutOfBudgetExpensesPage = () => {
    const searchParams = new URLSearchParams({
      filter: "out_of_budget",
      include_out_of_budget: "true",
      show_out_of_budget: "true",
      only_out_of_budget: "true",
      statusFilter: "OUT_OF_BUDGET",
      year: String(year)
    });
    if (scenarioId) searchParams.set("scenario_id", String(scenarioId));
    if (selectedMonthKey) searchParams.set("months", selectedMonthKey);
    if (budgetItemId) searchParams.set("budget_item_id", String(budgetItemId));
    if (capexOpex) searchParams.set("capex_opex", capexOpex);
    navigate(`/expenses?${searchParams.toString()}`, {
      state: {
        filter: "out_of_budget",
        statusFilter: "OUT_OF_BUDGET",
        selectedExpenseFilter: "OUT_OF_BUDGET",
        include_out_of_budget: true,
        show_out_of_budget: true,
        only_out_of_budget: true,
        year,
        scenarioId,
        budgetItemId,
        capexOpex,
        months: selectedMonthList
      }
    });
  };

  const dashboardExportFilterParts = useMemo(() => {
    const monthPart =
      (selectedPeriods.length > 0 ? selectedPeriods.join("_") : null) ||
      (selectedMonthList.length > 0
        ? selectedMonthList
            .map((monthValue) => monthLabels[monthValue - 1] ?? `Ay ${monthValue}`)
            .join("_")
        : null);
    return [monthPart, year];
  }, [selectedPeriods, selectedMonthList, year]);

  const buildDashboardExportFileName = (detailName: string) =>
    buildExcelFileName("dashboard", detailName, ...dashboardExportFilterParts);

  const planDetailItems = useMemo(
    () => {
      const rows = (dashboard?.monthly ?? [])
        .map((item) => ({
          month: item.month,
          monthLabel: monthLabels[item.month - 1] ?? `Ay ${item.month}`,
          planned: toSafeNumber(item.planned)
        }))
        .filter((item) => item.planned > 0);
      const targetTotal = roundMoney(normalizedKpi.total_plan);
      if (targetTotal <= 0) return rows;
      if (rows.length === 0) {
        return [{ month: 0, monthLabel: "Seçili kapsam", planned: targetTotal }];
      }

      const currentTotal = roundMoney(
        rows.reduce((sum, item) => sum + toSafeNumber(item.planned), 0)
      );
      if (Math.abs(currentTotal - targetTotal) <= 0.005) return rows;

      const adjustedValues = allocateTotalByWeights(
        rows.map((item) => item.planned),
        targetTotal
      );
      return rows
        .map((item, index) => ({ ...item, planned: adjustedValues[index] ?? 0 }))
        .filter((item) => item.planned > 0);
    },
    [dashboard?.monthly, normalizedKpi.total_plan]
  );
  const planDetailTotal = planDetailItems.reduce(
    (sum, item) => sum + toSafeNumber(item.planned),
    0
  );

  const buildPlanExportRows = (items: typeof planDetailItems) =>
    items.map((item) => ({
      "Ay / Dönem": item.monthLabel,
      "Toplam Bütçe": toSafeNumber(item.planned)
    }));

  const handleExportPlanDetail = () => {
    exportRowsToExcel(
      buildPlanExportRows(planDetailItems),
      buildDashboardExportFileName("toplam_butce_detayi"),
      "Toplam Bütçe",
      ["Toplam Bütçe"]
    );
  };

  const formatExpensePeriod = (expense: DashboardExpense) => {
    const rawDate = expense.expense_date ?? expense.date ?? "";
    if (!rawDate) return "-";
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) return "-";
    return monthLabels[date.getMonth()] ?? "-";
  };

  const formatExpenseOwner = (expense: DashboardExpense) =>
    expense.created_by_name || expense.created_by_username || "-";

  const buildExpenseExportRows = (items: DashboardExpense[]) =>
    items.map((expense) => {
      const rawDate = expense.expense_date ?? expense.date ?? "";
      return {
        Tarih: rawDate ? new Date(rawDate).toLocaleDateString("tr-TR") : "-",
        "Bütçe Kalemi / Açıklama":
          formatBudgetLabel(expense.budget_name ?? expense.budget_outside_title, expense.budget_code) ||
          expense.description ||
          "-",
        "Ay / Dönem": formatExpensePeriod(expense),
        Departman: expense.department ?? expense.budget_outside_department ?? "-",
        "Capex/Opex": expense.capex_opex ?? expense.map_capex_opex ?? expense.budget_outside_capex_opex ?? "-",
        Nitelik:
          expense.asset_type ??
          expense.map_nitelik ??
          expense.nitelik ??
          expense.budget_outside_asset_type ??
          "-",
        Tutar: toSafeNumber(expense.amount),
        Satıcı: expense.vendor || "-",
        "Kaydı Giren": formatExpenseOwner(expense),
        Durum: expense.status === "cancelled" ? "İptal" : "Kaydedildi"
      };
    });

  const buildRealizedExpenseExportRows = (items: typeof realizedExpenseRows) =>
    items.map(({ expense, amount, planInside, overrun }) => {
      const rawDate = expense.expense_date ?? expense.date ?? "";
      return {
        Tarih: rawDate ? new Date(rawDate).toLocaleDateString("tr-TR") : "-",
        "Bütçe Kalemi / Açıklama":
          formatBudgetLabel(expense.budget_name ?? expense.budget_outside_title, expense.budget_code) ||
          expense.description ||
          "-",
        "Ay / Dönem": formatExpensePeriod(expense),
        Departman: expense.department ?? expense.budget_outside_department ?? "-",
        "Capex/Opex": expense.capex_opex ?? expense.map_capex_opex ?? expense.budget_outside_capex_opex ?? "-",
        Nitelik:
          expense.asset_type ??
          expense.map_nitelik ??
          expense.nitelik ??
          expense.budget_outside_asset_type ??
          "-",
        "Harcama Tutarı": toSafeNumber(amount),
        "Gerçekleşen Plan İçi": toSafeNumber(planInside),
        Aşım: toSafeNumber(overrun),
        Satıcı: expense.vendor || "-",
        "Kaydı Giren": formatExpenseOwner(expense),
        Durum: expense.status === "cancelled" ? "İptal" : "Kaydedildi"
      };
    });

  const handleExportRealizedExpenses = () => {
    exportRowsToExcel(
      buildRealizedExpenseExportRows(realizedExpenseRows),
      buildDashboardExportFileName("gerceklesen_harcamalar"),
      "Gerçekleşen Harcamalar",
      ["Harcama Tutarı", "Gerçekleşen Plan İçi", "Aşım"]
    );
  };

  const handleExportOutOfBudgetExpenses = () => {
    exportRowsToExcel(
      buildExpenseExportRows(outOfBudgetExpenses),
      buildDashboardExportFileName("butce_disi_detayi"),
      "Bütçe Dışı",
      ["Tutar"]
    );
  };

  const handleExportCancelledExpenses = () => {
    exportRowsToExcel(
      buildExpenseExportRows(cancelledExpenses),
      buildDashboardExportFileName("iptal_detayi"),
      "İptal Edilenler",
      ["Tutar"]
    );
  };

  const buildUnusedBudgetExportRows = (items: UnusedBudgetItem[]) =>
    items.map((item) => ({
      "Bütçe Kalemi": formatBudgetItemLabel({
        code: item.budget_code,
        name: item.budget_name
      }),
      "Ay / Dönem": formatBudgetPeriod(item),
      Departman: item.department || "-",
      "Capex/Opex": item.capex_opex || "-",
      Nitelik: item.asset_type || "-",
      "Toplam Bütçe": toSafeNumber(item.plan),
      Harcama: toSafeNumber(item.actual),
      Kullanılmayacak: toSafeNumber(item.unused_amount ?? item.over),
      "Kalan Kullanılabilir": toSafeNumber(item.available_amount),
      Sebep: formatUnusedReason(item.reason),
      Not: item.note || "",
      "Güncelleme Tarihi": item.unused_updated_at
        ? new Date(item.unused_updated_at).toLocaleString("tr-TR")
        : "-"
    }));

  const handleExportUnusedBudget = () => {
    exportRowsToExcel(
      buildUnusedBudgetExportRows(unusedBudgetItems),
      buildDashboardExportFileName("kullanilmayacak_butce_detayi"),
      "Kullanılmayacak Bütçe",
      ["Toplam Bütçe", "Harcama", "Kullanılmayacak", "Kalan Kullanılabilir"]
    );
  };

  const buildNegotiatedSavingExportRows = (items: OverBudgetItem[]) =>
    items.map((item) => ({
      "Bütçe Kalemi": formatBudgetItemLabel({
        code: item.budget_code,
        name: item.budget_name
      }),
      "Ay / Dönem": formatBudgetPeriod(item),
      Departman: item.department || "-",
      "Capex/Opex": item.capex_opex || "-",
      Nitelik: item.asset_type || "-",
      "Toplam Bütçe": toSafeNumber(item.plan),
      "Gerçekleşen Harcama": toSafeNumber(item.actual),
      "Pazarlıklı Tasarruf": toSafeNumber(item.over)
    }));

  const handleExportNegotiatedSaving = () => {
    exportRowsToExcel(
      buildNegotiatedSavingExportRows(negotiatedSavingItems),
      buildDashboardExportFileName("pazarlikli_tasarruf_detayi"),
      "Pazarlıklı Tasarruf",
      ["Toplam Bütçe", "Gerçekleşen Harcama", "Pazarlıklı Tasarruf"]
    );
  };

  const buildCombinedSavingExportRows = (items: typeof combinedSavingItems) =>
    items.map(({ type, item, amount, unusedAmount }) => ({
      "Tasarruf Türü": type,
      "Bütçe Kalemi": formatBudgetItemLabel({
        code: item.budget_code,
        name: item.budget_name
      }),
      "Ay / Dönem": formatBudgetPeriod(item),
      Departman: item.department || "-",
      "Capex/Opex": item.capex_opex || "-",
      Nitelik: item.asset_type || "-",
      "Toplam Bütçe": toSafeNumber(item.plan),
      "Gerçekleşen Harcama":
        type === "Pazarlıklı Tasarruf" ? toSafeNumber(item.actual) : "-",
      "Kullanılmayacak Tutar": unusedAmount > 0 ? unusedAmount : "-",
      Tasarruf: amount
    }));

  const handleExportCombinedSaving = () => {
    exportRowsToExcel(
      buildCombinedSavingExportRows(combinedSavingItems),
      buildDashboardExportFileName("toplam_tasarruf_detayi"),
      "Toplam Tasarruf",
      ["Toplam Bütçe", "Gerçekleşen Harcama", "Kullanılmayacak Tutar", "Tasarruf"]
    );
  };

  const openDashboardExpenseDetail = (expense: DashboardExpense, title = "Harcama Detayı") => {
    const rawDate = expense.expense_date ?? expense.date ?? "";
    const budgetLabel =
      formatBudgetLabel(expense.budget_name ?? expense.budget_outside_title, expense.budget_code) ||
      expense.description ||
      "-";
    const budgetAmount = toSafeNumber(expense.plan_amount);
    const expenseAmount = toSafeNumber(expense.amount);
    const remainingAmount = Math.max(
      toSafeNumber(expense.scope_remaining_amount ?? budgetAmount - expenseAmount),
      0
    );
    const savingAmount = toSafeNumber(expense.scope_saving_amount ?? expense.saving_amount);
    setDashboardReadonlyDetail({
      title,
      summary: [
        { label: "Ay / Dönem", value: formatExpensePeriod(expense) },
        {
          label: "Tutar",
          value: formatCurrency(expenseAmount),
          color: "primary.main"
        },
        {
          label: "Bütçe",
          value: budgetAmount > 0 ? formatCurrency(budgetAmount) : "-"
        },
        {
          label: "Kalan",
          value: formatCurrency(remainingAmount),
          color: "success.main"
        },
        {
          label: "Tasarruf",
          value: formatCurrency(savingAmount),
          color: "success.main"
        }
      ],
      fields: [
        ["Bütçe Kalemi", budgetLabel],
        ["Senaryo", expense.scenario_id ? String(expense.scenario_id) : "-"],
        ["Tam Tarih", rawDate ? new Date(rawDate).toLocaleDateString("tr-TR") : "-"],
        ["Bütçe", budgetAmount > 0 ? formatCurrency(budgetAmount) : "-"],
        ["Harcama", formatCurrency(expenseAmount)],
        ["Kalan", formatCurrency(remainingAmount)],
        [
          "Aşım",
          toSafeNumber(expense.scope_overrun_amount) > 0
            ? formatCurrency(toSafeNumber(expense.scope_overrun_amount))
            : "-"
        ],
        ["Tasarruf", formatCurrency(savingAmount)],
        ["Departman", expense.department ?? expense.budget_outside_department ?? "-"],
        ["Capex/Opex", expense.capex_opex ?? expense.map_capex_opex ?? expense.budget_outside_capex_opex ?? "-"],
        [
          "Nitelik",
          expense.asset_type ??
            expense.map_nitelik ??
            expense.nitelik ??
            expense.budget_outside_asset_type ??
            "-"
        ],
        ["Satıcı", expense.vendor || "-"],
        ["Açıklama", expense.description || "-"],
        ["Kaydı Giren", formatExpenseOwner(expense)]
      ]
    });
  };

  const openDashboardPlanDetail = (item: (typeof planDetailItems)[number]) => {
    const detailBudgetLabel = debouncedFilters.budgetItemId
      ? formatBudgetItemLabel(
          budgetItems?.find((budgetItem) => budgetItem.id === debouncedFilters.budgetItemId) ?? null
        )
      : "Tümü";
    setDashboardReadonlyDetail({
      title: "Plan Detayı",
      summary: [
        { label: "Ay / Dönem", value: item.monthLabel },
        {
          label: "Toplam Bütçe",
          value: formatCurrency(toSafeNumber(item.planned)),
          color: "primary.main"
        }
      ],
      fields: [
        ["Ay / Dönem", item.monthLabel],
        ["Toplam Bütçe", formatCurrency(toSafeNumber(item.planned))],
        ["Seçili Yıl", String(debouncedFilters.year)],
        ["Bütçe Kalemi", detailBudgetLabel || "Tümü"]
      ]
    });
  };

  const openDashboardBudgetStatusDetail = (
    item: OverBudgetItem,
    title: string,
    resultLabel: string
  ) => {
    setDashboardReadonlyDetail({
      title,
      summary: [
        { label: "Ay / Dönem", value: formatBudgetPeriod(item) },
        { label: "Toplam Bütçe", value: formatCurrency(toSafeNumber(item.plan)) },
        { label: "Gerçekleşen", value: formatCurrency(toSafeNumber(item.actual)) },
        {
          label: resultLabel,
          value: formatCurrency(toSafeNumber(item.over)),
          color:
            resultLabel === "Aşım"
              ? "error.main"
              : resultLabel === "Kalan Bütçe"
                ? "warning.main"
                : "success.main"
        }
      ],
      fields: [
        ["Bütçe Kalemi", formatBudgetItemLabel({ code: item.budget_code, name: item.budget_name })],
        ["Departman", item.department || "-"],
        ["Capex/Opex", item.capex_opex || "-"],
        ["Nitelik", item.asset_type || "-"],
        ["Yüzde", `${toSafeNumber(item.over_pct).toFixed(1)}%`]
      ]
    });
  };

  const openDashboardSavingDetail = (
    item: OverBudgetItem,
    type: string,
    amount: number,
    unusedAmount = 0
  ) => {
    setDashboardReadonlyDetail({
      title: `${type} Detayı`,
      summary: [
        { label: "Ay / Dönem", value: formatBudgetPeriod(item) },
        { label: "Toplam Bütçe", value: formatCurrency(toSafeNumber(item.plan)) },
        { label: "Gerçekleşen", value: formatCurrency(toSafeNumber(item.actual)) },
        { label: "Tasarruf", value: formatCurrency(amount), color: "success.main" }
      ],
      fields: [
        ["Bütçe Kalemi", formatBudgetItemLabel({ code: item.budget_code, name: item.budget_name })],
        ["Tür", type],
        ["Departman", item.department || "-"],
        ["Capex/Opex", item.capex_opex || "-"],
        ["Nitelik", item.asset_type || "-"],
        ["Kullanılmayacak Tutar", unusedAmount > 0 ? formatCurrency(unusedAmount) : "-"],
        ["Sebep", formatUnusedReason(item.reason)],
        ["Not", item.note || "-"]
      ]
    });
  };

  const buildBudgetStatusExportRows = (
    items: OverBudgetItem[],
    resultLabel: string,
    monthsLabel = "Ay / Aylar"
  ) =>
    items.map((item) => ({
      "Bütçe Kalemi": formatBudgetItemLabel({
        code: item.budget_code,
        name: item.budget_name
      }),
      [monthsLabel]: formatBudgetPeriod(item),
      "Capex/Opex": item.capex_opex ?? "-",
      Nitelik: item.asset_type ?? "-",
      Departman: item.department ?? "-",
      "Toplam Bütçe": toSafeNumber(item.plan),
      "Gerçekleşen Harcama": toSafeNumber(item.actual),
      [resultLabel]: toSafeNumber(item.over)
    }));

  const selectedBudgetFilterLabel = debouncedFilters.budgetItemId
    ? formatBudgetItemLabel(
        budgetItems?.find((item) => item.id === debouncedFilters.budgetItemId) ?? null
      )
    : "Tümü";

  const fetchDashboardExpenseRowsForExport = async (
    kind: "realized" | "out_of_budget" | "cancelled"
  ) => {
    const params: Record<string, number | string | boolean> = {
      year: debouncedFilters.year
    };
    if (kind === "realized") {
      params.status_filter = "recorded";
      params.include_out_of_budget = false;
      params.show_out_of_budget = false;
      params.show_cancelled = false;
    } else if (kind === "out_of_budget") {
      params.status_filter = "recorded";
      params.include_out_of_budget = true;
      params.show_out_of_budget = true;
      params.only_out_of_budget = true;
      params.show_cancelled = false;
    } else {
      params.status_filter = "cancelled";
      params.include_out_of_budget = true;
      params.show_out_of_budget = true;
      params.show_cancelled = true;
    }
    if (debouncedFilters.scenarioId) params.scenario_id = debouncedFilters.scenarioId;
    if (debouncedFilters.selectedMonthKey) params.month_list = debouncedFilters.selectedMonthKey;
    if (debouncedFilters.budgetItemId) params.budget_item_id = debouncedFilters.budgetItemId;
    if (debouncedFilters.department) params.department = debouncedFilters.department;
    if (debouncedFilters.capexOpex) params.capex_opex = debouncedFilters.capexOpex;
    const { data } = await client.get<DashboardExpense[]>("/expenses", { params });
    return data;
  };

  const handleExportAllDashboardCards = async () => {
    setIsExportingAllCards(true);
    try {
      const [exportRealizedExpenses, exportOutOfBudgetExpenses, exportCancelledExpenses] =
        await Promise.all([
          fetchDashboardExpenseRowsForExport("realized"),
          fetchDashboardExpenseRowsForExport("out_of_budget"),
          fetchDashboardExpenseRowsForExport("cancelled")
        ]);
      const remainingItems = overBudget?.remaining_items ?? [];
      const workbook = XLSX.utils.book_new();
      const filterSummary = [
        `Yıl: ${debouncedFilters.year}`,
        `Dönem: ${selectedPeriodLabel}`,
        `Aylar: ${selectedMonthsLabel}`,
        `Departman: ${debouncedFilters.department || "Tümü"}`,
        `Bütçe Kalemi: ${selectedBudgetFilterLabel || "Tümü"}`,
        `Capex/Opex: ${debouncedFilters.capexOpex || "Tümü"}`
      ].join(" | ");

      appendRowsToWorkbook(workbook, "Rapor Özeti", [
        { Alan: "Rapor adı", Değer: "Dashboard Genel Raporu" },
        { Alan: "Rapor tarihi", Değer: new Date().toLocaleString("tr-TR") },
        { Alan: "Seçili yıl", Değer: debouncedFilters.year },
        { Alan: "Seçili dönem", Değer: selectedPeriodLabel },
        { Alan: "Seçili aylar", Değer: selectedMonthsLabel },
        { Alan: "Kullanılan filtreler", Değer: filterSummary },
        { Alan: "Hazırlayan kullanıcı", Değer: user?.username || user?.full_name || "-" }
      ]);

      const cardSummaryRows = [
        {
          "Kart Adı": "Toplam Plan",
          Tutar: normalizedKpi.total_plan,
          Açıklama: "Planlanan bütçe"
        },
        {
          "Kart Adı": "Gerçekleşen",
          Tutar: normalizedKpi.total_actual,
          Açıklama: "Aktif ve bütçe içi harcamalar"
        },
        {
          "Kart Adı": "Bütçe Dışı",
          Tutar: outOfBudgetTotal,
          Açıklama: "Bütçe dışı olarak işaretlenen geçerli harcamalar"
        },
        {
          "Kart Adı": "Kalan Bütçe",
          Tutar: normalizedKpi.total_remaining,
          Açıklama: "Aktif kullanılabilir kalan bütçe"
        },
        {
          "Kart Adı": "Pazarlıklı Tasarruf",
          Tutar: normalizedKpi.total_negotiated_saving ?? 0,
          Açıklama: "Gerçekleşen harcamanın ilgili bütçeden düşük kaldığı kayıtlar"
        },
        {
          "Kart Adı": "Diğer Tasarruf",
          Tutar: normalizedKpi.total_other_saving ?? 0,
          Açıklama: "Kullanılmayacak olarak işaretlenen bütçeler"
        },
        {
          "Kart Adı": "Toplam Tasarruf",
          Tutar: normalizedKpi.total_combined_saving ?? 0,
          Açıklama: "Pazarlıklı Tasarruf + Diğer Tasarruf"
        },
        {
          "Kart Adı": "Aşım",
          Tutar: normalizedKpi.total_overrun,
          Açıklama: "Gerçekleşen harcamanın toplam bütçeyi aştığı kayıtlar"
        },
        {
          "Kart Adı": "Kullanılmayacak Bütçe",
          Tutar: normalizedKpi.total_unused,
          Açıklama: "Plan kayıtlarından gelen kullanılmayacak tutar"
        },
        {
          "Kart Adı": "İptal",
          Tutar: normalizedKpi.total_cancelled,
          Açıklama: "İptal edilmiş harcama kayıtları"
        }
      ];
      const reconciliationRows = [
        {
          Kategori: "Genel",
          "Toplam Plan": normalizedKpi.total_plan,
          "Gerçekleşen Plan İçi": normalizedKpi.realized_plan_inside_amount ?? 0,
          "Kalan Bütçe / Kalan Kullanılabilir": normalizedKpi.remaining_available_amount ?? 0,
          "Pazarlıklı Tasarruf": normalizedKpi.negotiated_saving_amount ?? 0,
          "Diğer Tasarruf": normalizedKpi.other_saving_amount ?? 0,
          "İptal Edilen Bütçe": normalizedKpi.canceled_budget_amount ?? 0,
          "Mutabakat Toplamı": normalizedKpi.reconciliation_total ?? 0,
          "Mutabakat Farkı": normalizedKpi.reconciliation_difference ?? 0,
          "Aşım": normalizedKpi.overrun_amount ?? normalizedKpi.total_overrun,
          "Bütçe Dışı": normalizedKpi.budget_outside_amount ?? 0
        },
        {
          Kategori: "Capex",
          "Toplam Plan": normalizedKpi.capex_total_plan_amount ?? 0,
          "Gerçekleşen Plan İçi": normalizedKpi.capex_realized_plan_inside_amount ?? 0,
          "Kalan Bütçe / Kalan Kullanılabilir": normalizedKpi.capex_remaining_available_amount ?? 0,
          "Pazarlıklı Tasarruf": normalizedKpi.capex_negotiated_saving_amount ?? 0,
          "Diğer Tasarruf": normalizedKpi.capex_other_saving_amount ?? 0,
          "İptal Edilen Bütçe": normalizedKpi.capex_canceled_budget_amount ?? 0,
          "Mutabakat Toplamı": normalizedKpi.capex_reconciliation_total ?? 0,
          "Mutabakat Farkı": normalizedKpi.capex_reconciliation_difference ?? 0,
          "Aşım": normalizedKpi.capex_overrun_amount ?? 0,
          "Bütçe Dışı": normalizedKpi.capex_budget_outside_amount ?? 0
        },
        {
          Kategori: "Opex",
          "Toplam Plan": normalizedKpi.opex_total_plan_amount ?? 0,
          "Gerçekleşen Plan İçi": normalizedKpi.opex_realized_plan_inside_amount ?? 0,
          "Kalan Bütçe / Kalan Kullanılabilir": normalizedKpi.opex_remaining_available_amount ?? 0,
          "Pazarlıklı Tasarruf": normalizedKpi.opex_negotiated_saving_amount ?? 0,
          "Diğer Tasarruf": normalizedKpi.opex_other_saving_amount ?? 0,
          "İptal Edilen Bütçe": normalizedKpi.opex_canceled_budget_amount ?? 0,
          "Mutabakat Toplamı": normalizedKpi.opex_reconciliation_total ?? 0,
          "Mutabakat Farkı": normalizedKpi.opex_reconciliation_difference ?? 0,
          "Aşım": normalizedKpi.opex_overrun_amount ?? 0,
          "Bütçe Dışı": normalizedKpi.opex_budget_outside_amount ?? 0
        },
        {
          Kategori: "Sınıflandırılmamış",
          "Toplam Plan": normalizedKpi.unclassified_total_plan_amount ?? 0,
          "Gerçekleşen Plan İçi": normalizedKpi.unclassified_realized_plan_inside_amount ?? 0,
          "Kalan Bütçe / Kalan Kullanılabilir":
            normalizedKpi.unclassified_remaining_available_amount ?? 0,
          "Pazarlıklı Tasarruf": normalizedKpi.unclassified_negotiated_saving_amount ?? 0,
          "Diğer Tasarruf": normalizedKpi.unclassified_other_saving_amount ?? 0,
          "İptal Edilen Bütçe": normalizedKpi.unclassified_canceled_budget_amount ?? 0,
          "Mutabakat Toplamı": normalizedKpi.unclassified_reconciliation_total ?? 0,
          "Mutabakat Farkı": normalizedKpi.unclassified_reconciliation_difference ?? 0,
          "Aşım": normalizedKpi.unclassified_overrun_amount ?? 0,
          "Bütçe Dışı": normalizedKpi.unclassified_budget_outside_amount ?? 0
        }
      ];

      appendRowsToWorkbook(workbook, "Bütçe Özeti", cardSummaryRows, ["Tutar"]);
      appendRowsToWorkbook(workbook, "Mutabakat Kontrolü", reconciliationRows, [
        "Toplam Plan",
        "Gerçekleşen Plan İçi",
        "Kalan Bütçe / Kalan Kullanılabilir",
        "Pazarlıklı Tasarruf",
        "Diğer Tasarruf",
        "İptal Edilen Bütçe",
        "Mutabakat Toplamı",
        "Mutabakat Farkı",
        "Aşım",
        "Bütçe Dışı"
      ]);
      appendRowsToWorkbook(
        workbook,
        "Toplam Plan Detayı",
        buildPlanExportRows(planDetailItems),
        ["Toplam Bütçe"]
      );
      appendRowsToWorkbook(
        workbook,
        "Gerçekleşen Detayı",
        buildRealizedExpenseExportRows(
          buildExpenseAmountSplits(
            exportRealizedExpenses,
            realizedPlanInsideTotal,
            realizedOverrunTotal
          )
        ),
        ["Harcama Tutarı", "Gerçekleşen Plan İçi", "Aşım"]
      );
      appendRowsToWorkbook(
        workbook,
        "Bütçe Dışı Detayı",
        buildExpenseExportRows(exportOutOfBudgetExpenses),
        ["Tutar"]
      );
      appendRowsToWorkbook(
        workbook,
        "Kalan Bütçe Detayı",
        buildBudgetStatusExportRows(remainingItems, "Kalan Bütçe", "Ay / Aylar"),
        ["Toplam Bütçe", "Gerçekleşen Harcama", "Kalan Bütçe"]
      );
      appendRowsToWorkbook(
        workbook,
        "Pazarlıklı Tasarruf Detayı",
        buildNegotiatedSavingExportRows(negotiatedSavingItems),
        ["Toplam Bütçe", "Gerçekleşen Harcama", "Pazarlıklı Tasarruf"]
      );
      appendRowsToWorkbook(
        workbook,
        "Diğer Tasarruf Detayı",
        buildUnusedBudgetExportRows(unusedBudgetItems),
        ["Toplam Bütçe", "Harcama", "Kullanılmayacak", "Kalan Kullanılabilir"],
        ["Güncelleme Tarihi"]
      );
      appendRowsToWorkbook(
        workbook,
        "Toplam Tasarruf Detayı",
        buildCombinedSavingExportRows(combinedSavingItems),
        ["Toplam Bütçe", "Gerçekleşen Harcama", "Kullanılmayacak Tutar", "Tasarruf"]
      );
      appendRowsToWorkbook(
        workbook,
        "Aşım Detayı",
        buildBudgetStatusExportRows(overBudgetItems, "Aşım"),
        ["Toplam Bütçe", "Gerçekleşen Harcama", "Aşım"]
      );
      appendRowsToWorkbook(
        workbook,
        "Kullanılmayacak Bütçe Detayı",
        buildUnusedBudgetExportRows(unusedBudgetItems),
        ["Toplam Bütçe", "Harcama", "Kullanılmayacak", "Kalan Kullanılabilir"],
        ["Güncelleme Tarihi"]
      );
      appendRowsToWorkbook(
        workbook,
        "İptal Detayı",
        buildExpenseExportRows(exportCancelledExpenses),
        ["Tutar"]
      );

      const monthFilePart =
        (selectedPeriods.length > 0 ? selectedPeriods.join("_") : null) ||
        (selectedMonthList.length > 0
          ? selectedMonthList
              .map((monthValue) => monthLabels[monthValue - 1] ?? `Ay ${monthValue}`)
              .join("_")
          : "Tum_Aylar");
      const fileName = buildExcelFileName(
        "dashboard_genel_rapor",
        debouncedFilters.year,
        monthFilePart
      );
      XLSX.writeFile(workbook, `${fileName}.xlsx`);
    } catch (error) {
      console.error(error);
      setPurchaseStatusFeedback({
        message: "Dashboard genel Excel raporu hazırlanırken hata oluştu.",
        severity: "error"
      });
    } finally {
      setIsExportingAllCards(false);
    }
  };

  if (isLoading || !dashboard) {
    return (
      <Box
        sx={{
          width: "100%",
          maxWidth: "none",
          ml: 0,
          mr: 0,
          px: { xs: 2, md: 3 },
          py: { xs: 2, md: 3 },
          overflowX: "hidden"
        }}
      >
        <Stack spacing={2} sx={{ width: "100%" }}>
          <Skeleton variant="rectangular" height={52} sx={{ borderRadius: 1 }} />
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {Array.from({ length: 4 }).map((_, index) => (
              <Grid item xs={12} sm={6} md={3} key={`dashboard-skeleton-${index}`}>
                <Card>
                  <CardContent>
                    <Skeleton variant="text" width="40%" />
                    <Skeleton variant="rectangular" height={64} sx={{ borderRadius: 1 }} />
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
          <Stack spacing={3}>
            <Card>
              <CardHeader title={<Skeleton variant="text" width="30%" />} />
              <CardContent>
                <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1 }} />
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                  <Skeleton variant="text" width="35%" />
                  <Skeleton variant="rectangular" width={120} height={32} sx={{ borderRadius: 1 }} />
                </Stack>
                <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1 }} />
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                  <Skeleton variant="text" width="35%" />
                </Stack>
                <Skeleton variant="rectangular" height={260} sx={{ borderRadius: 1 }} />
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                  <Skeleton variant="text" width="35%" />
                </Stack>
                <Grid container spacing={2}>
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Grid item xs={12} sm={6} md={3} key={`quarter-skeleton-${index}`}>
                      <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 1 }} />
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          </Stack>
        </Stack>
      </Box>
    );
  }

  return (
    <>
      <Box
        sx={{
          width: "100%",
          maxWidth: "none",
          ml: 0,
          mr: 0,
          px: { xs: 2, md: 3 },
          py: { xs: 2, md: 3 },
          overflowX: "hidden"
        }}
      >
        <Stack spacing={2} sx={{ width: "100%" }}>
          <FiltersBar onReset={handleResetFilters}>
            <TextField
              size="small"
              label="Yıl"
              type="number"
              value={year}
              onChange={(event) => {
                const value = event.target.value;
                setYear(value ? Number(value) : currentYear);
              }}
              sx={{ minWidth: 160, "& .MuiInputBase-root": { height: 40 } }}
            />
            <TextField
              select
              size="small"
              label="Scenario"
              value={scenarioId ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                setScenarioId(value === "" ? null : Number(value));
              }}
              sx={{ minWidth: 240, "& .MuiInputBase-root": { height: 40 } }}
            >
              <MenuItem value="">Tüm Scenario'lar</MenuItem>
              {(scenarios ?? [])
                .filter((scenario) => scenario.year === year)
                .map((scenario) => (
                  <MenuItem key={scenario.id} value={scenario.id}>
                    {scenario.name} ({scenario.year})
                  </MenuItem>
                ))}
            </TextField>
            <Autocomplete
              ref={periodFilterRef}
              multiple
              disableCloseOnSelect
              blurOnSelect={false}
              open={periodFilterOpen}
              onOpen={() => {
                setMonthFilterOpen(false);
                setPeriodFilterOpen(true);
              }}
              onClose={(_, reason) => {
                if (reason === "selectOption" || reason === "removeOption") {
                  return;
                }
                setPeriodFilterOpen(false);
              }}
              size="small"
              options={periodOptions}
              value={
                selectedPeriods.length > 0
                  ? periodOptions.filter(
                      (option) =>
                        option.value && selectedPeriods.includes(option.value as DashboardQuarter)
                    )
                  : [periodOptions[0]]
              }
              onChange={(_, value) => {
                handlePeriodChange(value.map((option) => option.value));
              }}
              getOptionLabel={(option) => option.label}
              isOptionEqualToValue={(option, value) => option.value === value.value}
              ListboxProps={{ id: dashboardPeriodListboxId }}
              sx={{ minWidth: 180, "& .MuiInputBase-root": { minHeight: 40 } }}
              renderOption={(props, option, { selected }) => {
                const checked =
                  option.value === ""
                    ? selectedPeriods.length === 0
                    : selectedPeriods.includes(option.value as DashboardQuarter);
                return (
                  <li {...props}>
                    <Checkbox size="small" checked={checked || selected} sx={{ p: 0.5, mr: 1 }} />
                    {option.label}
                  </li>
                );
              }}
              renderTags={(value) => {
                const quarters = value.filter((option) => option.value);
                return (
                  <Typography variant="body2">
                    {quarters.length > 0 ? quarters.map((option) => option.label).join(", ") : "Tümü"}
                  </Typography>
                );
              }}
              renderInput={(params) => (
                <TextField {...params} label="Dönem" placeholder="Tümü" size="small" />
              )}
            />
            <Autocomplete
              ref={monthFilterRef}
              multiple
              disableCloseOnSelect
              blurOnSelect={false}
              open={monthFilterOpen}
              onOpen={() => {
                setPeriodFilterOpen(false);
                setMonthFilterOpen(true);
              }}
              onClose={(_, reason) => {
                if (reason === "selectOption" || reason === "removeOption") {
                  return;
                }
                setMonthFilterOpen(false);
              }}
              size="small"
              options={monthOptions}
              value={monthOptions.filter((option) => selectedMonthList.includes(option.value))}
              onChange={(_, value) => {
                setSelectedPeriods([]);
                setSelectedMonths(value.map((option) => option.value));
              }}
              getOptionLabel={(option) => option.label}
              isOptionEqualToValue={(option, value) => option.value === value.value}
              ListboxProps={{ id: dashboardMonthListboxId }}
              sx={{ minWidth: 280, "& .MuiInputBase-root": { minHeight: 40 } }}
              renderOption={(props, option, { selected }) => (
                <li {...props}>
                  <Checkbox size="small" checked={selected} sx={{ p: 0.5, mr: 1 }} />
                  {option.label}
                </li>
              )}
              renderTags={(value) => {
                if (value.length === 0) return null;
                const label =
                  value.length > 5
                    ? `${value.length} ay seçildi`
                    : value.map((option) => option.label).join(", ");
                return <Typography variant="body2">{label}</Typography>;
              }}
              renderInput={(params) => (
                <TextField {...params} label="Ay" placeholder="Tüm Aylar" size="small" />
              )}
            />
            <TextField
              size="small"
              select
              label="Departman"
              value={department}
              onChange={(event) => setDepartment(event.target.value || "")}
              sx={{ minWidth: 180, "& .MuiInputBase-root": { height: 40 } }}
            >
              <MenuItem value="">Tümü</MenuItem>
              {departments.map((name) => (
                <MenuItem key={name} value={name}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
            <Autocomplete
              size="small"
              options={budgetItems ?? []}
              value={budgetItems?.find((item) => item.id === budgetItemId) ?? null}
              onChange={(_, value) => setBudgetItemId(value?.id ?? null)}
              getOptionLabel={(option) => formatBudgetItemLabel(option) || "-"}
              filterOptions={budgetFilterOptions}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              sx={{ minWidth: 320, flex: 1, "& .MuiInputBase-root": { height: 40 } }}
              renderOption={(props, option) => {
                const meta = formatBudgetItemMeta(option);
                return (
                  <li {...props} key={option.id}>
                    <Stack spacing={0.2}>
                      <Typography variant="body2" fontWeight={600}>
                        {formatBudgetItemLabel(option) || "-"}
                      </Typography>
                      {meta && (
                        <Typography variant="caption" color="text.secondary">
                          {meta}
                        </Typography>
                      )}
                    </Stack>
                  </li>
                );
              }}
              renderInput={(params) => (
                <TextField {...params} label="Bütçe Kalemi" placeholder="Tümü" size="small" />
              )}
            />
            <TextField
              size="small"
              select
              label="Capex/Opex"
              value={capexOpex}
              onChange={(event) => setCapexOpex(event.target.value as "" | "capex" | "opex")}
              sx={{ minWidth: 170, "& .MuiInputBase-root": { height: 40 } }}
            >
              <MenuItem value="">Tümü</MenuItem>
              <MenuItem value="capex">Capex</MenuItem>
              <MenuItem value="opex">Opex</MenuItem>
            </TextField>
          </FiltersBar>
          <Stack direction="row" justifyContent="flex-end">
            <Button
              variant="contained"
              startIcon={<FileDownloadOutlinedIcon />}
              onClick={() => void handleExportAllDashboardCards()}
              disabled={isExportingAllCards}
              sx={{ textTransform: "none" }}
            >
              {isExportingAllCards ? "Excel hazırlanıyor..." : "Tüm Kartları Excel’e Aktar"}
            </Button>
          </Stack>

          <DashboardSectionBoundary title="Özet kartlar">
            <Grid container spacing={2} sx={{ mb: 3 }}>
              {[
                {
                  title: "Toplam Plan",
                  value: formattedTotalPlan,
                  subtitle: "Planlanan bütçe",
                  icon: (
                    <AccountBalanceWalletOutlinedIcon
                      sx={{ fontSize: 18, color: "common.white" }}
                    />
                  ),
                  iconColor: "primary.main",
                  filterKey: "total_plan" as const
                },
                {
                  title: "Gerçekleşen",
                  value: formattedActual,
                  subtitle: "Harcanan toplam",
                  icon: (
                    <CheckCircleOutlineOutlinedIcon
                      sx={{ fontSize: 18, color: "common.white" }}
                    />
                  ),
                  iconColor: "primary.main",
                  filterKey: "total_actual" as const
                },
                {
                  title: "Bütçe Dışı",
                  value: formattedOutOfBudget,
                  subtitle: `${outOfBudgetExpenses.length} bütçe dışı harcama`,
                  icon: <WarningAmberOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
                  iconColor: "warning.main",
                  filterKey: "out_of_budget" as const
                },
                {
                  title: "Kalan Bütçe",
                  value: formattedRemaining,
                  subtitle: "Aktif kullanılabilir kalan",
                  icon: <TrendingUpOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
                  iconColor: "warning.main",
                  filterKey: "total_remaining" as const
                },
                {
                  title: "Pazarlıklı Tasarruf",
                  value: formattedNegotiatedSaving,
                  subtitle: `${savingsSummary?.negotiated_saving_item_count ?? savingsSummary?.saving_item_count ?? 0} kalemde pazarlıklı tasarruf`,
                  icon: <TrendingUpOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
                  iconColor: "success.main",
                  filterKey: "total_negotiated_saving" as const
                },
                {
                  title: "Diğer Tasarruf",
                  value: formattedOtherSaving,
                  subtitle: `${savingsSummary?.other_saving_item_count ?? savingsSummary?.unused_item_count ?? 0} kullanılmayacak kayıt`,
                  icon: <WarningAmberOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
                  iconColor: "warning.dark",
                  filterKey: "total_other_saving" as const
                },
                {
                  title: "Toplam Tasarruf",
                  value: formattedCombinedSaving,
                  subtitle: "Pazarlıklı + Diğer Tasarruf",
                  icon: <TrendingUpOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
                  iconColor: "success.dark",
                  filterKey: "total_combined_saving" as const
                },
                {
                  title: "Aşım",
                  value: formattedOver,
                  subtitle: overBudgetSubtitle,
                  icon: <WarningAmberOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
                  iconColor: "error.main",
                  filterKey: "total_overrun" as const
                },
                {
                  title: "İptal",
                  value: formattedCancelled,
                  subtitle: `${cancelledExpenses.length} iptal kaydı`,
                  icon: <WarningAmberOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
                  iconColor: "error.dark",
                  filterKey: "total_cancelled" as const
                }
              ].map((card) => (
                <Grid item xs={12} sm={6} md={4} key={card.title}>
                  <SummaryCard
                    {...card}
                    isLoading={isLoading}
                    selected={selectedKpiFilter === card.filterKey}
                    onClick={() => handleSummaryCardClick(card.filterKey)}
                  />
                </Grid>
              ))}
              <Grid item xs={12} sm={6} md={4}>
                <SummaryCard
                  title="Satın Alma Bekleyen"
                  value={`${purchaseAlert?.pending ?? 0}`}
                  subtitle="Bu ay bekleyen kayıt"
                  icon={<PendingActionsOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />}
                  iconColor="info.main"
                  onClick={() =>
                    navigate(
                      `/pending-budget-actions?filter=purchase-pending&year=${purchaseAlert?.year ?? new Date().getFullYear()}&month=${
                        purchaseAlert?.month ?? new Date().getMonth() + 1
                      }`
                    )
                  }
                />
              </Grid>
            </Grid>
          </DashboardSectionBoundary>
          <Stack spacing={3}>
            <DashboardSectionBoundary title="Riskteki Kalemler">
              <Card sx={{ order: 5 }}>
                <CardHeader title="Riskteki Kalemler" subheader="Planın %80 ve üzeri harcananlar" />
                <CardContent>
                  {riskyItems.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      Bu ay için kritik seviyede kalem bulunmuyor.
                    </Typography>
                  ) : (
                    <List dense>
                      {riskyItems?.map((item) => {
                        const plan = toSafeNumber(item.plan);
                        const actual = toSafeNumber(item.actual);
                        const ratioPct = Math.round(toSafeNumber(item.ratio) * 100);
                        return (
                          <ListItem key={item.budget_item_id}>
                            <ListItemText
                              primary={formatBudgetLabel(item.budget_name, item.budget_code)}
                              secondary={`Plan: ${plan.toLocaleString()} | Gerçekleşen: ${actual.toLocaleString()} | %${ratioPct}`}
                              primaryTypographyProps={{ variant: "body2" }}
                            />
                          </ListItem>
                        );
                      })}
                    </List>
                  )}
                </CardContent>
              </Card>
            </DashboardSectionBoundary>

            {showOverBudgetSection ? (
              <DashboardSectionBoundary title="Aşım Yapan Kalemler">
                <Box ref={overBudgetRef} sx={{ order: 4 }}>
                  <Card
                    sx={{
                      border: highlightOverBudget ? "1px solid" : "1px solid transparent",
                      borderColor: highlightOverBudget ? "error.main" : "transparent",
                      boxShadow: highlightOverBudget ? "0 0 0 3px rgba(244, 67, 54, 0.2)" : "none",
                      transition: "border-color 0.2s ease, box-shadow 0.2s ease"
                    }}
                  >
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                        <Typography variant="h6" fontWeight={600}>
                          Aşım Yapan Kalemler (Top 10)
                        </Typography>
                        {overBudgetItems.length > 10 && (
                            <Button
                              variant="text"
                              size="small"
                              onClick={() => setBudgetStatusDialogCategory("overrun")}
                            >
                            Tümünü Gör
                          </Button>
                        )}
                      </Stack>
                      {overBudgetTopItems.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          Aşım yapan kalem bulunmuyor.
                        </Typography>
                      ) : (
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Kalem</TableCell>
                              <TableCell align="right">Toplam Bütçe</TableCell>
                              <TableCell align="right">Gerçekleşen</TableCell>
                              <TableCell align="right">Aşım</TableCell>
                              <TableCell align="right">%</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {overBudgetTopItems?.map((item) => {
                              const plan = toSafeNumber(item.plan);
                              const actual = toSafeNumber(item.actual);
                              const over = toSafeNumber(item.over);
                              const overPct = toSafeNumber(item.over_pct);
                              return (
                                <TableRow
                                  key={item.budget_code}
                                  hover
                                  sx={{ cursor: "pointer" }}
                                  onClick={() => handleOverBudgetRowClick(item)}
                                >
                                  <TableCell>
                                    {formatBudgetLabel(item.budget_name, item.budget_code)}
                                  </TableCell>
                                  <TableCell align="right">{formatCurrency(plan)}</TableCell>
                                  <TableCell align="right">{formatCurrency(actual)}</TableCell>
                                  <TableCell align="right">{formatCurrency(over)}</TableCell>
                                  <TableCell align="right">{overPct.toFixed(1)}%</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </Box>
              </DashboardSectionBoundary>
            ) : null}

            <DashboardSectionBoundary title="Aylık Trend">
              <Card ref={trendSectionRef} sx={{ order: 2 }}>
                <CardContent sx={{ minHeight: 280 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                    <Typography variant="h6" fontWeight={600}>
                      Aylık Trend Analizi
                    </Typography>
                    <Chip
                      label={
                        hasSelectedOverrun
                          ? `Aşım: ${formatBudgetLabel(
                              selectedOverrunItem.budget_name,
                              selectedOverrunItem.budget_code
                            )}`
                          : "Tüm Kalemler"
                      }
                      color={hasSelectedOverrun ? "error" : "primary"}
                      variant="filled"
                      onClick={
                        hasSelectedOverrun ? () => setSelectedOverrunItem(null) : undefined
                      }
                      sx={{
                        cursor: hasSelectedOverrun ? "pointer" : "default"
                      }}
                    />
                  </Stack>
                  {isTrendLoading ? (
                    <Skeleton variant="rectangular" height="100%" />
                  ) : isTrendError ? (
                    <Alert
                      severity="error"
                      action={
                        <Button color="inherit" size="small" onClick={() => refetchTrend()}>
                          Tekrar Dene
                        </Button>
                      }
                    >
                      Aylık Trend yüklenirken hata oluştu.
                    </Alert>
                  ) : !monthlyData?.length ? (
                    <Box sx={{ py: 4, textAlign: "center" }}>
                      <Typography variant="body2" color="text.secondary">
                        Trend verisi yok.
                      </Typography>
                    </Box>
                  ) : !hasTrendData ? (
                    <Alert severity="info">Trend verisi yok.</Alert>
                  ) : (
                    <Box>
                      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                          Aylık Plan / Gerçekleşen / Kalan / Aşım Karşılaştırması
                      </Typography>
                      <SafeChartContainer minHeight={320}>
                        <ResponsiveContainer width="100%" height={320}>
                          <BarChart
                              data={monthlyData}
                              margin={{ top: 8, right: 20, left: 8, bottom: 8 }}
                              barCategoryGap="20%"
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="monthLabel" />
                              <YAxis tickFormatter={formatCompactCurrency} width={80} />
                              <RechartsTooltip
                                content={({ active, payload, label }) => {
                                  if (!active || !payload?.length) return null;
                                  const rows = [
                                    { key: "planned", label: "Planlanan", color: COLOR_PLANNED },
                                    { key: "actual", label: "Gerçekleşen", color: COLOR_ACTUAL },
                                    { key: "remaining", label: "Kalan", color: COLOR_REMAINING },
                                    { key: "overrun", label: "Aşım", color: COLOR_OVER }
                                  ]
                                    .map((item) => {
                                      const entry = payload.find((payloadItem) => payloadItem.dataKey === item.key);
                                      return entry
                                        ? { ...item, value: toSafeNumber(entry.value as number) }
                                        : null;
                                    })
                                    .filter(Boolean) as Array<{ label: string; color: string; value: number }>;
                                  return (
                                    <Box
                                      sx={{
                                        bgcolor: "background.paper",
                                        border: "1px solid",
                                        borderColor: "divider",
                                        borderRadius: 1,
                                        boxShadow: 2,
                                        p: 1.25,
                                        minWidth: 180
                                      }}
                                    >
                                      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.75 }}>
                                        {label}
                                      </Typography>
                                      <Stack spacing={0.5}>
                                        {rows.map((row) => (
                                          <Stack
                                            key={row.label}
                                            direction="row"
                                            justifyContent="space-between"
                                            spacing={2}
                                          >
                                            <Stack direction="row" spacing={0.75} alignItems="center">
                                              <Box
                                                sx={{
                                                  width: 8,
                                                  height: 8,
                                                  borderRadius: "50%",
                                                  bgcolor: row.color
                                                }}
                                              />
                                              <Typography variant="caption">{row.label}</Typography>
                                            </Stack>
                                            <Typography variant="caption" fontWeight={600}>
                                              {formatCurrency(row.value)}
                                            </Typography>
                                          </Stack>
                                        ))}
                                      </Stack>
                                    </Box>
                                  );
                                }}
                              />
                              <Legend />
                              {showPlanned ? (
                                <Bar dataKey="planned" name="Planlanan" fill={COLOR_PLANNED} />
                              ) : null}
                              {showActual ? (
                                <Bar dataKey="actual" name="Gerçekleşen" fill={COLOR_ACTUAL} />
                              ) : null}
                              {showRemaining ? (
                                <Bar dataKey="remaining" name="Kalan" fill={COLOR_REMAINING} />
                              ) : null}
                              {showOverrun ? (
                                <Bar dataKey="overrun" name="Aşım" fill={COLOR_OVER} />
                              ) : null}
                            </BarChart>
                        </ResponsiveContainer>
                      </SafeChartContainer>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </DashboardSectionBoundary>

            <DashboardSectionBoundary title="Dönem Grafiği">
              <Card sx={{ order: 3 }}>
                <CardContent>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
                    <Typography variant="h6" fontWeight={700}>
                      Dönem Grafiği
                    </Typography>
                  </Stack>

                  <Stack direction="row" spacing={3} alignItems="center" mb={2}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          bgcolor: pieColors.actual
                        }}
                      />
                      <Typography variant="caption">Gerçekleşen</Typography>
                    </Stack>

                    <Stack direction="row" spacing={1} alignItems="center">
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          bgcolor: pieColors.overrun
                        }}
                      />
                      <Typography variant="caption">Aşım</Typography>
                    </Stack>

                    <Stack direction="row" spacing={1} alignItems="center">
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          bgcolor: pieColors.remaining
                        }}
                      />
                      <Typography variant="caption">Kalan</Typography>
                    </Stack>
                  </Stack>

                  {!hasQuarterlyData ? (
                    <Typography variant="body2" color="text.secondary">
                      Dönem grafiği için yeterli veri bulunamadı.
                    </Typography>
                  ) : (
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: {
                          xs: "repeat(1, minmax(0, 1fr))",
                          sm: "repeat(2, minmax(0, 1fr))",
                          lg: "repeat(4, minmax(0, 1fr))"
                        },
                        gap: 2,
                        alignItems: "start",
                        justifyItems: "center"
                      }}
                    >
                      {quarterlyTotals?.map((quarter) => (
                        <Box
                          key={quarter.label}
                          sx={{
                            width: "100%",
                            minWidth: 0,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center"
                          }}
                        >
                          <Typography
                            variant="subtitle2"
                            fontWeight={600}
                            mb={1}
                            sx={{ textAlign: "center", width: "100%" }}
                          >
                            {quarter.label}
                          </Typography>
                          {!quarter.pieData?.length ? (
                            <Typography variant="body2" color="text.secondary">
                              Veri bulunamadı.
                            </Typography>
                          ) : quarter.totalValue <= 0 ? (
                            <Typography variant="body2" color="text.secondary">
                              Veri yok
                            </Typography>
                          ) : (
                            <Box sx={{ height: 220, width: "100%" }}>
                              <SafeChartContainer minHeight={220}>
                                <ResponsiveContainer width="100%" height={220}>
                                  <PieChart>
                                    <RechartsTooltip
                                      content={({ active }) => {
                                        if (!active) return null;
                                        const rows = [
                                          { label: "Planlanan", value: quarter.totals.planned, color: pieColors.planned },
                                          { label: "Gerçekleşen", value: quarter.totals.actual, color: pieColors.actual },
                                          { label: "Kalan", value: quarter.totals.remaining, color: pieColors.remaining },
                                          {
                                            label: "Pazarlıklı Tasarruf",
                                            value: quarter.totals.negotiatedSaving,
                                            color: pieColors.negotiatedSaving
                                          },
                                          {
                                            label: "Diğer Tasarruf",
                                            value: quarter.totals.otherSaving,
                                            color: pieColors.otherSaving
                                          },
                                          { label: "İptal", value: quarter.totals.cancelled, color: pieColors.cancelled }
                                        ];
                                        return (
                                          <Box
                                            sx={{
                                              bgcolor: "background.paper",
                                              border: "1px solid",
                                              borderColor: "divider",
                                              borderRadius: 1,
                                              boxShadow: 2,
                                              p: 1.25,
                                              minWidth: 220
                                            }}
                                          >
                                            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.75 }}>
                                              Dönem: {quarter.label}
                                            </Typography>
                                            <Stack spacing={0.5}>
                                              {rows.map((row) => (
                                                <Stack
                                                  key={row.label}
                                                  direction="row"
                                                  justifyContent="space-between"
                                                  spacing={2}
                                                >
                                                  <Stack direction="row" spacing={0.75} alignItems="center">
                                                    <Box
                                                      sx={{
                                                        width: 8,
                                                        height: 8,
                                                        borderRadius: "50%",
                                                        bgcolor: row.color
                                                      }}
                                                    />
                                                    <Typography variant="caption">{row.label}</Typography>
                                                  </Stack>
                                                  <Typography variant="caption" fontWeight={600}>
                                                    {formatCurrency(row.value)}
                                                  </Typography>
                                                </Stack>
                                              ))}
                                            </Stack>
                                          </Box>
                                        );
                                      }}
                                    />
                                    <Pie
                                      data={quarter.pieData}
                                      dataKey="value"
                                      nameKey="name"
                                      innerRadius={46}
                                      outerRadius={72}
                                      paddingAngle={2}
                                    >
                                      {quarter.pieData?.map((entry) => (
                                        <Cell key={`${quarter.label}-${entry.name}`} fill={entry.color} />
                                      ))}
                                    </Pie>
                                  </PieChart>
                                </ResponsiveContainer>
                              </SafeChartContainer>
                            </Box>
                          )}
                        </Box>
                      ))}
                    </Box>
                  )}
                </CardContent>
              </Card>
            </DashboardSectionBoundary>
          </Stack>
        </Stack>
      </Box>
      <Dialog
        open={isPlanDetailDialogOpen}
        onClose={() => setIsPlanDetailDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Toplam Bütçe Detayı</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <DetailSummaryGrid
              items={[
                { label: "Toplam Bütçe", value: formatCurrency(planDetailTotal), color: "primary.main" },
                { label: "Kayıt Sayısı", value: String(planDetailItems.length) },
                { label: "Seçili Dönem", value: selectedPeriodLabel },
                { label: "Seçili Aylar", value: selectedMonthsLabel }
              ]}
            />
            <DetailTableWrap>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Ay / Dönem</TableCell>
                    <TableCell align="right">Toplam Bütçe</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {planDetailItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2}>
                        <Typography variant="body2" color="text.secondary">
                          Plan kaydı bulunamadı.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    planDetailItems.map((item) => (
                      <TableRow
                        key={`plan-${item.month}`}
                        hover
                        sx={{ cursor: "pointer" }}
                        onClick={() => openDashboardPlanDetail(item)}
                      >
                        <TableCell>{item.monthLabel}</TableCell>
                        <TableCell align="right">{formatCurrency(toSafeNumber(item.planned))}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </DetailTableWrap>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            onClick={handleExportPlanDetail}
            disabled={planDetailItems.length === 0}
          >
            Excel'e Aktar
          </Button>
          <Button onClick={() => setIsPlanDetailDialogOpen(false)}>Kapat</Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={isRealizedDialogOpen}
        onClose={() => setIsRealizedDialogOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: theme.palette.background.paper,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 2
          }
        }}
      >
        <DialogTitle>Gerçekleşen Harcamalar</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <DetailSummaryGrid
              items={[
                { label: "Toplam Bütçe", value: formatCurrency(realizedExpensesPlanTotal) },
                {
                  label: "Gerçekleşen Plan İçi",
                  value: formatCurrency(realizedPlanInsideDetailTotal),
                  color: "primary.main"
                },
                { label: "Aşım", value: formatCurrency(realizedOverrunDetailTotal), color: "error.main" },
                { label: "Toplam Harcama", value: formatCurrency(realizedSpendDetailTotal) },
                { label: "Kayıt Sayısı", value: String(realizedExpenses.length) },
                { label: "Bütçe Dışı", value: "Hariç" }
              ]}
            />
            <DetailTableWrap>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Tarih</TableCell>
                    <TableCell>Bütçe Kalemi</TableCell>
                    <TableCell>Ay / Dönem</TableCell>
                    <TableCell>Departman</TableCell>
                    <TableCell>Capex/Opex</TableCell>
                    <TableCell>Nitelik</TableCell>
                    <TableCell align="right">Harcama Tutarı</TableCell>
                    <TableCell align="right">Gerçekleşen Plan İçi</TableCell>
                    <TableCell align="right">Aşım</TableCell>
                    <TableCell>Satıcı</TableCell>
                    <TableCell>Kaydı Giren</TableCell>
                    <TableCell>Durum</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {isRealizedExpensesFetching ? (
                    <TableRow>
                      <TableCell colSpan={12}>
                        <Typography variant="body2" color="text.secondary">
                          Harcamalar yükleniyor...
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : realizedExpenses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12}>
                        <Typography variant="body2" color="text.secondary">
                          Kayıt bulunamadı.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    realizedExpenseRows.map(({ expense, amount, planInside, overrun }) => {
                      const rawDate = expense.expense_date ?? expense.date ?? "";
                      const displayDate = rawDate ? new Date(rawDate).toLocaleDateString("tr-TR") : "-";
                      const budgetLabel =
                        formatBudgetItemLabel({
                          code: expense.budget_code ?? "",
                          name: expense.budget_name ?? ""
                        }) || "-";
                      const capexOpex = expense.capex_opex ?? expense.map_capex_opex ?? "-";
                      const nitelik = expense.asset_type ?? expense.map_nitelik ?? expense.nitelik ?? "-";
                      return (
                        <TableRow
                          key={expense.id ?? `${rawDate}-${expense.budget_code}-${expense.amount}`}
                          hover
                          sx={{ cursor: "pointer" }}
                          onClick={() => openDashboardExpenseDetail(expense, "Gerçekleşen Harcama Detayı")}
                        >
                          <TableCell>{displayDate}</TableCell>
                          <TableCell>{budgetLabel}</TableCell>
                          <TableCell>{formatExpensePeriod(expense)}</TableCell>
                          <TableCell>{expense.department || "-"}</TableCell>
                          <TableCell>{capexOpex}</TableCell>
                          <TableCell>{nitelik}</TableCell>
                          <TableCell align="right">{formatCurrency(toSafeNumber(amount))}</TableCell>
                          <TableCell align="right">{formatCurrency(toSafeNumber(planInside))}</TableCell>
                          <TableCell align="right">{formatCurrency(toSafeNumber(overrun))}</TableCell>
                          <TableCell>{expense.vendor || "-"}</TableCell>
                          <TableCell>{formatExpenseOwner(expense)}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              color={expense.status === "cancelled" ? "error" : "success"}
                              label={expense.status === "cancelled" ? "İptal" : "Kaydedildi"}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </DetailTableWrap>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            onClick={handleExportRealizedExpenses}
            disabled={realizedExpenses.length === 0}
          >
            Excel'e Aktar
          </Button>
          <Button onClick={() => setIsRealizedDialogOpen(false)}>Kapat</Button>
          <Button variant="contained" onClick={handleOpenRealizedExpensesPage}>
            Harcama ekranında aç
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={isOutOfBudgetDialogOpen}
        onClose={() => setIsOutOfBudgetDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>Bütçe Dışı Harcamalar</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <DetailSummaryGrid
              items={[
                {
                  label: "Toplam Bütçe Dışı Harcama",
                  value: formatCurrency(outOfBudgetTotal),
                  color: "warning.main"
                },
                { label: "Kayıt Sayısı", value: String(outOfBudgetExpenses.length) },
                { label: "Seçili Ay/Dönem", value: selectedMonthsLabel },
                { label: "Departman", value: debouncedFilters.department || "Tümü" }
              ]}
            />
            <DetailTableWrap>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Tarih</TableCell>
                    <TableCell>Bütçe Kalemi / Açıklama</TableCell>
                    <TableCell>Departman</TableCell>
                    <TableCell>Capex/Opex</TableCell>
                    <TableCell>Nitelik</TableCell>
                    <TableCell align="right">Tutar</TableCell>
                    <TableCell>Satıcı</TableCell>
                    <TableCell>Kaydı Giren</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {outOfBudgetExpenses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8}>
                        <Typography variant="body2" color="text.secondary">
                          Kayıt bulunamadı.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    outOfBudgetExpenses.map((expense) => {
                      const rawDate = expense.expense_date ?? expense.date ?? "";
                      const displayDate = rawDate ? new Date(rawDate).toLocaleDateString("tr-TR") : "-";
                      const budgetLabel =
                        formatBudgetLabel(
                          expense.budget_name ?? expense.budget_outside_title,
                          expense.budget_code
                        ) ||
                        expense.description ||
                        "-";
                      const nitelik =
                        expense.asset_type ??
                        expense.map_nitelik ??
                        expense.nitelik ??
                        expense.budget_outside_asset_type ??
                        "-";
                      return (
                        <TableRow
                          key={expense.id ?? `${rawDate}-${expense.budget_code}-${expense.amount}`}
                          hover
                          sx={{ cursor: "pointer" }}
                          onClick={() => openDashboardExpenseDetail(expense, "Bütçe Dışı Harcama Detayı")}
                        >
                          <TableCell>{displayDate}</TableCell>
                          <TableCell>{budgetLabel}</TableCell>
                          <TableCell>{expense.department ?? expense.budget_outside_department ?? "-"}</TableCell>
                          <TableCell>
                            {expense.capex_opex ?? expense.map_capex_opex ?? expense.budget_outside_capex_opex ?? "-"}
                          </TableCell>
                          <TableCell>{nitelik}</TableCell>
                          <TableCell align="right">{formatCurrency(toSafeNumber(expense.amount))}</TableCell>
                          <TableCell>{expense.vendor || "-"}</TableCell>
                          <TableCell>{formatExpenseOwner(expense)}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </DetailTableWrap>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            onClick={handleExportOutOfBudgetExpenses}
            disabled={outOfBudgetExpenses.length === 0}
          >
            Excel'e Aktar
          </Button>
          <Button onClick={() => setIsOutOfBudgetDialogOpen(false)}>Kapat</Button>
          <Button variant="contained" onClick={handleOpenOutOfBudgetExpensesPage}>
            Harcama ekranında aç
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={isCancelledDialogOpen}
        onClose={() => setIsCancelledDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>İptal Edilenler</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <DetailSummaryGrid
              items={[
                {
                  label: "Toplam İptal",
                  value: formatCurrency(cancelledTotal),
                  color: "error.main"
                },
                { label: "Kayıt Sayısı", value: String(cancelledExpenses.length) },
                { label: "Seçili Ay/Dönem", value: selectedMonthsLabel },
                { label: "Departman", value: debouncedFilters.department || "Tümü" }
              ]}
            />
            <DetailTableWrap>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Tarih</TableCell>
                    <TableCell>Bütçe Kalemi / Açıklama</TableCell>
                    <TableCell>Ay / Dönem</TableCell>
                    <TableCell>Departman</TableCell>
                    <TableCell>Capex/Opex</TableCell>
                    <TableCell>Nitelik</TableCell>
                    <TableCell align="right">Tutar</TableCell>
                    <TableCell>Satıcı</TableCell>
                    <TableCell>Kaydı Giren</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {cancelledExpenses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9}>
                        <Typography variant="body2" color="text.secondary">
                          İptal kaydı bulunamadı.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    cancelledExpenses.map((expense) => {
                      const rawDate = expense.expense_date ?? expense.date ?? "";
                      const displayDate = rawDate ? new Date(rawDate).toLocaleDateString("tr-TR") : "-";
                      const budgetLabel =
                        formatBudgetItemLabel({
                          code: expense.budget_code ?? "",
                          name: expense.budget_name ?? ""
                        }) || expense.description || "-";
                      const nitelik = expense.asset_type ?? expense.map_nitelik ?? expense.nitelik ?? "-";
                      return (
                        <TableRow
                          key={expense.id ?? `${rawDate}-${expense.budget_code}-${expense.amount}`}
                          hover
                          sx={{ cursor: "pointer" }}
                          onClick={() => openDashboardExpenseDetail(expense, "İptal Detayı")}
                        >
                          <TableCell>{displayDate}</TableCell>
                          <TableCell>{budgetLabel}</TableCell>
                          <TableCell>{formatExpensePeriod(expense)}</TableCell>
                          <TableCell>{expense.department || "-"}</TableCell>
                          <TableCell>{expense.capex_opex ?? expense.map_capex_opex ?? "-"}</TableCell>
                          <TableCell>{nitelik}</TableCell>
                          <TableCell align="right">{formatCurrency(toSafeNumber(expense.amount))}</TableCell>
                          <TableCell>{expense.vendor || "-"}</TableCell>
                          <TableCell>{formatExpenseOwner(expense)}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </DetailTableWrap>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            onClick={handleExportCancelledExpenses}
            disabled={cancelledExpenses.length === 0}
          >
            Excel'e Aktar
          </Button>
          <Button onClick={() => setIsCancelledDialogOpen(false)}>Kapat</Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={isUnusedBudgetDialogOpen}
        onClose={() => setIsUnusedBudgetDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>Diğer Tasarruf Detayı</DialogTitle>
        <DialogContent dividers>
          <DetailSummaryGrid
            items={[
              { label: "Toplam Bütçe", value: formatCurrency(unusedBudgetTotals.plan) },
              {
                label: "Toplam Diğer Tasarruf",
                value: formatCurrency(normalizedKpi.total_other_saving ?? unusedBudgetTotals.unused),
                color: "warning.main"
              },
              {
                label: "Bilgi: Kalan Kullanılabilir",
                value: formatCurrency(unusedBudgetTotals.available)
              },
              { label: "Kalem Sayısı", value: String(unusedBudgetItems.length) }
            ]}
          />
          {unusedBudgetItems.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Diğer tasarruf olarak izlenen kullanılmayacak bütçe bulunamadı.
            </Typography>
          ) : (
            <DetailTableWrap>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Bütçe Kalemi</TableCell>
                    <TableCell>Ay / Dönem</TableCell>
                    <TableCell>Departman</TableCell>
                    <TableCell>Capex/Opex</TableCell>
                    <TableCell>Nitelik</TableCell>
                    <TableCell align="right">Toplam Bütçe</TableCell>
                    <TableCell align="right">Harcama</TableCell>
                    <TableCell align="right">Kullanılmayacak Tutar</TableCell>
                    <TableCell align="right">Kalan Kullanılabilir</TableCell>
                    <TableCell>Sebep</TableCell>
                    <TableCell>Açıklama</TableCell>
                    <TableCell>Güncelleme Tarihi</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {unusedBudgetItems.map((item, index) => (
                    <TableRow
                      key={`${item.budget_item_id}-${item.budget_code}-${index}`}
                      hover
                      sx={{ cursor: "pointer" }}
                      onClick={() =>
                        openDashboardSavingDetail(
                          item,
                          "Diğer Tasarruf",
                          toSafeNumber(item.unused_amount ?? item.over),
                          toSafeNumber(item.unused_amount ?? item.over)
                        )
                      }
                    >
                      <TableCell>
                        {formatBudgetItemLabel({ code: item.budget_code, name: item.budget_name })}
                      </TableCell>
                      <TableCell>{formatBudgetPeriod(item)}</TableCell>
                      <TableCell>{item.department || "-"}</TableCell>
                      <TableCell>{item.capex_opex || "-"}</TableCell>
                      <TableCell>{item.asset_type || "-"}</TableCell>
                      <TableCell align="right">{formatCurrency(toSafeNumber(item.plan))}</TableCell>
                      <TableCell align="right">{formatCurrency(toSafeNumber(item.actual))}</TableCell>
                      <TableCell align="right">
                        {formatCurrency(toSafeNumber(item.unused_amount ?? item.over))}
                      </TableCell>
                      <TableCell align="right">{formatCurrency(toSafeNumber(item.available_amount))}</TableCell>
                      <TableCell>{formatUnusedReason(item.reason)}</TableCell>
                      <TableCell>{item.note || "-"}</TableCell>
                      <TableCell>
                        {item.unused_updated_at
                          ? new Date(item.unused_updated_at).toLocaleString("tr-TR")
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DetailTableWrap>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            onClick={handleExportUnusedBudget}
            disabled={unusedBudgetItems.length === 0}
          >
            Excel'e Aktar
          </Button>
          <Button onClick={() => setIsUnusedBudgetDialogOpen(false)}>Kapat</Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={savingDetailDialog === "negotiated"}
        onClose={() => setSavingDetailDialog(null)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>Pazarlıklı Tasarruf Detayı</DialogTitle>
        <DialogContent dividers>
          <DetailSummaryGrid
            items={[
              { label: "Toplam Bütçe", value: formatCurrency(negotiatedSavingTotals.plan) },
              {
                label: "Toplam Gerçekleşen Harcama",
                value: formatCurrency(negotiatedSavingTotals.actual)
              },
              {
                label: "Toplam Pazarlıklı Tasarruf",
                value: formatCurrency(negotiatedSavingTotals.saving),
                color: "success.main"
              },
              { label: "Kalem Sayısı", value: String(negotiatedSavingItems.length) }
            ]}
          />
          {negotiatedSavingItems.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Pazarlıklı tasarruf kaydı bulunamadı.
            </Typography>
          ) : (
            <DetailTableWrap>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Bütçe Kalemi</TableCell>
                    <TableCell>Ay / Dönem</TableCell>
                    <TableCell>Departman</TableCell>
                    <TableCell>Capex/Opex</TableCell>
                    <TableCell>Nitelik</TableCell>
                    <TableCell align="right">Toplam Bütçe</TableCell>
                    <TableCell align="right">Gerçekleşen Harcama</TableCell>
                    <TableCell align="right">Pazarlıklı Tasarruf</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {negotiatedSavingItems.map((item, index) => (
                    <TableRow
                      key={`${item.budget_item_id}-${item.budget_code}-${index}`}
                      hover
                      sx={{ cursor: "pointer" }}
                      onClick={() =>
                        openDashboardSavingDetail(
                          item,
                          "Pazarlıklı Tasarruf",
                          toSafeNumber(item.over)
                        )
                      }
                    >
                      <TableCell>
                        {formatBudgetItemLabel({ code: item.budget_code, name: item.budget_name })}
                      </TableCell>
                      <TableCell>{formatBudgetPeriod(item)}</TableCell>
                      <TableCell>{item.department || "-"}</TableCell>
                      <TableCell>{item.capex_opex || "-"}</TableCell>
                      <TableCell>{item.asset_type || "-"}</TableCell>
                      <TableCell align="right">{formatCurrency(toSafeNumber(item.plan))}</TableCell>
                      <TableCell align="right">{formatCurrency(toSafeNumber(item.actual))}</TableCell>
                      <TableCell align="right">{formatCurrency(toSafeNumber(item.over))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DetailTableWrap>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            onClick={handleExportNegotiatedSaving}
            disabled={negotiatedSavingItems.length === 0}
          >
            Excel'e Aktar
          </Button>
          <Button onClick={() => setSavingDetailDialog(null)}>Kapat</Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={savingDetailDialog === "total"}
        onClose={() => setSavingDetailDialog(null)}
        maxWidth="xl"
        fullWidth
      >
        <DialogTitle>Toplam Tasarruf Detayı</DialogTitle>
        <DialogContent dividers>
          <DetailSummaryGrid
            items={[
              {
                label: "Pazarlıklı Tasarruf",
                value: formatCurrency(negotiatedSavingTotals.saving),
                color: "success.main"
              },
              {
                label: "Diğer Tasarruf",
                value: formatCurrency(unusedBudgetTotals.unused),
                color: "warning.main"
              },
              {
                label: "Toplam Tasarruf",
                value: formatCurrency(negotiatedSavingTotals.saving + unusedBudgetTotals.unused),
                color: "success.dark"
              },
              { label: "Kalem Sayısı", value: String(combinedSavingItems.length) }
            ]}
          />
          {combinedSavingItems.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Tasarruf kaydı bulunamadı.
            </Typography>
          ) : (
            <DetailTableWrap>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Tür</TableCell>
                    <TableCell>Bütçe Kalemi</TableCell>
                    <TableCell>Ay / Dönem</TableCell>
                    <TableCell>Departman</TableCell>
                    <TableCell>Capex/Opex</TableCell>
                    <TableCell>Nitelik</TableCell>
                    <TableCell align="right">Toplam Bütçe</TableCell>
                    <TableCell align="right">Gerçekleşen</TableCell>
                    <TableCell align="right">Tasarruf Tutarı</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {combinedSavingItems.map(({ type, item, amount, unusedAmount }, index) => (
                    <TableRow
                      key={`${type}-${item.budget_item_id}-${item.budget_code}-${index}`}
                      hover
                      sx={{ cursor: "pointer" }}
                      onClick={() => openDashboardSavingDetail(item, type, amount, unusedAmount)}
                    >
                      <TableCell>{type}</TableCell>
                      <TableCell>
                        {formatBudgetItemLabel({ code: item.budget_code, name: item.budget_name })}
                      </TableCell>
                      <TableCell>{formatBudgetPeriod(item)}</TableCell>
                      <TableCell>{item.department || "-"}</TableCell>
                      <TableCell>{item.capex_opex || "-"}</TableCell>
                      <TableCell>{item.asset_type || "-"}</TableCell>
                      <TableCell align="right">{formatCurrency(toSafeNumber(item.plan))}</TableCell>
                      <TableCell align="right">
                        {type === "Pazarlıklı Tasarruf"
                          ? formatCurrency(toSafeNumber(item.actual))
                          : unusedAmount > 0
                            ? formatCurrency(unusedAmount)
                            : "-"}
                      </TableCell>
                      <TableCell align="right">{formatCurrency(amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DetailTableWrap>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            onClick={handleExportCombinedSaving}
            disabled={combinedSavingItems.length === 0}
          >
            Excel'e Aktar
          </Button>
          <Button onClick={() => setSavingDetailDialog(null)}>Kapat</Button>
        </DialogActions>
      </Dialog>
      {purchaseAlert && purchaseAlert.total > 0 && purchaseAlert.pending === 0 && (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="body2" color="success.main" fontWeight={700}>
              Bu ay tüm satın alma talepleri tamamlandı (✓)
            </Typography>
            <Button
              size="small"
              onClick={() =>
                navigate(
                  `/pending-budget-actions?filter=purchase-pending&year=${purchaseAlert?.year ?? new Date().getFullYear()}&month=${
                    purchaseAlert?.month ?? new Date().getMonth() + 1
                  }`
                )
              }
            >
              Listeyi Gör
            </Button>
          </CardContent>
        </Card>
      )}
      <Dialog
        open={isAlertsDialogOpen}
        onClose={handleCloseAlertsDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: theme.palette.background.paper,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: "16px"
          }
        }}
      >
        <DialogTitle
          sx={{
            fontSize: 18,
            fontWeight: 800,
            bgcolor: theme.palette.primary.main,
            color: theme.palette.primary.contrastText
          }}
        >
          Bu Ay Satın Alma Talepleri
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Bu Ay Satın Alma Talepleri
            </Typography>
            {purchaseItems.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Bu ay için satın alma kalemi bulunmuyor.
              </Typography>
            ) : (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  {`Bekleyen satın alma kalemi: ${purchaseAlert?.pending ?? 0}`}
                </Typography>
                <TextField
                  select
                  label="Departman"
                  size="small"
                  value={purchaseDepartmentFilter}
                  onChange={(event) => setPurchaseDepartmentFilter(event.target.value)}
                  sx={{ mb: 2, minWidth: 220 }}
                >
                  <MenuItem value="">Hepsi</MenuItem>
                  {purchaseDepartments.map((department) => (
                    <MenuItem key={department} value={department}>
                      {department}
                    </MenuItem>
                  ))}
                </TextField>
                <Table size="small" sx={{ maxHeight: 320 }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: theme.palette.action.hover }}>
                      <TableCell>
                        <Typography fontWeight={700}>Kalem</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography fontWeight={700}>Departman</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography fontWeight={700}>Tutar</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography fontWeight={700}>Durum</Typography>
                      </TableCell>
                      {!isViewer && (
                        <TableCell align="right">
                          <Typography fontWeight={700}>İşlem</Typography>
                        </TableCell>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredPurchaseItems?.map((item) => (
                      <TableRow key={item.id} hover>
                        <TableCell>{item.title}</TableCell>
                        <TableCell>{item.department || "-"}</TableCell>
                        <TableCell align="right">{formatCurrency(toSafeNumber(item.amount))}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            color={item.requested ? "success" : "warning"}
                            icon={item.requested ? <TaskAltIcon /> : <RadioButtonUncheckedIcon />}
                            label={item.requested ? "Talep Oluşturuldu" : "Bekleyen"}
                          />
                        </TableCell>
                        {!isViewer && (
                          <TableCell align="right">
                            <Button
                              size="small"
                              variant={item.requested ? "outlined" : "contained"}
                              color={item.requested ? "warning" : "primary"}
                              disabled={savingPurchaseStatus === item.id}
                              onClick={() => void handleSetPurchaseRequested(item)}
                            >
                              {item.requested ? "Geri Al" : "Talep Oluşturuldu"}
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </Box>

          <Box>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Garanti Uyarıları
            </Typography>
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Süresi dolanlar
                </Typography>
                {warrantyAlerts.expired.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Süresi dolan garanti kaydı bulunmuyor.
                  </Typography>
                ) : (
                  <List dense sx={{ maxHeight: 240, overflowY: "auto" }}>
                    {warrantyAlerts.expired.map((item) => (
                      <ListItem key={item.id ?? `${item.name}-${item.end_date}`}>
                        <ListItemText
                          primary={item.name ?? item.location ?? item.serial_no ?? "Garanti kalemi"}
                          secondary={`Kalan gün: ${item.days_left ?? "-"}`}
                          primaryTypographyProps={{ variant: "body2" }}
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>
              <Box>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  30 gün kalanlar
                </Typography>
                {warrantyAlerts.near.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    30 gün içinde süresi dolacak garanti kaydı bulunmuyor.
                  </Typography>
                ) : (
                  <List dense sx={{ maxHeight: 240, overflowY: "auto" }}>
                    {warrantyAlerts.near.map((item) => (
                      <ListItem key={item.id ?? `${item.name}-${item.end_date}`}>
                        <ListItemText
                          primary={item.name ?? item.location ?? item.serial_no ?? "Garanti kalemi"}
                          secondary={`Kalan gün: ${item.days_left ?? "-"}`}
                          primaryTypographyProps={{ variant: "body2" }}
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={handleCloseAlertsDialog} disabled={savingPurchaseStatus !== null}>
            Kapat
          </Button>
          {user?.is_admin && (warrantyAlerts.expired.length > 0 || warrantyAlerts.near.length > 0) && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                handleCloseAlertsDialog();
                navigate("/warranty-tracking");
              }}
            >
              Garanti Takibi'ne git
            </Button>
          )}
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(dashboardReadonlyDetail)}
        onClose={() => setDashboardReadonlyDetail(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>{dashboardReadonlyDetail?.title ?? "Detay"}</DialogTitle>
        <DialogContent dividers>
          {dashboardReadonlyDetail && (
            <Stack spacing={2}>
              <DetailSummaryGrid items={dashboardReadonlyDetail.summary} />
              <DetailTableWrap>
                <Table size="small">
                  <TableBody>
                    {dashboardReadonlyDetail.fields.map(([label, value]) => (
                      <TableRow key={label}>
                        <TableCell sx={{ width: 220, fontWeight: 700 }}>{label}</TableCell>
                        <TableCell>{value}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </DetailTableWrap>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDashboardReadonlyDetail(null)}>Kapat</Button>
        </DialogActions>
      </Dialog>
      <OverBudgetDialog
        open={budgetStatusDialogCategory !== null}
        onClose={() => setBudgetStatusDialogCategory(null)}
        data={
          overBudget
            ? {
                ...overBudget,
                items: overBudgetItems
              }
            : undefined
        }
        category={budgetStatusDialogCategory ?? "overrun"}
        onItemClick={(item) =>
          openDashboardBudgetStatusDetail(
            item,
            budgetStatusDialogCategory === "remaining" ? "Kalan Bütçe Detayı" : "Aşım Detayı",
            budgetStatusDialogCategory === "remaining" ? "Kalan Bütçe" : "Aşım"
          )
        }
        fileNamePrefix={
          budgetStatusDialogCategory === "saving"
            ? buildDashboardExportFileName("pazarlikli_tasarruf_detayi")
            : budgetStatusDialogCategory === "remaining"
              ? buildDashboardExportFileName("kalan_kullanilabilir_butce_detayi")
              : buildDashboardExportFileName("asim_detayi")
        }
      />
      <Snackbar
        open={Boolean(purchaseStatusFeedback)}
        autoHideDuration={4000}
        onClose={() => setPurchaseStatusFeedback(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        {purchaseStatusFeedback && (
          <Alert
            severity={purchaseStatusFeedback.severity}
            onClose={() => setPurchaseStatusFeedback(null)}
            sx={{ width: "100%" }}
          >
            {purchaseStatusFeedback.message}
          </Alert>
        )}
      </Snackbar>
    </>
  );
}
