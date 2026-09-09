import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Grid,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@mui/material";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DownloadIcon from "@mui/icons-material/Download";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import * as XLSX from "xlsx";
import { formatUnusedReason } from "../../utils/unusedReason";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import usePersistentState from "../../hooks/usePersistentState";
import { useAuth } from "../../context/AuthContext";
import { formatBudgetItemLabel, stripBudgetCode } from "../../utils/budgetLabel";

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

interface DashboardSummary {
  month: number;
  planned: number;
  actual: number;
  saving?: number;
  remaining?: number;
  unused?: number;
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

interface OverBudgetItem {
  budget_item_id: number;
  budget_code: string;
  budget_name: string;
  months: number[];
  capex_opex?: string | null;
  asset_type?: string | null;
  department?: string | null;
  plan: number;
  actual: number;
  over: number;
  over_pct: number;
  unused_amount?: number;
  available_amount?: number;
  reason?: string | null;
  note?: string | null;
  unused_updated_at?: string | null;
  month?: number | null;
}

interface OverBudgetResponse {
  summary: {
    over_total: number;
    over_item_count: number;
    remaining_total: number;
    remaining_item_count: number;
    saving_total: number;
    saving_item_count: number;
    unused_total: number;
    unused_item_count: number;
    negotiated_saving_total?: number;
    negotiated_saving_item_count?: number;
    other_saving_total?: number;
    other_saving_item_count?: number;
    total_saving_total?: number;
    total_saving_item_count?: number;
  };
  items: OverBudgetItem[];
  saving_items?: OverBudgetItem[];
  remaining_items?: OverBudgetItem[];
  unused_items?: OverBudgetItem[];
}

interface ReportExpense {
  id?: number;
  budget_item_id: number;
  budget_code?: string | null;
  budget_name?: string | null;
  date?: string | null;
  expense_date?: string | null;
  amount?: number | null;
  vendor?: string | null;
  status?: string | null;
  out_of_budget?: boolean | null;
  is_out_of_budget?: boolean | null;
  allocation_count?: number | null;
  allocations?: { month: number; allocated_amount: number }[];
  department?: string | null;
  capex_opex?: string | null;
  asset_type?: string | null;
  map_capex_opex?: string | null;
  map_nitelik?: string | null;
  nitelik?: string | null;
  created_by_name?: string | null;
  created_by_username?: string | null;
}

interface PlanEntry {
  id: number;
  year: number;
  month: number;
  amount: number;
  scenario_id: number;
  budget_item_id: number;
  department?: string | null;
  budget_code?: string | null;
  budget_name?: string | null;
  capex_opex?: string | null;
  asset_type?: string | null;
  map_capex_opex?: string | null;
  map_nitelik?: string | null;
  nitelik?: string | null;
  transfer_in_amount?: number | null;
  transfer_out_amount?: number | null;
  revised_amount?: number | null;
  actual_amount?: number | null;
  unused_amount?: number | null;
  available_amount?: number | null;
  unused_reason?: string | null;
  unused_note?: string | null;
  unused_updated_at?: string | null;
  is_form_prepared?: boolean | null;
  purchase_requested?: boolean | null;
  purchase_requested_at?: string | null;
}

interface BudgetTransfer {
  id: number;
  source_budget_item_id: number;
  source_year: number;
  source_month: number;
  source_scenario_id: number;
  target_budget_item_id: number;
  target_year: number;
  target_month: number;
  target_scenario_id: number;
  amount: number;
  reason: string;
  created_at?: string | null;
  is_cancelled: boolean;
  source_budget_name?: string | null;
  target_budget_name?: string | null;
}

interface PurchaseFormPrepared {
  budget_item_id: number;
  budget_code: string;
  budget_name: string;
  year: number;
  month: number;
  scenario_id?: number | null;
  department?: string | null;
}

interface ImportSummary {
  imported_plans: number;
  imported_expenses: number;
  skipped_rows: number;
  message?: string;
}

type BudgetImportRow = {
  type: string;
  budget_code: string;
  budget_name: string;
  scenario: string;
  year: string;
  month: string;
  amount: string;
  date?: string;
  quantity?: string;
  unit_price?: string;
  vendor?: string;
  description?: string;
  department?: string | null;
  out_of_budget?: string;
  capex_opex?: string;
  asset_type?: string;
};

type ReportId =
  | "executive-summary"
  | "all-reports"
  | "plan-detail"
  | "transfer"
  | "remaining"
  | "unused"
  | "expense-detail"
  | "out-of-budget"
  | "cancelled"
  | "overrun"
  | "negotiated"
  | "other-saving"
  | "total-saving"
  | "purchased"
  | "purchase-requested";

type ReportRow = Record<string, string | number | null | undefined>;

const sampleHeaders = [
  "type",
  "budget_code",
  "budget_name",
  "scenario",
  "year",
  "month",
  "amount",
  "date",
  "quantity",
  "unit_price",
  "vendor",
  "description",
  "department",
  "out_of_budget",
  "capex_opex",
  "asset_type"
] as const;

type SampleHeader = (typeof sampleHeaders)[number];

const sampleRows: BudgetImportRow[] = [
  {
    type: "plan",
    budget_code: "SK01",
    budget_name: "ŞAN Cep Telefonu + Çakmaklık Şarj + Kılıf + Koruyucu  (500 Adet)",
    scenario: "Temel",
    year: "2026",
    month: "6",
    amount: "50000",
    date: "",
    quantity: "1",
    unit_price: "50000",
    vendor: "",
    description: "ŞAN Cep Telefonu + Çakmaklık Şarj + Kılıf + Koruyucu  (500 Adet)",
    department: "Operasyon",
    out_of_budget: "YANLIŞ",
    capex_opex: "Capex",
    asset_type: "Donanım"
  },
  {
    type: "plan",
    budget_code: "SK01",
    budget_name: "ŞAN Cep Telefonu + Çakmaklık Şarj + Kılıf + Koruyucu  (500 Adet)",
    scenario: "Temel",
    year: "2026",
    month: "10",
    amount: "50000",
    date: "",
    quantity: "1",
    unit_price: "50000",
    vendor: "",
    description: "ŞAN Cep Telefonu + Çakmaklık Şarj + Kılıf + Koruyucu  (500 Adet)",
    department: "Operasyon",
    out_of_budget: "YANLIŞ",
    capex_opex: "Capex",
    asset_type: "Donanım"
  }
];

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

const periodOptions: { value: string; label: string; months: number[] }[] = [
  { value: "", label: "Tümü", months: [] },
  { value: "Q1", label: "Q1", months: [1, 2, 3] },
  { value: "Q2", label: "Q2", months: [4, 5, 6] },
  { value: "Q3", label: "Q3", months: [7, 8, 9] },
  { value: "Q4", label: "Q4", months: [10, 11, 12] }
];

const sampleCsv = [
  sampleHeaders.join(","),
  ...sampleRows.map((row) =>
    sampleHeaders.map((header) => row[header as keyof BudgetImportRow] ?? "").join(",")
  )
].join("\n");

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);
  return debouncedValue;
}

function toSafeNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatCurrency(value: number) {
  return `$${new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value ?? 0)}`;
}

function normalizeText(value?: string | null) {
  return (value ?? "").toString().trim().toLowerCase();
}

function normalizeMonthSelection(months: number[]) {
  return Array.from(new Set(months.filter((month) => month >= 1 && month <= 12))).sort(
    (a, b) => a - b
  );
}

function formatMonth(month?: number | null) {
  return month && month >= 1 && month <= 12 ? monthLabels[month - 1] : "-";
}

function formatMonths(months?: number[] | null, fallbackMonth?: number | null) {
  const source = months?.length ? months : fallbackMonth ? [fallbackMonth] : [];
  return normalizeMonthSelection(source)
    .map((month) => formatMonth(month))
    .join(", ") || "-";
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

function appendRowsToWorkbook(
  workbook: XLSX.WorkBook,
  sheetName: string,
  rows: ReportRow[],
  moneyColumns: string[] = []
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
  const firstHeader = headers[0];
  safeRows.forEach((row, rowIndex) => {
    if (String(row[firstHeader] ?? "") !== "Toplam") return;
    headers.forEach((_, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex });
      if (worksheet[cellRef]) {
        worksheet[cellRef].s = { font: { bold: true } };
      }
    });
  });
  const moneySet = new Set(moneyColumns);
  headers.forEach((header, colIndex) => {
    if (!moneySet.has(header)) return;
    for (let rowIndex = 1; rowIndex <= safeRows.length; rowIndex += 1) {
      const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      if (worksheet[cellRef]) {
        worksheet[cellRef].z = '"$"#,##0.00';
      }
    }
  });
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
}

function buildEmptyDashboard(): DashboardResponse {
  return {
    kpi: {
      total_plan: 0,
      total_actual: 0,
      total_remaining: 0,
      total_saving: 0,
      total_overrun: 0,
      total_unused: 0,
      total_negotiated_saving: 0,
      total_other_saving: 0,
      total_combined_saving: 0
    },
    monthly: []
  };
}

function combineDashboardResponses(responses: DashboardResponse[]): DashboardResponse {
  const combined = buildEmptyDashboard();
  const monthMap = new Map<number, DashboardSummary>();
  responses.forEach((response) => {
    Object.entries(response.kpi).forEach(([key, value]) => {
      (combined.kpi as Record<string, number>)[key] =
        ((combined.kpi as Record<string, number>)[key] ?? 0) + toSafeNumber(value);
    });
    response.monthly.forEach((item) => {
      const current = monthMap.get(item.month) ?? {
        month: item.month,
        planned: 0,
        actual: 0,
        saving: 0,
        remaining: 0,
        unused: 0
      };
      current.planned += toSafeNumber(item.planned);
      current.actual += toSafeNumber(item.actual);
      current.saving = toSafeNumber(current.saving) + toSafeNumber(item.saving);
      current.remaining = toSafeNumber(current.remaining) + toSafeNumber(item.remaining);
      current.unused = toSafeNumber(current.unused) + toSafeNumber(item.unused);
      monthMap.set(item.month, current);
    });
  });
  combined.monthly = Array.from(monthMap.values()).sort((a, b) => a.month - b.month);
  return combined;
}

function buildEmptyOverBudget(): OverBudgetResponse {
  return {
    summary: {
      over_total: 0,
      over_item_count: 0,
      remaining_total: 0,
      remaining_item_count: 0,
      saving_total: 0,
      saving_item_count: 0,
      unused_total: 0,
      unused_item_count: 0,
      negotiated_saving_total: 0,
      negotiated_saving_item_count: 0,
      other_saving_total: 0,
      other_saving_item_count: 0,
      total_saving_total: 0,
      total_saving_item_count: 0
    },
    items: [],
    saving_items: [],
    remaining_items: [],
    unused_items: []
  };
}

function combineOverBudgetResponses(responses: OverBudgetResponse[]): OverBudgetResponse {
  const combined = buildEmptyOverBudget();
  responses.forEach((response) => {
    combined.items.push(...(response.items ?? []));
    combined.saving_items?.push(...(response.saving_items ?? []));
    combined.remaining_items?.push(...(response.remaining_items ?? []));
    combined.unused_items?.push(...(response.unused_items ?? []));
  });
  combined.summary.over_total = combined.items.reduce((sum, item) => sum + toSafeNumber(item.over), 0);
  combined.summary.over_item_count = combined.items.length;
  combined.summary.remaining_total =
    combined.remaining_items?.reduce((sum, item) => sum + toSafeNumber(item.over), 0) ?? 0;
  combined.summary.remaining_item_count = combined.remaining_items?.length ?? 0;
  combined.summary.saving_total =
    combined.saving_items?.reduce((sum, item) => sum + toSafeNumber(item.over), 0) ?? 0;
  combined.summary.saving_item_count = combined.saving_items?.length ?? 0;
  combined.summary.unused_total =
    combined.unused_items?.reduce(
      (sum, item) => sum + toSafeNumber(item.unused_amount ?? item.over),
      0
    ) ?? 0;
  combined.summary.unused_item_count = combined.unused_items?.length ?? 0;
  combined.summary.negotiated_saving_total = combined.summary.saving_total;
  combined.summary.negotiated_saving_item_count = combined.summary.saving_item_count;
  combined.summary.other_saving_total = combined.summary.unused_total;
  combined.summary.other_saving_item_count = combined.summary.unused_item_count;
  combined.summary.total_saving_total =
    combined.summary.negotiated_saving_total + combined.summary.other_saving_total;
  combined.summary.total_saving_item_count =
    combined.summary.negotiated_saving_item_count + combined.summary.other_saving_item_count;
  return combined;
}

const moneyColumns = [
  "Tutar",
  "Toplam Plan",
  "Toplam Bütçe",
  "Revize Bütçe",
  "Harcama",
  "Harcama Tutarı",
  "Gerçekleşen",
  "Gerçekleşen Plan İçi",
  "Gerçekleşen Harcama",
  "Kalan Bütçe",
  "Kalan Kullanılabilir",
  "Kalan Bütçe / Kalan Kullanılabilir",
  "Pazarlıklı Tasarruf",
  "Kullanılmayacak Tutar",
  "Kullanılmayacak",
  "Tasarruf",
  "Diğer Tasarruf",
  "İptal Edilen Bütçe",
  "Mutabakat Toplamı",
  "Mutabakat Farkı",
  "Aşım",
  "Bütçe Dışı",
  "Aktarım Tutarı"
];

const preferredTotalColumns = [
  "Toplam Bütçe",
  "Harcama Tutarı",
  "Gerçekleşen Plan İçi",
  "Gerçekleşen Harcama",
  "Pazarlıklı Tasarruf",
  "Kullanılmayacak Tutar",
  "Kullanılmayacak",
  "Kalan Kullanılabilir",
  "Kalan Bütçe",
  "Tasarruf",
  "Aşım",
  "Tutar",
  "Aktarım Tutarı"
];

function buildReportTotals(rows: ReportRow[]) {
  const totals = new Map<string, number>();
  rows.forEach((row) => {
    moneyColumns.forEach((column) => {
      if (typeof row[column] === "number") {
        totals.set(column, (totals.get(column) ?? 0) + toSafeNumber(row[column]));
      }
    });
  });

  const orderedColumns = [
    ...preferredTotalColumns,
    ...moneyColumns.filter((column) => !preferredTotalColumns.includes(column))
  ];

  return orderedColumns
    .filter((column, index, self) => self.indexOf(column) === index && totals.has(column))
    .map((column) => ({ label: column, total: totals.get(column) ?? 0 }));
}

function buildReportTotalRows(rows: ReportRow[]): ReportRow[] {
  return buildReportTotals(rows).map((item) => ({
    Alan: item.label,
    Tutar: item.total
  }));
}

function withReportTotalRow(rows: ReportRow[]): ReportRow[] {
  const totals = buildReportTotals(rows);
  if (!rows.length || !totals.length) return rows;

  const firstColumn = Object.keys(rows[0])[0] ?? "Bilgi";
  const totalRow: ReportRow = { [firstColumn]: "Toplam" };
  totals.forEach(({ label, total }) => {
    totalRow[label] = total;
  });
  return [...rows, totalRow];
}

export default function ImportExportView() {
  const client = useAuthorizedClient();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;
  const isViewer = ["viewer", "readonly", "read_only"].includes(
    String(user?.role ?? "").toLowerCase()
  );
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const currentYear = new Date().getFullYear();

  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [backupFeedback, setBackupFeedback] = useState<{
    message: string;
    severity: "success" | "error";
  } | null>(null);

  const [year, setYear] = usePersistentState<number | "">("io:year", currentYear);
  const [scenarioId, setScenarioId] = usePersistentState<number | null>("io:scenarioId", null);
  const [period, setPeriod] = usePersistentState<string>("io:period", "");
  const [selectedMonths, setSelectedMonths] = usePersistentState<number[]>("io:months", []);
  const [budgetItemId, setBudgetItemId] = usePersistentState<number | null>("io:budgetItemId", null);
  const [departmentFilter, setDepartmentFilter] = usePersistentState<string>("io:department", "");
  const [capexOpex, setCapexOpex] = usePersistentState<"" | "capex" | "opex">("io:capexOpex", "");
  const [assetTypeFilter, setAssetTypeFilter] = usePersistentState<string>("io:assetType", "");
  const [selectedReport, setSelectedReport] = useState<ReportId>("executive-summary");

  const selectedMonthList = useMemo(
    () => normalizeMonthSelection(selectedMonths),
    [selectedMonths]
  );
  const selectedMonthKey = selectedMonthList.join(",");
  const numericYear = year ? Number(year) : currentYear;

  const debouncedFilters = useDebouncedValue(
    useMemo(
      () => ({
        year: numericYear,
        scenarioId,
        selectedMonthKey,
        budgetItemId,
        department: departmentFilter,
        capexOpex,
        assetType: assetTypeFilter
      }),
      [
        numericYear,
        scenarioId,
        selectedMonthKey,
        budgetItemId,
        departmentFilter,
        capexOpex,
        assetTypeFilter
      ]
    ),
    250
  );

  const { data: scenarios } = useQuery<Scenario[]>({
    queryKey: ["scenarios"],
    queryFn: async () => {
      const { data } = await client.get<Scenario[]>("/scenarios");
      return data;
    }
  });

  const { data: budgetItems = [] } = useQuery<BudgetItem[]>({
    queryKey: ["budget-items"],
    queryFn: async () => {
      const { data } = await client.get<BudgetItem[]>("/budget-items");
      return data;
    }
  });

  const { data: departments = [] } = useQuery<string[]>({
    queryKey: ["plan-departments", debouncedFilters.year, debouncedFilters.scenarioId],
    queryFn: async () => {
      const params: Record<string, number> = { year: debouncedFilters.year };
      if (debouncedFilters.scenarioId) params.scenario_id = debouncedFilters.scenarioId;
      const { data } = await client.get<string[]>("/plans/departments", { params });
      return data ?? [];
    }
  });

  useEffect(() => {
    if (!scenarios?.length) return;
    const matchingScenario = scenarios.find((scenario) => scenario.year === numericYear);
    setScenarioId(matchingScenario?.id ?? null);
  }, [numericYear, scenarios, setScenarioId]);

  const budgetItemMap = useMemo(
    () => new Map(budgetItems.map((item) => [item.id, item])),
    [budgetItems]
  );

  const assetTypeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          budgetItems
            .map((item) => item.map_attribute?.trim())
            .filter((value): value is string => Boolean(value))
        )
      ).sort((a, b) => a.localeCompare(b, "tr")),
    [budgetItems]
  );

  const budgetFilterOptions = useMemo(
    () =>
      createFilterOptions<BudgetItem>({
        stringify: (option) =>
          `${option.code ?? ""} ${stripBudgetCode(option.name ?? "")} ${option.map_category ?? ""} ${option.map_attribute ?? ""}`
      }),
    []
  );

  const matchesBudgetFilters = (item?: BudgetItem | null) => {
    if (!item) return false;
    if (capexOpex && normalizeText(item.map_category) !== capexOpex) return false;
    if (assetTypeFilter && normalizeText(item.map_attribute) !== normalizeText(assetTypeFilter)) {
      return false;
    }
    return true;
  };

  const effectiveBudgetItemIds = useMemo(() => {
    if (budgetItemId) {
      const item = budgetItemMap.get(budgetItemId);
      return matchesBudgetFilters(item) ? [budgetItemId] : [];
    }
    if (assetTypeFilter) {
      return budgetItems.filter(matchesBudgetFilters).map((item) => item.id);
    }
    return null;
  }, [assetTypeFilter, budgetItemId, budgetItemMap, budgetItems, capexOpex]);

  const shouldFanOutByBudgetItem = Boolean(assetTypeFilter && !budgetItemId);

  const selectedPeriodLabel =
    periodOptions.find((option) => option.value === period)?.label ?? "Tümü";
  const selectedMonthsLabel =
    selectedMonthList.length > 0
      ? selectedMonthList.map((month) => formatMonth(month)).join(", ")
      : "Tüm Aylar";
  const selectedBudgetItemLabel = budgetItemId
    ? formatBudgetItemLabel(budgetItemMap.get(budgetItemId) ?? null)
    : "Tümü";

  const baseAnalyticsParams = (budgetItemOverride?: number | null) => {
    const params: Record<string, string | number> = { year: debouncedFilters.year };
    if (debouncedFilters.scenarioId) params.scenario_id = debouncedFilters.scenarioId;
    if (debouncedFilters.selectedMonthKey) params.month_list = debouncedFilters.selectedMonthKey;
    if (debouncedFilters.department) params.department = debouncedFilters.department;
    if (debouncedFilters.capexOpex) params.capex_opex = debouncedFilters.capexOpex;
    const effectiveBudgetId =
      budgetItemOverride ?? (!shouldFanOutByBudgetItem ? debouncedFilters.budgetItemId : null);
    if (effectiveBudgetId) params.budget_item_id = effectiveBudgetId;
    return params;
  };

  const fetchDashboardForFilters = async () => {
    if (effectiveBudgetItemIds && effectiveBudgetItemIds.length === 0) {
      return buildEmptyDashboard();
    }
    if (shouldFanOutByBudgetItem && effectiveBudgetItemIds) {
      const responses = await Promise.all(
        effectiveBudgetItemIds.map(async (id) => {
          const { data } = await client.get<DashboardResponse>("/dashboard", {
            params: baseAnalyticsParams(id)
          });
          return data;
        })
      );
      return combineDashboardResponses(responses);
    }
    const { data } = await client.get<DashboardResponse>("/dashboard", {
      params: baseAnalyticsParams()
    });
    return data;
  };

  const fetchOverBudgetForFilters = async () => {
    if (effectiveBudgetItemIds && effectiveBudgetItemIds.length === 0) {
      return buildEmptyOverBudget();
    }
    if (shouldFanOutByBudgetItem && effectiveBudgetItemIds) {
      const responses = await Promise.all(
        effectiveBudgetItemIds.map(async (id) => {
          const { data } = await client.get<OverBudgetResponse>("/dashboard/overbudget", {
            params: baseAnalyticsParams(id)
          });
          return data;
        })
      );
      return combineOverBudgetResponses(responses);
    }
    const { data } = await client.get<OverBudgetResponse>("/dashboard/overbudget", {
      params: baseAnalyticsParams()
    });
    return data;
  };

  const { data: dashboard = buildEmptyDashboard(), isFetching: isDashboardFetching } =
    useQuery<DashboardResponse>({
      queryKey: [
        "reports",
        "dashboard",
        debouncedFilters,
        effectiveBudgetItemIds?.join(",") ?? "all"
      ],
      queryFn: fetchDashboardForFilters
    });

  const { data: overBudget = buildEmptyOverBudget(), isFetching: isOverBudgetFetching } =
    useQuery<OverBudgetResponse>({
      queryKey: [
        "reports",
        "overbudget",
        debouncedFilters,
        effectiveBudgetItemIds?.join(",") ?? "all"
      ],
      queryFn: fetchOverBudgetForFilters
    });

  const filterBudgetScopedRows = <T extends { budget_item_id?: number; asset_type?: string | null; map_nitelik?: string | null; nitelik?: string | null; capex_opex?: string | null; map_capex_opex?: string | null }>(
    rows: T[]
  ) =>
    rows.filter((row) => {
      if (effectiveBudgetItemIds && effectiveBudgetItemIds.length === 0) return false;
      if (effectiveBudgetItemIds?.length && row.budget_item_id && !effectiveBudgetItemIds.includes(row.budget_item_id)) {
        return false;
      }
      if (assetTypeFilter) {
        const rowAsset =
          row.asset_type ?? row.map_nitelik ?? row.nitelik ?? budgetItemMap.get(row.budget_item_id ?? -1)?.map_attribute;
        if (normalizeText(rowAsset) !== normalizeText(assetTypeFilter)) return false;
      }
      if (capexOpex) {
        const rowCapex =
          row.capex_opex ?? row.map_capex_opex ?? budgetItemMap.get(row.budget_item_id ?? -1)?.map_category;
        if (normalizeText(rowCapex) !== capexOpex) return false;
      }
      return true;
    });

  const { data: planRows = [] } = useQuery<PlanEntry[]>({
    queryKey: ["reports", "plans", debouncedFilters, effectiveBudgetItemIds?.join(",") ?? "all"],
    queryFn: async () => {
      const params: Record<string, string | number> = { year: debouncedFilters.year };
      if (debouncedFilters.scenarioId) params.scenario_id = debouncedFilters.scenarioId;
      if (debouncedFilters.department) params.department = debouncedFilters.department;
      if (debouncedFilters.capexOpex) params.capex_opex = debouncedFilters.capexOpex;
      if (!shouldFanOutByBudgetItem && debouncedFilters.budgetItemId) {
        params.budget_item_id = debouncedFilters.budgetItemId;
      }
      const { data } = await client.get<PlanEntry[]>("/plans", { params });
      const monthFiltered = debouncedFilters.selectedMonthKey
        ? data.filter((row) => selectedMonthList.includes(row.month))
        : data;
      return filterBudgetScopedRows(monthFiltered);
    }
  });

  const { data: expenseRows = [] } = useQuery<ReportExpense[]>({
    queryKey: ["reports", "expenses", debouncedFilters, effectiveBudgetItemIds?.join(",") ?? "all"],
    queryFn: async () => {
      const params: Record<string, string | number | boolean> = {
        year: debouncedFilters.year,
        include_out_of_budget: true,
        show_out_of_budget: true,
        show_cancelled: true
      };
      if (debouncedFilters.scenarioId) params.scenario_id = debouncedFilters.scenarioId;
      if (debouncedFilters.selectedMonthKey) params.month_list = debouncedFilters.selectedMonthKey;
      if (debouncedFilters.department) params.department = debouncedFilters.department;
      if (debouncedFilters.capexOpex) params.capex_opex = debouncedFilters.capexOpex;
      if (!shouldFanOutByBudgetItem && debouncedFilters.budgetItemId) {
        params.budget_item_id = debouncedFilters.budgetItemId;
      }
      const { data } = await client.get<ReportExpense[]>("/expenses", { params });
      return filterBudgetScopedRows(data);
    }
  });

  const { data: transfers = [] } = useQuery<BudgetTransfer[]>({
    queryKey: ["reports", "transfers", debouncedFilters, effectiveBudgetItemIds?.join(",") ?? "all"],
    queryFn: async () => {
      const params: Record<string, string | number | boolean> = {
        year: debouncedFilters.year,
        include_cancelled: false
      };
      if (debouncedFilters.scenarioId) params.scenario_id = debouncedFilters.scenarioId;
      const { data } = await client.get<BudgetTransfer[]>("/plans/transfers", { params });
      return data.filter((transfer) => {
        if (
          selectedMonthList.length > 0 &&
          !selectedMonthList.includes(transfer.source_month) &&
          !selectedMonthList.includes(transfer.target_month)
        ) {
          return false;
        }
        const sourceItem = budgetItemMap.get(transfer.source_budget_item_id);
        const targetItem = budgetItemMap.get(transfer.target_budget_item_id);
        const sourceMatches = matchesBudgetFilters(sourceItem);
        const targetMatches = matchesBudgetFilters(targetItem);
        if (effectiveBudgetItemIds?.length) {
          return (
            effectiveBudgetItemIds.includes(transfer.source_budget_item_id) ||
            effectiveBudgetItemIds.includes(transfer.target_budget_item_id)
          );
        }
        if (assetTypeFilter || capexOpex) return sourceMatches || targetMatches;
        return true;
      });
    }
  });

  const { data: purchasePreparedRows = [] } = useQuery<PurchaseFormPrepared[]>({
    queryKey: [
      "reports",
      "purchase-prepared",
      debouncedFilters,
      effectiveBudgetItemIds?.join(",") ?? "all"
    ],
    queryFn: async () => {
      const fetchForMonth = async (month?: number) => {
        const params: Record<string, string | number> = { year: debouncedFilters.year };
        if (debouncedFilters.scenarioId) params.scenario_id = debouncedFilters.scenarioId;
        if (debouncedFilters.department) params.department = debouncedFilters.department;
        if (month) params.month = month;
        const { data } = await client.get<PurchaseFormPrepared[]>(
          "/reports/purchase-forms-prepared",
          { params }
        );
        return data;
      };
      const responses =
        selectedMonthList.length > 0
          ? await Promise.all(selectedMonthList.map((month) => fetchForMonth(month)))
          : [await fetchForMonth()];
      return filterBudgetScopedRows(responses.flat());
    }
  });

  const realizedExpenses = expenseRows.filter(
    (expense) => expense.status !== "cancelled" && !Boolean(expense.is_out_of_budget ?? expense.out_of_budget)
  );
  const outOfBudgetExpenses = expenseRows.filter(
    (expense) => expense.status !== "cancelled" && Boolean(expense.is_out_of_budget ?? expense.out_of_budget)
  );
  const cancelledExpenses = expenseRows.filter((expense) => expense.status === "cancelled");

  const negotiatedItems = overBudget.saving_items ?? [];
  const remainingItems = overBudget.remaining_items ?? [];
  const overrunItems = overBudget.items ?? [];
  const unusedItems = overBudget.unused_items ?? [];
  const combinedSavingItems = [
    ...negotiatedItems.map((item) => ({
      type: "Pazarlıklı Tasarruf",
      item,
      amount: toSafeNumber(item.over),
      unusedAmount: 0
    })),
    ...unusedItems.map((item) => ({
      type: "Diğer Tasarruf",
      item,
      amount: toSafeNumber(item.unused_amount ?? item.over),
      unusedAmount: toSafeNumber(item.unused_amount ?? item.over)
    }))
  ];

  const normalizedKpi = {
    ...dashboard.kpi,
    total_plan: dashboard.reconciliation?.total_plan_amount ?? dashboard.kpi.total_plan,
    total_actual:
      dashboard.reconciliation?.realized_plan_inside_amount ?? dashboard.kpi.total_actual,
    total_remaining:
      dashboard.reconciliation?.remaining_available_amount ?? dashboard.kpi.total_remaining,
    total_overrun: dashboard.reconciliation?.overrun_amount ?? dashboard.kpi.total_overrun,
    total_unused: dashboard.reconciliation?.other_saving_amount ?? dashboard.kpi.total_unused,
    total_negotiated_saving:
      dashboard.reconciliation?.negotiated_saving_amount ??
      dashboard.kpi.total_negotiated_saving ??
      dashboard.kpi.total_saving,
    total_other_saving:
      dashboard.reconciliation?.other_saving_amount ??
      dashboard.kpi.total_other_saving ??
      dashboard.kpi.total_unused,
    total_combined_saving:
      (dashboard.reconciliation?.negotiated_saving_amount ??
        dashboard.kpi.total_negotiated_saving ??
        dashboard.kpi.total_saving ??
        0) +
      (dashboard.reconciliation?.other_saving_amount ??
        dashboard.kpi.total_other_saving ??
        dashboard.kpi.total_unused ??
        0),
    total_cancelled:
      dashboard.reconciliation?.canceled_budget_amount ??
      dashboard.kpi.total_cancelled ??
      0,
    budget_outside_amount:
      dashboard.reconciliation?.budget_outside_amount ??
      dashboard.kpi.budget_outside_amount ??
      0,
    capex_total_plan_amount:
      dashboard.reconciliation?.capex_total_plan_amount ??
      dashboard.kpi.capex_total_plan_amount ??
      0,
    opex_total_plan_amount:
      dashboard.reconciliation?.opex_total_plan_amount ??
      dashboard.kpi.opex_total_plan_amount ??
      0,
    unclassified_total_plan_amount:
      dashboard.reconciliation?.unclassified_total_plan_amount ??
      dashboard.kpi.unclassified_total_plan_amount ??
      0,
    capex_realized_plan_inside_amount:
      dashboard.reconciliation?.capex_realized_plan_inside_amount ??
      dashboard.kpi.capex_realized_plan_inside_amount ??
      0,
    opex_realized_plan_inside_amount:
      dashboard.reconciliation?.opex_realized_plan_inside_amount ??
      dashboard.kpi.opex_realized_plan_inside_amount ??
      0,
    unclassified_realized_plan_inside_amount:
      dashboard.reconciliation?.unclassified_realized_plan_inside_amount ??
      dashboard.kpi.unclassified_realized_plan_inside_amount ??
      0,
    capex_remaining_available_amount:
      dashboard.reconciliation?.capex_remaining_available_amount ??
      dashboard.kpi.capex_remaining_available_amount ??
      0,
    opex_remaining_available_amount:
      dashboard.reconciliation?.opex_remaining_available_amount ??
      dashboard.kpi.opex_remaining_available_amount ??
      0,
    unclassified_remaining_available_amount:
      dashboard.reconciliation?.unclassified_remaining_available_amount ??
      dashboard.kpi.unclassified_remaining_available_amount ??
      0,
    capex_negotiated_saving_amount:
      dashboard.reconciliation?.capex_negotiated_saving_amount ??
      dashboard.kpi.capex_negotiated_saving_amount ??
      0,
    opex_negotiated_saving_amount:
      dashboard.reconciliation?.opex_negotiated_saving_amount ??
      dashboard.kpi.opex_negotiated_saving_amount ??
      0,
    unclassified_negotiated_saving_amount:
      dashboard.reconciliation?.unclassified_negotiated_saving_amount ??
      dashboard.kpi.unclassified_negotiated_saving_amount ??
      0,
    capex_other_saving_amount:
      dashboard.reconciliation?.capex_other_saving_amount ??
      dashboard.kpi.capex_other_saving_amount ??
      0,
    opex_other_saving_amount:
      dashboard.reconciliation?.opex_other_saving_amount ??
      dashboard.kpi.opex_other_saving_amount ??
      0,
    unclassified_other_saving_amount:
      dashboard.reconciliation?.unclassified_other_saving_amount ??
      dashboard.kpi.unclassified_other_saving_amount ??
      0,
    capex_canceled_budget_amount:
      dashboard.reconciliation?.capex_canceled_budget_amount ??
      dashboard.kpi.capex_canceled_budget_amount ??
      0,
    opex_canceled_budget_amount:
      dashboard.reconciliation?.opex_canceled_budget_amount ??
      dashboard.kpi.opex_canceled_budget_amount ??
      0,
    unclassified_canceled_budget_amount:
      dashboard.reconciliation?.unclassified_canceled_budget_amount ??
      dashboard.kpi.unclassified_canceled_budget_amount ??
      0,
    capex_overrun_amount:
      dashboard.reconciliation?.capex_overrun_amount ??
      dashboard.kpi.capex_overrun_amount ??
      0,
    opex_overrun_amount:
      dashboard.reconciliation?.opex_overrun_amount ??
      dashboard.kpi.opex_overrun_amount ??
      0,
    unclassified_overrun_amount:
      dashboard.reconciliation?.unclassified_overrun_amount ??
      dashboard.kpi.unclassified_overrun_amount ??
      0,
    capex_budget_outside_amount:
      dashboard.reconciliation?.capex_budget_outside_amount ??
      dashboard.kpi.capex_budget_outside_amount ??
      0,
    opex_budget_outside_amount:
      dashboard.reconciliation?.opex_budget_outside_amount ??
      dashboard.kpi.opex_budget_outside_amount ??
      0,
    unclassified_budget_outside_amount:
      dashboard.reconciliation?.unclassified_budget_outside_amount ??
      dashboard.kpi.unclassified_budget_outside_amount ??
      0,
    reconciliation_total:
      dashboard.reconciliation?.reconciliation_total ??
      dashboard.kpi.reconciliation_total ??
      0,
    capex_reconciliation_total:
      dashboard.reconciliation?.capex_reconciliation_total ??
      dashboard.kpi.capex_reconciliation_total ??
      0,
    opex_reconciliation_total:
      dashboard.reconciliation?.opex_reconciliation_total ??
      dashboard.kpi.opex_reconciliation_total ??
      0,
    unclassified_reconciliation_total:
      dashboard.reconciliation?.unclassified_reconciliation_total ??
      dashboard.kpi.unclassified_reconciliation_total ??
      0,
    reconciliation_difference:
      dashboard.reconciliation?.reconciliation_difference ??
      dashboard.kpi.reconciliation_difference ??
      0,
    capex_reconciliation_difference:
      dashboard.reconciliation?.capex_reconciliation_difference ??
      dashboard.kpi.capex_reconciliation_difference ??
      0,
    opex_reconciliation_difference:
      dashboard.reconciliation?.opex_reconciliation_difference ??
      dashboard.kpi.opex_reconciliation_difference ??
      0,
    unclassified_reconciliation_difference:
      dashboard.reconciliation?.unclassified_reconciliation_difference ??
      dashboard.kpi.unclassified_reconciliation_difference ??
      0
  };
  const outOfBudgetTotal = toSafeNumber(normalizedKpi.budget_outside_amount);
  const cancelledTotal = toSafeNumber(normalizedKpi.total_cancelled);

  const cardSummaryRows: ReportRow[] = [
    {
      "Kart Adı": "Toplam Plan",
      Tutar: normalizedKpi.total_plan,
      "Kayıt Sayısı": planRows.length,
      Açıklama: "Planlanan toplam bütçe"
    },
    {
      "Kart Adı": "Gerçekleşen",
      Tutar: normalizedKpi.total_actual,
      "Kayıt Sayısı": realizedExpenses.length,
      Açıklama: "Aktif bütçe içi harcamalar"
    },
    {
      "Kart Adı": "Kalan Bütçe",
      Tutar: normalizedKpi.total_remaining,
      "Kayıt Sayısı": remainingItems.length,
      Açıklama: "Aktif kullanılabilir kalan bütçe"
    },
    {
      "Kart Adı": "Pazarlıklı Tasarruf",
      Tutar: normalizedKpi.total_negotiated_saving,
      "Kayıt Sayısı": negotiatedItems.length,
      Açıklama: "Satın alınmış/gerçekleşmiş bütçeden düşük harcama"
    },
    {
      "Kart Adı": "Diğer Tasarruf",
      Tutar: normalizedKpi.total_other_saving,
      "Kayıt Sayısı": unusedItems.length,
      Açıklama: "Kullanılmayacak olarak işaretlenen bütçe"
    },
    {
      "Kart Adı": "Toplam Tasarruf",
      Tutar: normalizedKpi.total_combined_saving,
      "Kayıt Sayısı": combinedSavingItems.length,
      Açıklama: "Pazarlıklı + Diğer Tasarruf"
    },
    {
      "Kart Adı": "Bütçe Dışı",
      Tutar: outOfBudgetTotal,
      "Kayıt Sayısı": outOfBudgetExpenses.length,
      Açıklama: "Bütçe dışı geçerli harcamalar"
    },
    {
      "Kart Adı": "Aşım",
      Tutar: normalizedKpi.total_overrun,
      "Kayıt Sayısı": overrunItems.length,
      Açıklama: "Gerçekleşen harcama bütçeyi geçen kalemler"
    },
    {
      "Kart Adı": "Kullanılmayacak Bütçe",
      Tutar: normalizedKpi.total_unused,
      "Kayıt Sayısı": unusedItems.length,
      Açıklama: "Plan bazlı kullanılmayacak bütçe"
    },
    {
      "Kart Adı": "İptal Edilen Harcamalar",
      Tutar: cancelledTotal,
      "Kayıt Sayısı": cancelledExpenses.length,
      Açıklama: "İptal statüsündeki harcamalar"
    }
  ];
  const reconciliationRows: ReportRow[] = [
    {
      Kategori: "Genel",
      "Toplam Plan": normalizedKpi.total_plan,
      "Gerçekleşen Plan İçi": normalizedKpi.total_actual,
      "Kalan Bütçe / Kalan Kullanılabilir": normalizedKpi.total_remaining,
      "Pazarlıklı Tasarruf": normalizedKpi.total_negotiated_saving,
      "Diğer Tasarruf": normalizedKpi.total_other_saving,
      "İptal Edilen Bütçe": normalizedKpi.total_cancelled,
      "Mutabakat Toplamı": normalizedKpi.reconciliation_total,
      "Mutabakat Farkı": normalizedKpi.reconciliation_difference,
      Aşım: normalizedKpi.total_overrun,
      "Bütçe Dışı": normalizedKpi.budget_outside_amount
    },
    {
      Kategori: "Capex",
      "Toplam Plan": normalizedKpi.capex_total_plan_amount,
      "Gerçekleşen Plan İçi": normalizedKpi.capex_realized_plan_inside_amount,
      "Kalan Bütçe / Kalan Kullanılabilir": normalizedKpi.capex_remaining_available_amount,
      "Pazarlıklı Tasarruf": normalizedKpi.capex_negotiated_saving_amount,
      "Diğer Tasarruf": normalizedKpi.capex_other_saving_amount,
      "İptal Edilen Bütçe": normalizedKpi.capex_canceled_budget_amount,
      "Mutabakat Toplamı": normalizedKpi.capex_reconciliation_total,
      "Mutabakat Farkı": normalizedKpi.capex_reconciliation_difference,
      Aşım: normalizedKpi.capex_overrun_amount,
      "Bütçe Dışı": normalizedKpi.capex_budget_outside_amount
    },
    {
      Kategori: "Opex",
      "Toplam Plan": normalizedKpi.opex_total_plan_amount,
      "Gerçekleşen Plan İçi": normalizedKpi.opex_realized_plan_inside_amount,
      "Kalan Bütçe / Kalan Kullanılabilir": normalizedKpi.opex_remaining_available_amount,
      "Pazarlıklı Tasarruf": normalizedKpi.opex_negotiated_saving_amount,
      "Diğer Tasarruf": normalizedKpi.opex_other_saving_amount,
      "İptal Edilen Bütçe": normalizedKpi.opex_canceled_budget_amount,
      "Mutabakat Toplamı": normalizedKpi.opex_reconciliation_total,
      "Mutabakat Farkı": normalizedKpi.opex_reconciliation_difference,
      Aşım: normalizedKpi.opex_overrun_amount,
      "Bütçe Dışı": normalizedKpi.opex_budget_outside_amount
    },
    {
      Kategori: "Sınıflandırılmamış",
      "Toplam Plan": normalizedKpi.unclassified_total_plan_amount,
      "Gerçekleşen Plan İçi": normalizedKpi.unclassified_realized_plan_inside_amount,
      "Kalan Bütçe / Kalan Kullanılabilir": normalizedKpi.unclassified_remaining_available_amount,
      "Pazarlıklı Tasarruf": normalizedKpi.unclassified_negotiated_saving_amount,
      "Diğer Tasarruf": normalizedKpi.unclassified_other_saving_amount,
      "İptal Edilen Bütçe": normalizedKpi.unclassified_canceled_budget_amount,
      "Mutabakat Toplamı": normalizedKpi.unclassified_reconciliation_total,
      "Mutabakat Farkı": normalizedKpi.unclassified_reconciliation_difference,
      Aşım: normalizedKpi.unclassified_overrun_amount,
      "Bütçe Dışı": normalizedKpi.unclassified_budget_outside_amount
    }
  ];

  const reportSummaryRows: ReportRow[] = [
    { Alan: "Rapor adı", Değer: "Raporlama Genel Raporu" },
    { Alan: "Rapor tarihi", Değer: new Date().toLocaleString("tr-TR") },
    { Alan: "Seçili yıl", Değer: numericYear },
    { Alan: "Seçili dönem", Değer: selectedPeriodLabel },
    { Alan: "Seçili aylar", Değer: selectedMonthsLabel },
    { Alan: "Departman", Değer: departmentFilter || "Tümü" },
    { Alan: "Capex/Opex", Değer: capexOpex || "Tümü" },
    { Alan: "Nitelik", Değer: assetTypeFilter || "Tümü" },
    { Alan: "Bütçe Kalemi", Değer: selectedBudgetItemLabel },
    { Alan: "Hazırlayan kullanıcı", Değer: user?.username || user?.full_name || "-" }
  ];

  const buildPlanRows = (items: PlanEntry[]): ReportRow[] =>
    items.map((item) => ({
      "Bütçe Kalemi": formatBudgetItemLabel({
        code: item.budget_code,
        name: item.budget_name
      }),
      "Ay / Dönem": formatMonth(item.month),
      Departman: item.department || "-",
      "Capex/Opex": item.capex_opex ?? item.map_capex_opex ?? "-",
      Nitelik: item.asset_type ?? item.map_nitelik ?? item.nitelik ?? "-",
      "Toplam Bütçe": toSafeNumber(item.revised_amount ?? item.amount),
      "Gerçekleşen Harcama": toSafeNumber(item.actual_amount),
      Kullanılmayacak: toSafeNumber(item.unused_amount),
      "Kalan Kullanılabilir": toSafeNumber(item.available_amount)
    }));

  const buildExpenseRows = (items: ReportExpense[]): ReportRow[] =>
    items.map((expense) => {
      const rawDate = expense.expense_date ?? expense.date ?? "";
      const allocationText =
        expense.allocations?.length
          ? expense.allocations
              .map((allocation) => `${formatMonth(allocation.month)}: ${formatCurrency(toSafeNumber(allocation.allocated_amount))}`)
              .join(", ")
          : expense.allocation_count ? `${expense.allocation_count} aya dağıtılmış` : "Tek ay";
      return {
        Tarih: rawDate ? new Date(rawDate).toLocaleDateString("tr-TR") : "-",
        "Bütçe Kalemi": formatBudgetItemLabel({
          code: expense.budget_code,
          name: expense.budget_name
        }),
        Departman: expense.department || "-",
        "Capex/Opex": expense.capex_opex ?? expense.map_capex_opex ?? "-",
        Nitelik: expense.asset_type ?? expense.map_nitelik ?? expense.nitelik ?? "-",
        Tutar: toSafeNumber(expense.amount),
        Dağıtım: allocationText,
        Satıcı: expense.vendor || "-",
        "Bütçe Dışı": Boolean(expense.is_out_of_budget ?? expense.out_of_budget) ? "Evet" : "Hayır",
        "Durum / Tür": expense.status === "cancelled" ? "İptal" : "Kaydedildi",
        "Kaydı Giren": expense.created_by_name || expense.created_by_username || "-"
      };
    });

  const buildStatusRows = (items: OverBudgetItem[], valueLabel: string): ReportRow[] =>
    items.map((item) => ({
      "Bütçe Kalemi": formatBudgetItemLabel({
        code: item.budget_code,
        name: item.budget_name
      }),
      "Ay / Dönem": formatMonths(item.months, item.month),
      Departman: item.department || "-",
      "Capex/Opex": item.capex_opex || "-",
      Nitelik: item.asset_type || "-",
      "Toplam Bütçe": toSafeNumber(item.plan),
      "Gerçekleşen Harcama": toSafeNumber(item.actual),
      [valueLabel]: toSafeNumber(item.over)
    }));

  const buildUnusedRows = (items: OverBudgetItem[]): ReportRow[] =>
    items.map((item) => ({
      "Bütçe Kalemi": formatBudgetItemLabel({
        code: item.budget_code,
        name: item.budget_name
      }),
      "Ay / Dönem": formatMonths(item.months, item.month),
      Departman: item.department || "-",
      "Capex/Opex": item.capex_opex || "-",
      Nitelik: item.asset_type || "-",
      "Toplam Bütçe": toSafeNumber(item.plan),
      "Kullanılmayacak Tutar": toSafeNumber(item.unused_amount ?? item.over),
      Sebep: formatUnusedReason(item.reason),
      Not: item.note || "",
      "Güncelleme Tarihi": item.unused_updated_at
        ? new Date(item.unused_updated_at).toLocaleString("tr-TR")
        : "-"
    }));

  const buildCombinedSavingRows = (): ReportRow[] =>
    combinedSavingItems.map(({ type, item, amount, unusedAmount }) => ({
      Tür: type,
      "Bütçe Kalemi": formatBudgetItemLabel({
        code: item.budget_code,
        name: item.budget_name
      }),
      "Ay / Dönem": formatMonths(item.months, item.month),
      Departman: item.department || "-",
      "Capex/Opex": item.capex_opex || "-",
      Nitelik: item.asset_type || "-",
      "Toplam Bütçe": toSafeNumber(item.plan),
      "Gerçekleşen Harcama": type === "Pazarlıklı Tasarruf" ? toSafeNumber(item.actual) : "-",
      "Kullanılmayacak Tutar": unusedAmount > 0 ? unusedAmount : "-",
      Tasarruf: amount
    }));

  const buildTransferRows = (items: BudgetTransfer[]): ReportRow[] =>
    items.map((transfer) => ({
      "Kaynak Bütçe": transfer.source_budget_name || transfer.source_budget_item_id,
      "Kaynak Ay": formatMonth(transfer.source_month),
      "Hedef Bütçe": transfer.target_budget_name || transfer.target_budget_item_id,
      "Hedef Ay": formatMonth(transfer.target_month),
      "Aktarım Tutarı": toSafeNumber(transfer.amount),
      Sebep: transfer.reason || "-",
      Tarih: transfer.created_at ? new Date(transfer.created_at).toLocaleDateString("tr-TR") : "-",
      Durum: transfer.is_cancelled ? "İptal" : "Aktif"
    }));

  const buildPurchaseRows = (items: PurchaseFormPrepared[]): ReportRow[] =>
    items.map((item) => ({
      "Bütçe Kalemi": formatBudgetItemLabel({
        code: item.budget_code,
        name: item.budget_name
      }),
      "Ay / Dönem": formatMonth(item.month),
      Departman: item.department || "-",
      Yıl: item.year,
      Senaryo: item.scenario_id ?? "-"
    }));

  const purchaseRequestedRows = buildPlanRows(
    planRows.filter((item) => Boolean(item.purchase_requested))
  );
  const purchasedRows = buildPurchaseRows(purchasePreparedRows);

  const executiveSummaryRows: ReportRow[] = [
    ...reportSummaryRows.map((row) => ({
      Bölüm: "Rapor Özeti",
      Başlık: row.Alan,
      Değer: row.Değer,
      "Kayıt Sayısı": "",
      Açıklama: ""
    })),
    ...cardSummaryRows.map((row) => ({
      Bölüm: "Kart Özeti",
      Başlık: row["Kart Adı"],
      Değer: row.Tutar,
      "Kayıt Sayısı": row["Kayıt Sayısı"],
      Açıklama: row.Açıklama
    }))
  ];

  const reportRowsById: Record<ReportId, ReportRow[]> = {
    "executive-summary": executiveSummaryRows,
    "all-reports": cardSummaryRows,
    "plan-detail": buildPlanRows(planRows),
    transfer: buildTransferRows(transfers),
    remaining: buildStatusRows(remainingItems, "Kalan Bütçe"),
    unused: buildUnusedRows(unusedItems),
    "expense-detail": buildExpenseRows(expenseRows),
    "out-of-budget": buildExpenseRows(outOfBudgetExpenses),
    cancelled: buildExpenseRows(cancelledExpenses),
    overrun: buildStatusRows(overrunItems, "Aşım"),
    negotiated: buildStatusRows(negotiatedItems, "Pazarlıklı Tasarruf"),
    "other-saving": buildUnusedRows(unusedItems),
    "total-saving": buildCombinedSavingRows(),
    purchased: purchasedRows,
    "purchase-requested": purchaseRequestedRows
  };

  const reportGroups: {
    title: string;
    reports: {
      id?: ReportId;
      title: string;
      description: string;
      action?: "all-reports" | "quarterly" | "prepared-purchase";
    }[];
  }[] = [
    {
      title: "Genel Raporlar",
      reports: [
        { id: "executive-summary", title: "Özet Raporu", description: "Filtre ve kart özetleri" },
        { title: "Tüm Kartları Excel’e Aktar", description: "Kart özeti ve detay sheetleri", action: "all-reports" },
        { title: "3 Aylık XLSX İndir", description: "Mevcut üç aylık rapor", action: "quarterly" }
      ]
    },
    {
      title: "Bütçe Raporları",
      reports: [
        { id: "plan-detail", title: "Plan Detay Raporu", description: "Plan, toplam bütçe ve harcama" },
        { id: "transfer", title: "Bütçe Aktarım Raporu", description: "Aktif bütçe aktarımları" },
        { id: "remaining", title: "Kalan Bütçe Raporu", description: "Aktif kullanılabilir kalan bütçeler" },
        { id: "unused", title: "Kullanılmayacak Bütçe Raporu", description: "Plan bazlı kullanılmayacak kayıtlar" }
      ]
    },
    {
      title: "Harcama Raporları",
      reports: [
        { id: "expense-detail", title: "Harcama Detay Raporu", description: "Tüm harcama kayıtları" },
        { id: "out-of-budget", title: "Bütçe Dışı Harcamalar Raporu", description: "Bütçe dışı kayıtlar" },
        { id: "cancelled", title: "İptal Edilen Harcamalar Raporu", description: "İptal statüsündeki harcamalar" },
        { id: "overrun", title: "Aşım Raporu", description: "Bütçeyi aşan kalemler" }
      ]
    },
    {
      title: "Tasarruf Raporları",
      reports: [
        { id: "negotiated", title: "Pazarlıklı Tasarruf Raporu", description: "Gerçekleşen alım tasarrufu" },
        { id: "other-saving", title: "Diğer Tasarruf Raporu", description: "Kullanılmayacak bütçeler" },
        { id: "total-saving", title: "Toplam Tasarruf Raporu", description: "Pazarlıklı + Diğer" }
      ]
    },
    {
      title: "Satın Alma Raporları",
      reports: [
        { id: "purchased", title: "Satın Alındı Raporu", description: "Satın alma formu hazırlananlar" },
        { id: "purchase-requested", title: "Talep Oluşturuldu Raporu", description: "Plan kayıtlarındaki talep işaretleri" },
        {
          title: "Satın Alma Formu Hazırlanan Bütçeler XLSX",
          description: "Mevcut özel XLSX raporu",
          action: "prepared-purchase"
        }
      ]
    }
  ];

  const selectedReportRows = reportRowsById[selectedReport] ?? [];
  const selectedReportTitle =
    reportGroups.flatMap((group) => group.reports).find((report) => report.id === selectedReport)?.title ??
    "Rapor Önizleme";
  const previewColumns = Object.keys(selectedReportRows[0] ?? { Bilgi: "Kayıt bulunamadı" });
  const selectedReportTotals = buildReportTotals(selectedReportRows);
  const selectedReportTotalRows = buildReportTotalRows(selectedReportRows);

  const handleImport = async (file: File, type: "json" | "csv" | "xlsx") => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const { data } = await client.post<ImportSummary>(`/io/import/${type}`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setImportSummary(data);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["budget-items"] });
      queryClient.invalidateQueries({ queryKey: ["scenarios"] });
    } catch (err) {
      console.error(err);
      if (axios.isAxiosError(err)) {
        const detail =
          (err.response?.data as { detail?: string; message?: string } | undefined)?.detail ||
          (err.response?.data as { detail?: string; message?: string } | undefined)?.message;
        setError(detail || "Dosya içe aktarılırken bir hata oluştu. Lütfen formatı kontrol edin.");
      } else {
        setError("Dosya içe aktarılırken bir hata oluştu. Lütfen formatı kontrol edin.");
      }
      setImportSummary(null);
    }
  };

  const handleFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    type: "json" | "csv"
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (type === "json") {
        void handleImport(file, "json");
      } else if (extension === "xlsx" || extension === "xls") {
        void handleImport(file, "xlsx");
      } else {
        void handleImport(file, "csv");
      }
      event.target.value = "";
    }
  };

  const downloadBlob = (
    data: BlobPart | Blob,
    fileName: string,
    options?: BlobPropertyBag
  ) => {
    const blob = data instanceof Blob && !options ? data : new Blob([data], options);
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const resolveDownloadErrorMessage = async (err: unknown, fallback: string) => {
    if (!axios.isAxiosError(err)) return fallback;
    const data = err.response?.data;
    if (data instanceof Blob) {
      try {
        const text = await data.text();
        if (text) {
          const parsed = JSON.parse(text) as { detail?: string; message?: string };
          return parsed.detail || parsed.message || fallback;
        }
      } catch {
        return fallback;
      }
    }
    const typedData = data as { detail?: string; message?: string } | undefined;
    if (typedData?.detail || typedData?.message) {
      return typedData.detail || typedData.message || fallback;
    }
    return err.message && err.message !== "Network Error" ? err.message : fallback;
  };

  const buildLegacyExportParams = () => {
    const params: Record<string, string | number> = {};
    if (year) params.year = Number(year);
    if (scenarioId) params.scenario_id = scenarioId;
    if (budgetItemId) params.budget_item_id = budgetItemId;
    if (selectedMonthList.length === 1) params.month = selectedMonthList[0];
    if (departmentFilter) params.department = departmentFilter;
    return params;
  };

  const handleExportXlsx = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const response = await client.get("/io/export/xlsx", {
        params: buildLegacyExportParams(),
        responseType: "blob"
      });
      downloadBlob(response.data, `butce-raporu-${Date.now()}.xlsx`);
    } catch (err) {
      console.error(err);
      setExportError("Dışa aktarma sırasında bir hata oluştu. Lütfen filtreleri kontrol edin.");
    } finally {
      setExporting(false);
    }
  };

  const handleQuarterlyExportXlsx = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const response = await client.get("/io/export/quarterly/xlsx", {
        params: buildLegacyExportParams(),
        responseType: "blob"
      });
      downloadBlob(response.data, `butce-ucaylik-rapor-${Date.now()}.xlsx`);
    } catch (err) {
      console.error(err);
      setExportError("Üç aylık rapor indirilirken bir hata oluştu. Lütfen filtreleri kontrol edin.");
    } finally {
      setExporting(false);
    }
  };

  const handleFilteredExpenseExport = async (type: "out-of-budget" | "cancelled") => {
    setExporting(true);
    setExportError(null);
    try {
      const response = await client.get(`/io/export/expenses/${type}`, {
        params: buildLegacyExportParams(),
        responseType: "blob"
      });
      const fileName =
        type === "out-of-budget"
          ? `butce-disi-harcamalar-${Date.now()}.xlsx`
          : `iptal-edilen-harcamalar-${Date.now()}.xlsx`;
      downloadBlob(response.data, fileName);
    } catch (err) {
      console.error(err);
      setExportError("Seçili rapor indirilirken bir hata oluştu. Lütfen filtreleri kontrol edin.");
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadPreparedPurchaseForms = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const response = await client.get("/reports/purchase-forms-prepared/xlsx", {
        params: buildLegacyExportParams(),
        responseType: "blob"
      });
      downloadBlob(response.data, `satinalma_formu_hazirlanan_butceler_${year}.xlsx`);
    } catch (err) {
      console.error(err);
      setExportError("Rapor indirilirken hata oluştu. Lütfen filtreleri kontrol edin.");
    } finally {
      setExporting(false);
    }
  };

  const appendReportDetailSheet = (
    workbook: XLSX.WorkBook,
    sheetName: string,
    rows: ReportRow[]
  ) => {
    appendRowsToWorkbook(workbook, sheetName, withReportTotalRow(rows), moneyColumns);
  };

  const handleExportSelectedReport = () => {
    const workbook = XLSX.utils.book_new();
    appendRowsToWorkbook(
      workbook,
      "Rapor Özeti",
      [
        { Alan: "Rapor adı", Değer: selectedReportTitle },
        { Alan: "Kayıt sayısı", Değer: selectedReportRows.length },
        ...reportSummaryRows
      ],
      moneyColumns
    );
    appendRowsToWorkbook(workbook, "Toplamlar", selectedReportTotalRows, moneyColumns);
    appendReportDetailSheet(workbook, selectedReportTitle, selectedReportRows);
    XLSX.writeFile(
      workbook,
      `${buildExcelFileName("rapor", selectedReportTitle, numericYear, period || selectedMonthsLabel)}.xlsx`
    );
  };

  const handleExportAllReports = () => {
    const workbook = XLSX.utils.book_new();
    appendRowsToWorkbook(workbook, "Rapor Özeti", reportSummaryRows, moneyColumns);
    appendRowsToWorkbook(workbook, "Kart Özeti", cardSummaryRows, moneyColumns);
    appendRowsToWorkbook(workbook, "Mutabakat Kontrolü", reconciliationRows, moneyColumns);
    appendReportDetailSheet(workbook, "Plan Detayı", reportRowsById["plan-detail"]);
    appendReportDetailSheet(workbook, "Harcama Detayı", reportRowsById["expense-detail"]);
    appendReportDetailSheet(workbook, "Bütçe Dışı", reportRowsById["out-of-budget"]);
    appendReportDetailSheet(workbook, "Kalan Bütçe", reportRowsById.remaining);
    appendReportDetailSheet(workbook, "Pazarlıklı Tasarruf", reportRowsById.negotiated);
    appendReportDetailSheet(workbook, "Diğer Tasarruf", reportRowsById["other-saving"]);
    appendReportDetailSheet(workbook, "Toplam Tasarruf", reportRowsById["total-saving"]);
    appendReportDetailSheet(workbook, "Aşım", reportRowsById.overrun);
    appendReportDetailSheet(workbook, "Kullanılmayacak Bütçe", reportRowsById.unused);
    appendReportDetailSheet(workbook, "İptal Harcamalar", reportRowsById.cancelled);
    appendReportDetailSheet(workbook, "Satın Alma Talep", [
      ...reportRowsById.purchased,
      ...reportRowsById["purchase-requested"]
    ]);
    XLSX.writeFile(
      workbook,
      `${buildExcelFileName("raporlama_genel_rapor", numericYear, period || selectedMonthsLabel)}.xlsx`
    );
  };

  const handleDownloadBackup = async (type: "full" | "users") => {
    setExporting(true);
    setBackupFeedback(null);
    try {
      const response = await client.get(`/backup/${type}`, {
        responseType: "blob",
        suppressGlobalError: true
      });
      const fileName =
        type === "full"
          ? `butce_tam_yedek_${Date.now()}.json`
          : `butce_kullanicilar_${Date.now()}.json`;
      downloadBlob(response.data, fileName, { type: "application/json" });
      setBackupFeedback({ message: "Yedek başarıyla indirildi.", severity: "success" });
    } catch (err) {
      console.error(err);
      const message = await resolveDownloadErrorMessage(
        err,
        "Yedek indirilirken hata oluştu."
      );
      setBackupFeedback({ message, severity: "error" });
    } finally {
      setExporting(false);
    }
  };

  const handleRestoreBackup = async (file: File) => {
    const confirmed = window.confirm("Mevcut tüm veri silinip yüklenecek, emin misiniz?");
    if (!confirmed) return;
    setExporting(true);
    setBackupFeedback(null);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      await client.post("/backup/restore/full", payload);
      setBackupFeedback({ message: "Yedek başarıyla geri yüklendi.", severity: "success" });
    } catch (err) {
      console.error(err);
      setBackupFeedback({ message: "Yedek geri yüklenirken hata oluştu.", severity: "error" });
    } finally {
      setExporting(false);
    }
  };

  const handleRestoreFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void handleRestoreBackup(file);
      event.target.value = "";
    }
  };

  const downloadSampleCsv = () => {
    downloadBlob(sampleCsv, "butce-ornek.csv", { type: "text/csv;charset=utf-8;" });
  };

  const downloadSampleXlsx = () => {
    const worksheetData = [
      sampleHeaders,
      ...sampleRows.map((row) =>
        sampleHeaders.map((header: SampleHeader) => row[header as keyof BudgetImportRow] ?? "")
      )
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Örnek");
    const workbookBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    downloadBlob(workbookBuffer, "butce-ornek.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
  };

  const summaryCards = [
    { title: "Toplam Plan", value: normalizedKpi.total_plan, count: planRows.length },
    { title: "Gerçekleşen", value: normalizedKpi.total_actual, count: realizedExpenses.length },
    { title: "Kalan Bütçe", value: normalizedKpi.total_remaining, count: remainingItems.length },
    {
      title: "Pazarlıklı Tasarruf",
      value: normalizedKpi.total_negotiated_saving,
      count: negotiatedItems.length
    },
    { title: "Diğer Tasarruf", value: normalizedKpi.total_other_saving, count: unusedItems.length },
    {
      title: "Toplam Tasarruf",
      value: normalizedKpi.total_combined_saving,
      count: combinedSavingItems.length
    },
    { title: "Bütçe Dışı", value: outOfBudgetTotal, count: outOfBudgetExpenses.length },
    { title: "Aşım", value: normalizedKpi.total_overrun, count: overrunItems.length },
    { title: "Kullanılmayacak Bütçe", value: normalizedKpi.total_unused, count: unusedItems.length },
    { title: "İptal Edilen Harcamalar", value: cancelledTotal, count: cancelledExpenses.length }
  ];

  return (
    <Stack spacing={3}>
      <Card>
        <CardHeader
          title="Raporlama Merkezi"
          subheader="Dashboard hesap mantığıyla uyumlu filtreli raporlar, önizleme ve Excel çıktıları"
          action={
            <Button
              variant="contained"
              startIcon={<FileDownloadOutlinedIcon />}
              onClick={handleExportAllReports}
              disabled={exporting || isDashboardFetching || isOverBudgetFetching}
              sx={{ textTransform: "none" }}
            >
              Tüm Raporları Excel’e Aktar
            </Button>
          }
        />
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                label="Yıl"
                type="number"
                value={year}
                onChange={(event) => setYear(event.target.value ? Number(event.target.value) : "")}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                select
                label="Dönem"
                value={period}
                onChange={(event) => {
                  const value = event.target.value;
                  setPeriod(value);
                  setSelectedMonths(periodOptions.find((option) => option.value === value)?.months ?? []);
                }}
                fullWidth
                size="small"
              >
                {periodOptions.map((option) => (
                  <MenuItem key={option.value || "all"} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={4}>
              <Autocomplete
                multiple
                size="small"
                options={monthLabels.map((label, index) => ({ label, value: index + 1 }))}
                value={monthLabels
                  .map((label, index) => ({ label, value: index + 1 }))
                  .filter((option) => selectedMonthList.includes(option.value))}
                onChange={(_, value) => {
                  setPeriod("");
                  setSelectedMonths(value.map((option) => option.value));
                }}
                getOptionLabel={(option) => option.label}
                isOptionEqualToValue={(option, value) => option.value === value.value}
                renderInput={(params) => (
                  <TextField {...params} label="Ay" placeholder="Tüm Aylar" size="small" />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                select
                label="Departman"
                value={departmentFilter}
                onChange={(event) => setDepartmentFilter(event.target.value)}
                fullWidth
                size="small"
              >
                <MenuItem value="">Tümü</MenuItem>
                {departments.map((department) => (
                  <MenuItem key={department} value={department}>
                    {department}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                select
                label="Capex/Opex"
                value={capexOpex}
                onChange={(event) => setCapexOpex(event.target.value as "" | "capex" | "opex")}
                fullWidth
                size="small"
              >
                <MenuItem value="">Tümü</MenuItem>
                <MenuItem value="capex">Capex</MenuItem>
                <MenuItem value="opex">Opex</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                select
                label="Nitelik"
                value={assetTypeFilter}
                onChange={(event) => setAssetTypeFilter(event.target.value)}
                fullWidth
                size="small"
              >
                <MenuItem value="">Tümü</MenuItem>
                {assetTypeOptions.map((assetType) => (
                  <MenuItem key={assetType} value={assetType}>
                    {assetType}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={9}>
              <Autocomplete
                size="small"
                options={budgetItems}
                value={budgetItems.find((item) => item.id === budgetItemId) ?? null}
                onChange={(_, value) => setBudgetItemId(value?.id ?? null)}
                getOptionLabel={(option) => formatBudgetItemLabel(option) || "-"}
                filterOptions={budgetFilterOptions}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderInput={(params) => (
                  <TextField {...params} label="Bütçe Kalemi" placeholder="Tümü" />
                )}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {(exportError || error) && <Alert severity="error">{exportError || error}</Alert>}

      <Grid container spacing={2}>
        {summaryCards.map((card) => (
          <Grid item xs={12} sm={6} md={3} lg={2} key={card.title}>
            <Card sx={{ height: "100%" }}>
              <CardContent>
                <Stack spacing={1}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>
                    {card.title}
                  </Typography>
                  <Typography variant="h6" fontWeight={800}>
                    {formatCurrency(toSafeNumber(card.value))}
                  </Typography>
                  <Chip size="small" label={`${card.count} kayıt`} sx={{ alignSelf: "flex-start" }} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={1.5}>
        {reportGroups.map((group) => (
          <Grid item xs={12} sm={6} lg={2.4} key={group.title}>
            <Card sx={{ height: "100%" }}>
              <CardHeader
                title={group.title}
                avatar={<AssessmentOutlinedIcon color="primary" fontSize="small" />}
                titleTypographyProps={{ variant: "subtitle2", fontWeight: 800 }}
                sx={{ py: 1.25, pb: 0.5 }}
              />
              <CardContent sx={{ pt: 0.5, pb: 1.25 }}>
                <Stack spacing={0.75}>
                  {group.reports.map((report) => (
                    <Button
                      key={report.title}
                      size="small"
                      variant={report.id === selectedReport ? "contained" : "outlined"}
                      color={report.action ? "secondary" : "primary"}
                      onClick={() => {
                        if (report.action === "all-reports") {
                          handleExportAllReports();
                          return;
                        }
                        if (report.action === "quarterly") {
                          void handleQuarterlyExportXlsx();
                          return;
                        }
                        if (report.action === "prepared-purchase") {
                          void handleDownloadPreparedPurchaseForms();
                          return;
                        }
                        if (report.id) setSelectedReport(report.id);
                      }}
                      disabled={exporting}
                      sx={{
                        justifyContent: "space-between",
                        textAlign: "left",
                        textTransform: "none",
                        minHeight: 50,
                        px: 1,
                        py: 0.75
                      }}
                    >
                      <Box>
                        <Typography variant="body2" fontWeight={700}>
                          {report.title}
                        </Typography>
                        <Typography variant="caption" color="inherit" sx={{ display: "block", lineHeight: 1.2 }}>
                          {report.description}
                        </Typography>
                      </Box>
                    </Button>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card>
        <CardHeader
          title={selectedReportTitle}
          subheader={`Önizleme: ${selectedReportRows.length} kayıt`}
          action={
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={handleExportSelectedReport}
              disabled={exporting}
              sx={{ textTransform: "none" }}
            >
              Excel’e Aktar
            </Button>
          }
        />
        <CardContent>
          {selectedReportTotals.length > 0 && (
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2, rowGap: 1 }}>
              {selectedReportTotals.map((item) => (
                <Chip
                  key={item.label}
                  size="small"
                  variant="outlined"
                  label={`${item.label}: ${formatCurrency(item.total)}`}
                />
              ))}
            </Stack>
          )}
          <Box sx={{ maxHeight: 560, overflow: "auto" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {previewColumns.map((column) => (
                    <TableCell key={column}>{column}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {selectedReportRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={previewColumns.length}>
                      <Typography variant="body2" color="text.secondary">
                        Kayıt bulunamadı.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  selectedReportRows.slice(0, 200).map((row, rowIndex) => (
                    <TableRow key={`preview-${rowIndex}`} hover>
                      {previewColumns.map((column) => (
                        <TableCell key={column}>
                          {typeof row[column] === "number" && moneyColumns.includes(column)
                            ? formatCurrency(toSafeNumber(row[column]))
                            : row[column] ?? "-"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Box>
          {selectedReportRows.length > 200 && (
            <Typography variant="caption" color="text.secondary">
              Önizlemede ilk 200 kayıt gösteriliyor. Excel çıktısında tüm kayıtlar yer alır.
            </Typography>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Mevcut Excel / Yedek Araçları" />
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Eski çalışan indirme butonları korunarak bu bölüme taşındı.
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={4}>
                <Button
                  variant="contained"
                  startIcon={<DownloadIcon />}
                  onClick={() => void handleExportXlsx()}
                  disabled={exporting}
                  fullWidth
                >
                  Bütçe Yedek Al
                </Button>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <Button
                  variant="contained"
                  startIcon={<DownloadIcon />}
                  onClick={() => void handleQuarterlyExportXlsx()}
                  disabled={exporting}
                  fullWidth
                >
                  3 Aylık XLSX İndir
                </Button>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <Button
                  variant="contained"
                  startIcon={<DownloadIcon />}
                  onClick={() => void handleFilteredExpenseExport("out-of-budget")}
                  disabled={exporting}
                  fullWidth
                >
                  Bütçe Dışı Harcamalar XLSX
                </Button>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <Button
                  variant="contained"
                  startIcon={<DownloadIcon />}
                  onClick={() => void handleFilteredExpenseExport("cancelled")}
                  disabled={exporting}
                  fullWidth
                >
                  İptal Edilen Harcamalar XLSX
                </Button>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <Button
                  variant="contained"
                  startIcon={<DownloadIcon />}
                  onClick={() => void handleDownloadPreparedPurchaseForms()}
                  disabled={exporting}
                  fullWidth
                >
                  Satın alma formu hazırlanan bütçeler XLSX
                </Button>
              </Grid>
            </Grid>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        {!isViewer && (
          <Grid item xs={12} md={6}>
          <Card sx={{ height: "100%" }}>
            <CardHeader title="İçe Aktarım" />
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="body2" color="text.secondary">
                  Plan ve harcama verilerini JSON, CSV veya Excel (XLSX) formatında sisteme aktarabilirsiniz.
                </Typography>
                {importSummary && (
                  <Alert severity="success">
                    {importSummary.message ?? "İçe aktarma tamamlandı"} — Plan: {importSummary.imported_plans}
                    , Harcama: {importSummary.imported_expenses}, Atlanan Satır: {importSummary.skipped_rows}
                  </Alert>
                )}
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <Button component="label" variant="contained" startIcon={<CloudUploadIcon />}>
                    JSON Yükle
                    <input
                      type="file"
                      hidden
                      accept="application/json"
                      onChange={(event) => handleFileChange(event, "json")}
                    />
                  </Button>
                  <Button component="label" variant="outlined" startIcon={<CloudUploadIcon />}>
                    CSV/XLSX Yükle
                    <input
                      type="file"
                      hidden
                      accept=".csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={(event) => handleFileChange(event, "csv")}
                    />
                  </Button>
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignSelf: "flex-start" }}>
                  <Button variant="text" startIcon={<DownloadIcon />} onClick={downloadSampleCsv}>
                    Örnek CSV indir
                  </Button>
                  <Button variant="text" startIcon={<DownloadIcon />} onClick={downloadSampleXlsx}>
                    Örnek XLSX indir
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        )}

        {isAdmin && (
          <Grid item xs={12} md={6}>
            <Card sx={{ height: "100%" }}>
              <CardHeader title="Yedekleme Araçları" />
              <CardContent>
                <Stack spacing={2}>
                  <Typography variant="body2" color="text.secondary">
                    Tam yedek ve kullanıcı yedeklerini alabilir, mevcut veriyi tamamen değiştirerek geri yükleyebilirsiniz.
                  </Typography>
                  {backupFeedback && (
                    <Alert severity={backupFeedback.severity}>{backupFeedback.message}</Alert>
                  )}
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <Button
                      variant="contained"
                      startIcon={<DownloadIcon />}
                      onClick={() => void handleDownloadBackup("full")}
                      disabled={exporting}
                    >
                      Tam Yedek Al
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<DownloadIcon />}
                      onClick={() => void handleDownloadBackup("users")}
                      disabled={exporting}
                    >
                      Kullanıcı Yedeği Al
                    </Button>
                    <Button
                      variant="contained"
                      color="warning"
                      startIcon={<CloudUploadIcon />}
                      onClick={() => restoreInputRef.current?.click()}
                      disabled={exporting}
                    >
                      Geri Yükle (Replace)
                    </Button>
                    <input
                      ref={restoreInputRef}
                      type="file"
                      hidden
                      accept="application/json"
                      onChange={handleRestoreFileChange}
                    />
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Stack>
  );
}
