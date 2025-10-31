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
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import { useAuth } from "../../context/AuthContext";

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
  const [year, setYear] = useState<number | "">(currentYear);
  const [scenarioId, setScenarioId] = useState<number | null>(null);
  const [budgetItemId, setBudgetItemId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | Expense["status"]>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [includeOutOfBudget, setIncludeOutOfBudget] = useState(true);
  const [mineOnly, setMineOnly] = useState(false);
  const [todayOnly, setTodayOnly] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    }
  });

  const handleCreate = useCallback(() => {
    setEditingExpense(null);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((expense: Expense) => {
    setEditingExpense(expense);
    setDialogOpen(true);
  }, []);

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
    const payload: ExpensePayload = {
      id: editingExpense?.id,
      budget_item_id: Number(formData.get("budget_item_id")),
      scenario_id: formData.get("scenario_id")
        ? Number(formData.get("scenario_id"))
        : null,
      expense_date: String(formData.get("expense_date")),
      amount: Number(formData.get("amount")),
      quantity: Number(formData.get("quantity")) || 1,
      unit_price: Number(formData.get("unit_price")) || 0,
      vendor: formData.get("vendor")?.toString() ?? undefined,
      description: formData.get("description")?.toString() ?? undefined,
      status: formData.get("is_cancelled") === "on" ? "cancelled" : "recorded",
      is_out_of_budget: formData.get("is_out_of_budget") === "on"
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

  const columns = useMemo<GridColDef[]>(() => {
    return [
      {
        field: "expense_date",
        headerName: "Tarih",
        width: 140,
        valueFormatter: ({ value }) => dayjs(value as string).format("DD MMM YYYY")
      },
      {
        field: "budget_item_id",
        headerName: "Bütçe Kalemi",
        flex: 1,
        valueGetter: (params) => {
          const item = budgetItems?.find((budget) => budget.id === params.row.budget_item_id);
          return item ? `${item.code} — ${item.name}` : "-";
        }
      },
      {
        field: "scenario_id",
        headerName: "Senaryo",
        width: 150,
        valueGetter: (params) =>
          scenarios?.find((scenario) => scenario.id === params.row.scenario_id)?.name ?? "-"
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
        flex: 1,
        valueGetter: (params) => params.row.vendor ?? "-"
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
  }, [budgetItems, handleDelete, handleEdit, scenarios]);

  return (
    <Stack spacing={4} sx={{ width: "100%", minWidth: 0, maxWidth: "100%", overflowX: "hidden" }}>
      <Box>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Harcama Yönetimi
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Güncel harcamaları kaydedin, bütçe dışı/iptal durumlarını takip edin ve filtreleyin.
        </Typography>
      </Box>

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
                    {item.code} — {item.name}
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
          <Card
            sx={{
              height: { xs: 520, lg: 640 },
              display: "flex",
              flexDirection: "column",
              overflow: "hidden"
            }}
          >
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
              <Box sx={{ flexGrow: 1, minWidth: 0, width: "100%", overflow: "hidden" }}>
                <DataGrid
                  rows={expenses ?? []}
                  columns={columns}
                  loading={isFetching}
                  getRowId={(row) => row.id}
                  disableRowSelectionOnClick
                  initialState={{
                    pagination: { paginationModel: { pageSize: 15, page: 0 } }
                  }}
                  pageSizeOptions={[15, 30, 50]}
                  sx={{
                    border: "none",
                    flexGrow: 1,
                    minWidth: 0,
                    width: "100%",
                    "& .MuiDataGrid-main": {
                      overflowX: "auto",
                      scrollbarGutter: "stable"
                    },
                    "& .MuiDataGrid-virtualScroller": {
                      overflowX: "hidden",
                      overscrollBehaviorX: "contain"
                    },
                    "& .MuiDataGrid-virtualScrollerContent": {
                      minWidth: "100%"
                    }
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
                        {item.code} — {item.name}
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
                    label="Toplam Tutar"
                    name="amount"
                    type="number"
                    inputProps={{ min: 0, step: 10 }}
                    defaultValue={editingExpense?.amount ?? 0}
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
                    defaultValue={editingExpense?.quantity ?? 1}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Birim Fiyat"
                    name="unit_price"
                    type="number"
                    inputProps={{ min: 0, step: 10 }}
                    defaultValue={editingExpense?.unit_price ?? 0}
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
