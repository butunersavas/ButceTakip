import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Chip,
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

export default function DashboardView() {
  const client = useAuthorizedClient();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [scenarioId, setScenarioId] = useState<number | null>(null);
  const [budgetItemId, setBudgetItemId] = useState<number | null>(null);

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
                onChange={(event) => setYear(Number(event.target.value))}
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
                onChange={(event) =>
                  setBudgetItemId(event.target.value ? Number(event.target.value) : null)
                }
                fullWidth
              >
                <MenuItem value="">Tümü</MenuItem>
                {budgetItems?.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.code} — {item.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

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
                budgetItemId
                  ? budgetItems?.find((item) => item.id === budgetItemId)?.name
                  : "Tüm Kalemler"
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
