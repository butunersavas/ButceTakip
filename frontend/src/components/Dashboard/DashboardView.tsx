import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Box,
  Checkbox,
  Chip,
  Container,
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
  TextField,
  Typography
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis
} from "recharts";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import usePersistentState from "../../hooks/usePersistentState";
import { formatBudgetItemLabel } from "../../utils/budgetItem";
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

type QuarterlyDataItem = QuarterlySummary & { quarter: string };

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

const pieKeys: Array<keyof QuarterlySummary> = ["planned", "actual", "remaining", "overrun"];

const pieColors: Record<keyof QuarterlySummary, string> = {
  planned: COLOR_PLANNED,
  actual: COLOR_ACTUAL,
  remaining: COLOR_REMAINING,
  overrun: COLOR_OVER
};

const pieLabelMap = {
  planned: "Planlanan",
  actual: "Gerçekleşen",
  remaining: "Kalan",
  overrun: "Aşım"
} as const;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "USD"
  }).format(value ?? 0);
}

export default function DashboardView() {
  const client = useAuthorizedClient();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = usePersistentState<number>("dashboard:year", currentYear);
  const [scenarioId, setScenarioId] = usePersistentState<number | null>("dashboard:scenarioId", null);
  const [month, setMonth] = usePersistentState<number | null>("dashboard:month", null);
  const [budgetItemId, setBudgetItemId] = usePersistentState<number | null>("dashboard:budgetItemId", null);
  const [department, setDepartment] = useState<string>("");
  const [purchaseItems, setPurchaseItems] = useState<PurchaseReminderItem[]>([]);
  const [isPurchaseDialogOpen, setIsPurchaseDialogOpen] = useState(false);
  const [dontShowAgainThisMonth, setDontShowAgainThisMonth] = useState(false);
  const [savingPurchaseStatus, setSavingPurchaseStatus] = useState(false);
  const [purchaseStatusFeedback, setPurchaseStatusFeedback] = useState<
    { message: string; severity: "success" | "error" } | null
  >(null);

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
    queryKey: ["departments", year, scenarioId],
    queryFn: async () => {
      const { data } = await client.get<string[]>("/plans/departments", {
        params: {
          year,
          scenario_id: scenarioId || undefined
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

  const handleClosePurchaseDialog = () => {
    if (dontShowAgainThisMonth) {
      localStorage.setItem(reminderKey, "dismissed");
    }
    setIsPurchaseDialogOpen(false);
  };

  const { data: riskyItems = [] } = useQuery<RiskyItem[]>({
    queryKey: ["dashboard", "risky-items", year, month, department],
    queryFn: async () => {
      const params: Record<string, number | string> = { year };

      if (month) {
        params.month = month;
      }

      if (department) {
        params.department = department;
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
    queryKey: ["dashboard", year, scenarioId, month, budgetItemId, department],
    queryFn: async () => {
      const params: Record<string, number | string> = { year };
      if (scenarioId) params.scenario_id = scenarioId;
      if (month) params.month = month;
      if (budgetItemId) params.budget_item_id = budgetItemId;
      if (department) params.department = department;
      const { data } = await client.get<DashboardResponse>("/dashboard", { params });
      return data;
    }
  });

  const monthlyData = useMemo(() => {
    if (!dashboard?.monthly) return [];
    return dashboard.monthly.map((entry) => {
      const planned = entry.planned ?? 0;
      const actual = entry.actual ?? 0;
      const remaining = Math.max(planned - actual, 0);
      const overrun = Math.max(actual - planned, 0);

      return {
        ...entry,
        planned,
        actual,
        remaining,
        overrun,
        monthLabel: monthLabels[entry.month - 1]
      };
    });
  }, [dashboard]);

  const quarterlyData = useMemo<QuarterlyDataItem[]>(() => {
    if (!dashboard?.monthly?.length) return [];
    const quarters = [
      { label: "Q1", months: [1, 2, 3] },
      { label: "Q2", months: [4, 5, 6] },
      { label: "Q3", months: [7, 8, 9] },
      { label: "Q4", months: [10, 11, 12] }
    ];
    return quarters.map(({ label, months }) => {
      const entries = dashboard.monthly.filter((item) => months.includes(item.month));
      const planned = entries.reduce((sum, item) => sum + (item.planned ?? 0), 0);
      const actual = entries.reduce((sum, item) => sum + (item.actual ?? 0), 0);
      const remaining = Math.max(planned - actual, 0);
      const overrun = Math.max(actual - planned, 0);
      return { quarter: label, planned, actual, remaining, overrun } satisfies QuarterlyDataItem;
    });
  }, [dashboard]);
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
  const formattedOver = formatCurrency(normalizedKpi.total_overrun);

  return (
    <>
      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Stack spacing={2}>
          <Card>
            <CardContent sx={{ py: 1.5, px: 2.5 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                    Filtreler
                  </Typography>
                  <Chip label="Güncel" color="primary" variant="outlined" size="small" />
                </Stack>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} md={2}>
                    <TextField
                      size="small"
                      label="Yıl"
                      type="number"
                      value={year}
                      onChange={(event) => {
                        const value = event.target.value;
                        setYear(value ? Number(value) : currentYear);
                      }}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField
                      size="small"
                      select
                      label="Senaryo"
                      value={scenarioId ?? ""}
                      onChange={(event) => setScenarioId(event.target.value ? Number(event.target.value) : null)}
                      fullWidth
                    >
                      <MenuItem value="">Tümü</MenuItem>
                      {scenarios?.map((scenario) => (
                        <MenuItem key={scenario.id} value={scenario.id}>
                          {scenario.name} ({scenario.year})
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField
                      size="small"
                      select
                      label="Departman"
                      value={department}
                      onChange={(event) => setDepartment(event.target.value || "")}
                      fullWidth
                    >
                      <MenuItem value="">Tümü</MenuItem>
                      {departments.map((name) => (
                        <MenuItem key={name} value={name}>
                          {name}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <TextField
                      select
                      fullWidth
                      size="small"
                      label="Ay"
                      value={month ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        setMonth(value === "" ? null : Number(value));
                      }}
                    >
                      <MenuItem value="">Tüm Aylar</MenuItem>
                      {monthOptions.map((m) => (
                        <MenuItem key={m.value} value={m.value}>
                          {m.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <TextField
                      size="small"
                      select
                      label="Bütçe Kalemi"
                      value={budgetItemId ?? ""}
                      onChange={(event) => setBudgetItemId(event.target.value ? Number(event.target.value) : null)}
                      fullWidth
                    >
                      <MenuItem value="">Tümü</MenuItem>
                      {budgetItems?.map((item) => (
                        <MenuItem key={item.id} value={item.id}>
                          {formatBudgetItemLabel(item)}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                </Grid>
              </Stack>
            </CardContent>
          </Card>

          <Grid container spacing={2} sx={{ mb: 3 }}>
            {[
              {
                title: "Toplam Plan",
                value: formattedTotalPlan,
                subtitle: "Planlanan bütçe",
                icon: (
                  <AccountBalanceWalletOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />
                ),
                iconColor: "primary.main"
              },
              {
                title: "Gerçekleşen",
                value: formattedActual,
                subtitle: "Harcanan toplam",
                icon: <CheckCircleOutlineOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
                iconColor: "primary.main"
              },
              {
                title: "Kalan",
                value: formattedRemaining,
                subtitle: "Bütçede kalan",
                icon: <TrendingUpOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
                iconColor: "warning.main"
              },
              {
                title: "Aşım",
                value: formattedOver,
                subtitle: "Limit aşımı",
                icon: <WarningAmberOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
                iconColor: "error.main"
              }
            ].map((card) => (
              <Grid item xs={12} sm={6} md={3} key={card.title}>
                <SummaryCard {...card} isLoading={isLoading} />
              </Grid>
            ))}
          </Grid>
          <Stack spacing={3}>
            <Card>
              <CardContent sx={{ height: 280 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                  <Typography variant="h6" fontWeight={600}>
                    Aylık Trend Analizi
                  </Typography>
                  <Chip
                    label={
                      budgetItemId
                        ? budgetItems?.find((item) => item.id === budgetItemId)?.name
                        : "Tüm Kalemler"
                    }
                    color={budgetItemId ? "primary" : "default"}
                    variant={budgetItemId ? "filled" : "outlined"}
                  />
                </Stack>
                {isLoading ? (
                  <Skeleton variant="rectangular" height="100%" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="monthLabel" tick={{ fill: "#475569" }} />
                      <YAxis
                        tick={{ fill: "#475569" }}
                        tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                      />
                      <ReferenceLine y={0} stroke="#9e9e9e" strokeDasharray="3 3" />
                      <RechartsTooltip
                        formatter={(value: number) => formatCurrency(value)}
                        labelFormatter={(label) => label}
                      />
                      <Legend />
                      <Bar dataKey="planned" name="Planlanan" fill={pieColors.planned} radius={[6, 6, 0, 0]} />
                      <Bar dataKey="actual" name="Gerçekleşen" fill={pieColors.actual} radius={[6, 6, 0, 0]} />
                      <Bar dataKey="remaining" name="Kalan" fill={pieColors.remaining} radius={[6, 6, 0, 0]} />
                      <Bar dataKey="overrun" name="Aşım" fill={pieColors.overrun} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  mb={2}
                >
                  <Typography variant="h6" fontWeight={700}>
                    3 Aylık Harcama Dağılımı
                  </Typography>
                  <Button
                    variant="outlined"
                    size="small"
                    sx={{ borderRadius: 999, textTransform: "none" }}
                  >
                    Son 4 Çeyrek
                  </Button>
                </Stack>

                {/* LEJAND – Planlanan / Gerçekleşen / Kalan / Aşım (renkler korunuyor) */}
                <Stack
                  direction="row"
                  spacing={3}
                  alignItems="center"
                  mb={2}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        bgcolor: pieColors.planned
                      }}
                    />
                    <Typography variant="caption">Planlanan</Typography>
                  </Stack>

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
                        bgcolor: pieColors.remaining
                      }}
                    />
                    <Typography variant="caption">Kalan</Typography>
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
                </Stack>

                {/* 4 ÇEYREK İÇİN YAN YANA DONUT GRAFİKLER */}
                <Grid container spacing={3}>
                  {["Q1", "Q2", "Q3", "Q4"].map((quarterKey) => {
                    const quarterSummary = quarterlyData.find(
                      (item) => item.quarter === quarterKey
                    );

                    if (!quarterSummary) return null;

                    const quarterLabel =
                      quarterKey === "Q1"
                        ? "Q1"
                        : quarterKey === "Q2"
                        ? "Q2"
                        : quarterKey === "Q3"
                        ? "Q3"
                        : "Q4";

                    const chartData = pieKeys.map((key) => ({
                      label: pieLabelMap[key],
                      value: quarterSummary[key] ?? 0,
                      color: pieColors[key]
                    }));

                    return (
                      <Grid item xs={12} sm={6} md={3} key={quarterKey}>
                        <Stack alignItems="center" spacing={1}>
                          <Typography variant="subtitle2">{quarterLabel}</Typography>
                          <PieChart width={180} height={180}>
                            <Pie
                              data={chartData}
                              dataKey="value"
                              nameKey="label"
                              innerRadius={55}
                              outerRadius={75}
                              paddingAngle={3}
                              strokeWidth={1}
                            >
                              {chartData.map((entry) => (
                                <Cell key={entry.label} fill={entry.color} />
                              ))}
                            </Pie>

                            {/* HOVER’DA TUTAR GÖSTEREN TOOLTIP */}
                            <RechartsTooltip
                              formatter={(value: number, name: string) => [
                                formatCurrency(Number(value) || 0),
                                name
                              ]}
                            />
                          </PieChart>
                        </Stack>
                      </Grid>
                    );
                  })}
                </Grid>
              </CardContent>
            </Card>

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
                          primary={`${item.budget_code} – ${item.budget_name}`}
                          secondary={`Plan: ${item.plan.toLocaleString()} | Gerçekleşen: ${item.actual.toLocaleString()} | %${Math.round(item.ratio * 100)}`}
                          primaryTypographyProps={{ variant: "body2" }}
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
              </CardContent>
            </Card>
          </Stack>
        </Stack>
      </Container>
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
                  primary={`${item.budget_code} – ${item.budget_name}`}
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
