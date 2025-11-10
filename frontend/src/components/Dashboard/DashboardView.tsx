import { ChangeEvent, Fragment, useEffect, useMemo } from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  MenuItem,
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
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  Cell
} from "recharts";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import usePersistentState from "../../hooks/usePersistentState";
import { useDashboardPlayback } from "../../context/DashboardPlaybackContext";

interface DashboardSummary {
  month: number;
  planned: number;
  actual: number;
  saving: number;
}

interface DashboardKPI {
  total_plan: number;
  total_actual: number;
  total_remaining: number;
  total_saving: number;
  total_overrun: number;
}

interface DashboardReminder {
  severity: "info" | "warning" | "success" | "error";
  message: string;
}

interface DashboardTodayEntry {
  id: number;
  budget_item_id: number;
  budget_item_code?: string | null;
  budget_item_name?: string | null;
  amount: number;
  description?: string | null;
  expense_date: string;
  status: "recorded" | "cancelled";
}

interface DashboardTodayPanel {
  recorded: DashboardTodayEntry[];
  cancelled: DashboardTodayEntry[];
  out_of_budget: DashboardTodayEntry[];
}

interface DashboardResponse {
  kpi: DashboardKPI;
  monthly: DashboardSummary[];
  reminders: DashboardReminder[];
  today: DashboardTodayPanel;
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
  map_attribute?: string | null;
}

function getBudgetItemLabel(item: BudgetItem) {
  const code = item.code?.trim();
  const name = item.name?.trim();
  const parts = [code, name].filter(Boolean);
  const baseLabel = parts.length
    ? parts.join(" — ")
    : item.map_attribute?.trim() ?? "Tanımsız Kalem";
  if (item.map_attribute && parts.length) {
    return `${baseLabel} (${item.map_attribute})`;
  }
  return baseLabel;
}

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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "USD"
  }).format(value ?? 0);
}

function formatBudgetItemLabel(entry: Pick<DashboardTodayEntry, "budget_item_code" | "budget_item_name">) {
  const code = entry.budget_item_code?.trim() ?? "";
  const name = entry.budget_item_name?.trim() ?? "";
  const parts = [code, name].filter(Boolean);
  return parts.length ? parts.join(" — ") : "Tanımsız Kalem";
}

export default function DashboardView() {
  const client = useAuthorizedClient();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = usePersistentState<number>("dashboard:year", currentYear);
  const [scenarioId, setScenarioId] = usePersistentState<number | null>("dashboard:scenarioId", null);
  const [budgetItemId, setBudgetItemId] = usePersistentState<number | null>("dashboard:budgetItemId", null);
  const { autoPlay, setAutoPlay } = useDashboardPlayback();

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

  const sortedBudgetItems = useMemo(() => {
    if (!budgetItems?.length) return [];

    return [...budgetItems].sort((first, second) => {
      const firstCode = first.code ?? "";
      const secondCode = second.code ?? "";
      const codeComparison = firstCode.localeCompare(secondCode, "tr", {
        numeric: true,
        sensitivity: "base"
      });

      if (codeComparison !== 0) return codeComparison;

      const firstName = first.name ?? "";
      const secondName = second.name ?? "";
      return firstName.localeCompare(secondName, "tr", { sensitivity: "base" });
    });
  }, [budgetItems]);

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
    queryKey: ["dashboard", year, scenarioId, budgetItemId],
    queryFn: async () => {
      const params: Record<string, number> = { year };
      if (scenarioId) params.scenario_id = scenarioId;
      if (budgetItemId) params.budget_item_id = budgetItemId;
      const { data } = await client.get<DashboardResponse>("/dashboard", { params });
      return data;
    }
  });

  const monthlyData = useMemo(() => {
    if (!dashboard?.monthly) return [];
    return dashboard.monthly.map((entry) => ({
      ...entry,
      monthLabel: monthLabels[entry.month - 1]
    }));
  }, [dashboard]);

  const quarterlyData = useMemo(() => {
    if (!dashboard?.monthly?.length) return [];
    const quarters = [
      { label: "Q1", months: [1, 2, 3] },
      { label: "Q2", months: [4, 5, 6] },
      { label: "Q3", months: [7, 8, 9] },
      { label: "Q4", months: [10, 11, 12] }
    ];
    return quarters.map(({ label, months }) => {
      const entries = dashboard.monthly.filter((item) => months.includes(item.month));
      const planned = entries.reduce((sum, item) => sum + item.planned, 0);
      const actual = entries.reduce((sum, item) => sum + item.actual, 0);
      const saving = Math.max(planned - actual, 0);
      return { label, planned, actual, saving };
    });
  }, [dashboard]);

  const pieColors = useMemo(
    () => ({
      planned: "#0d47a1",
      actual: "#26a69a",
      saving: "#ff7043"
    }),
    []
  );
  const pieKeys = useMemo(() => ["planned", "actual", "saving"] as const, []);

  const playbackSequence = useMemo(
    () => sortedBudgetItems.map((item) => item.id),
    [sortedBudgetItems]
  );

  const selectedBudgetItem = useMemo(() => {
    if (!budgetItemId) return null;
    return (
      sortedBudgetItems.find((item) => item.id === budgetItemId) ?? null
    );
  }, [budgetItemId, sortedBudgetItems]);

  useEffect(() => {
    if (!sortedBudgetItems.length) {
      if (budgetItemId !== null) {
        setBudgetItemId(null);
      }
      return;
    }

    const exists = sortedBudgetItems.some((item) => item.id === budgetItemId);
    if (!exists) {
      if (autoPlay) {
        setBudgetItemId(sortedBudgetItems[0].id);
      } else if (budgetItemId !== null) {
        setBudgetItemId(null);
      }
    }
  }, [
    autoPlay,
    budgetItemId,
    setBudgetItemId,
    sortedBudgetItems
  ]);

  useEffect(() => {
    if (isLoading || !dashboard) return;
    if (!autoPlay) return;
    if (!playbackSequence.length) return;

    let currentIndex = budgetItemId
      ? playbackSequence.findIndex((itemId) => itemId === budgetItemId)
      : -1;

    if (currentIndex === -1) {
      currentIndex = 0;
      setBudgetItemId(playbackSequence[0]);
    }

    const interval = window.setInterval(() => {
      currentIndex = (currentIndex + 1) % playbackSequence.length;
      setBudgetItemId(playbackSequence[currentIndex]);
    }, 6000);

    return () => window.clearInterval(interval);
  }, [
    autoPlay,
    playbackSequence,
    budgetItemId,
    dashboard,
    isLoading,
    setBudgetItemId
  ]);

  const handleBudgetItemChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value ? Number(event.target.value) : null;
    setAutoPlay(false);
    setBudgetItemId(value);
  };

  return (
    <Stack spacing={4}>
      <Card>
        <CardContent>
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <TextField
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
            <Grid item xs={12} md={4}>
              <TextField
                select
                label="Senaryo"
                value={scenarioId ?? ""}
                onChange={(event) =>
                  setScenarioId(event.target.value ? Number(event.target.value) : null)
                }
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
            <Grid item xs={12} md={4}>
              <TextField
                select
                label="Bütçe Kalemi"
                value={budgetItemId ?? ""}
                onChange={handleBudgetItemChange}
                fullWidth
              >
                <MenuItem value="">Tümü</MenuItem>
                {sortedBudgetItems.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {getBudgetItemLabel(item)}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" fontWeight={600}>
                  Görev & Hatırlatmalar
                </Typography>
                {isLoading ? (
                  <Stack spacing={1}>
                    {Array.from({ length: 3 }).map((_, index) => (
                      <Skeleton
                        // eslint-disable-next-line react/no-array-index-key
                        key={index}
                        variant="rounded"
                        height={48}
                      />
                    ))}
                  </Stack>
                ) : dashboard?.reminders?.length ? (
                  <Stack spacing={1.5}>
                    {dashboard.reminders.map((reminder, index) => (
                      <Alert
                        key={`${reminder.message}-${index}`}
                        severity={reminder.severity}
                        variant="outlined"
                      >
                        {reminder.message}
                      </Alert>
                    ))}
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Şu anda gösterilecek hatırlatma bulunmuyor.
                  </Typography>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" fontWeight={600}>
                  Bugün İçin
                </Typography>
                {isLoading ? (
                  <Stack spacing={1}>
                    {Array.from({ length: 3 }).map((_, sectionIndex) => (
                      <Fragment key={sectionIndex}>
                        <Skeleton variant="text" height={28} width="40%" />
                        <Skeleton variant="rounded" height={56} />
                        {sectionIndex < 2 ? <Divider /> : null}
                      </Fragment>
                    ))}
                  </Stack>
                ) : (
                  <Stack spacing={2}>
                    {(
                      [
                        {
                          title: "Bugün girilen harcamalar",
                          key: "recorded" as const,
                          emptyText: "Bugün herhangi bir harcama kaydedilmedi."
                        },
                        {
                          title: "Bugün reddedilenler",
                          key: "cancelled" as const,
                          emptyText: "Bugün reddedilen kayıt bulunmuyor."
                        },
                        {
                          title: "Bugün bütçe dışı girişler",
                          key: "out_of_budget" as const,
                          emptyText: "Bugün bütçe dışı kayıt bulunmuyor."
                        }
                      ]
                    ).map((section, index) => {
                      const entries = dashboard?.today?.[section.key] ?? [];
                      return (
                        <Fragment key={section.key}>
                          <Stack spacing={1}>
                            <Typography variant="subtitle1" fontWeight={600}>
                              {section.title}
                            </Typography>
                            {entries.length ? (
                              <Stack spacing={1.5}>
                                {entries.map((entry) => (
                                  <Stack
                                    key={entry.id}
                                    direction="row"
                                    justifyContent="space-between"
                                    alignItems="flex-start"
                                    spacing={2}
                                  >
                                    <Stack spacing={0.5}>
                                      <Typography variant="body2" fontWeight={600}>
                                        {formatBudgetItemLabel(entry)}
                                      </Typography>
                                      {entry.description ? (
                                        <Typography variant="caption" color="text.secondary">
                                          {entry.description}
                                        </Typography>
                                      ) : null}
                                    </Stack>
                                    <Typography variant="body2" color="text.secondary">
                                      {formatCurrency(entry.amount)}
                                    </Typography>
                                  </Stack>
                                ))}
                              </Stack>
                            ) : (
                              <Typography variant="body2" color="text.secondary">
                                {section.emptyText}
                              </Typography>
                            )}
                          </Stack>
                          {index < 2 ? <Divider /> : null}
                        </Fragment>
                      );
                    })}
                  </Stack>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {(
          [
            {
              title: "Toplam Plan",
              value: dashboard?.kpi.total_plan ?? 0,
              color: "primary"
            },
            {
              title: "Gerçekleşen",
              value: dashboard?.kpi.total_actual ?? 0,
              color: "secondary"
            },
            {
              title: "Kalan",
              value: dashboard?.kpi.total_remaining ?? 0,
              color: "default"
            },
            {
              title: "Tasarruf",
              value: dashboard?.kpi.total_saving ?? 0,
              color: "success"
            },
            {
              title: "Aşım",
              value: dashboard?.kpi.total_overrun ?? 0,
              color: "error"
            }
          ] as const
        ).map((kpi) => (
          <Grid item xs={12} sm={6} md={4} lg={2} key={kpi.title}>
            <Card
              sx={{
                borderTop: 4,
                borderColor:
                  kpi.color === "default"
                    ? "divider"
                    : kpi.color === "success"
                    ? "success.main"
                    : kpi.color === "error"
                    ? "error.main"
                    : `${kpi.color}.main`
              }}
            >
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">
                  {kpi.title}
                </Typography>
                {isLoading ? (
                  <Skeleton variant="text" height={40} width="60%" />
                ) : (
                  <Typography variant="h5" fontWeight={700} sx={{ mt: 1 }}>
                    {formatCurrency(kpi.value)}
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
            <Typography variant="h6" fontWeight={600}>
              Aylık Trend Analizi
            </Typography>
            <Chip
              label={
                selectedBudgetItem ? getBudgetItemLabel(selectedBudgetItem) : "Tüm Kalemler"
              }
              color={budgetItemId ? "primary" : "default"}
              variant={budgetItemId ? "filled" : "outlined"}
            />
          </Stack>
          <Box sx={{ height: 360 }}>
            {isLoading ? (
              <Skeleton variant="rectangular" height="100%" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="monthLabel" />
                  <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
                  <RechartsTooltip
                    formatter={(value: number) => formatCurrency(value)}
                    labelFormatter={(label) => label}
                  />
                  <Legend />
                  <Bar dataKey="planned" name="Planlanan" fill={pieColors.planned} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" name="Gerçekleşen" fill={pieColors.actual} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="saving" name="Tasarruf" fill={pieColors.saving} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={3}>
            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                3 Aylık Harcama Dağılımı
              </Typography>
              <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="center">
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box sx={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: pieColors.planned }} />
                  <Typography variant="body2">Planlanan</Typography>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box sx={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: pieColors.actual }} />
                  <Typography variant="body2">Gerçekleşen</Typography>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box sx={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: pieColors.saving }} />
                  <Typography variant="body2">Tasarruf</Typography>
                </Stack>
              </Stack>
            </Box>
            <Grid container spacing={3}>
              {quarterlyData.map((quarter) => (
                <Grid item xs={12} md={6} lg={3} key={quarter.label}>
                  <Stack spacing={1} alignItems="center">
                    <Typography variant="subtitle1" fontWeight={600}>
                      {quarter.label}
                    </Typography>
                    <Box sx={{ width: "100%", height: 220 }}>
                      {isLoading ? (
                        <Skeleton
                          variant="circular"
                          width={220}
                          height={220}
                          sx={{ mx: "auto" }}
                        />
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: "Planlanan", value: quarter.planned, key: "planned" },
                                { name: "Gerçekleşen", value: quarter.actual, key: "actual" },
                                { name: "Tasarruf", value: quarter.saving, key: "saving" }
                              ]}
                              dataKey="value"
                              nameKey="name"
                              innerRadius={50}
                              outerRadius={80}
                              paddingAngle={2}
                            >
                              {pieKeys.map((key) => (
                                <Cell key={key} fill={pieColors[key]} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </Box>
                  </Stack>
                </Grid>
              ))}
            </Grid>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
