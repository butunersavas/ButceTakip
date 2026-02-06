import { Component, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Box,
  Checkbox,
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
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis
} from "recharts";
import { useNavigate } from "react-router-dom";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import usePersistentState from "../../hooks/usePersistentState";
import { formatBudgetItemLabel, stripBudgetCode } from "../../utils/budgetLabel";
import { formatBudgetItemMeta } from "../../utils/budgetItem";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import { SummaryCard } from "./SummaryCard";
import {
  COLOR_ACTUAL,
  COLOR_OVER,
  COLOR_PLANNED,
  COLOR_REMAINING
} from "../../theme/chartColors";
import FiltersBar from "../Filters/FiltersBar";
import SafeChartContainer from "../common/SafeChartContainer";

interface DashboardSummary {
  month: number;
  planned: number;
  actual: number;
}

interface DashboardKPI {
  total_plan: number;
  total_actual: number;
  total_remaining: number;
  total_overrun: number;
}

interface DashboardResponse {
  kpi: DashboardKPI;
  monthly: DashboardSummary[];
}

interface OverBudgetSummary {
  over_total: number;
  over_item_count: number;
}

interface OverBudgetItem {
  budget_code: string;
  budget_name: string;
  plan: number;
  actual: number;
  over: number;
  over_pct: number;
  year?: number;
  month?: number | null;
  scenario?: number | null;
}

interface OverBudgetResponse {
  summary: OverBudgetSummary;
  items: OverBudgetItem[];
}

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

type PurchaseReminderItem = {
  budget_item_id: number;
  budget_code: string;
  budget_name: string;
  year: number;
  month: number;
  scenario_id: number;
  department?: string | null;
  is_form_prepared: boolean;
  amount?: number | null;
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

const pieColors: Record<keyof QuarterlySummary, string> = {
  planned: COLOR_PLANNED,
  actual: COLOR_ACTUAL,
  remaining: COLOR_REMAINING,
  overrun: COLOR_OVER
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
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "USD"
  }).format(value ?? 0);
}

function formatBudgetLabel(name?: string | null, code?: string | null) {
  return stripBudgetCode(name ?? "") || code || "-";
}

const buildPurchaseKey = (item: Pick<
  PurchaseReminderItem,
  "budget_code" | "year" | "month" | "scenario_id" | "department"
>) =>
  `${item.budget_code}-${item.year}-${item.month}-${item.scenario_id}-${item.department ?? ""}`;

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
  const client = useAuthorizedClient();
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = usePersistentState<number>("dashboard:year", currentYear);
  const [scenarioId, setScenarioId] = usePersistentState<number | null>("dashboard:scenarioId", null);
  const [month, setMonth] = usePersistentState<number | null>("dashboard:month", null);
  const [budgetItemId, setBudgetItemId] = usePersistentState<number | null>("dashboard:budgetItemId", null);
  const [capexOpex, setCapexOpex] = usePersistentState<"" | "capex" | "opex">(
    "dashboard:capexOpex",
    ""
  );
  const [department, setDepartment] = useState<string>("");
  const [purchaseItems, setPurchaseItems] = useState<PurchaseReminderItem[]>([]);
  const [purchaseDepartmentFilter, setPurchaseDepartmentFilter] = useState("");
  const [purchaseSelections, setPurchaseSelections] = useState<Record<string, boolean>>({});
  const [isAlertsDialogOpen, setIsAlertsDialogOpen] = useState(false);
  const [savingPurchaseStatus, setSavingPurchaseStatus] = useState(false);
  const [purchaseStatusFeedback, setPurchaseStatusFeedback] = useState<
    { message: string; severity: "success" | "error" } | null
  >(null);
  const [warrantyAlertItems, setWarrantyAlertItems] = useState<WarrantyAlertItem[]>([]);
  const [selectedKpiFilter, setSelectedKpiFilter] = useState<
    "total_plan" | "total_actual" | "total_remaining" | "total_overrun" | null
  >(null);
  const [selectedOverrunItem, setSelectedOverrunItem] = useState<{
    budget_code: string;
    budget_name?: string | null;
  } | null>(null);
  const [isOverBudgetDialogOpen, setIsOverBudgetDialogOpen] = useState(false);
  const [forceShowOverBudget, setForceShowOverBudget] = useState(false);
  const [highlightOverBudget, setHighlightOverBudget] = useState(false);
  const overBudgetRef = useRef<HTMLDivElement | null>(null);
  const trendSectionRef = useRef<HTMLDivElement | null>(null);
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

  const now = new Date();
  const yearNow = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const dayKey = `${yearNow}${String(currentMonth).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const alertsShownKey = `dashboard_alert_shown_${dayKey}`;
  const purchaseDoneKey = `purchase_alert_done_${yearNow}_${currentMonth}`;
  const debouncedFilters = useDebouncedValue(
    useMemo(
      () => ({
        year,
        scenarioId,
        month,
        budgetItemId,
        department,
        capexOpex
      }),
      [year, scenarioId, month, budgetItemId, department, capexOpex]
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
        }
      });
      return data ?? [];
    }
  });

  useEffect(() => {
    const shown = localStorage.getItem(alertsShownKey);
    if (shown === "shown") {
      return;
    }

    let isMounted = true;

    const fetchWarrantyAlerts = async () => {
      const { data } = await client.get("/warranty-items");
      return Array.isArray(data)
        ? data
        : (data as { items?: WarrantyAlertItem[] } | null)?.items ?? [];
    };

    const loadAlerts = async () => {
      const purchaseDismissed = localStorage.getItem(purchaseDoneKey) === "done";
      const purchasePromise = purchaseDismissed
        ? Promise.resolve({ data: [] as PurchaseReminderItem[] })
        : client.get<PurchaseReminderItem[]>(
            `/budget/purchase-reminders?year=${yearNow}&month=${currentMonth}`
          );

      const [purchaseResult, warrantyResult] = await Promise.allSettled([
        purchasePromise,
        fetchWarrantyAlerts()
      ]);

      if (!isMounted) return;

      const purchaseList =
        purchaseResult.status === "fulfilled" ? purchaseResult.value.data ?? [] : [];
      const warrantyList =
        warrantyResult.status === "fulfilled" ? warrantyResult.value : [];
      const { normalized, expired, near } = splitWarrantyAlerts(warrantyList);

      setPurchaseItems(purchaseList);
      setWarrantyAlertItems(normalized);

      if (purchaseList.length > 0 || expired.length > 0 || near.length > 0) {
        setIsAlertsDialogOpen(true);
        localStorage.setItem(alertsShownKey, "shown");
      }
    };

    loadAlerts();

    return () => {
      isMounted = false;
    };
  }, [alertsShownKey, client, currentMonth, purchaseDoneKey, yearNow]);

  const handleCloseAlertsDialog = () => {
    setIsAlertsDialogOpen(false);
  };

  const warrantyAlerts = useMemo(
    () => splitWarrantyAlerts(warrantyAlertItems),
    [warrantyAlertItems]
  );

  useEffect(() => {
    const nextSelections: Record<string, boolean> = {};
    purchaseItems.forEach((item) => {
      nextSelections[buildPurchaseKey(item)] = item.is_form_prepared;
    });
    setPurchaseSelections(nextSelections);
  }, [purchaseItems]);

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

  const { data: riskyItems = [] } = useQuery<RiskyItem[]>({
    queryKey: [
      "dashboard",
      "risky-items",
      debouncedFilters.year,
      debouncedFilters.month,
      debouncedFilters.department,
      debouncedFilters.capexOpex
    ],
    queryFn: async () => {
      const params: Record<string, number | string> = { year: debouncedFilters.year };

      if (debouncedFilters.month) {
        params.month = debouncedFilters.month;
      }

      if (debouncedFilters.department) {
        params.department = debouncedFilters.department;
      }

      if (debouncedFilters.capexOpex) {
        params.capex_opex = debouncedFilters.capexOpex;
      }

      const { data } = await client.get<RiskyItem[]>("/dashboard/risky-items", {
        params
      });

      return data ?? [];
    }
  });

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
      if (matchingScenario) {
        return matchingScenario.id;
      }
      return scenarios[0]?.id ?? null;
    });
  }, [scenarios, year]);

  const { data: dashboard, isLoading } = useQuery<DashboardResponse>({
    queryKey: [
      "dashboard",
      debouncedFilters.year,
      debouncedFilters.scenarioId,
      debouncedFilters.month,
      debouncedFilters.budgetItemId,
      debouncedFilters.department,
      debouncedFilters.capexOpex
    ],
    queryFn: async () => {
      const params: Record<string, number | string> = { year: debouncedFilters.year };
      if (debouncedFilters.scenarioId) params.scenario_id = debouncedFilters.scenarioId;
      if (debouncedFilters.month) params.month = debouncedFilters.month;
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
      debouncedFilters.month,
      debouncedFilters.budgetItemId,
      selectedBudgetCode,
      debouncedFilters.department,
      debouncedFilters.capexOpex
    ],
    queryFn: async () => {
      const params: Record<string, number | string> = {
        year: debouncedFilters.year,
        months: 3
      };
      if (debouncedFilters.scenarioId) params.scenario_id = debouncedFilters.scenarioId;
      if (debouncedFilters.month) params.month = debouncedFilters.month;
      if (debouncedFilters.department) params.department = debouncedFilters.department;
      if (debouncedFilters.capexOpex) params.capex_opex = debouncedFilters.capexOpex;
      if (selectedBudgetCode) {
        params.budget_code = selectedBudgetCode;
      }
      const { data } = await client.get<OverBudgetResponse>("/dashboard/overbudget", {
        params
      });
      return data;
    },
    enabled: Boolean(debouncedFilters.year)
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
      selectedOverrunBudgetItemId ?? debouncedFilters.budgetItemId,
      debouncedFilters.department,
      debouncedFilters.capexOpex,
      selectedOverrunItem?.budget_code ?? null
    ],
    queryFn: async () => {
      const params: Record<string, number | string> = { year: debouncedFilters.year };
      if (debouncedFilters.scenarioId) params.scenario_id = debouncedFilters.scenarioId;
      if (debouncedFilters.month) params.month = debouncedFilters.month;
      const trendBudgetItemId = selectedOverrunBudgetItemId ?? debouncedFilters.budgetItemId;
      if (trendBudgetItemId) params.budget_item_id = trendBudgetItemId;
      if (selectedOverrunItem?.budget_code) {
        params.budget_code = selectedOverrunItem.budget_code;
      }
      if (debouncedFilters.department) params.department = debouncedFilters.department;
      if (debouncedFilters.capexOpex) params.capex_opex = debouncedFilters.capexOpex;
      const { data } = await client.get("/dashboard/trend", { params });
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
    setMonth(null);
    setBudgetItemId(null);
    setCapexOpex("");
    setDepartment("");
    setSelectedKpiFilter(null);
    setForceShowOverBudget(false);
    setHighlightOverBudget(false);
    setSelectedOverrunItem(null);
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

  const quarterlyTotals = useMemo(() => {
    const quarters = [
      { label: "Q1", months: [1, 2, 3] },
      { label: "Q2", months: [4, 5, 6] },
      { label: "Q3", months: [7, 8, 9] },
      { label: "Q4", months: [10, 11, 12] }
    ];

    return quarters.map((quarter) => {
      const totals = monthlyData.reduce<QuarterlySummary>(
        (acc, entry) => {
          if (!quarter.months.includes(entry.month)) {
            return acc;
          }
          acc.planned += toSafeNumber(entry.planned);
          acc.actual += toSafeNumber(entry.actual);
          acc.overrun += toSafeNumber(entry.overrun);
          acc.remaining += toSafeNumber(entry.remaining);
          return acc;
        },
        { planned: 0, actual: 0, remaining: 0, overrun: 0 }
      );

      const totalValue = totals.actual + totals.overrun + totals.remaining;
      const pieData = [
        { name: "Gerçekleşen", value: totals.actual, color: pieColors.actual },
        { name: "Aşım", value: totals.overrun, color: pieColors.overrun },
        { name: "Kalan", value: totals.remaining, color: pieColors.remaining }
      ];

      return { ...quarter, totals, pieData, totalValue };
    });
  }, [monthlyData]);

  const normalizedKpi = useMemo(() => {
    const totalPlan = dashboard?.kpi.total_plan ?? 0;
    const totalActual = dashboard?.kpi.total_actual ?? 0;
    const rawRemaining = totalPlan - totalActual;

    const totalRemaining = Math.max(rawRemaining, 0);
    const totalOverrun = Math.max(totalActual - totalPlan, dashboard?.kpi.total_overrun ?? 0);

    return {
      total_plan: totalPlan,
      total_actual: totalActual,
      total_remaining: totalRemaining,
      total_overrun: totalOverrun
    } satisfies DashboardKPI;
  }, [dashboard]);

  const formattedTotalPlan = formatCurrency(normalizedKpi.total_plan);
  const formattedActual = formatCurrency(normalizedKpi.total_actual);
  const formattedRemaining = formatCurrency(normalizedKpi.total_remaining);
  const rawOverBudgetItems = overBudget?.items ?? [];
  const overBudgetItems = useMemo(() => {
    return rawOverBudgetItems
      .map((item) => {
        const plan = toSafeNumber(item.plan);
        const actual = toSafeNumber(item.actual);
        const over = Math.max(actual - plan, 0);
        const overPct = plan > 0 ? (over / plan) * 100 : 0;
        return { ...item, plan, actual, over, over_pct: overPct };
      })
      .filter((item) => item.over > 0)
      .sort((a, b) => b.over - a.over);
  }, [rawOverBudgetItems]);
  const overBudgetSummary = useMemo(() => {
    const overTotal = overBudgetItems.reduce((sum, item) => sum + item.over, 0);
    return { over_total: overTotal, over_item_count: overBudgetItems.length };
  }, [overBudgetItems]);
  const overBudgetTopItems = useMemo(() => overBudgetItems.slice(0, 10), [overBudgetItems]);
  const formattedOver = formatCurrency(overBudgetSummary.over_total);
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

  const showPlanned = !selectedKpiFilter || selectedKpiFilter === "total_plan";
  const showActual = !selectedKpiFilter || selectedKpiFilter === "total_actual";
  const showRemaining = !selectedKpiFilter || selectedKpiFilter === "total_remaining";
  const showOverrun = !selectedKpiFilter || selectedKpiFilter === "total_overrun";
  const showOverBudgetSection = !budgetItemId || forceShowOverBudget;
  const hasTrendData = hasTrendMonths && monthlyData.some(
    (entry) => entry.planned > 0 || entry.actual > 0 || entry.remaining > 0 || entry.overrun > 0
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
  const maxOverrunValue = useMemo(() => {
    return monthlyData.reduce((maxValue, entry) => Math.max(maxValue, entry.overrun ?? 0), 0);
  }, [monthlyData]);

  const renderTrendTooltip = ({
    active,
    payload,
    label
  }: {
    active?: boolean;
    payload?: Array<{ payload?: (typeof monthlyData)[number] }>;
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    const data = payload[0]?.payload;
    if (!data) return null;
    return (
      <Box
        sx={{
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          px: 1.5,
          py: 1
        }}
      >
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          {label}
        </Typography>
        <Stack spacing={0.4}>
          <Typography variant="body2">Planlanan: {formatCurrency(toSafeNumber(data.planned))}</Typography>
          <Typography variant="body2">Gerçekleşen: {formatCurrency(toSafeNumber(data.actual))}</Typography>
          <Typography variant="body2">Kalan: {formatCurrency(toSafeNumber(data.remaining))}</Typography>
          <Typography
            variant="body2"
            color={toSafeNumber(data.overrun) > 0 ? "error.main" : "text.secondary"}
          >
            Aşım: {formatCurrency(toSafeNumber(data.overrun))}
          </Typography>
          <Typography variant="body2">
            Aşım %: {toSafeNumber(data.overrunPct ?? data.overrun_pct).toFixed(1)}%
          </Typography>
        </Stack>
      </Box>
    );
  };

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  const handleSummaryCardClick = (filterKey: string) => {
    const isSameFilter = selectedKpiFilter === filterKey;
    setSelectedKpiFilter((prev) => (prev === filterKey ? null : filterKey));
    if (filterKey === "total_overrun") {
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
              size="small"
              select
              label="Senaryo"
              value={scenarioId ?? ""}
              onChange={(event) => setScenarioId(event.target.value ? Number(event.target.value) : null)}
              sx={{ minWidth: 240, "& .MuiInputBase-root": { height: 40 } }}
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
              select
              label="Ay"
              value={month ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                setMonth(value === "" ? null : Number(value));
              }}
              sx={{ minWidth: 160, "& .MuiInputBase-root": { height: 40 } }}
            >
              <MenuItem value="">Tüm Aylar</MenuItem>
              {monthOptions.map((m) => (
                <MenuItem key={m.value} value={m.value}>
                  {m.label}
                </MenuItem>
              ))}
            </TextField>
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
                  title: "Kalan",
                  value: formattedRemaining,
                  subtitle: "Bütçede kalan",
                  icon: <TrendingUpOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
                  iconColor: "warning.main",
                  filterKey: "total_remaining" as const
                },
                {
                  title: "Aşım",
                  value: formattedOver,
                  subtitle: overBudgetSubtitle,
                  icon: <WarningAmberOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
                  iconColor: "error.main",
                  filterKey: "total_overrun" as const
                }
              ].map((card) => (
                <Grid item xs={12} sm={6} md={3} key={card.title}>
                  <SummaryCard
                    {...card}
                    isLoading={isLoading}
                    selected={selectedKpiFilter === card.filterKey}
                    onClick={() => handleSummaryCardClick(card.filterKey)}
                  />
                </Grid>
              ))}
            </Grid>
          </DashboardSectionBoundary>
          <Stack spacing={3}>
            <DashboardSectionBoundary title="Riskteki Kalemler">
              <Card>
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
                <Box ref={overBudgetRef}>
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
                            onClick={() => setIsOverBudgetDialogOpen(true)}
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
                              <TableCell align="right">Plan</TableCell>
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
              <Card ref={trendSectionRef}>
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
                    <Box sx={{ width: "100%", height: 260, minWidth: 240 }}>
                      <SafeChartContainer minHeight={260}>
                        {(size) => (
                          <ComposedChart width={size.width} height={size.height} data={monthlyData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                            <XAxis dataKey="name" tick={{ fill: "#475569" }} />
                            <YAxis
                              yAxisId="left"
                              tick={{ fill: "#475569" }}
                              tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                            />
                            <YAxis
                              yAxisId="right"
                              orientation="right"
                              hide={maxOverrunValue <= 0 || !showOverrun}
                              domain={[0, Math.max(maxOverrunValue * 1.2, 1)]}
                              tick={{ fill: "#475569" }}
                              tickFormatter={(value) => formatCurrency(toSafeNumber(value))}
                            />
                            <ReferenceLine y={0} stroke="#9e9e9e" strokeDasharray="3 3" />
                            <RechartsTooltip
                              content={renderTrendTooltip}
                              labelFormatter={(label) => {
                                const n = Number(label);
                                return Number.isFinite(n)
                                  ? (monthLabels[n - 1] ?? `Ay ${n}`)
                                  : String(label);
                              }}
                            />
                            <Legend />
                            <Bar
                              dataKey="planned"
                              name="Planlanan"
                              fill={pieColors.planned}
                              radius={[6, 6, 0, 0]}
                              yAxisId="left"
                              hide={!showPlanned}
                            />
                            <Bar
                              dataKey="actual"
                              name="Gerçekleşen"
                              fill={pieColors.actual}
                              radius={[6, 6, 0, 0]}
                              yAxisId="left"
                              hide={!showActual}
                            />
                            <Bar
                              dataKey="remaining"
                              name="Kalan"
                              fill={pieColors.remaining}
                              radius={[6, 6, 0, 0]}
                              yAxisId="left"
                              hide={!showRemaining}
                            />
                            <Line
                              dataKey="overrun"
                              name="Aşım"
                              stroke={pieColors.overrun}
                              strokeWidth={2}
                              dot={(props) => {
                                if (!props?.payload || props.payload.overrun <= 0) {
                                  return null;
                                }
                                return (
                                  <circle
                                    cx={props.cx}
                                    cy={props.cy}
                                    r={4}
                                    fill={pieColors.overrun}
                                    stroke="#fff"
                                    strokeWidth={1}
                                  />
                                );
                              }}
                              yAxisId="right"
                              hide={!showOverrun || maxOverrunValue <= 0}
                            />
                          </ComposedChart>
                        )}
                      </SafeChartContainer>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </DashboardSectionBoundary>

            <DashboardSectionBoundary title="Çeyreklik Harcama Dağılımı">
              <Card>
                <CardContent>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
                    <Typography variant="h6" fontWeight={700}>
                      Çeyreklik Harcama Dağılımı
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

                  {!hasTrendData ? (
                    <Typography variant="body2" color="text.secondary">
                      Çeyreklik görünüm için yeterli veri bulunamadı.
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
                        gap: 3,
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
                            <Box sx={{ height: 240, width: "100%" }}>
                              <SafeChartContainer minHeight={240}>
                                {(size) => (
                                  <PieChart width={size.width} height={size.height}>
                                    <RechartsTooltip
                                      formatter={(value: number, name: string) => [
                                        formatCurrency(toSafeNumber(value)),
                                        name
                                      ]}
                                    />
                                    <Pie
                                      data={quarter.pieData}
                                      dataKey="value"
                                      nameKey="name"
                                      innerRadius={50}
                                      outerRadius={80}
                                      paddingAngle={2}
                                    >
                                      {quarter.pieData?.map((entry) => (
                                        <Cell key={`${quarter.label}-${entry.name}`} fill={entry.color} />
                                      ))}
                                    </Pie>
                                  </PieChart>
                                )}
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
        open={isAlertsDialogOpen}
        onClose={handleCloseAlertsDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: 18, fontWeight: 600 }}>
          Uyarılar
        </DialogTitle>
        <DialogContent dividers>
          {purchaseItems.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Bu ay bütçede satın alma kalemleriniz var
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
              <List dense sx={{ maxHeight: 300, overflowY: "auto" }}>
                {filteredPurchaseItems?.map((item) => {
                  const amountLabel =
                    item.amount != null ? formatCurrency(toSafeNumber(item.amount)) : null;
                  const secondaryPieces = [
                    amountLabel ? `Tutar: ${amountLabel}` : null,
                    item.department ? `Departman: ${item.department}` : null
                  ].filter(Boolean);
                  const key = buildPurchaseKey(item);
                  return (
                    <ListItem
                      key={key}
                      secondaryAction={
                        <Checkbox
                          edge="end"
                          checked={purchaseSelections[key] ?? false}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setPurchaseSelections((prev) => ({ ...prev, [key]: checked }));
                          }}
                        />
                      }
                    >
                      <ListItemText
                        primary={formatBudgetLabel(item.budget_name, item.budget_code)}
                        secondary={secondaryPieces.length ? secondaryPieces.join(" • ") : undefined}
                        primaryTypographyProps={{ variant: "body2" }}
                      />
                    </ListItem>
                  );
                })}
              </List>
            </Box>
          )}

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
          <Button size="small" onClick={handleCloseAlertsDialog} disabled={savingPurchaseStatus}>
            Kapat
          </Button>
          {(warrantyAlerts.expired.length > 0 || warrantyAlerts.near.length > 0) && (
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
          {purchaseItems.length > 0 && (
            <Button
              variant="contained"
              size="small"
              disabled={savingPurchaseStatus}
              onClick={async () => {
                try {
                  setSavingPurchaseStatus(true);
                  const payload = purchaseItems.map((item) => ({
                    budget_code: item.budget_code,
                    year: item.year,
                    month: item.month,
                    scenario_id: item.scenario_id,
                    department: item.department ?? null,
                    is_form_prepared: purchaseSelections[buildPurchaseKey(item)] ?? false
                  }));

                  await client.post("/budget/purchase-reminders/mark-prepared", payload);
                  localStorage.setItem(purchaseDoneKey, "done");
                  setPurchaseStatusFeedback({
                    message: "Satın alma seçimleri kaydedildi.",
                    severity: "success"
                  });
                  handleCloseAlertsDialog();
                } catch (error) {
                  console.error(error);
                  localStorage.setItem(purchaseDoneKey, "done");
                  setPurchaseStatusFeedback({
                    message: "Kayıt sırasında hata oluştu. Yerel olarak kaydedildi.",
                    severity: "error"
                  });
                  handleCloseAlertsDialog();
                } finally {
                  setSavingPurchaseStatus(false);
                }
              }}
            >
              Seçimleri Kaydet
            </Button>
          )}
        </DialogActions>
      </Dialog>
      <Dialog
        open={isOverBudgetDialogOpen}
        onClose={() => setIsOverBudgetDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: 18, fontWeight: 600 }}>
          Aşım Yapan Kalemler
        </DialogTitle>
        <DialogContent dividers>
          {overBudgetItems.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Aşım yapan kalem bulunmuyor.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Kalem</TableCell>
                  <TableCell align="right">Plan</TableCell>
                  <TableCell align="right">Gerçekleşen</TableCell>
                  <TableCell align="right">Aşım</TableCell>
                  <TableCell align="right">%</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {overBudgetItems?.map((item) => {
                  const plan = toSafeNumber(item.plan);
                  const actual = toSafeNumber(item.actual);
                  const over = toSafeNumber(item.over);
                  const overPct = toSafeNumber(item.over_pct);
                  return (
                    <TableRow key={`${item.budget_code}-${item.budget_name}`}>
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
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setIsOverBudgetDialogOpen(false)}>
            Kapat
          </Button>
        </DialogActions>
      </Dialog>
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
