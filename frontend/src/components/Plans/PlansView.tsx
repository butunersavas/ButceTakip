import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import usePersistentState from "../../hooks/usePersistentState";
import { useAuth } from "../../context/AuthContext";
import { formatBudgetItemLabel, stripBudgetCode } from "../../utils/budgetLabel";
import { formatBudgetItemMeta } from "../../utils/budgetItem";
import FiltersBar from "../Filters/FiltersBar";

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
  department?: string | null;
  scenario?: string | null;
  scenario_name?: string | null;
  budget_code?: string | null;
  budget_name?: string | null;
  capex_opex?: string | null;
  asset_type?: string | null;
  map_capex_opex?: string | null;
  map_nitelik?: string | null;
}

type PlanMutationPayload = {
  id?: number;
  year: number;
  month: number;
  amount: number;
  scenario_id: number;
  budget_item_id: number;
  department?: string | null;
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
  const [monthFilter, setMonthFilter] = useState<number | "">("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("");
  const [budgetItemId, setBudgetItemId] = usePersistentState<number | null>("plans:budgetItemId", null);
  const [capexOpex, setCapexOpex] = usePersistentState<"" | "capex" | "opex">("plans:capexOpex", "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanEntry | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formBudgetItemId, setFormBudgetItemId] = useState<number | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const planTableRef = useRef<HTMLDivElement | null>(null);

  const { data: scenarios } = useQuery<Scenario[]>({
    queryKey: ["scenarios"],
    queryFn: async () => {
      const { data } = await client.get<Scenario[]>("/scenarios");
      return data;
    }
  });

  useEffect(() => {
    if (!scenarios?.length) return;
    setScenarioId((previous) => {
      if (previous && scenarios.some((scenario) => scenario.id === previous)) {
        return previous;
      }

      const defaultScenario =
        scenarios.find((scenario) => scenario.name?.trim().toLowerCase() === "temel") ||
        scenarios.find((scenario) => scenario.year === year) ||
        scenarios[0];
      return defaultScenario?.id ?? null;
    });
  }, [scenarios, setScenarioId, year]);

  const { data: budgetItems } = useQuery<BudgetItem[]>({
    queryKey: ["budget-items"],
    queryFn: async () => {
      const { data } = await client.get<BudgetItem[]>("/budget-items");
      return data;
    }
  });

  const plansQuery = useQuery<PlanEntry[]>({
    queryKey: [
      "plans",
      year,
      scenarioId,
      budgetItemId,
      monthFilter || "",
      departmentFilter || "",
      capexOpex
    ],
    queryFn: async () => {
      const params: Record<string, number | string> = { year };
      if (scenarioId) params.scenario_id = scenarioId;
      if (budgetItemId) params.budget_item_id = budgetItemId;
      if (monthFilter !== "") params.month = Number(monthFilter);
      if (departmentFilter) params.department = departmentFilter;
      if (capexOpex) params.capex_opex = capexOpex;
      const { data } = await client.get<PlanEntry[]>("/plans", { params });
      return data;
    }
  });

  useEffect(() => {
    if (plansQuery.isError) {
      const error = plansQuery.error as any;
      const detail = error?.response?.data?.detail ?? "Plan kayıtları alınamadı.";
      setListError(detail);
    }
  }, [plansQuery.error, plansQuery.isError]);

  const aggregatesQuery = useQuery<PlanAggregate[]>({
    queryKey: ["plan-aggregate", year, scenarioId, capexOpex],
    queryFn: async () => {
      const params: Record<string, number | string> = { year };
      if (scenarioId) params.scenario_id = scenarioId;
      if (capexOpex) params.capex_opex = capexOpex;
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
    setFormBudgetItemId(plan.budget_item_id ?? null);
    setDialogOpen(true);
    setFormError(null);
  }, []);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formBudgetItemId) {
      setFormError("Bütçe kalemi seçmelisiniz.");
      return;
    }
    const formData = new FormData(event.currentTarget);
    const payload: PlanMutationPayload = {
      id: editingPlan?.id ?? undefined,
      year: Number(formData.get("year")) || year,
      month: Number(formData.get("month")),
      amount: Number(formData.get("amount")),
      scenario_id: Number(formData.get("scenario_id")),
      budget_item_id: formBudgetItemId
    };

    const departmentValue = (formData.get("department") || "").toString().trim();
    if (departmentValue) {
      payload.department = departmentValue;
    }

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

  const rows = useMemo(() => {
    const mapped =
      plansQuery.data?.map((plan) => ({
        ...plan,
        amount: Number(plan.amount) || 0,
        budget_item_id: plan?.budget_item_id ?? null
      })) ?? [];

    if (monthFilter === "" && !departmentFilter) {
      return mapped;
    }

    return mapped.filter((row) => {
      const matchesMonth = monthFilter === "" || row.month === monthFilter;
      const matchesDepartment = !departmentFilter || row.department === departmentFilter;
      return matchesMonth && matchesDepartment;
    });
  }, [plansQuery.data, monthFilter, departmentFilter]);

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

  const departmentOptions = useMemo(() => {
    const options = new Set<string>();
    plansQuery.data?.forEach((plan) => {
      if (plan.department) {
        options.add(plan.department);
      }
    });
    return Array.from(options).sort((a, b) => a.localeCompare(b, "tr"));
  }, [plansQuery.data]);

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
        valueGetter: (params) => {
          const row = params?.row;
          if (!row) {
            return "-";
          }

          return row.scenario_name ?? "-";
        }
      },
      {
        field: "budget",
        headerName: "Bütçe Kalemi",
        flex: 1,
        valueGetter: (params) => {
          const row = params?.row;
          const label = row?.budget_name ?? row?.budget_code ?? "-";
          if (label === "-") {
            return "-";
          }
          return formatBudgetItemLabel({
            code: row?.budget_code ?? undefined,
            name: row?.budget_name ?? row?.budget_code ?? ""
          });
        }
      },
      {
        field: "capex_opex",
        headerName: "Map Capex/Opex",
        flex: 1,
        valueGetter: (params) => {
          return params?.row?.capex_opex ?? "-";
        }
      },
      {
        field: "asset_type",
        headerName: "Map Nitelik",
        flex: 1,
        valueGetter: (params) => {
          return params?.row?.asset_type ?? "-";
        }
      },
      {
        field: "department",
        headerName: "Departman",
        flex: 1,
        valueGetter: (params) => params?.row?.department ?? "-",
      },
      { field: "year", headerName: "Yıl", width: 110 },
      {
        field: "month",
        headerName: "Ay",
        width: 120,
        valueGetter: (params) => {
          const raw = params?.row?.month;

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
        renderCell: ({ row }) => {
          const raw = row.amount;
          let num: number;

          if (typeof raw === "number") {
            num = raw;
          } else if (typeof raw === "string") {
            const parsed = Number(
              raw
                .toString()
                .replace(/\./g, "") // binlik noktaları sil
                .replace(",", ".") // virgülü noktaya çevir
            );
            num = Number.isFinite(parsed) ? parsed : 0;
          } else {
            num = 0;
          }

          return formatCurrency(num);
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
  }, [handleDelete, handleEdit, scenarios, user?.is_admin]);

  const monthlyTotals = useMemo(() => {
    const totals = Array(12).fill(0);
    aggregatesQuery.data?.forEach((aggregate) => {
      totals[aggregate.month - 1] += aggregate.total_amount;
    });
    return totals;
  }, [aggregatesQuery.data]);

  const filteredTotal = useMemo(() => {
    return rows.reduce((sum, plan) => sum + (Number(plan.amount) || 0), 0);
  }, [rows]);

  const formattedFilteredTotal = formatCurrency(filteredTotal);

  const handleMonthlyTotalClick = (selectedMonth: number) => {
    setMonthFilter(selectedMonth);
    plansQuery.refetch();
    window.setTimeout(() => {
      planTableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const handleApplyFilters = () => {
    plansQuery.refetch();
    aggregatesQuery.refetch();
  };

  const handleResetFilters = () => {
    setYear(currentYear);
    setScenarioId(null);
    setMonthFilter("");
    setDepartmentFilter("");
    setBudgetItemId(null);
    setCapexOpex("");
    setFormBudgetItemId(null);
    setTimeout(() => {
      plansQuery.refetch();
      aggregatesQuery.refetch();
    }, 0);
  };

  return (
    <Stack spacing={4}>
      <FiltersBar onApply={handleApplyFilters} onReset={handleResetFilters}>
        <TextField
          label="Yıl"
          type="number"
          size="small"
          value={year}
          onChange={(event) => {
            const value = event.target.value;
            setYear(value ? Number(value) : currentYear);
          }}
          sx={{ minWidth: 110, "& .MuiInputBase-root": { height: 40 } }}
        />
        <TextField
          select
          label="Senaryo"
          size="small"
          value={scenarioId ?? ""}
          onChange={(event) =>
            setScenarioId(event.target.value ? Number(event.target.value) : null)
          }
          sx={{ minWidth: 260, "& .MuiInputBase-root": { height: 40 } }}
        >
          <MenuItem value="">Tümü</MenuItem>
          {scenarios?.map((scenario) => (
            <MenuItem key={scenario.id} value={scenario.id}>
              {scenario.name} ({scenario.year})
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Ay"
          size="small"
          value={monthFilter}
          onChange={(event) =>
            setMonthFilter(
              event.target.value ? Number(event.target.value) : ""
            )
          }
          sx={{ minWidth: 160, "& .MuiInputBase-root": { height: 40 } }}
        >
          <MenuItem value="">Tümü</MenuItem>
          {monthOptions.map((label, index) => (
            <MenuItem key={index + 1} value={index + 1}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Departman"
          size="small"
          value={departmentFilter}
          onChange={(event) => setDepartmentFilter(event.target.value)}
          sx={{ minWidth: 180, "& .MuiInputBase-root": { height: 40 } }}
        >
          <MenuItem value="">Tümü</MenuItem>
          {departmentOptions.map((name) => (
            <MenuItem key={name} value={name}>
              {name}
            </MenuItem>
          ))}
        </TextField>
        <Autocomplete
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
          select
          label="Capex/Opex"
          size="small"
          value={capexOpex}
          onChange={(event) => setCapexOpex(event.target.value as "" | "capex" | "opex")}
          sx={{ minWidth: 170, "& .MuiInputBase-root": { height: 40 } }}
        >
          <MenuItem value="">Tümü</MenuItem>
          <MenuItem value="capex">Capex</MenuItem>
          <MenuItem value="opex">Opex</MenuItem>
        </TextField>
      </FiltersBar>

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
                      backgroundColor: total > 0 ? "rgba(13, 71, 161, 0.06)" : "background.default",
                      border:
                        monthFilter === index + 1 ? "1px solid rgba(13, 71, 161, 0.35)" : "1px solid transparent",
                      cursor: "pointer"
                    }}
                    onClick={() => handleMonthlyTotalClick(index + 1)}
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
              <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
                spacing={1}
                mb={1}
              >
                <Typography variant="subtitle1" fontWeight={600}>
                  Plan Kayıtları
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Seçili filtrelere göre plan toplamı:{" "}
                  <Box component="span" fontWeight={700} color="text.primary">
                    {formattedFilteredTotal}
                  </Box>
                </Typography>
              </Stack>
              <Box ref={planTableRef} sx={{ width: "100%", overflowX: "auto" }}>
                <DataGrid
                  autoHeight
                  rows={rows ?? []}
                  columns={columns}
                  loading={plansQuery.isFetching}
                  getRowId={(row) => row.id ?? `${row.year}-${row.month}-${row.budget_item_id}`}
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
              <Autocomplete
                options={budgetItems ?? []}
                value={budgetItems?.find((item) => item.id === formBudgetItemId) ?? null}
                onChange={(_, value) => setFormBudgetItemId(value?.id ?? null)}
                getOptionLabel={(option) => formatBudgetItemLabel(option) || "-"}
                filterOptions={budgetFilterOptions}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderInput={(params) => (
                  <TextField {...params} label="Bütçe Kalemi" required fullWidth />
                )}
              />
              <TextField
                label="Departman"
                name="department"
                defaultValue={editingPlan?.department ?? ""}
                placeholder="Opsiyonel"
              />
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
      <Snackbar
        open={Boolean(listError)}
        autoHideDuration={5000}
        onClose={() => setListError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity="error" onClose={() => setListError(null)} sx={{ width: "100%" }}>
          {listError}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
