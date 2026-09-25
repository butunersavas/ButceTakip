import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Menu,
  MenuItem,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import AddIcon from "@mui/icons-material/Add";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import ReportGmailerrorredOutlinedIcon from "@mui/icons-material/ReportGmailerrorredOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import {
  DataGrid,
  useGridApiRef,
  type GridColDef,
  type GridColumnVisibilityModel,
  type GridFilterModel,
  type GridPaginationModel,
  type GridSortModel
} from "@mui/x-data-grid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import dayjs from "dayjs";
import { useLocation } from "react-router-dom";
import * as XLSX from "xlsx";
import { formatUnusedReason, UNUSED_REASON_OPTIONS } from "../../utils/unusedReason";

import { API_BASE, authHeaders } from "../../api/client";
import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import usePersistentState from "../../hooks/usePersistentState";
import { useAuth } from "../../context/AuthContext";
import UnusedBudgetDialog from "../common/UnusedBudgetDialog";
import { formatBudgetItemLabel, stripBudgetCode } from "../../utils/budgetLabel";
import OverBudgetDialog, {
  type BudgetStatusCategory,
  type OverBudgetItem,
  type OverBudgetResponse
} from "../common/OverBudgetDialog";
import { useConfirmDialog } from "../../context/ConfirmDialogContext";

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

export interface Expense {
  id: number;
  budget_item_id: number | null;
  scenario_id: number | null;
  expense_date: string;
  date?: string;
  scenario_name?: string | null;
  budget_code?: string | null;
  budget_name?: string | null;
  capex_opex?: string | null;
  asset_type?: string | null;
  map_capex_opex?: string | null;
  map_nitelik?: string | null;
  nitelik?: string | null;
  department?: string | null;
  amount: number;
  quantity: number;
  unit_price: number;
  vendor: string | null;
  description: string | null;
  status: "recorded" | "cancelled";
  is_out_of_budget: boolean;
  out_of_budget?: boolean;
  is_budget_outside?: boolean | null;
  budget_outside_title?: string | null;
  budget_outside_department?: string | null;
  budget_outside_capex_opex?: string | null;
  budget_outside_asset_type?: string | null;
  is_cancelled?: boolean | null;
  expense_type?: string | null;
  created_by_id?: number | null;
  updated_by_id?: number | null;
  created_at: string;
  updated_at: string;
  client_hostname: string | null;
  kaydi_giren_kullanici: string | null;
  created_by_name?: string | null;
  updated_by_name?: string | null;
  created_by_username?: string | null;
  updated_by_username?: string | null;
  plan_amount?: number | null;
  saving_amount?: number | null;
  actual_amount?: number | null;
  unused_amount?: number | null;
  available_amount?: number | null;
  scope_plan_amount?: number | null;
  scope_actual_amount?: number | null;
  scope_unused_amount?: number | null;
  scope_remaining_amount?: number | null;
  scope_saving_amount?: number | null;
  scope_overrun_amount?: number | null;
  attachment_count?: number;
  has_attachment?: boolean;
  allocation_count?: number;
  allocations?: ExpenseAllocation[];
}

interface ExpenseAllocation {
  year: number;
  month: number;
  allocated_amount: number;
  plan_amount?: number | null;
  actual_amount?: number | null;
  unused_amount?: number | null;
  available_amount?: number | null;
  saving_amount?: number | null;
  scope_plan_amount?: number | null;
  scope_actual_amount?: number | null;
  scope_unused_amount?: number | null;
  scope_remaining_amount?: number | null;
  scope_saving_amount?: number | null;
  scope_overrun_amount?: number | null;
}

interface PlanAggregate {
  budget_item_id: number;
  month: number;
  total_amount: number;
  scenario_id?: number | null;
}

interface ExpensePlanOption {
  id: number;
  month: number;
  budget_item_id: number;
  scenario_id: number;
}

interface ExpenseAttachment {
  id: number;
  expense_id: number;
  file_name: string;
  content_type: string;
  size_bytes: number;
  created_at?: string | null;
}

type AttachmentPreview = {
  fileName: string;
  url: string;
};

interface ExpensePayload {
  id?: number;
  budget_item_id: number | null;
  scenario_id: number;
  expense_date: string;
  amount: number;
  quantity: number;
  unit_price: number;
  vendor?: string;
  description?: string;
  status: "recorded" | "cancelled";
  is_out_of_budget: boolean;
  budget_outside_title?: string | null;
  budget_outside_department?: string | null;
  budget_outside_capex_opex?: string | null;
  budget_outside_asset_type?: string | null;
  mark_plan_purchased: boolean;
  allocation_mode: "single" | "planned_months";
  allocation_start_month?: number | null;
  allocation_month_count?: number | null;
  allocation_method?: "equal" | "plan_amount" | null;
  client_hostname?: string | null;
  kaydi_giren_kullanici?: string | null;
}

type ExpenseMutationPayload = ExpensePayload & {
  attachmentFiles?: File[];
};

const ATTACHMENT_DOWNLOAD_ERROR_MESSAGE =
  "Dosya indirilemedi. Dosya sunucuda bulunamıyor veya erişim hatası var.";

class AttachmentRequestError extends Error {
  constructor(message = ATTACHMENT_DOWNLOAD_ERROR_MESSAGE) {
    super(message);
    this.name = "AttachmentRequestError";
  }
}

function buildApiUrl(path: string) {
  const normalizedBase = API_BASE.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function readAttachmentErrorMessage(
  response: Response,
  fallback = ATTACHMENT_DOWNLOAD_ERROR_MESSAGE
) {
  if (response.status >= 500) {
    return fallback;
  }
  try {
    const text = await response.text();
    if (!text) {
      if (response.status === 401) {
        return "Oturum doğrulanamadı. Lütfen tekrar giriş yapın.";
      }
      if (response.status === 403) {
        return "Bu dosyaya erişim yetkiniz yok.";
      }
      return fallback;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const payload = JSON.parse(text) as { detail?: string; message?: string };
      const detail = payload.detail || payload.message;
      if (
        response.status === 401 &&
        (!detail || detail === "Not authenticated" || detail === "Could not validate credentials")
      ) {
        return "Oturum doğrulanamadı. Lütfen tekrar giriş yapın.";
      }
      if (response.status === 403) {
        return detail && detail !== "Not allowed" ? detail : "Bu dosyaya erişim yetkiniz yok.";
      }
      return detail || fallback;
    }
    return fallback;
  } catch (error) {
    console.debug("Attachment error response could not be parsed", error);
    return fallback;
  }
}

function getAttachmentErrorMessage(error: unknown) {
  if (error instanceof AttachmentRequestError && error.message) {
    return error.message;
  }
  return ATTACHMENT_DOWNLOAD_ERROR_MESSAGE;
}

type UnusedBudgetPayload = {
  budget_item_id: number;
  scenario_id: number;
  expense_date: string;
  amount: number;
  reason?: string;
  note?: string;
};

interface DeleteDependencyInfo {
  related_file_count: number;
}

type DeleteExpensePayload = {
  expenseId: number;
  deleteRelated: boolean;
};

type ExpenseStatusFilter = "ACTIVE" | "CANCELLED" | "OUT_OF_BUDGET" | "ALL" | "MINE" | "TODAY";
type ExpenseSummaryFilter = "ALL" | "ACTIVE" | "OUT_OF_BUDGET" | "CANCELLED";

type UnusedBudgetItem = {
  budget_item_id: number;
  budget_code: string;
  budget_name: string;
  months?: number[];
  month?: number | null;
  capex_opex?: string | null;
  asset_type?: string | null;
  department?: string | null;
  plan: number;
  actual: number;
  unused_amount?: number;
  available_amount?: number;
  reason?: string | null;
  note?: string | null;
  unused_updated_at?: string | null;
};

type UnusedBudgetResponse = OverBudgetResponse & {
  summary: OverBudgetResponse["summary"] & {
    unused_total?: number;
    unused_item_count?: number;
    negotiated_saving_total?: number;
    negotiated_saving_item_count?: number;
    other_saving_total?: number;
    other_saving_item_count?: number;
    total_saving_total?: number;
    total_saving_item_count?: number;
  };
  unused_items?: UnusedBudgetItem[];
};

type ExpensesRouteState = {
  openCreate?: boolean;
  filter?: string;
  statusFilter?: ExpenseStatusFilter;
  selectedExpenseFilter?: ExpenseSummaryFilter;
  showOutOfBudget?: boolean;
  include_out_of_budget?: boolean;
  show_out_of_budget?: boolean;
  only_out_of_budget?: boolean;
  year?: number | string | "";
  scenarioId?: number | string | null;
  scenario_id?: number | string | null;
  budgetItemId?: number | string | null;
  budget_item_id?: number | string | null;
  capexOpex?: "" | "capex" | "opex";
  capex_opex?: "" | "capex" | "opex";
  month?: number | string | null;
  months?: number[] | string | null;
};

type ExpensesErrorBoundaryProps = {
  children: ReactNode;
};

type ExpensesErrorBoundaryState = {
  hasError: boolean;
};

class ExpensesErrorBoundary extends Component<
  ExpensesErrorBoundaryProps,
  ExpensesErrorBoundaryState
> {
  state: ExpensesErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("Expenses page error", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert severity="error">
          Veri yüklenemedi. Lütfen sayfayı yenileyip tekrar deneyin.
        </Alert>
      );
    }

    return this.props.children;
  }
}

function formatCurrency(value: number) {
  return `$${new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value ?? 0)}`;
}

function sumUniqueExpensePlanScopes(expenses: Expense[]) {
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
        return allocationTotal + (Number(allocation.plan_amount ?? 0) || 0);
      }, total);
    }

    const expenseDate = dayjs(expense.expense_date);
    const year = expenseDate.isValid() ? expenseDate.year() : "unknown";
    const month = expenseDate.isValid() ? expenseDate.month() + 1 : "unknown";
    const key = `${budgetKey}-${scenarioKey}-${year}-${month}`;
    if (seen.has(key)) return total;
    seen.add(key);
    return total + (Number(expense.plan_amount ?? 0) || 0);
  }, 0);
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

function parseLocaleNumber(value: FormDataEntryValue | string | null) {
  if (value === null) return NaN;
  const raw = value.toString().trim();
  if (!raw) return NaN;
  let normalized = raw.replace(/\s/g, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized =
      normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
        ? normalized.replace(/\./g, "").replace(",", ".")
        : normalized.replace(/,/g, "");
  } else {
    normalized = normalized.replace(",", ".");
  }
  return Number(normalized);
}

function normalizeCapexOpexValue(value: string | null | undefined) {
  const normalized = value?.trim().toLocaleLowerCase("tr-TR");
  return normalized === "capex" || normalized === "opex" ? normalized : "";
}

const statusLabels: Record<Expense["status"], string> = {
  recorded: "Kaydedildi",
  cancelled: "İptal Edildi"
};

const monthOptions = [
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

const expensesMonthListboxId = "expenses-month-filter-listbox";

const unusedBudgetReasonOptions = UNUSED_REASON_OPTIONS;

function formatBudgetPeriod(item: { months?: number[]; month?: number | null }) {
  const sourceMonths = item.months?.length ? item.months : item.month ? [item.month] : [];
  const labels = Array.from(new Set(sourceMonths))
    .filter((month) => month >= 1 && month <= 12)
    .sort((a, b) => a - b)
    .map((month) => monthOptions[month - 1] ?? String(month));
  return labels.join(", ") || "-";
}

function formatMonthYear(value: string | Date | null | undefined) {
  if (!value) return "-";
  const parsed = dayjs(value);
  if (!parsed.isValid()) return "-";
  return `${monthOptions[parsed.month()] ?? String(parsed.month() + 1)} ${parsed.year()}`;
}

function normalizeMonthSelection(value: unknown): number[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => Number(item))
          .filter((item) => Number.isInteger(item) && item >= 1 && item <= 12)
      )
    ).sort((a, b) => a - b);
  }
  if (typeof value === "string") {
    return normalizeMonthSelection(value.split(","));
  }
  return [];
}

function isExpenseExcludedFromBudgetSavings(expense?: Expense | null) {
  if (!expense) return true;
  const status = String(expense.status ?? "").toLowerCase();
  const expenseType = String(expense.expense_type ?? "").toLocaleLowerCase("tr-TR");
  const isOutOfBudget = Boolean(
    expense.is_out_of_budget ?? expense.out_of_budget ?? expense.is_budget_outside
  );
  const isCancelled = status === "cancelled" || Boolean(expense.is_cancelled);
  const isUnused =
    expenseType === "unused" ||
    expenseType === "kullanılmayacak" ||
    expenseType === "kullanilmayacak";

  return isOutOfBudget || isCancelled || isUnused;
}

export default function ExpensesView() {
  const client = useAuthorizedClient();
  const queryClient = useQueryClient();
  const requestConfirmation = useConfirmDialog();
  const location = useLocation();
  const { user } = useAuth();
  const isViewer = ["viewer", "readonly", "read_only"].includes(
    String(user?.role ?? "").toLowerCase()
  );
  const tableRef = useRef<HTMLDivElement | null>(null);
  const monthFilterRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useGridApiRef();

  const currentYear = new Date().getFullYear();
  const [year, setYear] = usePersistentState<number | "">("expenses:year", currentYear);
  const [scenarioId, setScenarioId] = usePersistentState<number | null>("expenses:scenarioId", null);
  const [budgetItemId, setBudgetItemId] = usePersistentState<number | null>("expenses:budgetItemId", null);
  const [selectedMonths, setSelectedMonths] = usePersistentState<number[]>(
    "expenses:selectedMonths",
    []
  );
  const [startDate, setStartDate] = usePersistentState<string>("expenses:startDate", "");
  const [endDate, setEndDate] = usePersistentState<string>("expenses:endDate", "");
  const [capexOpex, setCapexOpex] = usePersistentState<"" | "capex" | "opex">(
    "expenses:capexOpex",
    ""
  );
  const [statusFilter, setStatusFilter] = usePersistentState<ExpenseStatusFilter>(
    "expenses:statusFilter",
    "ACTIVE"
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [listLoadFailed, setListLoadFailed] = useState(false);
  const [listErrorToastOpen, setListErrorToastOpen] = useState(false);
  const [formQuantity, setFormQuantity] = useState<string>("1");
  const [formUnitPrice, setFormUnitPrice] = useState<string>("0");
  const [formBudgetItemId, setFormBudgetItemId] = useState<number | null>(null);
  const [unusedDialogPlanId, setUnusedDialogPlanId] = useState<number | null>(null);
  const [formIsOutOfBudget, setFormIsOutOfBudget] = useState(false);
  const [formBudgetOutsideTitle, setFormBudgetOutsideTitle] = useState("");
  const [formBudgetOutsideDepartment, setFormBudgetOutsideDepartment] = useState("");
  const [formBudgetOutsideCapexOpex, setFormBudgetOutsideCapexOpex] = useState("");
  const [formBudgetOutsideAssetType, setFormBudgetOutsideAssetType] = useState("");
  const [formScenarioId, setFormScenarioId] = useState<number | "">(scenarioId ?? "");
  const [formExpenseDate, setFormExpenseDate] = useState<string>(dayjs().format("YYYY-MM-DD"));
  const [allocationMode, setAllocationMode] = useState<"single" | "planned_months">("single");
  const [allocationStartMonth, setAllocationStartMonth] = useState<number>(new Date().getMonth() + 1);
  const [allocationMonthCount, setAllocationMonthCount] = useState<string>("1");
  const [allocationMethod, setAllocationMethod] = useState<"equal" | "plan_amount">("equal");
  const [formMarkPlanPurchased, setFormMarkPlanPurchased] = useState(true);
  const [isUnusedBudgetMode, setIsUnusedBudgetMode] = useState(false);
  const [unusedBudgetReason, setUnusedBudgetReason] = useState(unusedBudgetReasonOptions[0].value);
  const [selectedAttachmentFiles, setSelectedAttachmentFiles] = useState<File[]>([]);
  const [attachmentPicker, setAttachmentPicker] = useState<{
    expenseId: number;
    attachments: ExpenseAttachment[];
  } | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreview | null>(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<number | null>(null);
  const [selectedExpenseDetail, setSelectedExpenseDetail] = useState<Expense | null>(null);
  const [distributionDetailExpense, setDistributionDetailExpense] = useState<Expense | null>(null);
  const [budgetStatusDialogCategory, setBudgetStatusDialogCategory] =
    useState<BudgetStatusCategory | null>(null);
  const [isUnusedBudgetDialogOpen, setIsUnusedBudgetDialogOpen] = useState(false);
  const [savingDetailDialog, setSavingDetailDialog] = useState<
    "negotiated" | "total" | null
  >(null);
  const [monthFilterOpen, setMonthFilterOpen] = useState(false);
  const [expenseDetailDialog, setExpenseDetailDialog] = useState<
    "realized" | "out_of_budget" | "cancelled" | null
  >(null);
  const [filterModel, setFilterModel] = useState<GridFilterModel>({ items: [] });
  const [sortModel, setSortModel] = useState<GridSortModel>([]);
  const [columnVisibilityModel, setColumnVisibilityModel] =
    useState<GridColumnVisibilityModel>({});
  const [searchText, setSearchText] = useState<string>("");
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50
  });
  const [selectedExpenseFilter, setSelectedExpenseFilter] =
    useState<ExpenseSummaryFilter>("ALL");

  const resolveApiErrorMessage = useCallback(
    (error: unknown, fallback: string) => {
      if (axios.isAxiosError(error)) {
        const detail =
          (error.response?.data as { detail?: string; message?: string } | undefined)?.detail ||
          (error.response?.data as { detail?: string; message?: string } | undefined)?.message;
        if (detail) {
          return detail;
        }
      }
      return fallback;
    },
    []
  );

  const selectedMonthList = useMemo(
    () => normalizeMonthSelection(selectedMonths),
    [selectedMonths]
  );
  const selectedMonthKey = selectedMonthList.join(",");

  useEffect(() => {
    if (!attachmentPreview?.url) {
      return;
    }
    return () => {
      window.URL.revokeObjectURL(attachmentPreview.url);
    };
  }, [attachmentPreview?.url]);

  useEffect(() => {
    if (!monthFilterOpen) {
      return;
    }

    const isInsideMonthFilter = (target: EventTarget | null) => {
      if (!(target instanceof Node)) {
        return false;
      }
      const listbox = document.getElementById(expensesMonthListboxId);
      return Boolean(monthFilterRef.current?.contains(target) || listbox?.contains(target));
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!isInsideMonthFilter(event.target)) {
        setMonthFilterOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMonthFilterOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [monthFilterOpen]);

  const handleRowUpdate = useCallback(
    (updatedRow: Expense, originalRow: Expense) => ({ ...originalRow, ...updatedRow }),
    []
  );

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const routeState = (location.state ?? null) as ExpensesRouteState | null;
    const routeFilter = searchParams.get("filter") ?? routeState?.filter ?? "";
    const routeStatusFilter = searchParams.get("statusFilter") ?? routeState?.statusFilter;
    const shouldShowOutOfBudget =
      routeFilter === "out_of_budget" ||
      routeState?.showOutOfBudget === true ||
      routeState?.include_out_of_budget === true ||
      routeState?.show_out_of_budget === true ||
      routeState?.only_out_of_budget === true ||
      searchParams.get("include_out_of_budget") === "true" ||
      searchParams.get("show_out_of_budget") === "true" ||
      searchParams.get("only_out_of_budget") === "true" ||
      routeStatusFilter === "OUT_OF_BUDGET";
    const shouldApplyRouteFilters =
      shouldShowOutOfBudget || routeFilter === "actual" || Boolean(routeStatusFilter);

    if (!shouldApplyRouteFilters) return;

    const nextStatusFilter =
      routeStatusFilter === "CANCELLED" ||
      routeStatusFilter === "OUT_OF_BUDGET" ||
      routeStatusFilter === "ALL" ||
      routeStatusFilter === "MINE" ||
      routeStatusFilter === "TODAY" ||
      routeStatusFilter === "ACTIVE"
        ? routeStatusFilter
        : shouldShowOutOfBudget
          ? "OUT_OF_BUDGET"
          : "ACTIVE";
    setStatusFilter(nextStatusFilter);
    setSelectedExpenseFilter(shouldShowOutOfBudget ? "OUT_OF_BUDGET" : "ALL");

    const routeYear = routeState?.year ?? searchParams.get("year");
    const parsedYear = Number(routeYear);
    if (routeYear !== undefined && routeYear !== null && routeYear !== "" && Number.isFinite(parsedYear)) {
      setYear(parsedYear);
    }

    const routeScenarioId = routeState?.scenarioId ?? routeState?.scenario_id ?? searchParams.get("scenario_id");
    const parsedScenarioId = Number(routeScenarioId);
    if (routeScenarioId !== undefined && routeScenarioId !== null && routeScenarioId !== "" && Number.isFinite(parsedScenarioId)) {
      setScenarioId(parsedScenarioId);
    } else {
      setScenarioId(null);
    }

    const routeBudgetItemId =
      routeState?.budgetItemId ?? routeState?.budget_item_id ?? searchParams.get("budget_item_id");
    const parsedBudgetItemId = Number(routeBudgetItemId);
    if (
      routeBudgetItemId !== undefined &&
      routeBudgetItemId !== null &&
      routeBudgetItemId !== "" &&
      Number.isFinite(parsedBudgetItemId)
    ) {
      setBudgetItemId(parsedBudgetItemId);
    } else {
      setBudgetItemId(null);
    }

    const routeCapexOpex = routeState?.capexOpex ?? routeState?.capex_opex ?? searchParams.get("capex_opex");
    setCapexOpex(routeCapexOpex === "capex" || routeCapexOpex === "opex" ? routeCapexOpex : "");

    const routeMonths = routeState?.months ?? searchParams.get("months");
    const parsedRouteMonths = normalizeMonthSelection(routeMonths);
    if (parsedRouteMonths.length > 0) {
      setSelectedMonths(parsedRouteMonths);
    }

    const routeMonth = parsedRouteMonths.length > 0 ? null : routeState?.month ?? searchParams.get("month");
    const parsedMonth = Number(routeMonth);
    const filterYear = Number.isFinite(parsedYear) ? parsedYear : Number(year || currentYear);
    if (Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12 && Number.isFinite(filterYear)) {
      const monthText = String(parsedMonth).padStart(2, "0");
      const lastDay = new Date(filterYear, parsedMonth, 0).getDate();
      setStartDate(`${filterYear}-${monthText}-01`);
      setEndDate(`${filterYear}-${monthText}-${String(lastDay).padStart(2, "0")}`);
      setSelectedMonths([parsedMonth]);
    } else {
      setStartDate("");
      setEndDate("");
    }
  }, [
    currentYear,
    location.search,
    location.state,
    setBudgetItemId,
    setCapexOpex,
    setEndDate,
    setScenarioId,
    setSelectedMonths,
    setStartDate,
    setStatusFilter,
    setYear,
    year
  ]);

  const { data: scenarios } = useQuery<Scenario[]>({
    queryKey: ["scenarios"],
    queryFn: async () => {
      try {
        const { data } = await client.get<Scenario[]>("/scenarios");
        return data;
      } catch (error) {
        setErrorMessage(resolveApiErrorMessage(error, "Senaryo verileri yüklenemedi."));
        throw error;
      }
    }
  });

  const { data: budgetItems } = useQuery<BudgetItem[]>({
    queryKey: ["budget-items"],
    queryFn: async () => {
      try {
        const { data } = await client.get<BudgetItem[]>("/budget-items");
        return data;
      } catch (error) {
        setErrorMessage(resolveApiErrorMessage(error, "Bütçe kalemleri yüklenemedi."));
        throw error;
      }
    }
  });

  const selectedFormBudgetItem = useMemo(
    () => budgetItems?.find((item) => item.id === formBudgetItemId) ?? null,
    [budgetItems, formBudgetItemId]
  );

  useEffect(() => {
    if (!scenarios?.length) return;
    const matchingScenario = scenarios.find((scenario) => scenario.year === year);
    setScenarioId((previous) => {
      if (
        previous &&
        scenarios.some((scenario) => scenario.id === previous && scenario.year === year)
      ) {
        return previous;
      }
      return matchingScenario ? matchingScenario.id : null;
    });
  }, [scenarios, year]);

  const { data: expenses, isFetching, refetch: refetchExpenses } = useQuery<Expense[]>({
    queryKey: [
      "expenses",
      year,
      scenarioId,
      budgetItemId,
      selectedMonthKey,
      startDate,
      endDate,
      capexOpex,
      statusFilter,
      selectedExpenseFilter
    ],
    queryFn: async () => {
      try {
        let includeOutOfBudget = false;
        let showCancelled = false;
        let mineOnly = false;
        let todayOnly = false;
        let statusParam: string | undefined;

        switch (statusFilter) {
          case "ACTIVE":
            statusParam = "recorded";
            break;
          case "CANCELLED":
            statusParam = "cancelled";
            showCancelled = true;
            includeOutOfBudget = true;
            break;
          case "OUT_OF_BUDGET":
            statusParam = "recorded";
            includeOutOfBudget = true;
            break;
          case "MINE":
            mineOnly = true;
            includeOutOfBudget = true;
            showCancelled = true;
            break;
          case "TODAY":
            todayOnly = true;
            includeOutOfBudget = true;
            showCancelled = true;
            break;
          case "ALL":
          default:
            includeOutOfBudget = true;
            showCancelled = true;
            break;
        }
        if (selectedExpenseFilter === "OUT_OF_BUDGET") {
          includeOutOfBudget = true;
        }
        const onlyOutOfBudget =
          statusFilter === "OUT_OF_BUDGET" || selectedExpenseFilter === "OUT_OF_BUDGET";
        const params: Record<string, string | number | boolean> = {};
        if (year) params.year = Number(year);
        if (scenarioId) params.scenario_id = scenarioId;
        if (budgetItemId) params.budget_item_id = budgetItemId;
        if (!todayOnly && selectedMonthKey) params.month_list = selectedMonthKey;
        if (!todayOnly && !selectedMonthKey && startDate) params.start_date = startDate;
        if (!todayOnly && !selectedMonthKey && endDate) params.end_date = endDate;
        if (capexOpex) params.capex_opex = capexOpex;
        params.include_out_of_budget = includeOutOfBudget;
        params.show_cancelled = showCancelled;
        params.show_out_of_budget = includeOutOfBudget;
        params.only_out_of_budget = onlyOutOfBudget;
        params.mine_only = mineOnly;
        params.today_only = todayOnly;
        if (statusParam) {
          params.status_filter = statusParam;
        }
        const { data } = await client.get<Expense[]>("/expenses", { params });
        return data.map((item) => ({
          ...item,
          expense_date: item.expense_date ?? item.date ?? "",
          is_out_of_budget:
            item.is_out_of_budget ?? item.out_of_budget ?? item.is_budget_outside ?? false,
          status: item.status ?? (item.is_cancelled ? "cancelled" : "recorded"),
          is_cancelled: item.is_cancelled ?? item.status === "cancelled",
          attachment_count: item.attachment_count ?? 0,
          has_attachment: item.has_attachment ?? Boolean(item.attachment_count),
          plan_amount: item.plan_amount ?? 0,
          actual_amount: item.actual_amount ?? item.amount ?? 0,
          saving_amount: item.saving_amount ?? 0,
          unused_amount: item.unused_amount ?? 0,
          available_amount: item.available_amount ?? 0,
          scope_plan_amount: item.scope_plan_amount ?? 0,
          scope_actual_amount: item.scope_actual_amount ?? 0,
          scope_unused_amount: item.scope_unused_amount ?? 0,
          scope_remaining_amount: item.scope_remaining_amount ?? 0,
          scope_saving_amount: item.scope_saving_amount ?? 0,
          scope_overrun_amount: item.scope_overrun_amount ?? 0
        }));
      } catch (error) {
        setErrorMessage(
          resolveApiErrorMessage(error, "Harcama verileri yüklenemedi. Lütfen tekrar deneyin.")
        );
        setListLoadFailed(true);
        setListErrorToastOpen(true);
        throw error;
      }
    },
    onSuccess: () => {
      setErrorMessage(null);
      setListLoadFailed(false);
      setListErrorToastOpen(false);
    },
    onError: () => {
      // handled in queryFn
    }
  });

  const {
    data: budgetStatus,
    isFetching: isBudgetStatusFetching
  } = useQuery<OverBudgetResponse>({
    queryKey: [
      "dashboard",
      "overbudget",
      "expenses",
      year,
      scenarioId,
      budgetItemId,
      selectedMonthKey,
      startDate,
      endDate,
      capexOpex
    ],
    enabled: Boolean(year),
    queryFn: async () => {
      const selectedYear = Number(year);
      const params: Record<string, number | string> = { year: selectedYear };
      if (scenarioId) params.scenario_id = scenarioId;
      if (budgetItemId) params.budget_item_id = budgetItemId;
      if (capexOpex) params.capex_opex = capexOpex;
      if (selectedMonthKey) params.month_list = selectedMonthKey;

      if (!selectedMonthKey) {
        const parsedStartDate = dayjs(startDate);
        if (startDate && parsedStartDate.isValid() && parsedStartDate.year() === selectedYear) {
          params.start_month = parsedStartDate.month() + 1;
        }
        const parsedEndDate = dayjs(endDate);
        if (endDate && parsedEndDate.isValid() && parsedEndDate.year() === selectedYear) {
          params.end_month = parsedEndDate.month() + 1;
        }
      }

      const { data } = await client.get<OverBudgetResponse>("/dashboard/overbudget", {
        params
      });
      return data;
    }
  });

  const { data: outOfBudgetExpenses = [] } = useQuery<Expense[]>({
    queryKey: [
      "expenses",
      "out-of-budget-summary",
      year,
      scenarioId,
      budgetItemId,
      selectedMonthKey,
      startDate,
      endDate,
      capexOpex
    ],
    enabled: Boolean(year),
    queryFn: async () => {
      const params: Record<string, string | number | boolean> = {
        year: Number(year),
        status_filter: "recorded",
        include_out_of_budget: true,
        show_out_of_budget: true,
        only_out_of_budget: true,
        show_cancelled: false
      };
      if (scenarioId) params.scenario_id = scenarioId;
      if (budgetItemId) params.budget_item_id = budgetItemId;
      if (selectedMonthKey) params.month_list = selectedMonthKey;
      if (!selectedMonthKey && startDate) params.start_date = startDate;
      if (!selectedMonthKey && endDate) params.end_date = endDate;
      if (capexOpex) params.capex_opex = capexOpex;
      const { data } = await client.get<Expense[]>("/expenses", { params });
      return data.filter(
        (expense) =>
          expense.status === "recorded" &&
          Boolean(expense.is_out_of_budget ?? expense.out_of_budget)
      );
    }
  });

  const mutation = useMutation({
    mutationFn: async (payload: ExpenseMutationPayload) => {
      try {
        const { attachmentFiles = [], ...expensePayload } = payload;
        let savedExpense: Expense;
        if (payload.id) {
          const { id, ...body } = expensePayload;
          const { data } = await client.put<Expense>(`/expenses/${id}`, body);
          savedExpense = data;
        } else {
          const { data } = await client.post<Expense>("/expenses", expensePayload);
          savedExpense = data;
        }
        if (attachmentFiles.length > 0) {
          const attachmentData = new FormData();
          attachmentFiles.forEach((file) => attachmentData.append("files", file));
          await client.post(`/expenses/${savedExpense.id}/attachments/batch`, attachmentData);
          savedExpense = {
            ...savedExpense,
            attachment_count:
              (savedExpense.attachment_count ?? 0) + attachmentFiles.length,
            has_attachment: true
          };
        }
        return savedExpense;
      } catch (error) {
        setErrorMessage(
          resolveApiErrorMessage(error, "Harcama kaydı kaydedilirken bir hata oluştu")
        );
        throw error;
      }
    },
    onSuccess: (savedExpense) => {
      const savedIsOutOfBudget = Boolean(
        savedExpense.is_out_of_budget ?? savedExpense.out_of_budget
      );
      if (savedIsOutOfBudget) {
        setStatusFilter("OUT_OF_BUDGET");
        setSelectedExpenseFilter("OUT_OF_BUDGET");
      }
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      refetchExpenses();
      setDialogOpen(false);
      setSelectedAttachmentFiles([]);
      setErrorMessage(null);
    },
    onError: (error: unknown) => {
      console.error(error);
    }
  });

  const unusedBudgetMutation = useMutation({
    mutationFn: async (payload: UnusedBudgetPayload) => {
      try {
        const { data } = await client.post("/expenses/unused-budget", payload);
        return data;
      } catch (error) {
        setErrorMessage(
          resolveApiErrorMessage(error, "Kullanılmayacak bütçe kaydı oluşturulurken bir hata oluştu")
        );
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      refetchExpenses();
      setDialogOpen(false);
      setSelectedAttachmentFiles([]);
      setIsUnusedBudgetMode(false);
      setUnusedBudgetReason(unusedBudgetReasonOptions[0].value);
      setErrorMessage(null);
      setSuccessMessage("Kullanılmayacak bütçe kaydedildi.");
    },
    onError: (error: unknown) => {
      console.error(error);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ expenseId, deleteRelated }: DeleteExpensePayload) => {
      try {
        await client.delete(`/expenses/${expenseId}`, {
          params: { delete_related: deleteRelated }
        });
      } catch (error) {
        setErrorMessage(
          resolveApiErrorMessage(error, "Harcama kaydı silinirken bir hata oluştu")
        );
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      setErrorMessage(null);
      setSuccessMessage("Kayıt silindi.");
    },
    onError: (error: unknown) => {
      console.error(error);
    }
  });

  const handleCreate = useCallback(() => {
    if (isViewer) {
      setErrorMessage("Bu kullanıcı yalnızca görüntüleme yetkisine sahiptir.");
      return;
    }
    setEditingExpense(null);
    setFormQuantity("1");
    setFormUnitPrice("0");
    const routeState = (location.state ?? null) as ExpensesRouteState | null;
    const routeBudgetItemId = Number(routeState?.budgetItemId ?? routeState?.budget_item_id);
    const routeScenarioId = Number(routeState?.scenarioId ?? routeState?.scenario_id);
    const routeYear = Number(routeState?.year);
    const routeMonth = Number(routeState?.month);
    setFormBudgetItemId(Number.isFinite(routeBudgetItemId) && routeBudgetItemId > 0 ? routeBudgetItemId : budgetItemId ?? null);
    setFormIsOutOfBudget(false);
    setFormBudgetOutsideTitle("");
    setFormBudgetOutsideDepartment("");
    setFormBudgetOutsideCapexOpex("");
    setFormBudgetOutsideAssetType("");
    setFormScenarioId(Number.isFinite(routeScenarioId) && routeScenarioId > 0 ? routeScenarioId : scenarioId ?? "");
    setFormExpenseDate(
      Number.isFinite(routeYear) && Number.isInteger(routeMonth) && routeMonth >= 1 && routeMonth <= 12
        ? `${routeYear}-${String(routeMonth).padStart(2, "0")}-01`
        : dayjs().format("YYYY-MM-DD")
    );
    setAllocationMode("single");
    setAllocationStartMonth(new Date().getMonth() + 1);
    setAllocationMonthCount("1");
    setAllocationMethod("equal");
    setFormMarkPlanPurchased(true);
    setIsUnusedBudgetMode(false);
    setUnusedBudgetReason(unusedBudgetReasonOptions[0].value);
    setSelectedAttachmentFiles([]);
    setDialogOpen(true);
  }, [budgetItemId, isViewer, location.state, scenarioId, setDialogOpen, setEditingExpense, setFormQuantity, setFormUnitPrice]);

  const handledOpenCreateRef = useRef<unknown>(null);
  useEffect(() => {
    const routeState = (location.state ?? null) as ExpensesRouteState | null;
    if (!routeState?.openCreate || handledOpenCreateRef.current === location.state) return;
    handledOpenCreateRef.current = location.state;
    handleCreate();
  }, [handleCreate, location.state]);

  const handleEdit = useCallback(
    (expense: Expense) => {
      if (isViewer) {
        setSelectedExpenseDetail(expense);
        return;
      }
      setEditingExpense(expense);
      const isOutOfBudget = Boolean(expense.is_out_of_budget ?? expense.out_of_budget);
      setFormQuantity(String(expense.quantity ?? 1));
      setFormUnitPrice(String(expense.unit_price ?? 0));
      setFormBudgetItemId(isOutOfBudget ? null : expense.budget_item_id ?? null);
      setFormIsOutOfBudget(isOutOfBudget);
      setFormBudgetOutsideTitle(
        expense.budget_outside_title ??
          (isOutOfBudget ? stripBudgetCode(expense.budget_name ?? "") || expense.vendor || "" : "")
      );
      setFormBudgetOutsideDepartment(expense.budget_outside_department ?? expense.department ?? "");
      setFormBudgetOutsideCapexOpex(
        normalizeCapexOpexValue(
          expense.budget_outside_capex_opex ?? expense.map_capex_opex ?? expense.capex_opex
        )
      );
      setFormBudgetOutsideAssetType(
        expense.budget_outside_asset_type ?? expense.map_nitelik ?? expense.nitelik ?? expense.asset_type ?? ""
      );
      setFormScenarioId(expense.scenario_id ?? "");
      setFormExpenseDate(
        expense.expense_date ? dayjs(expense.expense_date).format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD")
      );
      const allocations = expense.allocations ?? [];
      if (isOutOfBudget) {
        setAllocationMode("single");
        setAllocationStartMonth(dayjs(expense.expense_date).month() + 1);
        setAllocationMonthCount("1");
      } else if (allocations.length > 0) {
        const sortedAllocations = [...allocations].sort((a, b) => a.month - b.month);
        setAllocationMode("planned_months");
        setAllocationStartMonth(sortedAllocations[0]?.month ?? dayjs(expense.expense_date).month() + 1);
        setAllocationMonthCount(String(sortedAllocations.length));
      } else {
        setAllocationMode("single");
        setAllocationStartMonth(dayjs(expense.expense_date).month() + 1);
        setAllocationMonthCount("1");
      }
      setAllocationMethod("equal");
      setFormMarkPlanPurchased(!isOutOfBudget);
      setIsUnusedBudgetMode(false);
      setUnusedBudgetReason(unusedBudgetReasonOptions[0].value);
      setSelectedAttachmentFiles([]);
      setDialogOpen(true);
    },
    [isViewer, setDialogOpen, setEditingExpense, setFormQuantity, setFormUnitPrice]
  );

  const handleDelete = useCallback(
    async (expenseId: number) => {
      if (isViewer) {
        setErrorMessage("Bu kullanıcı yalnızca görüntüleme yetkisine sahiptir.");
        return;
      }
      let relatedFileCount: number | null = null;
      try {
        const { data } = await client.get<DeleteDependencyInfo>(
          `/expenses/${expenseId}/delete-info`
        );
        relatedFileCount = data.related_file_count ?? 0;
      } catch (error) {
        console.error(error);
      }

      const confirmMessage =
        relatedFileCount === null
          ? "Bu kaydı silmek istediğinize emin misiniz? Bağlı ek/dosya varsa ekler de silinecek. Devam etmek istiyor musunuz?"
          : relatedFileCount > 0
            ? `Bu kayda bağlı ${relatedFileCount} ek/dosya var. Silerseniz ekler de silinecek. Devam etmek istiyor musunuz?`
            : "Harcama kaydını silmek istediğinize emin misiniz?";
      const confirmed = await requestConfirmation({
        title: "Harcama Kaydını Sil",
        message: confirmMessage,
        confirmLabel: "Harcama Kaydını Sil",
        severity: "error",
        irreversible: true,
      });
      if (confirmed) {
        deleteMutation.mutate({
          expenseId,
          deleteRelated: relatedFileCount === null || relatedFileCount > 0
        });
      }
    },
    [client, deleteMutation, isViewer, requestConfirmation]
  );

  const buildAllocationSummary = useCallback(
    async (
      amount: number,
      expenseDate: string,
      selectedScenarioId: number,
      selectedBudgetItemId: number
    ) => {
      if (allocationMode !== "planned_months") return null;
      const startMonth = Number(allocationStartMonth);
      const monthCount = Number(allocationMonthCount);
      if (!startMonth) throw new Error("Başlangıç ayı boş olamaz.");
      if (!Number.isInteger(monthCount) || monthCount < 1) {
        throw new Error("Dağıtılacak ay sayısı 1'den küçük olamaz.");
      }
      const endMonth = startMonth + monthCount - 1;
      if (startMonth < 1 || startMonth > 12 || endMonth > 12) {
        throw new Error("Dağıtım Aralık ayını geçemez.");
      }
      const expenseYear = dayjs(expenseDate).year();
      const months = Array.from({ length: monthCount }, (_, index) => startMonth + index);
      const totalCents = Math.round(amount * 100);
      let amountCents: number[];

      if (allocationMethod === "equal") {
        const base = Math.floor(totalCents / monthCount);
        amountCents = Array(monthCount - 1).fill(base);
        amountCents.push(totalCents - base * (monthCount - 1));
      } else {
        const { data } = await client.get<PlanAggregate[]>("/plans/aggregate", {
          params: {
            year: expenseYear,
            scenario_id: selectedScenarioId,
            budget_item_id: selectedBudgetItemId
          }
        });
        const planByMonth = new Map<number, number>();
        data.forEach((item) => {
          planByMonth.set(item.month, (planByMonth.get(item.month) ?? 0) + Number(item.total_amount ?? 0));
        });
        const missingMonths = months.filter((month) => (planByMonth.get(month) ?? 0) <= 0);
        if (missingMonths.length) {
          throw new Error("Plan tutarlarına göre dağıtım için seçilen tüm aylarda plan tutarı bulunmalı.");
        }
        const totalPlan = months.reduce((sum, month) => sum + (planByMonth.get(month) ?? 0), 0);
        if (totalPlan <= 0) throw new Error("Seçilen ay aralığında plan tutarı bulunamadı.");
        let usedCents = 0;
        amountCents = months.slice(0, -1).map((month) => {
          const cents = Math.floor(totalCents * ((planByMonth.get(month) ?? 0) / totalPlan));
          usedCents += cents;
          return cents;
        });
        amountCents.push(totalCents - usedCents);
      }

      const calculatedTotal = amountCents.reduce((sum, cents) => sum + cents, 0);
      if (calculatedTotal !== totalCents) {
        throw new Error("Toplam dağıtım tutarı ana harcama tutarına eşit olmalı.");
      }

      return months
        .map((month, index) => `${monthOptions[month - 1]}: ${formatCurrency(amountCents[index] / 100)}`)
        .join("\n");
    },
    [allocationMethod, allocationMode, allocationMonthCount, allocationStartMonth, client]
  );

  const handleOutOfBudgetChange = useCallback(
    (checked: boolean) => {
      setFormIsOutOfBudget(checked);
      if (checked) {
        setFormBudgetOutsideTitle((previous) =>
          previous.trim() ? previous : stripBudgetCode(selectedFormBudgetItem?.name ?? "")
        );
        setFormBudgetOutsideCapexOpex((previous) =>
          previous.trim() ? previous : normalizeCapexOpexValue(selectedFormBudgetItem?.map_category)
        );
        setFormBudgetOutsideAssetType((previous) =>
          previous.trim() ? previous : (selectedFormBudgetItem?.map_attribute ?? "")
        );
        setFormBudgetItemId(null);
        setAllocationMode("single");
        setFormMarkPlanPurchased(false);
      } else {
        setFormMarkPlanPurchased(true);
      }
    },
    [selectedFormBudgetItem]
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isViewer) {
      setErrorMessage("Bu kullanıcı yalnızca görüntüleme yetkisine sahiptir.");
      return;
    }
    const formData = new FormData(event.currentTarget);
    const isOutOfBudget = formIsOutOfBudget;
    const budgetOutsideTitle = formBudgetOutsideTitle.trim();
    if (isOutOfBudget) {
      if (!budgetOutsideTitle) {
        setErrorMessage("Bütçe dışı harcama başlığı girmelisiniz.");
        return;
      }
    } else if (!formBudgetItemId) {
      setErrorMessage("Bütçe kalemi seçmelisiniz.");
      return;
    }
    const quantity = parseLocaleNumber(formData.get("quantity")) || 1;
    const unitPrice = parseLocaleNumber(formData.get("unit_price")) || 0;
    const amount = Number.isFinite(quantity * unitPrice)
      ? Math.round(quantity * unitPrice * 100) / 100
      : 0;
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      setErrorMessage("Adet ve birim fiyat geçerli bir sayı olmalı.");
      return;
    }
    const selectedScenarioId = formData.get("scenario_id")
      ? Number(formData.get("scenario_id"))
      : Number(scenarioId);
    const payload: ExpenseMutationPayload = {
      id: editingExpense?.id,
      budget_item_id: isOutOfBudget ? null : formBudgetItemId,
      scenario_id: selectedScenarioId,
      expense_date: String(formData.get("expense_date")),
      amount,
      quantity,
      unit_price: unitPrice,
      vendor: formData.get("vendor")?.toString() ?? undefined,
      description: formData.get("description")?.toString() ?? undefined,
      status: formData.get("is_cancelled") === "on" ? "cancelled" : "recorded",
      is_out_of_budget: isOutOfBudget,
      budget_outside_title: isOutOfBudget ? budgetOutsideTitle : null,
      budget_outside_department: isOutOfBudget
        ? formBudgetOutsideDepartment.trim() || null
        : null,
      budget_outside_capex_opex: isOutOfBudget
        ? formBudgetOutsideCapexOpex.trim() || null
        : null,
      budget_outside_asset_type: isOutOfBudget
        ? formBudgetOutsideAssetType.trim() || null
        : null,
      mark_plan_purchased: !isOutOfBudget && formMarkPlanPurchased,
      allocation_mode: isOutOfBudget ? "single" : allocationMode,
      allocation_start_month:
        !isOutOfBudget && allocationMode === "planned_months" ? allocationStartMonth : null,
      allocation_month_count:
        !isOutOfBudget && allocationMode === "planned_months" ? Number(allocationMonthCount) : null,
      allocation_method: !isOutOfBudget && allocationMode === "planned_months" ? allocationMethod : null,
      client_hostname: editingExpense?.client_hostname ?? undefined,
      kaydi_giren_kullanici:
        editingExpense?.kaydi_giren_kullanici ?? user?.username ?? user?.full_name ?? undefined,
      attachmentFiles: selectedAttachmentFiles
    };

    if (!payload.scenario_id) {
      setErrorMessage("Senaryo seçmelisiniz.");
      return;
    }

    if (isUnusedBudgetMode) {
      if (!payload.budget_item_id) {
        setErrorMessage("Kullanılmayacak bütçe için bütçe kalemi seçmelisiniz.");
        return;
      }
      if (editingExpense) {
        setErrorMessage("Kullanılmayacak bütçe mevcut harcama güncellemesinden değil, yeni kayıt olarak girilebilir.");
        return;
      }
      if (amount <= 0) {
        setErrorMessage("Kullanılmayacak tutar 0'dan büyük olmalı.");
        return;
      }
      unusedBudgetMutation.mutate({
        budget_item_id: payload.budget_item_id,
        scenario_id: payload.scenario_id,
        expense_date: payload.expense_date,
        amount,
        reason: formData.get("unused_reason")?.toString() || unusedBudgetReason,
        note: formData.get("unused_note")?.toString() || undefined
      });
      return;
    }

    if (!isOutOfBudget && allocationMode === "planned_months") {
      if (!payload.budget_item_id) {
        setErrorMessage("Bütçe kalemi seçmelisiniz.");
        return;
      }
      try {
        const summary = await buildAllocationSummary(
          amount,
          payload.expense_date,
          payload.scenario_id,
          payload.budget_item_id
        );
        if (summary) {
          const confirmed = await requestConfirmation({
            title: "Harcama Dağılımını Onayla",
            message: `Bu harcama şu aylara dağıtılacak: ${summary}`,
            confirmLabel: "Dağılımı Onayla",
            severity: "warning",
          });
          if (!confirmed) return;
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Dağıtım özeti hesaplanamadı.");
        return;
      }
    }

    mutation.mutate(payload);
  };

  const activeTotal = useMemo(() => {
    return (
      expenses?.reduce(
        (sum, expense) => (expense.status === "recorded" ? sum + expense.amount : sum),
        0
      ) ?? 0
    );
  }, [expenses]);

  const safeExpenses = useMemo(
    () => (Array.isArray(expenses) ? expenses : []),
    [expenses]
  );

  const savingAmountByExpenseId = useMemo(() => {
    const selectedYear = Number(year || currentYear);
    const scopeKey = (
      budgetItemIdValue: number | null | undefined,
      scenarioValue: number | null | undefined,
      scopeYear: number | string,
      month: number | string
    ) => `${budgetItemIdValue ?? "none"}|${scenarioValue ?? "none"}|${scopeYear}|${month}`;

    const savingByScope = new Map<string, number>();
    (budgetStatus?.saving_items ?? []).forEach((item: OverBudgetItem) => {
      const months = normalizeMonthSelection(
        item.months?.length ? item.months : item.month ? [item.month] : []
      );
      const amount = Number(item.over ?? 0) || 0;
      if (months.length === 0 || amount <= 0) {
        return;
      }
      const itemYear = Number(item.year ?? selectedYear);
      const amountPerMonth = months.length > 1 ? amount / months.length : amount;
      months.forEach((month) => {
        const key = scopeKey(item.budget_item_id, item.scenario ?? null, itemYear, month);
        savingByScope.set(key, (savingByScope.get(key) ?? 0) + amountPerMonth);
      });
    });

    const claimedScopes = new Set<string>();
    const result = new Map<number, number>();

    safeExpenses.forEach((expense) => {
      if (isExpenseExcludedFromBudgetSavings(expense)) {
        result.set(expense.id, 0);
        return;
      }

      const scopeKeys =
        expense.allocations && expense.allocations.length > 0
          ? expense.allocations.map((allocation) =>
              scopeKey(
                expense.budget_item_id,
                expense.scenario_id,
                allocation.year,
                allocation.month
              )
            )
          : (() => {
              const parsedDate = dayjs(expense.expense_date ?? expense.date ?? "");
              if (!parsedDate.isValid()) {
                return [];
              }
              return [
                scopeKey(
                  expense.budget_item_id,
                  expense.scenario_id,
                  parsedDate.year(),
                  parsedDate.month() + 1
                )
              ];
            })();

      const displaySaving = Array.from(new Set(scopeKeys)).reduce((sum, key) => {
        if (claimedScopes.has(key)) {
          return sum;
        }
        const saving = savingByScope.get(key) ?? 0;
        if (saving > 0) {
          claimedScopes.add(key);
        }
        return sum + saving;
      }, 0);
      result.set(expense.id, Math.round(displaySaving * 100) / 100);
    });

    return result;
  }, [budgetStatus?.saving_items, currentYear, safeExpenses, year]);

  const showListLoadError = listLoadFailed && !isFetching && safeExpenses.length === 0;

  const outOfBudgetTotal = useMemo(() => {
    return outOfBudgetExpenses.reduce(
      (sum, expense) => sum + Number(expense.amount ?? 0),
      0
    );
  }, [outOfBudgetExpenses]);

  const cancelledTotal = useMemo(() => {
    return safeExpenses.reduce(
      (sum, expense) => (expense.status === "cancelled" ? sum + expense.amount : sum),
      0
    );
  }, [safeExpenses]);

  const summaryFilterItems = useMemo<GridFilterModel["items"]>(() => {
    switch (selectedExpenseFilter) {
      case "ACTIVE":
        return [{ field: "status", operator: "equals", value: "recorded" }];
      case "OUT_OF_BUDGET":
        return [];
      case "CANCELLED":
        return [{ field: "status", operator: "equals", value: "cancelled" }];
      default:
        return [];
    }
  }, [selectedExpenseFilter]);

  const combinedFilterModel = useMemo<GridFilterModel>(
    () => {
      const reservedFields = ["status", "is_out_of_budget"];
      const cleanedItems = filterModel.items.filter(
        (item) => !reservedFields.includes(item.field ?? "")
      );
      return {
        ...filterModel,
        items: [...cleanedItems, ...summaryFilterItems]
      };
    },
    [filterModel, summaryFilterItems]
  );

  const handleFilterModelChange = useCallback(
    (model: GridFilterModel) => {
      const reservedFields = ["status", "is_out_of_budget"];
      const cleanedItems = model.items.filter(
        (item) => !reservedFields.includes(item.field ?? "")
      );
      setFilterModel({ ...model, items: cleanedItems });
    },
    [setFilterModel]
  );

  const totalAmount = useMemo(() => {
    const quantityNumber = parseLocaleNumber(formQuantity);
    const unitPriceNumber = parseLocaleNumber(formUnitPrice);
    if (Number.isNaN(quantityNumber) || Number.isNaN(unitPriceNumber)) {
      return 0;
    }
    return Math.round(quantityNumber * unitPriceNumber * 100) / 100;
  }, [formQuantity, formUnitPrice]);

  const formPlanYear = useMemo(() => {
    const parsedDate = dayjs(formExpenseDate);
    if (parsedDate.isValid()) {
      return parsedDate.year();
    }
    return typeof year === "number" ? year : currentYear;
  }, [currentYear, formExpenseDate, year]);

  const selectedAllocationMonths = useMemo(() => {
    const startMonth = Number(allocationStartMonth);
    const monthCount = Number(allocationMonthCount);
    if (
      !Number.isInteger(startMonth) ||
      !Number.isInteger(monthCount) ||
      startMonth < 1 ||
      startMonth > 12 ||
      monthCount < 1 ||
      startMonth + monthCount - 1 > 12
    ) {
      return [];
    }
    return Array.from({ length: monthCount }, (_, index) => startMonth + index);
  }, [allocationMonthCount, allocationStartMonth]);

  const selectedPreviewMonths = useMemo(() => {
    if (allocationMode === "planned_months") {
      return selectedAllocationMonths;
    }
    const parsedDate = dayjs(formExpenseDate);
    return parsedDate.isValid() ? [parsedDate.month() + 1] : [];
  }, [allocationMode, formExpenseDate, selectedAllocationMonths]);

  const {
    data: plannedBudgetPreview = [],
    isFetching: isPlanPreviewFetching,
    isError: isPlanPreviewError
  } = useQuery<PlanAggregate[]>({
    queryKey: [
      "plans",
      "aggregate",
      "expense-preview",
      formPlanYear,
      formScenarioId,
      formBudgetItemId
    ],
    enabled:
      dialogOpen &&
      Boolean(formBudgetItemId) &&
      Boolean(formScenarioId),
    queryFn: async () => {
      const { data } = await client.get<PlanAggregate[]>("/plans/aggregate", {
        params: {
          year: formPlanYear,
          scenario_id: Number(formScenarioId),
          budget_item_id: formBudgetItemId
        }
      });
      return data;
    }
  });

  const { data: expensePlanOptions = [] } = useQuery<ExpensePlanOption[]>({
    queryKey: ["plans", "unused-dialog-options", formPlanYear, formScenarioId, formBudgetItemId],
    enabled: dialogOpen && Boolean(formBudgetItemId) && Boolean(formScenarioId),
    queryFn: async () => {
      const { data } = await client.get<ExpensePlanOption[]>("/plans", {
        params: {
          year: formPlanYear,
          scenario_id: Number(formScenarioId),
          budget_item_id: formBudgetItemId
        }
      });
      return data;
    }
  });

  const plannedBudgetByMonth = useMemo(() => {
    const map = new Map<number, number>();
    plannedBudgetPreview.forEach((item) => {
      if (formBudgetItemId && item.budget_item_id !== formBudgetItemId) return;
      const amount = Number(item.total_amount ?? 0);
      map.set(item.month, (map.get(item.month) ?? 0) + amount);
    });
    return map;
  }, [formBudgetItemId, plannedBudgetPreview]);

  const plannedBudgetRows = useMemo(
    () =>
      Array.from(plannedBudgetByMonth.entries())
        .filter(([, amount]) => amount > 0)
        .sort(([leftMonth], [rightMonth]) => leftMonth - rightMonth)
        .map(([month, amount]) => ({
          month,
          label: monthOptions[month - 1] ?? String(month),
          amount,
          isSelected: selectedPreviewMonths.includes(month)
        })),
    [plannedBudgetByMonth, selectedPreviewMonths]
  );

  const plannedBudgetTotal = useMemo(
    () => plannedBudgetRows.reduce((sum, row) => sum + row.amount, 0),
    [plannedBudgetRows]
  );

  const allocationPreview = useMemo(() => {
    if (selectedAllocationMonths.length === 0) {
      return {
        rows: [],
        message: "Dağıtım kapsamını görmek için geçerli başlangıç ayı ve ay sayısı girin."
      };
    }

    const totalCents = Math.round(totalAmount * 100);
    if (allocationMethod === "equal") {
      const base = Math.floor(totalCents / selectedAllocationMonths.length);
      const rows = selectedAllocationMonths.map((month, index) => {
        const cents =
          index === selectedAllocationMonths.length - 1
            ? totalCents - base * (selectedAllocationMonths.length - 1)
            : base;
        return {
          month,
          label: monthOptions[month - 1] ?? String(month),
          amount: cents / 100
        };
      });
      return { rows, message: null };
    }

    const missingMonths = selectedAllocationMonths.filter(
      (month) => (plannedBudgetByMonth.get(month) ?? 0) <= 0
    );
    if (missingMonths.length) {
      return {
        rows: [],
        message:
          "Plan tutarına göre tahmini dağıtım için seçilen tüm aylarda plan tutarı bulunmalı."
      };
    }

    const selectedPlanTotal = selectedAllocationMonths.reduce(
      (sum, month) => sum + (plannedBudgetByMonth.get(month) ?? 0),
      0
    );
    if (selectedPlanTotal <= 0) {
      return {
        rows: [],
        message: "Seçilen ay aralığında plan tutarı bulunamadı."
      };
    }

    let usedCents = 0;
    const rows = selectedAllocationMonths.map((month, index) => {
      const cents =
        index === selectedAllocationMonths.length - 1
          ? totalCents - usedCents
          : Math.floor(totalCents * ((plannedBudgetByMonth.get(month) ?? 0) / selectedPlanTotal));
      if (index !== selectedAllocationMonths.length - 1) {
        usedCents += cents;
      }
      return {
        month,
        label: monthOptions[month - 1] ?? String(month),
        amount: cents / 100
      };
    });
    return { rows, message: null };
  }, [allocationMethod, plannedBudgetByMonth, selectedAllocationMonths, totalAmount]);

  const renderTextWithTooltip = useCallback((value?: string | null, fallback = "-") => {
    const displayValue = value?.trim() || fallback;
    if (!displayValue) {
      return "-";
    }
    return (
      <Tooltip title={displayValue} placement="top" arrow>
        <span className="MuiDataGrid-cellContent" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {displayValue}
        </span>
      </Tooltip>
    );
  }, []);

  const buildBudgetSummary = useCallback((expense: Expense) => {
    if (isExpenseExcludedFromBudgetSavings(expense)) {
      return null;
    }
    const allocations = expense.allocations ?? [];
    const planTotalFromAllocations = allocations.reduce(
      (sum, allocation) => sum + Number(allocation.plan_amount ?? 0),
      0
    );
    const actualTotalFromAllocations = allocations.reduce(
      (sum, allocation) =>
        sum + Number(allocation.allocated_amount ?? allocation.actual_amount ?? 0),
      0
    );
    const budgetTotal = allocations.length > 0
      ? planTotalFromAllocations
      : Number(expense.plan_amount ?? 0);
    const spendingTotal = allocations.length > 0
      ? actualTotalFromAllocations
      : Number(expense.amount ?? expense.actual_amount ?? 0);

    if (!Number.isFinite(budgetTotal) || !Number.isFinite(spendingTotal)) {
      return null;
    }

    const result = budgetTotal - spendingTotal;
    return {
      budgetTotal,
      spendingTotal,
      result,
      isOverrun: result < 0
    };
  }, []);

  const distributionDetailRows = useMemo(() => {
    if (
      !distributionDetailExpense ||
      isExpenseExcludedFromBudgetSavings(distributionDetailExpense)
    ) {
      return [];
    }
    const allocations = [...(distributionDetailExpense.allocations ?? [])].sort(
      (a, b) => a.year - b.year || a.month - b.month
    );
    if (allocations.length > 0) {
      return allocations.map((allocation) => {
        const budgetAmount = Number(allocation.plan_amount ?? 0);
        const allocatedAmount = Number(
          allocation.actual_amount ?? allocation.allocated_amount ?? 0
        );
        const result = budgetAmount - allocatedAmount;
        return {
          year: allocation.year,
          month: allocation.month,
          budgetAmount,
          allocatedAmount,
          result,
          isOverrun: result < 0
        };
      });
    }

    const expenseDate = dayjs(distributionDetailExpense.expense_date);
    const budgetAmount = Number(distributionDetailExpense.plan_amount ?? 0);
    const allocatedAmount = Number(
      distributionDetailExpense.actual_amount ?? distributionDetailExpense.amount ?? 0
    );
    const result = budgetAmount - allocatedAmount;
    return [
      {
        year: expenseDate.isValid() ? expenseDate.year() : new Date().getFullYear(),
        month: expenseDate.isValid() ? expenseDate.month() + 1 : 0,
        budgetAmount,
        allocatedAmount,
        result,
        isOverrun: result < 0
      }
    ];
  }, [distributionDetailExpense]);

  const distributionDetailSummary = useMemo(() => {
    if (
      !distributionDetailExpense ||
      isExpenseExcludedFromBudgetSavings(distributionDetailExpense)
    ) {
      return null;
    }
    const summary = buildBudgetSummary(distributionDetailExpense);
    if (summary) {
      return summary;
    }

    const budgetTotal = distributionDetailRows.reduce(
      (sum, detail) => sum + Number(detail.budgetAmount ?? 0),
      0
    );
    const spendingTotal = distributionDetailRows.reduce(
      (sum, detail) => sum + Number(detail.allocatedAmount ?? 0),
      0
    );
    if (!Number.isFinite(budgetTotal) || !Number.isFinite(spendingTotal)) {
      return null;
    }

    const result = budgetTotal - spendingTotal;
    return {
      budgetTotal,
      spendingTotal,
      result,
      isOverrun: result < 0
    };
  }, [buildBudgetSummary, distributionDetailExpense, distributionDetailRows]);

  const closeAttachmentPreview = useCallback(() => {
    setAttachmentPreview(null);
  }, []);

  const previewAttachment = useCallback(
    async (expenseId: number, attachment: ExpenseAttachment) => {
      const previewPath = `/expenses/${expenseId}/attachments/${attachment.id}/preview`;
      const previewUrl = buildApiUrl(previewPath);
      try {
        const response = await fetch(previewUrl, {
          headers: authHeaders(localStorage.getItem("butce_token"))
        });
        if (!response.ok) {
          throw new AttachmentRequestError(await readAttachmentErrorMessage(response));
        }
        const blob = await response.blob();
        if (blob.size === 0) {
          throw new AttachmentRequestError();
        }
        const url = window.URL.createObjectURL(blob);
        setAttachmentPreview({
          fileName: attachment.file_name || "PDF Önizleme",
          url
        });
        setErrorMessage(null);
      } catch (error) {
        console.error("Expense attachment preview failed", {
          expenseId,
          attachmentId: attachment.id,
          url: previewUrl,
          error
        });
        setErrorMessage(getAttachmentErrorMessage(error));
      }
    },
    []
  );

  const downloadAttachment = useCallback(
    async (expenseId: number, attachment: ExpenseAttachment) => {
      const downloadPath = `/expenses/${expenseId}/attachments/${attachment.id}`;
      const downloadUrl = buildApiUrl(downloadPath);
      try {
        const response = await fetch(downloadUrl, {
          headers: authHeaders(localStorage.getItem("butce_token"))
        });
        if (!response.ok) {
          throw new AttachmentRequestError(await readAttachmentErrorMessage(response));
        }
        const blob = await response.blob();
        if (blob.size === 0) {
          throw new AttachmentRequestError();
        }
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = attachment.file_name || "fatura.pdf";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(blobUrl);
      } catch (error) {
        console.error("Expense attachment download failed", {
          expenseId,
          attachmentId: attachment.id,
          url: downloadUrl,
          error
        });
        setErrorMessage(getAttachmentErrorMessage(error));
      }
    },
    []
  );

  const handleDownloadAttachment = useCallback(
    async (expenseId: number) => {
      const listPath = `/expenses/${expenseId}/attachments`;
      const listUrl = buildApiUrl(listPath);
      try {
        const response = await fetch(listUrl, {
          headers: authHeaders(localStorage.getItem("butce_token"))
        });
        if (!response.ok) {
          throw new AttachmentRequestError(await readAttachmentErrorMessage(response));
        }
        const attachments = (await response.json()) as ExpenseAttachment[];
        if (!Array.isArray(attachments)) {
          throw new AttachmentRequestError();
        }
        if (attachments.length === 0) {
          setErrorMessage("Ek yok");
          return;
        }
        setAttachmentPicker({ expenseId, attachments });
      } catch (error) {
        console.error("Expense attachment list failed", {
          expenseId,
          url: listUrl,
          error
        });
        setErrorMessage(getAttachmentErrorMessage(error));
      }
    },
    []
  );

  const deleteAttachment = useCallback(
    async (expenseId: number, attachment: ExpenseAttachment) => {
      if (isViewer) {
        setErrorMessage("Bu kullanıcı yalnızca görüntüleme yetkisine sahiptir.");
        return;
      }
      const confirmed = await requestConfirmation({
        title: "Eki Sil",
        message: `“${attachment.file_name || "Ek dosya"}” kalıcı olarak silinecek.`,
        confirmLabel: "Eki Sil",
        severity: "error",
        irreversible: true,
      });
      if (!confirmed) {
        return;
      }

      const currentAttachments =
        attachmentPicker?.expenseId === expenseId ? attachmentPicker.attachments : [];
      const nextAttachments = currentAttachments.filter((item) => item.id !== attachment.id);
      setDeletingAttachmentId(attachment.id);
      try {
        await client.delete(`/expenses/${expenseId}/attachments/${attachment.id}`);
        setAttachmentPicker((current) => {
          if (!current || current.expenseId !== expenseId) {
            return current;
          }
          return {
            ...current,
            attachments: current.attachments.filter((item) => item.id !== attachment.id)
          };
        });
        queryClient.setQueriesData<Expense[]>({ queryKey: ["expenses"] }, (oldData) =>
          oldData?.map((expense) => {
            if (expense.id !== expenseId) {
              return expense;
            }
            const nextCount =
              currentAttachments.length > 0
                ? nextAttachments.length
                : Math.max(Number(expense.attachment_count ?? 1) - 1, 0);
            return {
              ...expense,
              attachment_count: nextCount,
              has_attachment: nextCount > 0
            };
          })
        );
        void refetchExpenses();
        setErrorMessage(null);
        setSuccessMessage("Ek silindi.");
      } catch (error) {
        console.error("Expense attachment delete failed", {
          expenseId,
          attachmentId: attachment.id,
          error
        });
        setErrorMessage(resolveApiErrorMessage(error, "Ek silinemedi. Lütfen tekrar deneyin."));
      } finally {
        setDeletingAttachmentId(null);
      }
    },
    [attachmentPicker, client, isViewer, queryClient, refetchExpenses, requestConfirmation, resolveApiErrorMessage]
  );

  const budgetFilterOptions = useMemo(
    () =>
      createFilterOptions<BudgetItem>({
        stringify: (option) => {
          const name = stripBudgetCode(option.name ?? "");
          return `${option.code ?? ""} ${name} ${option.map_category ?? ""} ${option.map_attribute ?? ""}`;
        }
      }),
    []
  );

  const rows = useMemo(() => {
    return safeExpenses.map((expense) => ({
      ...expense,
      budget_item_id: expense?.budget_item_id ?? null,
      saving_amount: savingAmountByExpenseId.get(expense.id) ?? 0
    }));
  }, [safeExpenses, savingAmountByExpenseId]);

  const visibleExpenseRows = useMemo(() => {
    const search = searchText.trim().toLocaleLowerCase("tr-TR");
    return rows.filter((row) => {
      if (selectedExpenseFilter === "ACTIVE" && row.status !== "recorded") return false;
      if (selectedExpenseFilter === "CANCELLED" && row.status !== "cancelled") return false;
      if (
        selectedExpenseFilter === "OUT_OF_BUDGET" &&
        !Boolean(row.is_out_of_budget ?? row.out_of_budget)
      ) {
        return false;
      }
      if (!search) return true;
      return [
        row.budget_code,
        row.budget_name,
        row.budget_outside_title,
        row.department,
        row.budget_outside_department,
        row.vendor,
        row.description,
        row.expense_date,
        row.amount
      ]
        .map((value) => String(value ?? "").toLocaleLowerCase("tr-TR"))
        .some((value) => value.includes(search));
    });
  }, [rows, searchText, selectedExpenseFilter]);

  const budgetItemById = useMemo(() => {
    const map = new Map<number, BudgetItem>();
    (budgetItems ?? []).forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [budgetItems]);

  const getExpenseDisplayValues = useCallback(
    (row?: Expense | null) => {
      const item = row?.budget_item_id ? budgetItemById.get(row.budget_item_id) : null;
      const budgetName =
        row?.budget_name ?? row?.budget_outside_title ?? item?.name ?? row?.budget_code ?? "-";
      const budgetCode = row?.budget_code ?? item?.code ?? undefined;
      const budgetLabel =
        budgetName === "-" ? "-" : formatBudgetItemLabel({ code: budgetCode, name: budgetName });
      const capexOpex =
        row?.map_capex_opex ??
        row?.capex_opex ??
        row?.budget_outside_capex_opex ??
        item?.map_category ??
        "-";
      const nitelik =
        row?.map_nitelik ??
        row?.nitelik ??
        row?.asset_type ??
        row?.budget_outside_asset_type ??
        item?.map_attribute ??
        "-";
      const department = row?.department ?? row?.budget_outside_department ?? "-";
      return { budgetLabel, capexOpex, nitelik, department };
    },
    [budgetItemById]
  );

  const baseColumns = useMemo<GridColDef[]>(() => {
    return [
      {
        field: "expense_date",
        headerName: "Ay / Dönem",
        width: 140,
        valueFormatter: (value) => formatMonthYear(value as string)
      },
      {
        field: "budget_name",
        headerName: "Bütçe Kalemi",
        width: 280,
        minWidth: 260,
        valueGetter: (_value, row) => {
          const r = row as any;
          return getExpenseDisplayValues(r).budgetLabel;
        }
      },
      {
        field: "capex_opex",
        headerName: "Capex/Opex",
        width: 190,
        minWidth: 180,
        valueGetter: (_value, row) => {
          const r = row as any;
          return getExpenseDisplayValues(r).capexOpex;
        }
      },
      {
        field: "asset_type",
        headerName: "Nitelik",
        width: 220,
        minWidth: 200,
        valueGetter: (_value, row) => {
          const r = row as any;
          return getExpenseDisplayValues(r).nitelik;
        }
      },
      {
        field: "department",
        headerName: "Departman",
        width: 210,
        minWidth: 190,
        valueGetter: (_value, row) => {
          const r = row as any;
          return getExpenseDisplayValues(r).department;
        }
      },
      {
        field: "amount",
        headerName: "Tutar",
        width: 140,
        renderCell: ({ row }) => {
          const raw = row.amount;

          let num: number;

          if (typeof raw === "number") {
            num = raw;
          } else if (typeof raw === "string") {
            const parsed = Number(
              raw
                .toString()
                .replace(/\./g, "")
                .replace(",", ".")
            );
            num = Number.isFinite(parsed) ? parsed : 0;
          } else {
            num = 0;
          }

          return formatCurrency(num);
        }
      },
      {
        field: "allocation_count",
        headerName: "Dağıtım",
        width: 160,
        renderCell: ({ row }) => {
          const count = Number(row.allocation_count ?? row.allocations?.length ?? 0);
          const canOpenDistributionDetail =
            count > 0 && !isExpenseExcludedFromBudgetSavings(row);
          const allocations = [...(row.allocations ?? [])].sort(
            (a, b) => a.year - b.year || a.month - b.month
          );
          const tooltipTitle = allocations
            .map((allocation) => {
              const monthLabel = monthOptions[allocation.month - 1] ?? allocation.month;
              return `${allocation.year} ${monthLabel}: ${formatCurrency(
                Number(allocation.allocated_amount ?? 0)
              )}`;
            })
            .join(" | ");
          const chip = (
            <Chip
              size="small"
              label={count > 0 ? `${count} aya dağıtıldı` : "Tek ay"}
              color={count > 0 ? "info" : "default"}
              variant={count > 0 ? "filled" : "outlined"}
              clickable={canOpenDistributionDetail}
              onClick={
                canOpenDistributionDetail
                  ? (event) => {
                      event.stopPropagation();
                      setDistributionDetailExpense(row);
                    }
                  : undefined
              }
            />
          );
          return count > 0 ? (
            <Tooltip title={tooltipTitle}>
              <span>{chip}</span>
            </Tooltip>
          ) : (
            chip
          );
        }
      },
      {
        field: "budget_summary",
        headerName: "Bütçe Özeti",
        width: 230,
        minWidth: 220,
        sortable: false,
        filterable: false,
        valueGetter: (_value, row) => {
          const summary = buildBudgetSummary(row as Expense);
          if (!summary) return "-";
          const resultLabel = summary.isOverrun ? "Aşım" : "Kalan";
          return [
            `Bütçe: ${formatCurrency(summary.budgetTotal)}`,
            `Harcama: ${formatCurrency(summary.spendingTotal)}`,
            `${resultLabel}: ${formatCurrency(Math.abs(summary.result))}`
          ].join(" | ");
        },
        renderCell: ({ row }) => {
          const summary = buildBudgetSummary(row);
          if (!summary) {
            return (
              <Typography variant="body2" color="text.secondary">
                -
              </Typography>
            );
          }
          return (
            <Stack spacing={0.25} sx={{ py: 0.5, lineHeight: 1.2 }}>
              <Typography variant="caption" color="text.secondary">
                Bütçe: {formatCurrency(summary.budgetTotal)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Harcama: {formatCurrency(summary.spendingTotal)}
              </Typography>
              <Typography
                variant="caption"
                fontWeight={700}
                color={summary.isOverrun ? "error.main" : "success.main"}
              >
                {summary.isOverrun ? "Aşım" : "Kalan"}:{" "}
                {formatCurrency(Math.abs(summary.result))}
              </Typography>
            </Stack>
          );
        }
      },
      {
        field: "saving_amount",
        headerName: "Tasarruf",
        width: 130,
        minWidth: 120,
        renderCell: ({ row }) => {
          if (isExpenseExcludedFromBudgetSavings(row)) {
            return (
              <Typography variant="body2" color="text.secondary">
                -
              </Typography>
            );
          }
          const value = Number(row.saving_amount ?? 0);
          return (
            <Typography
              variant="body2"
              color={value < 0 ? "error.main" : "success.main"}
              fontWeight={600}
            >
              {formatCurrency(value)}
            </Typography>
          );
        }
      },
      {
        field: "quantity",
        headerName: "Adet",
        width: 110
      },
      {
        field: "unit_price",
        headerName: "Birim Fiyat",
        width: 140,
        renderCell: ({ row }) => {
          const raw = row.unit_price;
          let num: number;

          if (typeof raw === "number") {
            num = raw;
          } else if (typeof raw === "string") {
            const parsed = Number(
              raw
                .toString()
                .replace(/\./g, "")
                .replace(",", ".")
            );
            num = Number.isFinite(parsed) ? parsed : 0;
          } else {
            num = 0;
          }

          return formatCurrency(num);
        }
      },
      {
        field: "vendor",
        headerName: "Satıcı",
        width: 200,
        renderCell: ({ row }) => renderTextWithTooltip(row.vendor)
      },
      {
        field: "created_by_name",
        headerName: "Kaydı Giren",
        width: 200,
        renderCell: ({ row }) =>
          renderTextWithTooltip(
            row.created_by_username ?? row.created_by_name ?? row.kaydi_giren_kullanici,
            "Bilinmiyor"
          )
      },
      {
        field: "updated_by_name",
        headerName: "Son Güncelleyen",
        width: 200,
        renderCell: ({ row }) =>
          renderTextWithTooltip(row.updated_by_username ?? row.updated_by_name, "Bilinmiyor")
      },
      {
        field: "is_out_of_budget",
        headerName: "Bütçe Dışı",
        width: 140,
        type: "boolean",
        valueGetter: (_value, row) => {
          const r = row as any;
          return Boolean(r?.is_out_of_budget);
        },
        renderCell: ({ row }) =>
          row.is_out_of_budget ? (
            <Chip label="Bütçe Dışı" color="warning" size="small" />
          ) : (
            <Chip label="Plan İçinde" color="primary" variant="outlined" size="small" />
          )
      },
      {
        field: "actions",
        headerName: "İşlemler",
        width: 170,
        minWidth: 170,
        align: "center",
        headerAlign: "center",
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        cellClassName: "sticky-actions-cell",
        headerClassName: "sticky-actions-header",
        renderCell: ({ row }) => {
          const attachmentCount = Number(row.attachment_count ?? 0);
          const hasAttachment = Boolean(row.has_attachment) || attachmentCount > 0;

          return (
            <Stack direction="row" spacing={0.5} justifyContent="center" sx={{ width: "100%" }}>
              <Tooltip title={hasAttachment ? `PDF Ekleri (${attachmentCount || 1})` : "Ek yok"}>
                <span>
                  <IconButton
                    size="small"
                    color="primary"
                    disabled={!hasAttachment}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDownloadAttachment(row.id);
                    }}
                    aria-label="PDF ekleri"
                  >
                    <AttachFileIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              {!isViewer && (
                <>
                  <Tooltip title="Güncelle">
                    <IconButton
                      size="small"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleEdit(row);
                      }}
                      aria-label="Güncelle"
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Sil">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDelete(row.id);
                      }}
                      aria-label="Sil"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Stack>
          );
        }
      }
    ];
  }, [
    getExpenseDisplayValues,
    handleDelete,
    handleDownloadAttachment,
    handleEdit,
    isViewer,
    buildBudgetSummary,
    renderTextWithTooltip
  ]);

  const columns = useMemo<GridColDef[]>(
    () =>
      baseColumns.map((column) => ({
        ...column,
        width: column.width ?? 160,
        resizable: true
      })),
    [baseColumns]
  );

  const unusedBudgetStatus = budgetStatus as UnusedBudgetResponse | undefined;
  const budgetStatusSummary = unusedBudgetStatus?.summary;
  const unusedBudgetItems = unusedBudgetStatus?.unused_items ?? [];
  const negotiatedSavingItems = budgetStatus?.saving_items ?? [];
  const combinedSavingItems = useMemo(
    () => [
      ...negotiatedSavingItems.map((item) => ({
        type: "Pazarlıklı Tasarruf",
        item,
        amount: Number(item.over) || 0,
        unusedAmount: 0
      })),
      ...unusedBudgetItems.map((item) => ({
        type: "Diğer Tasarruf",
        item,
        amount: Number(item.unused_amount ?? 0) || 0,
        unusedAmount: Number(item.unused_amount ?? 0) || 0
      }))
    ],
    [negotiatedSavingItems, unusedBudgetItems]
  );
  const negotiatedSavingTotals = useMemo(
    () =>
      negotiatedSavingItems.reduce(
        (totals, item) => ({
          plan: totals.plan + (Number(item.plan) || 0),
          actual: totals.actual + (Number(item.actual) || 0),
          saving: totals.saving + (Number(item.over) || 0)
        }),
        { plan: 0, actual: 0, saving: 0 }
      ),
    [negotiatedSavingItems]
  );
  const unusedBudgetTotals = useMemo(
    () =>
      unusedBudgetItems.reduce(
        (totals, item) => ({
          plan: totals.plan + (Number(item.plan) || 0),
          unused: totals.unused + (Number(item.unused_amount ?? 0) || 0),
          available: totals.available + (Number(item.available_amount ?? 0) || 0)
        }),
        { plan: 0, unused: 0, available: 0 }
      ),
    [unusedBudgetItems]
  );
  const formattedValidActual = formatCurrency(
    budgetStatusSummary?.total_valid_actual ?? activeTotal
  );
  const formattedRemaining = formatCurrency(budgetStatusSummary?.remaining_total ?? 0);
  const negotiatedSavingTotal =
    budgetStatusSummary?.negotiated_saving_total ?? budgetStatusSummary?.saving_total ?? 0;
  const otherSavingTotal =
    budgetStatusSummary?.other_saving_total ?? budgetStatusSummary?.unused_total ?? 0;
  const combinedSavingTotal =
    budgetStatusSummary?.total_saving_total ?? negotiatedSavingTotal + otherSavingTotal;
  const formattedNegotiatedSaving = formatCurrency(negotiatedSavingTotal);
  const formattedOtherSaving = formatCurrency(otherSavingTotal);
  const formattedCombinedSaving = formatCurrency(combinedSavingTotal);
  const formattedOverrun = formatCurrency(budgetStatusSummary?.over_total ?? 0);
  const formattedOutOfBudget = formatCurrency(outOfBudgetTotal);
  const formattedCanceled = formatCurrency(cancelledTotal);

  const realizedDetailItems = safeExpenses.filter(
    (expense) => expense.status === "recorded" && !expense.is_out_of_budget
  );
  const cancelledDetailItems = safeExpenses.filter((expense) => expense.status === "cancelled");
  const formatExpensePeriod = (expense: Expense) => {
    const rawDate = expense.expense_date ?? expense.date ?? "";
    if (!rawDate) return "-";
    const parsed = dayjs(rawDate);
    if (!parsed.isValid()) return "-";
    return monthOptions[parsed.month()] ?? "-";
  };
  const formatExpenseOwner = (expense: Expense) =>
    expense.created_by_name || expense.created_by_username || expense.kaydi_giren_kullanici || "-";
  const selectedMonthsLabel =
    selectedMonthList.length > 0
      ? selectedMonthList.map((monthValue) => monthOptions[monthValue - 1] ?? `Ay ${monthValue}`).join(", ")
      : "Tüm Aylar";

  const expenseExportFilterParts = useMemo(() => {
    const monthPart =
      selectedMonthList.length > 0
        ? selectedMonthList
            .map((monthValue) => monthOptions[monthValue - 1] ?? `Ay ${monthValue}`)
            .join("_")
        : null;
    return [monthPart, year || currentYear];
  }, [currentYear, selectedMonthList, year]);

  const buildExpenseExportFileName = (detailName: string) =>
    buildExcelFileName("harcama_yonetimi", detailName, ...expenseExportFilterParts);

  const buildExpenseExportRows = (items: Expense[]) =>
    items.map((expense) => ({
      Tarih: expense.expense_date ? dayjs(expense.expense_date).format("DD.MM.YYYY") : "-",
      "Bütçe Kalemi": formatBudgetItemLabel({
        code: expense.budget_code ?? "",
        name: expense.budget_name ?? ""
      }),
      "Ay / Dönem": formatExpensePeriod(expense),
      Departman: expense.department || "-",
      "Capex/Opex": expense.capex_opex ?? expense.map_capex_opex ?? "-",
      Nitelik: expense.asset_type ?? expense.map_nitelik ?? expense.nitelik ?? "-",
      Tutar: Number(expense.amount) || 0,
      Açıklama: expense.description || "-",
      Satıcı: expense.vendor || "-",
      "Kaydı Giren": formatExpenseOwner(expense),
      Durum: expense.status === "cancelled" ? "İptal" : "Kaydedildi"
    }));

  const expenseDetailItems =
    expenseDetailDialog === "out_of_budget"
      ? outOfBudgetExpenses
      : expenseDetailDialog === "cancelled"
        ? cancelledDetailItems
        : realizedDetailItems;
  const expenseDetailTotal = useMemo(
    () => expenseDetailItems.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0),
    [expenseDetailItems]
  );
  const expenseDetailPlanTotal = useMemo(
    () => sumUniqueExpensePlanScopes(expenseDetailItems),
    [expenseDetailItems]
  );

  const expenseDetailTitle =
    expenseDetailDialog === "out_of_budget"
      ? "Bütçe Dışı Harcamalar"
      : expenseDetailDialog === "cancelled"
        ? "İptal Edilen Harcamalar"
        : "Gerçekleşen Harcamalar";
  const expenseDetailSummaryItems: DetailSummaryItem[] =
    expenseDetailDialog === "out_of_budget"
      ? [
          {
            label: "Toplam Bütçe Dışı Harcama",
            value: formatCurrency(expenseDetailTotal),
            color: "warning.main"
          },
          { label: "Kayıt Sayısı", value: String(expenseDetailItems.length) },
          { label: "Seçili Ay/Dönem", value: selectedMonthsLabel },
          { label: "Departman", value: "Tümü" }
        ]
      : expenseDetailDialog === "cancelled"
        ? [
            {
              label: "Toplam İptal Tutar",
              value: formatCurrency(expenseDetailTotal),
              color: "error.main"
            },
            { label: "Kayıt Sayısı", value: String(expenseDetailItems.length) },
            { label: "Seçili Ay/Dönem", value: selectedMonthsLabel },
            { label: "Açıklama", value: "İptal edilmiş harcamalar" }
          ]
        : [
            { label: "Toplam Bütçe", value: formatCurrency(expenseDetailPlanTotal) },
            {
              label: "Toplam Gerçekleşen Harcama",
              value: formatCurrency(expenseDetailTotal),
              color: "primary.main"
            },
            { label: "Kayıt Sayısı", value: String(expenseDetailItems.length) },
            { label: "Bütçe Dışı", value: "Hariç" }
          ];

  const handleExportExpenseDetail = () => {
    const detailName =
      expenseDetailDialog === "out_of_budget"
        ? "butce_disi_detayi"
        : expenseDetailDialog === "cancelled"
          ? "iptal_detayi"
          : "gerceklesen_detayi";
    exportRowsToExcel(
      buildExpenseExportRows(expenseDetailItems),
      buildExpenseExportFileName(detailName),
      expenseDetailTitle,
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
      "Toplam Bütçe": Number(item.plan) || 0,
      Harcama: Number(item.actual) || 0,
      Kullanılmayacak: Number(item.unused_amount ?? 0),
      "Kalan Kullanılabilir": Number(item.available_amount ?? 0),
      Sebep: formatUnusedReason(item.reason),
      Not: item.note || "",
      "Güncelleme Tarihi": item.unused_updated_at
        ? new Date(item.unused_updated_at).toLocaleString("tr-TR")
        : "-"
    }));

  const handleExportUnusedBudget = () => {
    exportRowsToExcel(
      buildUnusedBudgetExportRows(unusedBudgetItems),
      buildExpenseExportFileName("kullanilmayacak_butce_detayi"),
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
      "Toplam Bütçe": Number(item.plan) || 0,
      "Gerçekleşen Harcama": Number(item.actual) || 0,
      "Pazarlıklı Tasarruf": Number(item.over) || 0
    }));

  const handleExportNegotiatedSaving = () => {
    exportRowsToExcel(
      buildNegotiatedSavingExportRows(negotiatedSavingItems),
      buildExpenseExportFileName("pazarlikli_tasarruf_detayi"),
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
      "Toplam Bütçe": Number(item.plan) || 0,
      "Gerçekleşen Harcama": type === "Pazarlıklı Tasarruf" ? Number(item.actual) || 0 : "-",
      "Kullanılmayacak Tutar": unusedAmount > 0 ? unusedAmount : "-",
      Tasarruf: amount
    }));

  const handleExportCombinedSaving = () => {
    exportRowsToExcel(
      buildCombinedSavingExportRows(combinedSavingItems),
      buildExpenseExportFileName("toplam_tasarruf_detayi"),
      "Toplam Tasarruf",
      ["Toplam Bütçe", "Gerçekleşen Harcama", "Kullanılmayacak Tutar", "Tasarruf"]
    );
  };

  const handleResetFilters = () => {
    setYear(currentYear);
    setScenarioId(null);
    setBudgetItemId(null);
    setSelectedMonths([]);
    setStartDate("");
    setEndDate("");
    setCapexOpex("");
    setStatusFilter("ACTIVE");
    setSelectedExpenseFilter("ALL");
    setSearchText("");
    setFilterModel({ items: [], quickFilterValues: [] });
    setSortModel([]);
    setTimeout(() => {
      refetchExpenses();
    }, 0);
  };

  const statusOptions = [
    { value: "ACTIVE", label: "Aktif" },
    { value: "CANCELLED", label: "İptal" },
    { value: "OUT_OF_BUDGET", label: "Bütçe Dışı" },
    { value: "MINE", label: "Sadece Benim" },
    { value: "TODAY", label: "Bugün" },
    { value: "ALL", label: "Tümü" }
  ] as const;

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSearchText(value);
    setFilterModel((prev) => ({
      ...prev,
      quickFilterValues: value ? [value] : []
    }));
  };

  const menuOpen = Boolean(menuAnchorEl);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
  };

  const handleExportCsv = () => {
    apiRef.current.exportDataAsCsv?.();
    handleMenuClose();
  };

  const handleExportXlsx = () => {
    (apiRef.current as { exportDataAsExcel?: () => void }).exportDataAsExcel?.();
    handleMenuClose();
  };

  const handleShowColumns = () => {
    (apiRef.current as { showPreferences?: (panel?: string) => void }).showPreferences?.("columns");
    handleMenuClose();
  };

  const summaryCards = [
    {
      key: "REALIZED",
      title: "Gerçekleşen",
      value: formattedValidActual,
      subtitle: "Toplam geçerli harcama",
      icon: <CheckCircleOutlineOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
      iconColor: "primary.main",
      selected: statusFilter === "ACTIVE",
      onClick: () => {
        setSavingDetailDialog(null);
        setIsUnusedBudgetDialogOpen(false);
        setBudgetStatusDialogCategory(null);
        setStatusFilter("ACTIVE");
        setSelectedExpenseFilter("ALL");
        setExpenseDetailDialog("realized");
      }
    },
    {
      key: "REMAINING",
      title: "Kalan Bütçe",
      value: formattedRemaining,
      subtitle: `${budgetStatusSummary?.remaining_item_count ?? 0} kalemde harcama yok`,
      icon: <CheckCircleOutlineOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
      iconColor: "warning.main",
      selected: budgetStatusDialogCategory === "remaining",
      onClick: () => {
        setSavingDetailDialog(null);
        setIsUnusedBudgetDialogOpen(false);
        setBudgetStatusDialogCategory("remaining");
      }
    },
    {
      key: "OTHER_SAVING",
      title: "Diğer Tasarruf",
      value: formattedOtherSaving,
      subtitle: `${budgetStatusSummary?.other_saving_item_count ?? budgetStatusSummary?.unused_item_count ?? 0} kullanılmayacak kayıt`,
      icon: <ReportGmailerrorredOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
      iconColor: "warning.dark",
      selected: isUnusedBudgetDialogOpen,
      onClick: () => {
        setBudgetStatusDialogCategory(null);
        setSavingDetailDialog(null);
        setIsUnusedBudgetDialogOpen(true);
      }
    },
    {
      key: "NEGOTIATED_SAVING",
      title: "Pazarlıklı Tasarruf",
      value: formattedNegotiatedSaving,
      subtitle: `${budgetStatusSummary?.negotiated_saving_item_count ?? budgetStatusSummary?.saving_item_count ?? 0} kalemde pazarlıklı tasarruf`,
      icon: <CheckCircleOutlineOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
      iconColor: "success.main",
      selected: savingDetailDialog === "negotiated",
      onClick: () => {
        setBudgetStatusDialogCategory(null);
        setIsUnusedBudgetDialogOpen(false);
        setSavingDetailDialog("negotiated");
      }
    },
    {
      key: "TOTAL_SAVING",
      title: "Toplam Tasarruf",
      value: formattedCombinedSaving,
      subtitle: "Pazarlıklı + Diğer Tasarruf",
      icon: <CheckCircleOutlineOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
      iconColor: "success.dark",
      selected: savingDetailDialog === "total",
      onClick: () => {
        setBudgetStatusDialogCategory(null);
        setIsUnusedBudgetDialogOpen(false);
        setSavingDetailDialog("total");
      }
    },
    {
      key: "OVER_BUDGET",
      title: "Aşım",
      value: formattedOverrun,
      subtitle: `${budgetStatusSummary?.over_item_count ?? 0} kalemde aşım`,
      icon: <ReportGmailerrorredOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
      iconColor: "error.main",
      selected: budgetStatusDialogCategory === "overrun",
      onClick: () => {
        setSavingDetailDialog(null);
        setIsUnusedBudgetDialogOpen(false);
        setBudgetStatusDialogCategory("overrun");
      }
    },
    {
      key: "OUT_OF_BUDGET",
      title: "Bütçe Dışı",
      value: formattedOutOfBudget,
      subtitle: `${outOfBudgetExpenses.length} bütçe dışı harcama`,
      icon: <ReportGmailerrorredOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
      iconColor: "warning.main",
      selected: statusFilter === "OUT_OF_BUDGET",
      onClick: () => {
        setSavingDetailDialog(null);
        setIsUnusedBudgetDialogOpen(false);
        setBudgetStatusDialogCategory(null);
        setStatusFilter("OUT_OF_BUDGET");
        setSelectedExpenseFilter("OUT_OF_BUDGET");
        setExpenseDetailDialog("out_of_budget");
      }
    },
    {
      key: "CANCELLED",
      title: "İptal",
      value: formattedCanceled,
      subtitle: "İptal edilenler",
      icon: <CancelOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
      iconColor: "error.main",
      selected: statusFilter === "CANCELLED",
      onClick: () => {
        setSavingDetailDialog(null);
        setIsUnusedBudgetDialogOpen(false);
        setBudgetStatusDialogCategory(null);
        setStatusFilter("CANCELLED");
        setSelectedExpenseFilter("CANCELLED");
        setExpenseDetailDialog("cancelled");
      }
    }
  ];

  const selectedExpenseDisplayValues = getExpenseDisplayValues(selectedExpenseDetail);
  const selectedExpenseAttachmentCount = Number(selectedExpenseDetail?.attachment_count ?? 0);
  const selectedExpenseHasAttachment =
    Boolean(selectedExpenseDetail?.has_attachment) || selectedExpenseAttachmentCount > 0;
  const selectedExpenseBudgetSummary = buildBudgetSummary(selectedExpenseDetail);

  return (
    <ExpensesErrorBoundary>
      <Stack
        spacing={3}
        sx={{
          width: "100%",
          minWidth: 0,
          maxWidth: "100%"
        }}
      >
        {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
        <Snackbar
          open={listErrorToastOpen}
          autoHideDuration={6000}
          onClose={() => setListErrorToastOpen(false)}
          anchorOrigin={{ vertical: "top", horizontal: "center" }}
        >
          <Alert
            severity="error"
            onClose={() => setListErrorToastOpen(false)}
            sx={{ width: "100%" }}
          >
            Liste yüklenemedi.
          </Alert>
        </Snackbar>
        <Snackbar
          open={Boolean(successMessage)}
          autoHideDuration={4000}
          onClose={() => setSuccessMessage(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        >
          <Alert severity="success" onClose={() => setSuccessMessage(null)} sx={{ width: "100%" }}>
            {successMessage}
          </Alert>
        </Snackbar>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          {summaryCards.map((card) => {
            const isSelected = card.selected;
            return (
              <Grid item xs={12} sm={6} md={3} key={card.key}>
                <Card
                  variant="outlined"
                  sx={{
                    borderColor: isSelected ? "primary.main" : "divider",
                    boxShadow: isSelected ? 3 : 0,
                    transition: "box-shadow 0.2s ease, border-color 0.2s ease",
                  }}
                >
                  <CardActionArea
                    onClick={card.onClick}
                    disabled={!card.onClick}
                    sx={{
                      height: "100%",
                      "&.Mui-disabled": { opacity: 1 }
                    }}
                  >
                    <CardContent sx={{ position: "relative", minHeight: 120 }}>
                      <Typography variant="subtitle2" color="text.secondary">
                        {card.title}
                      </Typography>
                      <Typography variant="h5" sx={{ mt: 0.5 }}>
                        {isBudgetStatusFetching &&
                        [
                          "REALIZED",
                          "REMAINING",
                          "OTHER_SAVING",
                          "NEGOTIATED_SAVING",
                          "TOTAL_SAVING",
                          "OVER_BUDGET"
                        ].includes(card.key)
                          ? "..."
                          : card.value}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {card.subtitle}
                      </Typography>
                      <Box sx={{ position: "absolute", top: 12, right: 12 }}>
                        <Box
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: "50%",
                            bgcolor: card.iconColor,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                          }}
                        >
                          {card.icon}
                        </Box>
                      </Box>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            );
          })}
      </Grid>

      {!isViewer && (
        <Card>
          <CardContent>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              alignItems={{ xs: "stretch", sm: "center" }}
              justifyContent="space-between"
            >
              <Typography variant="h6" fontWeight={700}>
                Harcama Ekle
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleCreate}
                sx={{ alignSelf: { xs: "flex-start", sm: "center" }, height: 40 }}
              >
                Harcama Ekle
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Card ref={tableRef}>
        <CardContent
          sx={{
            flexGrow: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            overflow: "visible"
          }}
        >
          <Box sx={{ mb: 3 }}>
            <Box
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 2,
                px: 2,
                py: 2
              }}
            >
              <Stack
                direction={{ xs: "column", lg: "row" }}
                spacing={1.5}
                alignItems={{ xs: "stretch", lg: "center" }}
              >
                <Box
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 1.5,
                    flex: 1,
                    minWidth: 0,
                    "& > .MuiFormControl-root, & > .MuiAutocomplete-root": {
                      flex: { xs: "1 1 100%", sm: "1 1 180px" },
                      minWidth: { xs: "100%", sm: 160 }
                    },
                    "& .MuiInputBase-root": { height: 40 },
                    "& .MuiOutlinedInput-input": { padding: "10px 12px" },
                    "& .MuiButton-root": { height: 40 }
                  }}
                >
                  <TextField
                    select
                    label="Durum"
                    size="small"
                    value={statusFilter}
                    onChange={(event) => {
                      const nextStatus = event.target.value as ExpenseStatusFilter;
                      setStatusFilter(nextStatus);
                      if (nextStatus === "OUT_OF_BUDGET") {
                        setSelectedExpenseFilter("OUT_OF_BUDGET");
                      } else if (selectedExpenseFilter === "OUT_OF_BUDGET") {
                        setSelectedExpenseFilter("ALL");
                      }
                    }}
                    sx={{ minWidth: 200 }}
                  >
                    {statusOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Başlangıç Tarihi"
                    type="date"
                    size="small"
                    value={startDate}
                    onChange={(event) => {
                      setSelectedMonths([]);
                      setStartDate(event.target.value);
                    }}
                    InputLabelProps={{ shrink: true }}
                    sx={{ minWidth: 170 }}
                  />
                  <TextField
                    label="Bitiş Tarihi"
                    type="date"
                    size="small"
                    value={endDate}
                    onChange={(event) => {
                      setSelectedMonths([]);
                      setEndDate(event.target.value);
                    }}
                    InputLabelProps={{ shrink: true }}
                    sx={{ minWidth: 170 }}
                  />
                  <Autocomplete
                    ref={monthFilterRef}
                    multiple
                    disableCloseOnSelect
                    blurOnSelect={false}
                    open={monthFilterOpen}
                    onOpen={() => setMonthFilterOpen(true)}
                    onClose={(_, reason) => {
                      if (reason === "selectOption" || reason === "removeOption") {
                        return;
                      }
                      setMonthFilterOpen(false);
                    }}
                    size="small"
                    options={monthOptions.map((label, index) => ({
                      value: index + 1,
                      label
                    }))}
                    value={monthOptions
                      .map((label, index) => ({ value: index + 1, label }))
                      .filter((option) => selectedMonthList.includes(option.value))}
                    onChange={(_, value) => {
                      setStartDate("");
                      setEndDate("");
                      setSelectedMonths(value.map((option) => option.value));
                    }}
                    getOptionLabel={(option) => option.label}
                    isOptionEqualToValue={(option, value) => option.value === value.value}
                    ListboxProps={{ id: expensesMonthListboxId }}
                    sx={{ minWidth: 260 }}
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
                  <Autocomplete
                    size="small"
                    options={budgetItems ?? []}
                    value={budgetItems?.find((item) => item.id === budgetItemId) ?? null}
                    onChange={(_, value) => setBudgetItemId(value?.id ?? null)}
                    getOptionLabel={(option) => formatBudgetItemLabel(option) || "-"}
                    filterOptions={budgetFilterOptions}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    sx={{ minWidth: 320, flex: 1 }}
                    renderInput={(params) => (
                      <TextField {...params} label="Bütçe Kalemi" placeholder="Tümü" size="small" />
                    )}
                  />
                  <TextField
                    select
                    label="Capex/Opex"
                    size="small"
                    value={capexOpex}
                    onChange={(event) => setCapexOpex(event.target.value as "" | "capex" | "opex")}
                    sx={{ minWidth: 170 }}
                  >
                    <MenuItem value="">Tümü</MenuItem>
                    <MenuItem value="capex">Capex</MenuItem>
                    <MenuItem value="opex">Opex</MenuItem>
                  </TextField>
                  <TextField
                    label="Yıl"
                    type="number"
                    size="small"
                    value={year}
                    onChange={(event) => setYear(event.target.value ? Number(event.target.value) : "")}
                    sx={{ minWidth: 110 }}
                  />
                  <TextField
                    select
                    label="Senaryo"
                    size="small"
                    value={scenarioId ?? ""}
                    onChange={(event) =>
                      setScenarioId(event.target.value ? Number(event.target.value) : null)
                    }
                    sx={{ minWidth: 220 }}
                  >
                    <MenuItem value="">Tümü</MenuItem>
                    {scenarios?.map((scenario) => (
                      <MenuItem key={scenario.id} value={scenario.id}>
                        {scenario.name} ({scenario.year})
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    size="small"
                    label="Ara"
                    value={searchText}
                    onChange={handleSearchChange}
                    sx={{ minWidth: 200 }}
                  />
                </Box>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  justifyContent={{ xs: "flex-start", sm: "flex-end", lg: "flex-start" }}
                  flexWrap="wrap"
                  sx={{
                    flexShrink: 0,
                    ml: { lg: "auto" },
                    rowGap: 1,
                    "& .MuiButton-root": { height: 40, whiteSpace: "nowrap" }
                  }}
                >
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => refetchExpenses()}
                    sx={{ height: 40 }}
                  >
                    Yenile
                  </Button>
                  <IconButton
                    size="small"
                    onClick={handleMenuOpen}
                    aria-label="Daha Fazla"
                    sx={{ height: 40, width: 40 }}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                  <Button
                    variant="text"
                    color="inherit"
                    size="small"
                    onClick={handleResetFilters}
                    sx={{ height: 40 }}
                  >
                    Sıfırla
                  </Button>
                </Stack>
              </Stack>
            </Box>
          </Box>

          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Harcamalar
          </Typography>
          <Menu
            anchorEl={menuAnchorEl}
            open={menuOpen}
            onClose={handleMenuClose}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
          >
            <MenuItem onClick={handleExportCsv}>Dışa Aktar (CSV)</MenuItem>
            <MenuItem onClick={handleExportXlsx}>Dışa Aktar (XLSX)</MenuItem>
            <MenuItem onClick={handleShowColumns}>Kolon Seçimi</MenuItem>
          </Menu>
          <Box
            sx={{
              width: "100%",
              minHeight: 640,
              height: { xs: 640, md: "calc(100vh - 360px)" },
              maxHeight: 920,
              overflow: "auto",
              borderRadius: 2,
            }}
          >
            {showListLoadError ? (
              <Alert severity="error">Liste yüklenemedi.</Alert>
            ) : (
              <DataGrid
                apiRef={apiRef}
                rows={rows ?? []}
                columns={columns}
                getRowId={(row) => row.id ?? `${row.budget_item_id}-${row.expense_date}-${row.amount}`}
                slots={{ toolbar: null }}
                paginationModel={paginationModel}
                onPaginationModelChange={setPaginationModel}
                filterModel={combinedFilterModel}
                onFilterModelChange={handleFilterModelChange}
                sortingMode="client"
                sortModel={sortModel}
                onSortModelChange={setSortModel}
                onRowClick={(params) => setSelectedExpenseDetail(params.row as Expense)}
                disableRowSelectionOnClick
                pageSizeOptions={[50, 100, 200]}
                initialState={{
                  pagination: {
                    paginationModel: { pageSize: 50 }
                  },
                  columns: {
                    columnVisibilityModel,
                  },
                }}
                processRowUpdate={(updatedRow, originalRow) =>
                  handleRowUpdate(updatedRow, originalRow)
                }
                getRowHeight={() => "auto"}
                getEstimatedRowHeight={() => 64}
                sx={{
                  minWidth: 2320,
                  border: 0,
                  "& .MuiDataGrid-main": {
                    minWidth: 2320,
                  },
                  "& .MuiDataGrid-virtualScroller": {
                    overflowX: "auto",
                  },
                  "& .MuiDataGrid-cell": {
                    py: 1.25,
                    display: "flex",
                    alignItems: "center",
                    lineHeight: 1.35,
                  },
                  "& .MuiDataGrid-cellContent": {
                    whiteSpace: "normal",
                    lineHeight: 1.35,
                  },
                  "& .MuiDataGrid-columnHeaders": {
                    bgcolor: (theme) => `${theme.palette.background.paper}`,
                  },
                  "& .sticky-actions-cell, & .sticky-actions-header": {
                    position: "sticky",
                    right: 0,
                    zIndex: 2,
                    backgroundColor: "background.paper",
                    overflow: "visible",
                    boxShadow: "-8px 0 12px -12px rgba(15, 23, 42, 0.45)"
                  },
                  "& .sticky-actions-header": {
                    zIndex: 3
                  },
                }}
              />
            )}
          </Box>
          {!showListLoadError && (
            <Box sx={{ mt: 1.5, display: "flex", justifyContent: "flex-end" }}>
              <Typography variant="subtitle2" fontWeight={800}>
                Toplam Tasarruf: {formattedCombinedSaving}
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selectedExpenseDetail)}
        onClose={() => setSelectedExpenseDetail(null)}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle>Harcama Detayı</DialogTitle>
        <DialogContent dividers>
          {selectedExpenseDetail && (
            <Stack spacing={2}>
              <DetailSummaryGrid
                items={[
                  {
                    label: "Ay / Dönem",
                    value: formatMonthYear(selectedExpenseDetail.expense_date ?? selectedExpenseDetail.date)
                  },
                  {
                    label: "Tutar",
                    value: formatCurrency(Number(selectedExpenseDetail.amount) || 0),
                    color: "primary.main"
                  },
                  {
                    label: "Bütçe",
                    value: selectedExpenseBudgetSummary
                      ? formatCurrency(selectedExpenseBudgetSummary.budgetTotal)
                      : "-"
                  },
                  {
                    label: "Kalan",
                    value: selectedExpenseBudgetSummary
                      ? formatCurrency(Math.max(selectedExpenseBudgetSummary.result, 0))
                      : "-",
                    color: "success.main"
                  },
                  {
                    label: "Tasarruf",
                    value: formatCurrency(Number(selectedExpenseDetail.saving_amount ?? 0) || 0),
                    color: "success.main"
                  }
                ]}
              />
              <DetailTableWrap>
                <Table size="small">
                  <TableBody>
                    {[
                      ["Bütçe Kalemi", selectedExpenseDisplayValues.budgetLabel],
                      [
                        "Senaryo",
                        selectedExpenseDetail.scenario_name ??
                          (selectedExpenseDetail.scenario_id ? String(selectedExpenseDetail.scenario_id) : "-")
                      ],
                      ["Departman", selectedExpenseDisplayValues.department],
                      ["Capex/Opex", selectedExpenseDisplayValues.capexOpex],
                      ["Nitelik", selectedExpenseDisplayValues.nitelik],
                      [
                        "Tam Tarih",
                        selectedExpenseDetail.expense_date
                          ? dayjs(selectedExpenseDetail.expense_date).format("DD.MM.YYYY")
                          : "-"
                      ],
                      ["Adet", String(selectedExpenseDetail.quantity ?? "-")],
                      ["Birim Fiyat", formatCurrency(Number(selectedExpenseDetail.unit_price) || 0)],
                      [
                        "Toplam Tutar",
                        formatCurrency(Number(selectedExpenseDetail.amount) || 0)
                      ],
                      [
                        "Bütçe",
                        selectedExpenseBudgetSummary
                          ? formatCurrency(selectedExpenseBudgetSummary.budgetTotal)
                          : "-"
                      ],
                      [
                        "Harcama",
                        selectedExpenseBudgetSummary
                          ? formatCurrency(selectedExpenseBudgetSummary.spendingTotal)
                          : formatCurrency(Number(selectedExpenseDetail.amount) || 0)
                      ],
                      [
                        "Kalan",
                        selectedExpenseBudgetSummary && !selectedExpenseBudgetSummary.isOverrun
                          ? formatCurrency(Math.max(selectedExpenseBudgetSummary.result, 0))
                          : "-"
                      ],
                      [
                        "Aşım",
                        selectedExpenseBudgetSummary?.isOverrun
                          ? formatCurrency(Math.abs(selectedExpenseBudgetSummary.result))
                          : "-"
                      ],
                      [
                        "Kullanılmayacak",
                        Number(selectedExpenseDetail.unused_amount ?? 0) > 0
                          ? formatCurrency(Number(selectedExpenseDetail.unused_amount ?? 0))
                          : "-"
                      ],
                      ["Satıcı", selectedExpenseDetail.vendor || "-"],
                      ["Açıklama", selectedExpenseDetail.description || "-"],
                      ["Bütçe Dışı", selectedExpenseDetail.is_out_of_budget ? "Evet" : "Hayır"],
                      [
                        "Dağıtım",
                        (selectedExpenseDetail.allocations?.length ?? 0) > 0
                          ? `${selectedExpenseDetail.allocations?.length} ay`
                          : "Tek ay"
                      ],
                      ["Kaydı Giren", formatExpenseOwner(selectedExpenseDetail)],
                      [
                        "Son Güncelleyen",
                        selectedExpenseDetail.updated_by_username ?? selectedExpenseDetail.updated_by_name ?? "-"
                      ],
                      [
                        "Ek Sayısı",
                        selectedExpenseHasAttachment ? String(selectedExpenseAttachmentCount || 1) : "Ek yok"
                      ]
                    ].map(([label, value]) => (
                      <TableRow key={String(label)}>
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
          <Button
            variant="outlined"
            startIcon={<AttachFileIcon />}
            disabled={!selectedExpenseDetail || !selectedExpenseHasAttachment}
            onClick={() => {
              if (selectedExpenseDetail) {
                void handleDownloadAttachment(selectedExpenseDetail.id);
              }
            }}
          >
            PDF Ekleri
          </Button>
          <Button onClick={() => setSelectedExpenseDetail(null)}>Kapat</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{editingExpense ? "Harcamayı Güncelle" : "Yeni Harcama"}</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent sx={{ pt: 2 }}>
            <Stack spacing={2.5}>
              {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <Autocomplete
                    options={budgetItems ?? []}
                    value={selectedFormBudgetItem}
                    onChange={(_, value) => setFormBudgetItemId(value?.id ?? null)}
                    getOptionLabel={(option) => formatBudgetItemLabel(option) || "-"}
                    filterOptions={budgetFilterOptions}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    disabled={formIsOutOfBudget}
                    renderInput={(params) => (
                      <TextField {...params} label="Bütçe Kalemi" required={!formIsOutOfBudget} fullWidth />
                    )}
                  />
                </Grid>
                {formIsOutOfBudget && (
                  <Grid item xs={12} md={8}>
                    <TextField
                      label="Bütçe Dışı Harcama Başlığı"
                      name="budget_outside_title"
                      value={formBudgetOutsideTitle}
                      onChange={(event) => setFormBudgetOutsideTitle(event.target.value)}
                      required
                      fullWidth
                    />
                  </Grid>
                )}
                <Grid item xs={12} md={4}>
                  <TextField
                    select
                    label="Senaryo"
                    name="scenario_id"
                    value={formScenarioId}
                    onChange={(event) =>
                      setFormScenarioId(event.target.value ? Number(event.target.value) : "")
                    }
                    fullWidth
                    required
                  >
                    {scenarios?.map((scenario) => (
                      <MenuItem key={scenario.id} value={scenario.id}>
                        {scenario.name} ({scenario.year})
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Tarih"
                    name="expense_date"
                    type="date"
                    value={formExpenseDate}
                    onChange={(event) => setFormExpenseDate(event.target.value)}
                    InputLabelProps={{ shrink: true }}
                    required
                    fullWidth
                  />
                </Grid>
                {formIsOutOfBudget && (
                  <>
                    <Grid item xs={12} md={4}>
                      <TextField
                        label="Departman"
                        name="budget_outside_department"
                        value={formBudgetOutsideDepartment}
                        onChange={(event) => setFormBudgetOutsideDepartment(event.target.value)}
                        fullWidth
                      />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField
                        select
                        label="Capex/Opex"
                        name="budget_outside_capex_opex"
                        value={formBudgetOutsideCapexOpex}
                        onChange={(event) => setFormBudgetOutsideCapexOpex(event.target.value)}
                        fullWidth
                      >
                        <MenuItem value="">-</MenuItem>
                        <MenuItem value="capex">Capex</MenuItem>
                        <MenuItem value="opex">Opex</MenuItem>
                      </TextField>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField
                        label="Nitelik"
                        name="budget_outside_asset_type"
                        value={formBudgetOutsideAssetType}
                        onChange={(event) => setFormBudgetOutsideAssetType(event.target.value)}
                        fullWidth
                      />
                    </Grid>
                  </>
                )}
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Adet"
                    name="quantity"
                    type="text"
                    inputProps={{ inputMode: "decimal" }}
                    value={formQuantity}
                    onChange={(event) => setFormQuantity(event.target.value)}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Birim Fiyat"
                    name="unit_price"
                    type="text"
                    inputProps={{ inputMode: "decimal" }}
                    value={formUnitPrice}
                    onChange={(event) => setFormUnitPrice(event.target.value)}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Toplam Tutar"
                    value={totalAmount.toFixed(2)}
                    type="number"
                    InputProps={{ readOnly: true }}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    select
                    label="Bütçeye Dağıtım Şekli"
                    value={allocationMode}
                    onChange={(event) =>
                      setAllocationMode(event.target.value as "single" | "planned_months")
                    }
                    disabled={isUnusedBudgetMode || formIsOutOfBudget}
                    fullWidth
                  >
                    <MenuItem value="single">Tek aya işle</MenuItem>
                    <MenuItem value="planned_months">Planlanan aylara böl</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} md={8}>
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ minHeight: 48 }}>
                      <Switch
                        checked={isUnusedBudgetMode}
                        disabled={Boolean(editingExpense)}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          if (checked) {
                            const parsedDate = dayjs(formExpenseDate);
                            const selectedMonth = parsedDate.isValid() ? parsedDate.month() + 1 : 0;
                            const selectedPlan = expensePlanOptions.find(
                              (item) =>
                                item.month === selectedMonth &&
                                item.budget_item_id === formBudgetItemId &&
                                item.scenario_id === Number(formScenarioId)
                            );
                            if (!selectedPlan) {
                              setErrorMessage("Seçili bütçe kalemi, ay ve senaryo için plan bulunamadı.");
                              return;
                            }
                            setUnusedDialogPlanId(selectedPlan.id);
                            return;
                          }
                          setIsUnusedBudgetMode(checked);
                        }}
                      />
                      <Typography variant="body2">Kullanılmayacak</Typography>
                    </Stack>
                    {isUnusedBudgetMode && (
                      <Alert severity="info">
                        Bu tutar normal harcama olarak kaydedilmez; seçili ayın kullanılmayacak bütçesine eklenir.
                      </Alert>
                    )}
                  </Stack>
                </Grid>
                {allocationMode === "planned_months" && (
                  <>
                    <Grid item xs={12}>
                      <Typography variant="caption" color="text.secondary">
                        Örnek: 150.000 tutarı 3 aya eşit dağıtılırsa her aya 50.000 yansır.
                        Ana fatura toplamı 150.000 olarak kalır.
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField
                        select
                        label="Başlangıç ayı"
                        value={allocationStartMonth}
                        onChange={(event) => setAllocationStartMonth(Number(event.target.value))}
                        fullWidth
                        required
                      >
                        {monthOptions.map((label, index) => (
                          <MenuItem key={label} value={index + 1}>
                            {label}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField
                        label="Dağıtılacak ay sayısı"
                        type="number"
                        inputProps={{ min: 1, max: 12 }}
                        value={allocationMonthCount}
                        onChange={(event) => setAllocationMonthCount(event.target.value)}
                        fullWidth
                        required
                      />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField
                        select
                        label="Dağıtım yöntemi"
                        value={allocationMethod}
                        onChange={(event) =>
                          setAllocationMethod(event.target.value as "equal" | "plan_amount")
                        }
                        fullWidth
                        required
                      >
                        <MenuItem value="equal">Eşit dağıt - toplam tutarı aylara eşit böler</MenuItem>
                        <MenuItem value="plan_amount">
                          Plan tutarlarına göre dağıt - aylık plan oranlarını kullanır
                        </MenuItem>
                      </TextField>
                    </Grid>
                  </>
                )}
                    <Grid item xs={12}>
                      <Box
                        sx={{
                          border: 1,
                          borderColor: "divider",
                          borderRadius: 1,
                          p: 1.5,
                          bgcolor: "background.default"
                        }}
                      >
                        <Stack spacing={1.5}>
                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            justifyContent="space-between"
                            alignItems={{ xs: "flex-start", sm: "center" }}
                            spacing={1}
                          >
                            <Typography variant="subtitle2" fontWeight={700}>
                              Planlanan Bütçe Dağılımı
                            </Typography>
                            {plannedBudgetRows.length > 0 && (
                              <Typography variant="caption" color="text.secondary">
                                Toplam Plan: {formatCurrency(plannedBudgetTotal)}
                              </Typography>
                            )}
                          </Stack>

                          {formIsOutOfBudget ? (
                            <Alert severity="info">
                              Bütçe dışı harcama plan bütçesine bağlanmaz.
                            </Alert>
                          ) : !formBudgetItemId || !formScenarioId ? (
                            <Alert severity="info">
                              Bütçe kalemi ve senaryo seçildiğinde plan ayları gösterilir.
                            </Alert>
                          ) : isPlanPreviewFetching ? (
                            <Typography variant="body2" color="text.secondary">
                              Plan dağılımı yükleniyor...
                            </Typography>
                          ) : isPlanPreviewError ? (
                            <Alert severity="warning">Plan dağılımı yüklenemedi.</Alert>
                          ) : plannedBudgetRows.length === 0 ? (
                            <Alert severity="warning">
                              Bu bütçe kalemi için seçili yıl/senaryoda plan bulunamadı.
                            </Alert>
                          ) : (
                            <Box sx={{ maxHeight: 180, overflow: "auto" }}>
                              <Table size="small" stickyHeader>
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Ay</TableCell>
                                    <TableCell align="right">Plan Tutarı</TableCell>
                                    <TableCell align="right">Kapsam</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {plannedBudgetRows.map((row) => (
                                    <TableRow
                                      key={row.month}
                                      selected={row.isSelected}
                                      sx={
                                        row.isSelected
                                          ? { "& .MuiTableCell-root": { fontWeight: 700 } }
                                          : undefined
                                      }
                                    >
                                      <TableCell>{row.label}</TableCell>
                                      <TableCell align="right">{formatCurrency(row.amount)}</TableCell>
                                      <TableCell align="right">
                                        {row.isSelected ? (
                                          <Chip size="small" color="info" label="Seçili" />
                                        ) : (
                                          "-"
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </Box>
                          )}

                          {allocationMode === "planned_months" ? (
                            <Box
                              sx={{
                                borderTop: 1,
                                borderColor: "divider",
                                pt: 1.5
                              }}
                            >
                              <Stack spacing={1}>
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                  <Typography variant="caption" color="text.secondary">
                                    Seçilen kapsam:
                                  </Typography>
                                  {selectedAllocationMonths.length > 0 ? (
                                    selectedAllocationMonths.map((month) => (
                                      <Chip
                                        key={month}
                                        size="small"
                                        variant="outlined"
                                        label={monthOptions[month - 1] ?? month}
                                      />
                                    ))
                                  ) : (
                                    <Typography variant="caption" color="error.main">
                                      Geçerli bir ay aralığı seçin.
                                    </Typography>
                                  )}
                                </Stack>
                                <Typography variant="caption" color="text.secondary">
                                  Toplam harcama: {formatCurrency(totalAmount)}
                                </Typography>
                                {allocationPreview.message ? (
                                  <Alert severity="info">{allocationPreview.message}</Alert>
                                ) : (
                                  <Box sx={{ maxHeight: 160, overflow: "auto" }}>
                                    <Table size="small" stickyHeader>
                                      <TableHead>
                                        <TableRow>
                                          <TableCell>Ay</TableCell>
                                          <TableCell align="right">Tahmini Dağıtım</TableCell>
                                        </TableRow>
                                      </TableHead>
                                      <TableBody>
                                        {allocationPreview.rows.map((row) => (
                                          <TableRow key={row.month}>
                                            <TableCell>{row.label}</TableCell>
                                            <TableCell align="right">
                                              {formatCurrency(row.amount)}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </Box>
                                )}
                              </Stack>
                            </Box>
                          ) : (
                            <Box
                              sx={{
                                borderTop: 1,
                                borderColor: "divider",
                                pt: 1.5
                              }}
                            >
                              <Stack spacing={0.5}>
                                <Typography variant="caption" color="text.secondary">
                                  Seçili harcama ayı:{" "}
                                  {selectedPreviewMonths.length > 0
                                    ? monthOptions[selectedPreviewMonths[0] - 1]
                                    : "-"}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {isUnusedBudgetMode ? "Kullanılmayacak tutar" : "Tahmini tek ay harcaması"}:{" "}
                                  {formatCurrency(totalAmount)}
                                </Typography>
                              </Stack>
                            </Box>
                          )}
                        </Stack>
                      </Box>
                    </Grid>
                {isUnusedBudgetMode && (
                  <>
                    <Grid item xs={12} md={6}>
                      <TextField
                        select
                        label="Kullanılmayacak Sebebi"
                        name="unused_reason"
                        value={unusedBudgetReason}
                        onChange={(event) => setUnusedBudgetReason(event.target.value)}
                        fullWidth
                        required
                      >
                        {unusedBudgetReasonOptions.map((reason) => (
                          <MenuItem key={reason.value} value={reason.value}>
                            {reason.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Kullanılmayacak Açıklama / Not"
                        name="unused_note"
                        multiline
                        minRows={2}
                        inputProps={{ maxLength: 500 }}
                        placeholder="İsteğe bağlı açıklama ekleyebilirsiniz"
                        fullWidth
                      />
                    </Grid>
                  </>
                )}
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Satıcı"
                    name="vendor"
                    defaultValue={editingExpense?.vendor ?? ""}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Açıklama"
                    name="description"
                    defaultValue={editingExpense?.description ?? ""}
                    fullWidth
                  />
                </Grid>
                {!isUnusedBudgetMode && (
                  <Grid item xs={12} md={8}>
                    <Stack spacing={0.75}>
                      <Button
                        variant="outlined"
                        component="label"
                        startIcon={<AttachFileIcon />}
                        sx={{ alignSelf: "flex-start", minHeight: 40 }}
                      >
                        Fatura Eki / Ek Dosya
                        <input
                          type="file"
                          name="invoice_attachment"
                          hidden
                          multiple
                          accept="application/pdf,.pdf"
                          onChange={(event) => {
                            const files = Array.from(event.target.files ?? []);
                            const invalidFile = files.find(
                              (file) =>
                                file.type !== "application/pdf" &&
                                !file.name.toLowerCase().endsWith(".pdf")
                            );
                            if (invalidFile) {
                              setErrorMessage("Sadece PDF fatura eki yüklenebilir.");
                              event.target.value = "";
                              setSelectedAttachmentFiles([]);
                              return;
                            }
                            setSelectedAttachmentFiles(files);
                          }}
                        />
                      </Button>
                      {selectedAttachmentFiles.length > 0 ? (
                        <Stack spacing={0.5}>
                          {selectedAttachmentFiles.map((file) => (
                            <Typography
                              key={`${file.name}-${file.size}-${file.lastModified}`}
                              variant="caption"
                              color="text.secondary"
                            >
                              {file.name}
                            </Typography>
                          ))}
                        </Stack>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          {editingExpense?.has_attachment
                            ? `Mevcut PDF eki var (${editingExpense.attachment_count ?? 1})`
                            : "PDF seçilmedi"}
                        </Typography>
                      )}
                    </Stack>
                  </Grid>
                )}
                <Grid item xs={12} md={4}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ minHeight: 48 }}>
                    <Switch
                      name="is_cancelled"
                      defaultChecked={editingExpense?.status === "cancelled"}
                      disabled={isUnusedBudgetMode}
                    />
                    <Typography variant="body2">İptal Edildi</Typography>
                  </Stack>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ minHeight: 48 }}>
                    <Switch
                      name="is_out_of_budget"
                      checked={formIsOutOfBudget}
                      onChange={(event) => handleOutOfBudgetChange(event.target.checked)}
                      disabled={isUnusedBudgetMode}
                    />
                    <Typography variant="body2">Bütçe Dışı</Typography>
                  </Stack>
                </Grid>
                <Grid item xs={12} md={8}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ minHeight: 48 }}>
                    <Switch
                      name="mark_plan_purchased"
                      checked={formMarkPlanPurchased && !formIsOutOfBudget}
                      onChange={(event) => setFormMarkPlanPurchased(event.target.checked)}
                      disabled={isUnusedBudgetMode || formIsOutOfBudget}
                    />
                    <Typography variant="body2">
                      Bu harcama sonrası ilgili bütçe kalemi satın alındı olarak işaretlensin
                    </Typography>
                  </Stack>
                </Grid>
              </Grid>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, flexWrap: "wrap" }}>
            <Button onClick={() => setDialogOpen(false)}>Vazgeç</Button>
            <Button
              type="submit"
              variant="contained"
              disabled={mutation.isPending || unusedBudgetMutation.isPending}
            >
              Kaydet
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <Dialog
        open={attachmentPicker !== null}
        onClose={() => setAttachmentPicker(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>PDF Ekleri</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1}>
            {attachmentPicker?.attachments.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                Ek yok.
              </Typography>
            )}
            {attachmentPicker?.attachments.map((attachment) => (
              <Box
                key={attachment.id}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 2,
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  px: 1.5,
                  py: 1
                }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" noWrap title={attachment.file_name}>
                    {attachment.file_name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {Math.max(attachment.size_bytes / 1024, 0.1).toFixed(1)} KB
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} flexShrink={0} flexWrap="wrap" useFlexGap>
                  <Button
                    size="small"
                    startIcon={<VisibilityOutlinedIcon fontSize="small" />}
                    onClick={() =>
                      previewAttachment(attachmentPicker.expenseId, attachment)
                    }
                  >
                    Önizle
                  </Button>
                  <Button
                    size="small"
                    startIcon={<AttachFileIcon fontSize="small" />}
                    onClick={() =>
                      downloadAttachment(attachmentPicker.expenseId, attachment)
                    }
                  >
                    İndir
                  </Button>
                  {!isViewer && (
                    <Button
                      size="small"
                      color="error"
                      startIcon={<DeleteIcon fontSize="small" />}
                      disabled={deletingAttachmentId === attachment.id}
                      onClick={() =>
                        deleteAttachment(attachmentPicker.expenseId, attachment)
                      }
                    >
                      Sil
                    </Button>
                  )}
                </Stack>
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAttachmentPicker(null)}>Kapat</Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={attachmentPreview !== null}
        onClose={closeAttachmentPreview}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2
          }}
        >
          <Typography component="span" variant="h6" noWrap title={attachmentPreview?.fileName}>
            {attachmentPreview?.fileName ?? "PDF Önizleme"}
          </Typography>
          <Button size="small" onClick={closeAttachmentPreview}>
            Kapat
          </Button>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {attachmentPreview && (
            <Box
              component="iframe"
              title={attachmentPreview.fileName}
              src={attachmentPreview.url}
              sx={{
                width: "100%",
                height: { xs: "70vh", md: "78vh" },
                border: 0,
                display: "block"
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <OverBudgetDialog
        open={budgetStatusDialogCategory !== null}
        onClose={() => setBudgetStatusDialogCategory(null)}
        data={budgetStatus}
        category={budgetStatusDialogCategory ?? "overrun"}
        fileNamePrefix={
          budgetStatusDialogCategory === "saving"
            ? buildExpenseExportFileName("pazarlikli_tasarruf_detayi")
            : budgetStatusDialogCategory === "remaining"
              ? buildExpenseExportFileName("kalan_butce_detayi")
            : buildExpenseExportFileName("asim_detayi")
        }
      />
      <Dialog
        open={savingDetailDialog === "negotiated"}
        onClose={() => setSavingDetailDialog(null)}
        fullWidth
        maxWidth="lg"
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
                    <TableRow key={`${item.budget_item_id}-${item.budget_code}-${index}`} hover>
                      <TableCell>
                        {formatBudgetItemLabel({
                          code: item.budget_code,
                          name: item.budget_name
                        })}
                      </TableCell>
                      <TableCell>{formatBudgetPeriod(item)}</TableCell>
                      <TableCell>{item.department || "-"}</TableCell>
                      <TableCell>{item.capex_opex || "-"}</TableCell>
                      <TableCell>{item.asset_type || "-"}</TableCell>
                      <TableCell align="right">{formatCurrency(Number(item.plan) || 0)}</TableCell>
                      <TableCell align="right">{formatCurrency(Number(item.actual) || 0)}</TableCell>
                      <TableCell align="right">{formatCurrency(Number(item.over) || 0)}</TableCell>
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
        fullWidth
        maxWidth="xl"
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
                    <TableRow key={`${type}-${item.budget_item_id}-${item.budget_code}-${index}`} hover>
                      <TableCell>{type}</TableCell>
                      <TableCell>
                        {formatBudgetItemLabel({
                          code: item.budget_code,
                          name: item.budget_name
                        })}
                      </TableCell>
                      <TableCell>{formatBudgetPeriod(item)}</TableCell>
                      <TableCell>{item.department || "-"}</TableCell>
                      <TableCell>{item.capex_opex || "-"}</TableCell>
                      <TableCell>{item.asset_type || "-"}</TableCell>
                      <TableCell align="right">{formatCurrency(Number(item.plan) || 0)}</TableCell>
                      <TableCell align="right">
                        {type === "Pazarlıklı Tasarruf"
                          ? formatCurrency(Number(item.actual) || 0)
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
      <Dialog
        open={expenseDetailDialog !== null}
        onClose={() => setExpenseDetailDialog(null)}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle>{expenseDetailTitle}</DialogTitle>
        <DialogContent dividers>
          <DetailSummaryGrid items={expenseDetailSummaryItems} />
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
                  <TableCell align="right">Tutar</TableCell>
                  {expenseDetailDialog === "cancelled" && <TableCell>Açıklama</TableCell>}
                  <TableCell>Satıcı</TableCell>
                  <TableCell>Kaydı Giren</TableCell>
                  <TableCell>Durum</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {expenseDetailItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={expenseDetailDialog === "cancelled" ? 11 : 10}>
                      <Typography variant="body2" color="text.secondary">
                        Kayıt bulunamadı.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  expenseDetailItems.map((expense) => {
                    const displayValues = getExpenseDisplayValues(expense);
                    return (
                      <TableRow key={expense.id} hover>
                        <TableCell>
                          {expense.expense_date ? dayjs(expense.expense_date).format("DD.MM.YYYY") : "-"}
                        </TableCell>
                        <TableCell>{displayValues.budgetLabel}</TableCell>
                        <TableCell>{formatExpensePeriod(expense)}</TableCell>
                        <TableCell>{displayValues.department}</TableCell>
                        <TableCell>{displayValues.capexOpex}</TableCell>
                        <TableCell>{displayValues.nitelik}</TableCell>
                        <TableCell align="right">{formatCurrency(Number(expense.amount) || 0)}</TableCell>
                        {expenseDetailDialog === "cancelled" && (
                          <TableCell>{expense.description || "-"}</TableCell>
                        )}
                        <TableCell>{expense.vendor || "-"}</TableCell>
                        <TableCell>{formatExpenseOwner(expense)}</TableCell>
                        <TableCell>
                          {expenseDetailDialog === "out_of_budget" ? (
                            <Chip size="small" color="warning" label="Bütçe Dışı" />
                          ) : (
                            <Chip
                              size="small"
                              color={expense.status === "cancelled" ? "error" : "success"}
                              label={expense.status === "cancelled" ? "İptal" : "Kaydedildi"}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </DetailTableWrap>
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            onClick={handleExportExpenseDetail}
            disabled={expenseDetailItems.length === 0}
          >
            Excel'e Aktar
          </Button>
          <Button onClick={() => setExpenseDetailDialog(null)}>Kapat</Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={isUnusedBudgetDialogOpen}
        onClose={() => setIsUnusedBudgetDialogOpen(false)}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle>Diğer Tasarruf Detayı</DialogTitle>
        <DialogContent dividers>
          <DetailSummaryGrid
            items={[
              { label: "Toplam Bütçe", value: formatCurrency(unusedBudgetTotals.plan) },
              {
                label: "Toplam Kullanılmayacak",
                value: formatCurrency(unusedBudgetTotals.unused),
                color: "warning.main"
              },
              {
                label: "Toplam Kalan Kullanılabilir",
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
                  {unusedBudgetItems.map((item, index) => {
                    const unusedAmount = Number(item.unused_amount ?? 0);
                    return (
                      <TableRow
                        hover
                        key={`${item.budget_item_id}-${item.budget_code}-${index}`}
                      >
                        <TableCell>
                          {formatBudgetItemLabel({
                            code: item.budget_code,
                            name: item.budget_name
                          })}
                        </TableCell>
                        <TableCell>{formatBudgetPeriod(item)}</TableCell>
                        <TableCell>{item.department || "-"}</TableCell>
                        <TableCell>{item.capex_opex || "-"}</TableCell>
                        <TableCell>{item.asset_type || "-"}</TableCell>
                        <TableCell align="right">{formatCurrency(Number(item.plan) || 0)}</TableCell>
                        <TableCell align="right">{formatCurrency(Number(item.actual) || 0)}</TableCell>
                        <TableCell align="right">{formatCurrency(unusedAmount)}</TableCell>
                        <TableCell align="right">
                          {formatCurrency(Number(item.available_amount ?? 0))}
                        </TableCell>
                        <TableCell>{formatUnusedReason(item.reason)}</TableCell>
                        <TableCell>{item.note || "-"}</TableCell>
                        <TableCell>
                          {item.unused_updated_at
                            ? new Date(item.unused_updated_at).toLocaleString("tr-TR")
                            : "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
        open={Boolean(distributionDetailExpense)}
        onClose={() => setDistributionDetailExpense(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Dağıtım Detayı</DialogTitle>
        <DialogContent dividers>
          {distributionDetailSummary && (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
                gap: 1.5,
                mb: 2
              }}
            >
              <Box
                sx={{
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  p: 1.25
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  Toplam Bütçe
                </Typography>
                <Typography variant="subtitle2" fontWeight={700}>
                  {formatCurrency(distributionDetailSummary.budgetTotal)}
                </Typography>
              </Box>
              <Box
                sx={{
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  p: 1.25
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  Toplam Harcama
                </Typography>
                <Typography variant="subtitle2" fontWeight={700}>
                  {formatCurrency(distributionDetailSummary.spendingTotal)}
                </Typography>
              </Box>
              <Box
                sx={{
                  border: 1,
                  borderColor: distributionDetailSummary.isOverrun ? "error.light" : "success.light",
                  borderRadius: 1,
                  p: 1.25
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  {distributionDetailSummary.isOverrun
                    ? "Toplam Aşım"
                    : "Toplam Kalan"}
                </Typography>
                <Typography
                  variant="subtitle2"
                  fontWeight={700}
                  color={distributionDetailSummary.isOverrun ? "error.main" : "success.main"}
                >
                  {formatCurrency(Math.abs(distributionDetailSummary.result))}
                </Typography>
              </Box>
            </Box>
          )}
          <Box sx={{ maxHeight: 360, overflow: "auto" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Ay</TableCell>
                  <TableCell align="right">Aylık Bütçe</TableCell>
                  <TableCell align="right">Geçerli Gerçekleşen</TableCell>
                  <TableCell>Sonuç</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {distributionDetailRows.map((detail) => {
                  const monthLabel =
                    detail.month >= 1 && detail.month <= 12
                      ? `${monthOptions[detail.month - 1]} ${detail.year}`
                      : "-";
                  return (
                    <TableRow key={`${detail.year}-${detail.month}`} hover>
                      <TableCell>{monthLabel}</TableCell>
                      <TableCell align="right">{formatCurrency(detail.budgetAmount)}</TableCell>
                      <TableCell align="right">{formatCurrency(detail.allocatedAmount)}</TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          fontWeight={700}
                          color={detail.isOverrun ? "error.main" : "success.main"}
                        >
                          {detail.isOverrun ? "Aşım" : "Kalan"}:{" "}
                          {formatCurrency(Math.abs(detail.result))}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDistributionDetailExpense(null)}>Kapat</Button>
        </DialogActions>
      </Dialog>
      <UnusedBudgetDialog
        planId={unusedDialogPlanId}
        onClose={() => setUnusedDialogPlanId(null)}
        onSuccess={(message) => setSuccessMessage(message)}
      />
      </Stack>
    </ExpensesErrorBoundary>
  );
}
