import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import ReportGmailerrorredOutlinedIcon from "@mui/icons-material/ReportGmailerrorredOutlined";
import {
  DataGrid,
  GridToolbar,
  type GridColDef,
  type GridColumnVisibilityModel,
  type GridFilterModel,
  type GridPaginationModel,
  type GridRowSelectionModel,
  type GridSortModel
} from "@mui/x-data-grid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import usePersistentState from "../../hooks/usePersistentState";
import { useAuth } from "../../context/AuthContext";
import { formatBudgetItemLabel, stripBudgetCode } from "../../utils/budgetLabel";
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
  updated_by_id?: number | null;
  created_at: string;
  updated_at: string;
  client_hostname: string | null;
  kaydi_giren_kullanici: string | null;
  created_by_name?: string | null;
  updated_by_name?: string | null;
  created_by_username?: string | null;
  updated_by_username?: string | null;
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

type SavedGridView = {
  name: string;
  filterModel: GridFilterModel;
  sortModel: GridSortModel;
  columnVisibilityModel: GridColumnVisibilityModel;
};

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

  const currentUserId = user?.id ?? "anon";
  const GRID_VIEWS_KEY = `expenses-grid-views-${currentUserId}`;

  const currentYear = new Date().getFullYear();
  const [year, setYear] = usePersistentState<number | "">("expenses:year", currentYear);
  const [scenarioId, setScenarioId] = usePersistentState<number | null>("expenses:scenarioId", null);
  const [budgetItemId, setBudgetItemId] = usePersistentState<number | null>("expenses:budgetItemId", null);
  const [statusFilter, setStatusFilter] = usePersistentState<"" | Expense["status"]>("expenses:status", "");
  const [startDate, setStartDate] = usePersistentState<string>("expenses:startDate", "");
  const [endDate, setEndDate] = usePersistentState<string>("expenses:endDate", "");
  const [capexOpex, setCapexOpex] = usePersistentState<"" | "capex" | "opex">(
    "expenses:capexOpex",
    ""
  );
  const [includeOutOfBudget, setIncludeOutOfBudget] = usePersistentState<boolean>("expenses:includeOutOfBudget", true);
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [showCancelled, setShowCancelled] = usePersistentState<boolean>("expenses:showCancelled", false);
  const [showOutOfBudget, setShowOutOfBudget] = usePersistentState<boolean>("expenses:showOutOfBudget", false);
  const [mineOnly, setMineOnly] = usePersistentState<boolean>("expenses:mineOnly", false);
  const [todayOnly, setTodayOnly] = usePersistentState<boolean>("expenses:todayOnly", false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formQuantity, setFormQuantity] = useState<string>("1");
  const [formUnitPrice, setFormUnitPrice] = useState<string>("0");
  const [formBudgetItemId, setFormBudgetItemId] = useState<number | null>(null);
  const [filterModel, setFilterModel] = useState<GridFilterModel>({ items: [] });
  const [sortModel, setSortModel] = useState<GridSortModel>([]);
  const [columnVisibilityModel, setColumnVisibilityModel] =
    useState<GridColumnVisibilityModel>({});
  const [savedViews, setSavedViews] = useState<SavedGridView[]>([]);
  const [selectedViewName, setSelectedViewName] = useState<string>("");
  const [newViewName, setNewViewName] = useState<string>("");
  const [renderVersion, setRenderVersion] = useState(0);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 10
  });
  const [, setSelectionModel] = useState<GridRowSelectionModel>([]);
  const [selectedExpenseFilter, setSelectedExpenseFilter] = useState<
    "ALL" | "ACTIVE" | "OUT_OF_BUDGET" | "CANCELLED"
  >("ALL");

  const handleRowUpdate = useCallback(
    (updatedRow: Expense, originalRow: Expense) => ({ ...originalRow, ...updatedRow }),
    []
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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(GRID_VIEWS_KEY);
      if (!raw) return;
      const parsed: SavedGridView[] = JSON.parse(raw);
      setSavedViews(parsed);
    } catch {
      // bozuk veri varsa sessiz geç
    }
  }, [GRID_VIEWS_KEY]);

  const { data: expenses, isFetching, refetch: refetchExpenses } = useQuery<Expense[]>({
    queryKey: [
      "expenses",
      year,
      scenarioId,
      budgetItemId,
      statusFilter,
      startDate,
      endDate,
      capexOpex,
      includeOutOfBudget,
      showCancelled,
      showOutOfBudget,
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
      if (capexOpex) params.capex_opex = capexOpex;
      params.include_out_of_budget = includeOutOfBudget;
      params.show_cancelled = showCancelled;
      params.show_out_of_budget = showOutOfBudget;
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
    setFormBudgetItemId(budgetItemId ?? null);
    setDialogOpen(true);
  }, [budgetItemId, setDialogOpen, setEditingExpense, setFormQuantity, setFormUnitPrice]);

  const handleEdit = useCallback(
    (expense: Expense) => {
      setEditingExpense(expense);
      setFormQuantity(String(expense.quantity ?? 1));
      setFormUnitPrice(String(expense.unit_price ?? 0));
      setFormBudgetItemId(expense.budget_item_id ?? null);
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

  const handleSaveCurrentView = () => {
    const name = newViewName.trim();
    if (!name) return;

    const newView: SavedGridView = {
      name,
      filterModel,
      sortModel,
      columnVisibilityModel
    };

    const updated = [...savedViews.filter((v) => v.name !== name), newView];

    setSavedViews(updated);
    localStorage.setItem(GRID_VIEWS_KEY, JSON.stringify(updated));
    setSelectedViewName(name);
  };

  const handleSelectView = (name: string) => {
    setSelectedViewName(name);
    const view = savedViews.find((v) => v.name === name);
    if (!view) return;

    setFilterModel(view.filterModel);
    setSortModel(view.sortModel);
    setColumnVisibilityModel(view.columnVisibilityModel);
  };

  const handleDeleteView = (name: string) => {
    const updated = savedViews.filter((v) => v.name !== name);
    setSavedViews(updated);
    localStorage.setItem(GRID_VIEWS_KEY, JSON.stringify(updated));

    if (selectedViewName === name) {
      setSelectedViewName("");
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formBudgetItemId) {
      setErrorMessage("Bütçe kalemi seçmelisiniz.");
      return;
    }
    const formData = new FormData(event.currentTarget);
    const quantity = Number(formData.get("quantity")) || 1;
    const unitPrice = Number(formData.get("unit_price")) || 0;
    const amount = Number.isFinite(quantity * unitPrice)
      ? Math.round(quantity * unitPrice * 100) / 100
      : 0;

    const payload: ExpensePayload = {
      id: editingExpense?.id,
      budget_item_id: formBudgetItemId,
      scenario_id: formData.get("scenario_id")
        ? Number(formData.get("scenario_id"))
        : scenarioId,
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

  const activeTotal = useMemo(() => {
    return (
      expenses?.reduce(
        (sum, expense) => (expense.status === "recorded" ? sum + expense.amount : sum),
        0
      ) ?? 0
    );
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

  const summaryFilterItems = useMemo<GridFilterModel["items"]>(() => {
    switch (selectedExpenseFilter) {
      case "ACTIVE":
        return [{ field: "status", operator: "equals", value: "recorded" }];
      case "OUT_OF_BUDGET":
        return [{ field: "is_out_of_budget", operator: "is", value: true }];
      case "CANCELLED":
        return [{ field: "status", operator: "equals", value: "cancelled" }];
      default:
        return [];
    }
  }, [selectedExpenseFilter]);

  const combinedFilterModel = useMemo<GridFilterModel>(
    () => {
      const reservedFields = ["status", "is_out_of_budget"];
      const cleanedItems = filterModel.items.filter(
        (item) => !reservedFields.includes(item.field ?? "")
      );
      return {
        ...filterModel,
        items: [...cleanedItems, ...summaryFilterItems]
      };
    },
    [filterModel, summaryFilterItems]
  );

  const handleFilterModelChange = useCallback(
    (model: GridFilterModel) => {
      const reservedFields = ["status", "is_out_of_budget"];
      const cleanedItems = model.items.filter(
        (item) => !reservedFields.includes(item.field ?? "")
      );
      setFilterModel({ ...model, items: cleanedItems });
    },
    [setFilterModel]
  );

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

  const budgetFilterOptions = useMemo(
    () =>
      createFilterOptions<BudgetItem>({
        stringify: (option) => {
          const name = stripBudgetCode(option.name ?? "");
          return `${option.code ?? ""} ${name} ${option.map_category ?? ""} ${option.map_attribute ?? ""}`;
        }
      }),
    []
  );

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
        valueGetter: (params) => {
          const item = findBudgetItem(params?.row);
          if (!item) {
            return "";
          }

          return formatBudgetItemLabel(item);
        }
      },
      {
        field: "map_category",
        headerName: "Map Capex/Opex",
        width: 180,
        valueGetter: (params) => {
          const item = findBudgetItem(params?.row);
          return item?.map_category ?? "-";
        }
      },
      {
        field: "map_attribute",
        headerName: "Map Nitelik",
        width: 180,
        valueGetter: (params) => {
          const item = findBudgetItem(params?.row);
          return item?.map_attribute ?? "-";
        }
      },
      {
        field: "scenario_id",
        headerName: "Bütçe Yılı",
        width: 150,
        valueGetter: (params) => {
          const row = params?.row;
          if (!row || row.scenario_id == null || !Array.isArray(scenarios)) {
            return "";
          }

          const scenario = scenarios.find(
            (item) => item && (item.scenario_id === row.scenario_id || item.id === row.scenario_id)
          );

          return scenario?.year ?? "";
        }
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
                .replace(/\./g, "")
                .replace(",", ".")
            );
            num = Number.isFinite(parsed) ? parsed : 0;
          } else {
            num = 0;
          }

          return formatCurrency(num);
        }
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
        renderCell: ({ row }) => {
          const raw = row.unit_price;
          let num: number;

          if (typeof raw === "number") {
            num = raw;
          } else if (typeof raw === "string") {
            const parsed = Number(
              raw
                .toString()
                .replace(/\./g, "")
                .replace(",", ".")
            );
            num = Number.isFinite(parsed) ? parsed : 0;
          } else {
            num = 0;
          }

          return formatCurrency(num);
        }
      },
      {
        field: "vendor",
        headerName: "Satıcı",
        width: 200,
        renderCell: ({ row }) => renderTextWithTooltip(row.vendor)
      },
      {
        field: "created_by_name",
        headerName: "Kaydı Giren",
        width: 200,
        renderCell: ({ row }) =>
          renderTextWithTooltip(
            row.created_by_username ?? row.created_by_name ?? row.kaydi_giren_kullanici,
            "Bilinmiyor"
          )
      },
      {
        field: "updated_by_name",
        headerName: "Son Güncelleyen",
        width: 200,
        renderCell: ({ row }) =>
          renderTextWithTooltip(row.updated_by_username ?? row.updated_by_name, "Bilinmiyor")
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

  const formattedTotalActual = formatCurrency(totalActual);
  const formattedActive = formatCurrency(activeTotal);
  const formattedOutOfBudget = formatCurrency(outOfBudgetTotal);
  const formattedCanceled = formatCurrency(cancelledTotal);

  const handleApplyFilters = () => {
    refetchExpenses();
  };

  const handleResetFilters = () => {
    setYear(currentYear);
    setScenarioId(null);
    setBudgetItemId(null);
    setStatusFilter("");
    setStartDate("");
    setEndDate("");
    setCapexOpex("");
    setIncludeOutOfBudget(true);
    setShowCancelled(false);
    setShowOutOfBudget(false);
    setMineOnly(false);
    setTodayOnly(false);
    setSelectedExpenseFilter("ALL");
    setFilterModel({ items: [] });
    setSortModel([]);
    setTimeout(() => {
      refetchExpenses();
    }, 0);
  };

  const summaryCards = [
    {
      key: "ALL",
      title: "Tümü",
      value: formattedTotalActual,
      subtitle: "Toplam gerçekleşen",
      icon: <CheckCircleOutlineOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
      iconColor: "primary.main"
    },
    {
      key: "ACTIVE",
      title: "Aktif",
      value: formattedActive,
      subtitle: "Aktif harcamalar",
      icon: <CheckCircleOutlineOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
      iconColor: "success.main"
    },
    {
      key: "OUT_OF_BUDGET",
      title: "Bütçe Dışı",
      value: formattedOutOfBudget,
      subtitle: "Bütçe dışı harcamalar",
      icon: <ReportGmailerrorredOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
      iconColor: "warning.main"
    },
    {
      key: "CANCELLED",
      title: "İptal",
      value: formattedCanceled,
      subtitle: "İptal edilenler",
      icon: <CancelOutlinedIcon sx={{ fontSize: 18, color: "common.white" }} />,
      iconColor: "error.main"
    }
  ] as const;

  return (
    <Stack
      spacing={3}
      sx={{
        width: "100%",
        minWidth: 0,
        maxWidth: "100%"
      }}
    >
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {summaryCards.map((card) => {
          const isSelected = selectedExpenseFilter === card.key;
          return (
            <Grid item xs={12} sm={6} md={3} key={card.key}>
              <Card
                variant="outlined"
                sx={{
                  borderColor: isSelected ? "primary.main" : "divider",
                  boxShadow: isSelected ? 3 : 0,
                  transition: "box-shadow 0.2s ease, border-color 0.2s ease",
                }}
              >
                <CardActionArea
                  onClick={() =>
                    setSelectedExpenseFilter((prev) => (prev === card.key ? "ALL" : card.key))
                  }
                  sx={{ height: "100%" }}
                >
                  <CardContent sx={{ position: "relative", minHeight: 120 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      {card.title}
                    </Typography>
                    <Typography variant="h5" sx={{ mt: 0.5 }}>
                      {card.value}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {card.subtitle}
                    </Typography>
                    <Box sx={{ position: "absolute", top: 12, right: 12 }}>
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          bgcolor: card.iconColor,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center"
                        }}
                      >
                        {card.icon}
                      </Box>
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center" justifyContent="space-between">
            <Typography variant="h6" fontWeight={700}>
              Harcama Ekle
            </Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
              Harcama Ekle
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent
          sx={{
            flexGrow: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            overflow: "visible"
          }}
        >
          <Box sx={{ mb: 3, display: "flex", flexDirection: "column", gap: 2 }}>
            <FiltersBar title="Harcama Filtreleri" onApply={handleApplyFilters} onReset={handleResetFilters}>
              <TextField
                label="Yıl"
                type="number"
                size="small"
                value={year}
                onChange={(event) => setYear(event.target.value ? Number(event.target.value) : "")}
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
                    {scenario.year}
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

            <Grid container spacing={3} disableEqualOverflow>
              <Grid item xs={12} md={3}>
                <TextField
                  select
                  label="Durum"
                  size="small"
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
                  size="small"
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
                  size="small"
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
                      <Checkbox
                        checked={showCancelled}
                        onChange={(event) => setShowCancelled(event.target.checked)}
                      />
                    }
                    label="İptal Edilenleri Göster"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={showOutOfBudget}
                        onChange={(event) => setShowOutOfBudget(event.target.checked)}
                      />
                    }
                    label="Bütçe Dışı Alımları Göster"
                  />
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
            </Grid>
          </Box>

          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Harcamalar
          </Typography>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              justifyContent: "space-between",
              mb: 1,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <TextField
                select
                size="small"
                label="Kayıtları Göster"
                value={includeCancelled ? "all" : "active"}
                onChange={(event) =>
                  setIncludeCancelled(event.target.value === "all")
                }
              >
                <MenuItem value="active">Aktif Kayıtlar</MenuItem>
                <MenuItem value="all">Tüm Kayıtlar</MenuItem>
              </TextField>
              <Button
                color="inherit"
                onClick={() => setRenderVersion((prev) => prev + 1)}
              >
                Listeyi Yenile
              </Button>
            </Box>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="center">
              <TextField
                size="small"
                label="Görünüm Adı"
                value={newViewName}
                onChange={(event) => setNewViewName(event.target.value)}
                sx={{ minWidth: 160 }}
              />
              <Select
                value={selectedViewName}
                size="small"
                displayEmpty
                onChange={(event) => handleSelectView(event.target.value)}
                sx={{ minWidth: 220 }}
              >
                <MenuItem value="" disabled>
                  Kayıtlı Görünümler
                </MenuItem>
                {savedViews.map((view) => (
                  <MenuItem key={view.name} value={view.name}>
                    {view.name}
                  </MenuItem>
                ))}
              </Select>
              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  color="inherit"
                  size="small"
                  onClick={handleSaveCurrentView}
                >
                  Kaydet
                </Button>
                <Button
                  variant="text"
                  color="inherit"
                  size="small"
                  disabled={!selectedViewName}
                  onClick={() => handleDeleteView(selectedViewName)}
                >
                  Sil
                </Button>
                <Button
                  variant="text"
                  color="inherit"
                  size="small"
                  onClick={() => {
                    setSavedViews([]);
                    setSelectedViewName("");
                    localStorage.removeItem(GRID_VIEWS_KEY);
                  }}
                >
                  Sıfırla
                </Button>
              </Stack>
            </Stack>
          </Box>
          <Box sx={{ height: 520, width: "100%" }}>
            <DataGrid
              key={renderVersion}
              rows={rows ?? []}
              columns={columns}
              getRowId={(row) => row.id ?? `${row.budget_item_id}-${row.expense_date}-${row.amount}`}
              paginationModel={paginationModel}
              onPaginationModelChange={setPaginationModel}
              filterModel={combinedFilterModel}
              onFilterModelChange={handleFilterModelChange}
              sortingMode="client"
              sortModel={sortModel}
              onSortModelChange={setSortModel}
              checkboxSelection
              disableRowSelectionOnClick
              initialState={{
                pagination: {
                  paginationModel: { pageSize: 10 }
                },
                columns: {
                  columnVisibilityModel,
                },
              }}
              slots={{ toolbar: GridToolbar }}
              slotProps={{
                toolbar: {
                  showQuickFilter: true,
                  quickFilterProps: { debounceMs: 500 },
                },
              }}
              onRowSelectionModelChange={(newSelection) =>
                setSelectionModel(newSelection as number[])
              }
              processRowUpdate={(updatedRow, originalRow) =>
                handleRowUpdate(updatedRow, originalRow)
              }
              getRowHeight={() => "auto"}
              getEstimatedRowHeight={() => 64}
              sx={{
                "& .MuiDataGrid-cell": {
                  py: 1.5,
                },
                "& .MuiDataGrid-columnHeaders": {
                  bgcolor: (theme) => `${theme.palette.background.paper}`,
                },
              }}
            />
          </Box>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{editingExpense ? "Harcamayı Güncelle" : "Yeni Harcama"}</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent>
            <Stack spacing={2.5}>
              {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
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
                        {scenario.year}
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
