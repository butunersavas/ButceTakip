import { useEffect, useMemo, useRef, useState } from "react";
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
  FormControlLabel,
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
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
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
}

interface OverBudgetResponse {
  summary: OverBudgetSummary;
  items: OverBudgetItem[];
}

interface SpendMonthlySummary {
  month: number;
  plan_total: number;
  actual_total: number;
  within_plan_total: number;
  over_total: number;
  remaining_total: number;
}

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
  is_form_prepared: boolean;
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

type WarrantyCriticalItem = {
  id: number;
  type: "DEVICE" | "SERVICE" | "DOMAIN_SSL";
  name: string;
  location: string;
  end_date: string;
  days_left: number;
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
  const [isPurchaseDialogOpen, setIsPurchaseDialogOpen] = useState(false);
  const [dontShowAgainThisMonth, setDontShowAgainThisMonth] = useState(false);
  const [savingPurchaseStatus, setSavingPurchaseStatus] = useState(false);
  const [purchaseStatusFeedback, setPurchaseStatusFeedback] = useState<
    { message: string; severity: "success" | "error" } | null
  >(null);
  const [criticalWarrantyItems, setCriticalWarrantyItems] = useState<WarrantyCriticalItem[]>([]);
  const [isWarrantyDialogOpen, setIsWarrantyDialogOpen] = useState(false);
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
  const highlightTimeoutRef = useRef<number | null>(null);

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
  const reminderKey = `purchase-reminder-${yearNow}-${currentMonth}`;
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
    const dismissed = localStorage.getItem(reminderKey);
    if (dismissed === "dismissed") {
      return;
    }

    client
      .get<PurchaseReminderItem[]>(
        `/budget/purchase-reminders?year=${yearNow}&month=${currentMonth}`
      )
      .then((res) => {
        const items = res.data ?? [];
        setPurchaseItems(items);

        if (items.length > 0) {
          setIsPurchaseDialogOpen(true);
        }
      })
      .catch(() => {
        // Hata durumunda sessiz geçilebilir veya loglanabilir
      });
  }, [client, currentMonth, reminderKey, yearNow]);

  useEffect(() => {
    client
      .get<WarrantyCriticalItem[]>("/warranty-items/critical")
      .then((res) => {
        const items = res.data ?? [];
        setCriticalWarrantyItems(items);
        if (items.length > 0) {
          setIsWarrantyDialogOpen(true);
        }
      })
      .catch(() => {
        // Sessiz geç
      });
  }, [client]);

  const handleClosePurchaseDialog = () => {
    if (dontShowAgainThisMonth) {
      localStorage.setItem(reminderKey, "dismissed");
    }
    setIsPurchaseDialogOpen(false);
  };

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
      return matchingScenario ? matchingScenario.id : null;
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

  const { data: trendMonths = [], isLoading: isTrendLoading } = useQuery<SpendMonthlySummary[]>({
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
      const trendBudgetItemId =
        selectedOverrunBudgetItemId ?? debouncedFilters.budgetItemId;
      if (trendBudgetItemId) params.budget_item_id = trendBudgetItemId;
      if (debouncedFilters.department) params.department = debouncedFilters.department;
      if (debouncedFilters.capexOpex) params.capex_opex = debouncedFilters.capexOpex;
      const { data } = await client.get<SpendMonthlySummary[]>("/dashboard/trend", { params });
      return data ?? [];
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

  const monthlyData = useMemo(() => {
    if (!trendMonths?.length) return [];
    return trendMonths.map((entry) => ({
      month: entry.month,
      planned: entry.plan_total ?? 0,
      actual: entry.actual_total ?? 0,
      remaining: entry.remaining_total ?? 0,
      overrun: entry.over_total ?? 0,
      over_pct: (entry.over_total ?? 0) / Math.max(entry.plan_total ?? 0, 1),
      monthLabel: monthLabels[entry.month - 1]
    }));
  }, [trendMonths]);

  const quarterlyTotals = useMemo(() => {
    const quarters = [
      { label: "Q1", months: [1, 2, 3] },
      { label: "Q2", months: [4, 5, 6] },
      { label: "Q3", months: [7, 8, 9] },
      { label: "Q4", months: [10, 11, 12] }
    ];

    return quarters.map((quarter) => {
      const totals = trendMonths.reduce<QuarterlySummary>(
        (acc, entry) => {
          if (!quarter.months.includes(entry.month)) {
            return acc;
          }
          acc.planned += entry.plan_total ?? 0;
          acc.actual += entry.within_plan_total ?? 0;
          acc.overrun += entry.over_total ?? 0;
          acc.remaining += entry.remaining_total ?? 0;
          return acc;
        },
        { planned: 0, actual: 0, remaining: 0, overrun: 0 }
      );

      const pieData = [
        { name: "Gerçekleşen", value: totals.actual, color: pieColors.actual },
        { name: "Aşım", value: totals.overrun, color: pieColors.overrun },
        { name: "Kalan", value: totals.remaining, color: pieColors.remaining }
      ];

      return { ...quarter, totals, pieData };
    });
  }, [trendMonths]);

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
  const formattedOver = formatCurrency(
    overBudget?.summary?.over_total ?? normalizedKpi.total_overrun
  );
  const overBudgetItems = overBudget?.items ?? [];
  const overBudgetSummary = overBudget?.summary;
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
      if (isSameFilter) {
        setSelectedOverrunItem(null);
      } else {
        const top = overBudgetItems?.[0];
        if (top) {
          setSelectedOverrunItem({
            budget_code: top.budget_code,
            budget_name: top.budget_name
          });
        } else {
          setSelectedOverrunItem(null);
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
      }, 0);
    } else {
      setSelectedOverrunItem(null);
    }
  };

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

          <Grid container spacing={2} sx={{ mb: 3 }}>
            {[
              {
                title: "Toplam Plan",
                value: formattedTotalPlan,
                subtitle: "Planlanan bütçe",
                icon: (
                  <AccountBalanceWalletOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />
                ),
                iconColor: "primary.main",
                filterKey: "total_plan" as const
              },
              {
                title: "Gerçekleşen",
                value: formattedActual,
                subtitle: "Harcanan toplam",
                icon: <CheckCircleOutlineOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
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
          <Stack spacing={3}>
            <Card>
              <CardHeader title="Riskteki Kalemler" subheader="Planın %80 ve üzeri harcananlar" />
              <CardContent>
                {riskyItems.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Bu ay için kritik seviyede kalem bulunmuyor.
                  </Typography>
                ) : (
                  <List dense>
                    {riskyItems.map((item) => (
                      <ListItem key={item.budget_item_id}>
                        <ListItemText
                          primary={stripBudgetCode(item.budget_name) || "-"}
                          secondary={`Plan: ${item.plan.toLocaleString()} | Gerçekleşen: ${item.actual.toLocaleString()} | %${Math.round(item.ratio * 100)}`}
                          primaryTypographyProps={{ variant: "body2" }}
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
              </CardContent>
            </Card>

            {showOverBudgetSection ? (
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
                          {overBudgetItems.slice(0, 10).map((item) => (
                            <TableRow key={item.budget_code}>
                              <TableCell>
                                {stripBudgetCode(item.budget_name) || item.budget_code}
                              </TableCell>
                              <TableCell align="right">{formatCurrency(item.plan)}</TableCell>
                              <TableCell align="right">{formatCurrency(item.actual)}</TableCell>
                              <TableCell align="right">{formatCurrency(item.over)}</TableCell>
                              <TableCell align="right">{item.over_pct.toFixed(1)}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </Box>
            ) : null}

            <Card>
              <CardContent sx={{ height: 280, minHeight: 280 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                  <Typography variant="h6" fontWeight={600}>
                    Aylık Trend Analizi
                  </Typography>
                  <Chip
                    label={
                      selectedOverrunItem
                        ? `Aşım: ${stripBudgetCode(
                            selectedOverrunItem.budget_name ?? selectedOverrunItem.budget_code ?? ""
                          )}`
                        : budgetItemId
                          ? stripBudgetCode(
                              budgetItems?.find((item) => item.id === budgetItemId)?.name ?? ""
                            )
                          : "Tüm Kalemler"
                    }
                    color={selectedOverrunItem ? "error" : "primary"}
                    variant={selectedOverrunItem ? "filled" : "outlined"}
                  />
                </Stack>
                {isTrendLoading ? (
                  <Skeleton variant="rectangular" height="100%" />
                ) : (
                  <Box sx={{ height: 200, minHeight: 200 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis dataKey="monthLabel" tick={{ fill: "#475569" }} />
                        <YAxis
                          yAxisId="left"
                          tick={{ fill: "#475569" }}
                          tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          tick={{ fill: "#475569" }}
                          tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                        />
                        <ReferenceLine y={0} stroke="#9e9e9e" strokeDasharray="3 3" />
                        <RechartsTooltip
                          formatter={(value: number, name: string, props: any) => {
                            if (name === "Aşım") {
                              const pct = props?.payload?.over_pct ?? 0;
                              return [`${formatCurrency(value)} (%${(pct * 100).toFixed(1)})`, name];
                            }
                            return [formatCurrency(value), name];
                          }}
                          labelFormatter={(label) => label}
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
                          dot={{ r: 3 }}
                          yAxisId="right"
                          hide={!showOverrun}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                )}
              </CardContent>
            </Card>

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

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-evenly",
                    alignItems: "center",
                    gap: 3,
                    flexWrap: "nowrap",
                    overflowX: "auto",
                    pb: 1
                  }}
                >
                  {quarterlyTotals.map((quarter) => (
                    <Box
                      key={quarter.label}
                      sx={{
                        width: 250,
                        flex: "0 0 250px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center"
                      }}
                    >
                      <Typography
                        variant="subtitle2"
                        fontWeight={600}
                        mb={1}
                        sx={{ alignSelf: "flex-start" }}
                      >
                        {quarter.label}
                      </Typography>
                      <Box sx={{ height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <RechartsTooltip
                              formatter={(value: number, name: string) =>
                                [formatCurrency(value), name]
                              }
                            />
                            <Pie
                              data={quarter.pieData}
                              dataKey="value"
                              nameKey="name"
                              innerRadius={50}
                              outerRadius={80}
                              paddingAngle={2}
                            >
                              {quarter.pieData.map((entry) => (
                                <Cell key={`${quarter.label}-${entry.name}`} fill={entry.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Stack>
        </Stack>
      </Box>
      <Dialog
        open={isWarrantyDialogOpen && criticalWarrantyItems.length > 0}
        onClose={() => setIsWarrantyDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: 18, fontWeight: 600 }}>
          Garanti süresi dolmak üzere (30 gün altı)
        </DialogTitle>
        <DialogContent dividers>
          <List dense sx={{ maxHeight: 400, overflowY: "auto" }}>
            {criticalWarrantyItems.map((item) => (
              <ListItem key={item.id}>
                <ListItemText
                  primary={`${item.type === "DEVICE" ? "Cihaz" : "Bakım/Hizmet"} — ${item.name} / ${item.location} — ${item.days_left} gün kaldı (Bitiş: ${item.end_date})`}
                  primaryTypographyProps={{ variant: "body2" }}
                />
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setIsWarrantyDialogOpen(false)}>
            Kapat
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={() => {
              setIsWarrantyDialogOpen(false);
              navigate("/warranty-tracking");
            }}
          >
            Garanti Takibi'ne git
          </Button>
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
                {overBudgetItems.map((item) => (
                  <TableRow key={`${item.budget_code}-${item.budget_name}`}>
                    <TableCell>
                      {stripBudgetCode(item.budget_name) || item.budget_code}
                    </TableCell>
                    <TableCell align="right">{formatCurrency(item.plan)}</TableCell>
                    <TableCell align="right">{formatCurrency(item.actual)}</TableCell>
                    <TableCell align="right">{formatCurrency(item.over)}</TableCell>
                    <TableCell align="right">{item.over_pct.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
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
      <Dialog
        open={isPurchaseDialogOpen && purchaseItems.length > 0}
        onClose={handleClosePurchaseDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: 18, fontWeight: 600 }}>
          Bu ay bütçede satın alma kalemleriniz var
        </DialogTitle>

        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Aşağıdaki kalemler için satın alma formunu hazırlamayı unutmayın:
          </Typography>

          <List dense sx={{ maxHeight: 500, overflowY: "auto" }}>
            {purchaseItems.map((item, index) => (
              <ListItem
                key={`${item.budget_item_id}-${item.year}-${item.month}`}
                secondaryAction={
                  <Checkbox
                    edge="end"
                    checked={item.is_form_prepared}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setPurchaseItems((prev) =>
                        prev.map((x, i) => (i === index ? { ...x, is_form_prepared: checked } : x))
                      );
                    }}
                  />
                }
              >
                <ListItemText
                  primary={stripBudgetCode(item.budget_name) || "-"}
                  secondary={
                    item.is_form_prepared
                      ? "Satın alma formu hazırlandı"
                      : "Satın alma formunu hazırlamayı unutmayın"
                  }
                  primaryTypographyProps={{ variant: "body2" }}
                  secondaryTypographyProps={{ variant: "caption" }}
                />
              </ListItem>
            ))}
          </List>

          <FormControlLabel
            sx={{ mt: 1 }}
            control={
              <Checkbox
                size="small"
                checked={dontShowAgainThisMonth}
                onChange={(e) => setDontShowAgainThisMonth(e.target.checked)}
              />
            }
            label="Bu ay tekrar gösterme"
          />
        </DialogContent>

        <DialogActions>
          <Button size="small" onClick={handleClosePurchaseDialog} disabled={savingPurchaseStatus}>
            Kapat
          </Button>
          <Button
            variant="contained"
            size="small"
            disabled={savingPurchaseStatus}
            onClick={async () => {
              try {
                setSavingPurchaseStatus(true);
                const payload = purchaseItems
                  .filter((item) => item.is_form_prepared)
                  .map((item) => ({
                    budget_item_id: item.budget_item_id,
                    year: item.year,
                    month: item.month,
                    is_form_prepared: true
                  }));

                await client.post("/budget/purchase-reminders/mark-prepared", payload);
                setPurchaseStatusFeedback({
                  message: "Seçili kalemler için satın alma formu hazırlandı olarak kaydedildi.",
                  severity: "success"
                });
                handleClosePurchaseDialog();
              } catch (error) {
                console.error(error);
                setPurchaseStatusFeedback({
                  message: "Kayıt sırasında bir hata oluştu.",
                  severity: "error"
                });
              } finally {
                setSavingPurchaseStatus(false);
              }
            }}
          >
            Satın alma formu hazırlandı olarak kaydet
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
