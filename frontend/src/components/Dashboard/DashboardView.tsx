import { useMemo, useState } from "react";
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
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis
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

  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Plan vs Gerçekleşen Özeti
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Yıl, senaryo ve bütçe kalemi filtreleri ile aylık performansı ve toplam KPI değerlerini takip edin.
        </Typography>
      </Box>

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
                <AreaChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="monthLabel" />
                  <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
                  <RechartsTooltip
                    formatter={(value: number) => formatCurrency(value)}
                    labelFormatter={(label) => label}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="planned" name="Plan" stroke="#0d47a1" fill="#0d47a1" fillOpacity={0.25} />
                  <Area type="monotone" dataKey="actual" name="Gerçekleşen" stroke="#26a69a" fill="#26a69a" fillOpacity={0.3} />
                  <Area type="monotone" dataKey="saving" name="Tasarruf" stroke="#ef6c00" fill="#ef6c00" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}
