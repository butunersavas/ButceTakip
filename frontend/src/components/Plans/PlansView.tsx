import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import usePersistentState from "../../hooks/usePersistentState";
import { useAuth } from "../../context/AuthContext";
import { formatBudgetItemLabel } from "../../utils/budgetItem";

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

interface PlanEntry {
  id: number;
  year: number;
  month: number;
  amount: number;
  scenario_id: number;
  budget_item_id: number;
}

type PlanMutationPayload = {
  id?: number;
  year: number;
  month: number;
  amount: number;
  scenario_id: number;
  budget_item_id: number;
};

interface PlanAggregate {
  budget_item_id: number;
  month: number;
  total_amount: number;
}

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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "USD"
  }).format(value ?? 0);
}

export default function PlansView() {
  const client = useAuthorizedClient();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const currentYear = new Date().getFullYear();
  const [year, setYear] = usePersistentState<number>("plans:year", currentYear);
  const [scenarioId, setScenarioId] = usePersistentState<number | null>("plans:scenarioId", null);
  const [budgetItemId, setBudgetItemId] = usePersistentState<number | null>("plans:budgetItemId", null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanEntry | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

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

  const { data: plans, isFetching } = useQuery<PlanEntry[]>({
    queryKey: ["plans", year, scenarioId, budgetItemId],
    queryFn: async () => {
      const params: Record<string, number> = { year };
      if (scenarioId) params.scenario_id = scenarioId;
      if (budgetItemId) params.budget_item_id = budgetItemId;
      const { data } = await client.get<PlanEntry[]>("/plans", { params });
      return data;
    }
  });

  const { data: aggregates } = useQuery<PlanAggregate[]>({
    queryKey: ["plan-aggregate", year, scenarioId],
    queryFn: async () => {
      const params: Record<string, number> = { year };
      if (scenarioId) params.scenario_id = scenarioId;
      const { data } = await client.get<PlanAggregate[]>("/plans/aggregate", { params });
      return data;
    }
  });

  const mutation = useMutation({
    mutationFn: async (payload: PlanMutationPayload) => {
      if (payload.id) {
        const { id, ...body } = payload;
        const { data } = await client.put<PlanEntry>(`/plans/${id}`, body);
        return data;
      }
      const { data } = await client.post<PlanEntry>("/plans", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({ queryKey: ["plan-aggregate"] });
      setDialogOpen(false);
      setFormError(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (planId: number) => {
      await client.delete(`/plans/${planId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({ queryKey: ["plan-aggregate"] });
    }
  });

  const handleEdit = useCallback((plan: PlanEntry) => {
    setEditingPlan(plan);
    setDialogOpen(true);
    setFormError(null);
  }, []);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload: PlanMutationPayload = {
      id: editingPlan?.id ?? undefined,
      year: Number(formData.get("year")) || year,
      month: Number(formData.get("month")),
      amount: Number(formData.get("amount")),
      scenario_id: Number(formData.get("scenario_id")),
      budget_item_id: Number(formData.get("budget_item_id"))
    };

    mutation.mutate(payload, {
      onError: () => {
        setFormError("Plan kaydı kaydedilirken bir sorun oluştu. Yetkinizi ve alanları kontrol edin.");
      }
    });
  };

  const handleDelete = useCallback((planId: number) => {
    if (!user?.is_admin) return;
    const confirmed = window.confirm(
      "Plan kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
    );
    if (confirmed) {
      deleteMutation.mutate(planId);
    }
  }, [deleteMutation, user?.is_admin]);

  const findBudgetItem = useCallback(
    (row: unknown) => {
      if (!row || typeof row !== "object") {
        return undefined;
      }

      const budgetItemId = (row as { budget_item_id?: number | null }).budget_item_id;
      if (budgetItemId == null || !Array.isArray(budgetItems)) {
        return undefined;
      }

      return budgetItems.find(
        (budget) =>
          budget?.id === budgetItemId ||
          ("budget_item_id" in budget && (budget as { budget_item_id?: number | null }).budget_item_id === budgetItemId)
      );
    },
    [budgetItems]
  );

  const rows = useMemo(() => {
    return (
      plans?.map((plan) => ({
        ...plan,
        budget_item_id: plan?.budget_item_id ?? null,
      })) ?? []
    );
  }, [plans]);

  const MONTH_NAMES_TR = [
    "",
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

  const columns = useMemo<GridColDef[]>(() => {
    return [
      {
        field: "scenario",
        headerName: "Senaryo",
        flex: 1,
        valueGetter: (value, row) => {
          if (!row || row.scenario_id == null) {
            return "";
          }

          if (!Array.isArray(scenarios)) {
            return "";
          }

          const scenario = scenarios.find(
            (item) => item && (item.scenario_id === row.scenario_id || item.id === row.scenario_id)
          );

          if (!scenario) {
            return "";
          }

          return (
            scenario.name ??
            scenario.scenario_name ??
            `${scenario.code ?? ""} ${scenario.description ?? ""}`.trim()
          );
        }
      },
      {
        field: "budget",
        headerName: "Bütçe Kalemi",
        flex: 1,
        valueGetter: (value, row) => {
          const item = findBudgetItem(row);
          if (!item) {
            return "";
          }

          const code = item.code ?? item.budget_code ?? "";
          const name = item.name ?? item.budget_name ?? "";

          return `${code} ${name}`.trim();
        }
      },
      {
        field: "map_category",
        headerName: "Map Capex/Opex",
        flex: 1,
        valueGetter: (value, row) => {
          const item = findBudgetItem(row);
          return item?.map_category ?? "";
        }
      },
      {
        field: "map_attribute",
        headerName: "Map Nitelik",
        flex: 1,
        valueGetter: (value, row) => {
          const item = findBudgetItem(row);
          return item?.map_attribute ?? "";
        }
      },
      { field: "year", headerName: "Yıl", width: 110 },
      {
        field: "month",
        headerName: "Ay",
        width: 120,
        valueGetter: (value, row) => {
          const raw = row?.month;

          // month zaten sayıysa
          if (typeof raw === "number") {
            if (raw >= 1 && raw <= 12) {
              return MONTH_NAMES_TR[raw];
            }
            return "";
          }

          // string geldiyse sayıya dönüştürmeyi dene
          const num = Number(raw);
          if (Number.isFinite(num) && num >= 1 && num <= 12) {
            return MONTH_NAMES_TR[num];
          }

          // Hiçbiri değilse boş bırak
          return "";
        },
      },
      {
        field: "amount",
        headerName: "Tutar",
        width: 140,
        valueGetter: (value, row) => row?.amount ?? 0,
        valueFormatter: ({ value }) => {
          const num =
            typeof value === "number"
              ? value
              : Number(String(value).replace(/\./g, "").replace(",", "."));

          return formatCurrency(Number.isFinite(num) ? num : 0);
        },
      },
      {
        field: "actions",
        headerName: "İşlemler",
        sortable: false,
        width: 140,
        renderCell: ({ row }) => (
          <Stack direction="row" spacing={1}>
            <Tooltip title="Güncelle">
              <span>
                <IconButton
                  size="small"
                  onClick={() => handleEdit(row)}
                  disabled={!user?.is_admin}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Sil">
              <span>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => handleDelete(row.id)}
                  disabled={!user?.is_admin}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        )
      }
    ];
  }, [findBudgetItem, handleDelete, handleEdit, scenarios, user?.is_admin]);

  const monthlyTotals = useMemo(() => {
    const totals = Array(12).fill(0);
    aggregates?.forEach((aggregate) => {
      totals[aggregate.month - 1] += aggregate.total_amount;
    });
    return totals;
  }, [aggregates]);

  return (
    <Stack spacing={4}>
      <Card>
        <CardContent>
          <Grid container spacing={3} alignItems="center">
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
                onChange={(event) =>
                  setBudgetItemId(event.target.value ? Number(event.target.value) : null)
                }
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
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Aylık Toplam Tutarlar
              </Typography>
              <Stack spacing={1.2}>
                {monthlyTotals.map((total, index) => (
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    key={index}
                    sx={{
                      p: 1.2,
                      borderRadius: 2,
                      backgroundColor: total > 0 ? "rgba(13, 71, 161, 0.06)" : "background.default"
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      {monthOptions[index]}
                    </Typography>
                    <Typography variant="subtitle2" fontWeight={600}>
                      {formatCurrency(total)}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent sx={{ height: "100%" }}>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Plan Kayıtları
              </Typography>
              <Box sx={{ width: "100%", overflowX: "auto" }}>
                <DataGrid
                  autoHeight
                  rows={rows ?? []}
                  columns={columns}
                  loading={isFetching}
                  getRowId={(row) => row.id}
                  disableRowSelectionOnClick
                  initialState={{
                    pagination: { paginationModel: { pageSize: 10, page: 0 } }
                  }}
                  pageSizeOptions={[10, 25, 50]}
                  sx={{
                    border: "none",
                    "& .MuiDataGrid-main": {
                      overflowX: "auto"
                    },
                    "& .MuiDataGrid-virtualScroller": {
                      overflowX: "visible"
                    },
                    "& .MuiDataGrid-virtualScrollerContent": {
                      overflowX: "visible"
                    }
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editingPlan ? "Plan Kaydını Güncelle" : "Yeni Plan Kaydı"}</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent>
            <Stack spacing={2.5}>
              {formError && <Alert severity="error">{formError}</Alert>}
              <TextField
                label="Yıl"
                name="year"
                type="number"
                defaultValue={editingPlan?.year ?? year}
                required
              />
              <TextField
                select
                label="Ay"
                name="month"
                defaultValue={editingPlan?.month ?? 1}
                required
              >
                {monthOptions.map((label, index) => (
                  <MenuItem key={label} value={index + 1}>
                    {label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Tutar"
                name="amount"
                type="number"
                inputProps={{ min: 0, step: 1 }}
                fullWidth
                defaultValue={editingPlan?.amount ?? 0}
                required
              />
              <TextField
                select
                label="Senaryo"
                name="scenario_id"
                defaultValue={editingPlan?.scenario_id ?? scenarioId ?? ""}
                required
              >
                {scenarios?.map((scenario) => (
                  <MenuItem key={scenario.id} value={scenario.id}>
                    {scenario.name} ({scenario.year})
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Bütçe Kalemi"
                name="budget_item_id"
                defaultValue={editingPlan?.budget_item_id ?? budgetItemId ?? ""}
                required
              >
                {budgetItems?.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {formatBudgetItemLabel(item)}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Vazgeç</Button>
            <Button type="submit" variant="contained" disabled={mutation.isPending}>
              Kaydet
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Stack>
  );
}
