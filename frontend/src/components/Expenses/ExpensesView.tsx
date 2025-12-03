import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

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

export interface Expense {
  id: number;
  budget_item_id: number;
  scenario_id: number | null;
  expense_date: string;
  amount: number;
  quantity: number;
  unit_price: number;
  vendor: string | null;
  description: string | null;
  status: "recorded" | "cancelled";
  is_out_of_budget: boolean;
  created_by_id: number | null;
  created_at: string;
  updated_at: string;
  client_hostname: string | null;
  kaydi_giren_kullanici: string | null;
}

interface ExpensePayload {
  id?: number;
  budget_item_id: number;
  scenario_id?: number | null;
  expense_date: string;
  amount: number;
  quantity: number;
  unit_price: number;
  vendor?: string;
  description?: string;
  status: "recorded" | "cancelled";
  is_out_of_budget: boolean;
  client_hostname?: string | null;
  kaydi_giren_kullanici?: string | null;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "USD"
  }).format(value ?? 0);
}

const statusLabels: Record<Expense["status"], string> = {
  recorded: "Kaydedildi",
  cancelled: "İptal Edildi"
};

export default function ExpensesView() {
  const client = useAuthorizedClient();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const currentYear = new Date().getFullYear();
  const [year, setYear] = usePersistentState<number | "">("expenses:year", currentYear);
  const [scenarioId, setScenarioId] = usePersistentState<number | null>("expenses:scenarioId", null);
  const [budgetItemId, setBudgetItemId] = usePersistentState<number | null>("expenses:budgetItemId", null);
  const [statusFilter, setStatusFilter] = usePersistentState<"" | Expense["status"]>("expenses:status", "");
  const [startDate, setStartDate] = usePersistentState<string>("expenses:startDate", "");
  const [endDate, setEndDate] = usePersistentState<string>("expenses:endDate", "");
  const [includeOutOfBudget, setIncludeOutOfBudget] = usePersistentState<boolean>("expenses:includeOutOfBudget", true);
  const [mineOnly, setMineOnly] = usePersistentState<boolean>("expenses:mineOnly", false);
  const [todayOnly, setTodayOnly] = usePersistentState<boolean>("expenses:todayOnly", false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formQuantity, setFormQuantity] = useState<string>("1");
  const [formUnitPrice, setFormUnitPrice] = useState<string>("0");

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

  const { data: expenses, isFetching } = useQuery<Expense[]>({
    queryKey: [
      "expenses",
      year,
      scenarioId,
      budgetItemId,
      statusFilter,
      startDate,
      endDate,
      includeOutOfBudget,
      mineOnly,
      todayOnly
    ],
    queryFn: async () => {
      const params: Record<string, string | number | boolean> = {};
      if (year) params.year = Number(year);
      if (scenarioId) params.scenario_id = scenarioId;
      if (budgetItemId) params.budget_item_id = budgetItemId;
      if (statusFilter) params.status_filter = statusFilter;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      params.include_out_of_budget = includeOutOfBudget;
      params.mine_only = mineOnly;
      params.today_only = todayOnly;
      const { data } = await client.get<Expense[]>("/expenses", { params });
      return data;
    }
  });

  const mutation = useMutation({
    mutationFn: async (payload: ExpensePayload) => {
      if (payload.id) {
        const { id, ...body } = payload;
        const { data } = await client.put<Expense>(`/expenses/${id}`, body);
        return data;
      }
      const { data } = await client.post<Expense>("/expenses", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setDialogOpen(false);
      setErrorMessage(null);
    },
    onError: (error: unknown) => {
      setErrorMessage("Harcama kaydı kaydedilirken bir hata oluştu");
      console.error(error);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (expenseId: number) => {
      await client.delete(`/expenses/${expenseId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });

  const handleCreate = useCallback(() => {
    setEditingExpense(null);
    setFormQuantity("1");
    setFormUnitPrice("0");
    setDialogOpen(true);
  }, [setDialogOpen, setEditingExpense, setFormQuantity, setFormUnitPrice]);

  const handleEdit = useCallback(
    (expense: Expense) => {
      setEditingExpense(expense);
      setFormQuantity(String(expense.quantity ?? 1));
      setFormUnitPrice(String(expense.unit_price ?? 0));
      setDialogOpen(true);
    },
    [setDialogOpen, setEditingExpense, setFormQuantity, setFormUnitPrice]
  );

  const handleDelete = useCallback(
    (expenseId: number) => {
      const confirmed = window.confirm("Harcama kaydını silmek istediğinize emin misiniz?");
      if (confirmed) {
        deleteMutation.mutate(expenseId);
      }
    },
    [deleteMutation]
  );

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const quantity = Number(formData.get("quantity")) || 1;
    const unitPrice = Number(formData.get("unit_price")) || 0;
    const amount = Number.isFinite(quantity * unitPrice)
      ? Math.round(quantity * unitPrice * 100) / 100
      : 0;

    const payload: ExpensePayload = {
      id: editingExpense?.id,
      budget_item_id: Number(formData.get("budget_item_id")),
      scenario_id: formData.get("scenario_id")
        ? Number(formData.get("scenario_id"))
        : null,
      expense_date: String(formData.get("expense_date")),
      amount,
      quantity,
      unit_price: unitPrice,
      vendor: formData.get("vendor")?.toString() ?? undefined,
      description: formData.get("description")?.toString() ?? undefined,
      status: formData.get("is_cancelled") === "on" ? "cancelled" : "recorded",
      is_out_of_budget: formData.get("is_out_of_budget") === "on",
      client_hostname: editingExpense?.client_hostname ?? undefined,
      kaydi_giren_kullanici:
        editingExpense?.kaydi_giren_kullanici ?? user?.username ?? user?.full_name ?? undefined
    };

    mutation.mutate(payload);
  };

  const totalActual = useMemo(() => {
    return expenses?.reduce((sum, expense) => sum + expense.amount, 0) ?? 0;
  }, [expenses]);

  const outOfBudgetTotal = useMemo(() => {
    return (
      expenses?.reduce(
        (sum, expense) => (expense.is_out_of_budget ? sum + expense.amount : sum),
        0
      ) ?? 0
    );
  }, [expenses]);

  const cancelledTotal = useMemo(() => {
    return (
      expenses?.reduce(
        (sum, expense) => (expense.status === "cancelled" ? sum + expense.amount : sum),
        0
      ) ?? 0
    );
  }, [expenses]);

  const totalAmount = useMemo(() => {
    const quantityNumber = Number(formQuantity);
    const unitPriceNumber = Number(formUnitPrice);
    if (Number.isNaN(quantityNumber) || Number.isNaN(unitPriceNumber)) {
      return 0;
    }
    return Math.round(quantityNumber * unitPriceNumber * 100) / 100;
  }, [formQuantity, formUnitPrice]);

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
    return expenses?.map((expense) => ({
      ...expense,
      budget_item_id: expense?.budget_item_id ?? null
    })) ?? [];
  }, [expenses]);

  const baseColumns = useMemo<GridColDef[]>(() => {
    return [
      {
        field: "expense_date",
        headerName: "Tarih",
        width: 140,
        valueFormatter: ({ value }) => dayjs(value as string).format("DD MMMM YYYY")
      },
      {
        field: "budget_item_id",
        headerName: "Bütçe Kalemi",
        width: 240,
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
        width: 180,
        valueGetter: (value, row) => {
          const item = findBudgetItem(row);
          return item?.map_category ?? "";
        }
      },
      {
        field: "map_attribute",
        headerName: "Map Nitelik",
        width: 180,
        valueGetter: (value, row) => {
          const item = findBudgetItem(row);
          return item?.map_attribute ?? "";
        }
      },
      {
        field: "scenario_id",
        headerName: "Senaryo",
        width: 150,
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
        field: "amount",
        headerName: "Tutar",
        width: 140,
        valueFormatter: ({ value }) => formatCurrency(value as number)
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
        valueFormatter: ({ value }) => formatCurrency(value as number)
      },
      {
        field: "vendor",
        headerName: "Satıcı",
        width: 200,
        renderCell: ({ row }) => renderTextWithTooltip(row.vendor)
      },
      {
        field: "kaydi_giren_kullanici",
        headerName: "Kaydı Giren",
        width: 220,
        renderCell: ({ row }) => renderTextWithTooltip(row.kaydi_giren_kullanici, "Bilinmiyor")
      },
      {
        field: "status",
        headerName: "Durum",
        width: 130,
        renderCell: ({ row }) => (
          <Chip
            label={statusLabels[row.status]}
            color={row.status === "recorded" ? "success" : "default"}
            variant={row.status === "recorded" ? "filled" : "outlined"}
            size="small"
          />
        )
      },
      {
        field: "is_out_of_budget",
        headerName: "Bütçe Dışı",
        width: 140,
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
        width: 140,
        sortable: false,
        renderCell: ({ row }) => (
          <Stack direction="row" spacing={1}>
            <Tooltip title="Güncelle">
              <IconButton size="small" onClick={() => handleEdit(row)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Sil">
              <IconButton size="small" color="error" onClick={() => handleDelete(row.id)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        )
      }
    ];
  }, [findBudgetItem, handleDelete, handleEdit, scenarios, renderTextWithTooltip]);

  const columns = useMemo<GridColDef[]>(
    () =>
      baseColumns.map((column) => ({
        ...column,
        width: column.width ?? 160,
        resizable: true
      })),
    [baseColumns]
  );

  return (
    <Stack spacing={4} sx={{ width: "100%", minWidth: 0, maxWidth: "100%", overflowX: "hidden" }}>
      <Card>
        <CardContent>
          <Grid container spacing={3} disableEqualOverflow>
            <Grid item xs={12} md={3}>
              <TextField
                label="Yıl"
                type="number"
                value={year}
                onChange={(event) => setYear(event.target.value ? Number(event.target.value) : "")}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={3}>
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
            <Grid item xs={12} md={3}>
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
            <Grid item xs={12} md={3}>
              <TextField
                select
                label="Durum"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as Expense["status"] | "")}
                fullWidth
              >
                <MenuItem value="">Tümü</MenuItem>
                <MenuItem value="recorded">Kaydedildi</MenuItem>
                <MenuItem value="cancelled">İptal Edildi</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="Başlangıç Tarihi"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="Bitiş Tarihi"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                flexWrap={{ sm: "wrap" }}
                sx={{
                  rowGap: { sm: 1.5 },
                  columnGap: { sm: 2 },
                  "& .MuiFormControlLabel-root": {
                    flex: { sm: "1 1 220px" }
                  }
                }}
              >
                <FormControlLabel
                  control={
                    <Switch
                      checked={includeOutOfBudget}
                      onChange={(event) => setIncludeOutOfBudget(event.target.checked)}
                    />
                  }
                  label="Bütçe dışı kayıtları dahil et"
                />
                <FormControlLabel
                  control={<Switch checked={mineOnly} onChange={(event) => setMineOnly(event.target.checked)} />}
                  label="Sadece benim kayıtlarım"
                />
                <FormControlLabel
                  control={<Switch checked={todayOnly} onChange={(event) => setTodayOnly(event.target.checked)} />}
                  label="Bugüne ait"
                />
              </Stack>
            </Grid>
            <Grid item xs={12} md={6} textAlign="right">
              <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
                Harcama Ekle
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Grid container spacing={3} disableEqualOverflow>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Toplam Gerçekleşen
              </Typography>
              <Typography variant="h4" fontWeight={700} color="primary">
                {formatCurrency(totalActual)}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Bu listeye dahil edilen kayıtların toplam tutarı.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Bütçe Dışı Harcamalar
              </Typography>
              <Typography variant="h5" fontWeight={700} color="warning.main">
                {formatCurrency(outOfBudgetTotal)}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Plan dışı olarak işaretlenen harcamaların toplamı.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                İptal Edildi
              </Typography>
              <Typography variant="h5" fontWeight={700} color="text.secondary">
                {formatCurrency(cancelledTotal)}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                İptal edilen kayıtların toplam tutarı.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12}>
          <Card>
            <CardContent
              sx={{
                flexGrow: 1,
                display: "flex",
                flexDirection: "column",
                minWidth: 0,
                overflow: "hidden"
              }}
            >
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Harcamalar
              </Typography>
              <Box sx={{ flexGrow: 1, minWidth: 0, width: "100%", overflowX: "auto" }}>
                <DataGrid
                  rows={rows ?? []}
                  columns={columns}
                  autoHeight
                  disableRowSelectionOnClick
                  pageSizeOptions={[15, 25, 50]}
                  initialState={{
                    pagination: { paginationModel: { pageSize: 15 } }
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{editingExpense ? "Harcamayı Güncelle" : "Yeni Harcama"}</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent>
            <Stack spacing={2.5}>
              {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    select
                    label="Bütçe Kalemi"
                    name="budget_item_id"
                    defaultValue={editingExpense?.budget_item_id ?? budgetItemId ?? ""}
                    required
                    fullWidth
                  >
                {budgetItems?.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {formatBudgetItemLabel(item)}
                  </MenuItem>
                ))}
              </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    select
                    label="Senaryo"
                    name="scenario_id"
                    defaultValue={editingExpense?.scenario_id ?? scenarioId ?? ""}
                    fullWidth
                  >
                    <MenuItem value="">Seçili Değil</MenuItem>
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
                    defaultValue={
                      editingExpense?.expense_date
                        ? dayjs(editingExpense.expense_date).format("YYYY-MM-DD")
                        : dayjs().format("YYYY-MM-DD")
                    }
                    InputLabelProps={{ shrink: true }}
                    required
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Adet"
                    name="quantity"
                    type="number"
                    inputProps={{ min: 1, step: 1 }}
                    value={formQuantity}
                    onChange={(event) => setFormQuantity(event.target.value)}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Birim Fiyat"
                    name="unit_price"
                    type="number"
                    inputProps={{ min: 0, step: 10 }}
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
                <Grid item xs={12} md={4}>
                  <FormControlLabel
                    control={
                      <Switch
                        name="is_cancelled"
                        defaultChecked={editingExpense?.status === "cancelled"}
                      />
                    }
                    label="İptal Edildi"
                    sx={{ ml: 0 }}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControlLabel
                    control={
                      <Switch
                        name="is_out_of_budget"
                        defaultChecked={editingExpense?.is_out_of_budget ?? false}
                      />
                    }
                    label="Bütçe Dışı"
                    sx={{ ml: 0 }}
                  />
                </Grid>
              </Grid>
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
