import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Menu,
  MenuItem,
  Snackbar,
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
import MoreVertIcon from "@mui/icons-material/MoreVert";
import {
  DataGrid,
  useGridApiRef,
  type GridColDef,
  type GridColumnVisibilityModel,
  type GridFilterModel,
  type GridPaginationModel,
  type GridRowSelectionModel,
  type GridSortModel
} from "@mui/x-data-grid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import dayjs from "dayjs";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import usePersistentState from "../../hooks/usePersistentState";
import { useAuth } from "../../context/AuthContext";
import { formatBudgetItemLabel, stripBudgetCode } from "../../utils/budgetLabel";

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
  date?: string;
  scenario_name?: string | null;
  budget_code?: string | null;
  budget_name?: string | null;
  capex_opex?: string | null;
  asset_type?: string | null;
  department?: string | null;
  amount: number;
  quantity: number;
  unit_price: number;
  vendor: string | null;
  description: string | null;
  status: "recorded" | "cancelled";
  is_out_of_budget: boolean;
  out_of_budget?: boolean;
  created_by_id?: number | null;
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
  scenario_id: number;
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

type ExpensesErrorBoundaryProps = {
  children: ReactNode;
};

type ExpensesErrorBoundaryState = {
  hasError: boolean;
};

class ExpensesErrorBoundary extends Component<
  ExpensesErrorBoundaryProps,
  ExpensesErrorBoundaryState
> {
  state: ExpensesErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("Expenses page error", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert severity="error">
          Veri yüklenemedi. Lütfen sayfayı yenileyip tekrar deneyin.
        </Alert>
      );
    }

    return this.props.children;
  }
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
  const tableRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useGridApiRef();

  const currentYear = new Date().getFullYear();
  const [year, setYear] = usePersistentState<number | "">("expenses:year", currentYear);
  const [scenarioId, setScenarioId] = usePersistentState<number | null>("expenses:scenarioId", null);
  const [budgetItemId, setBudgetItemId] = usePersistentState<number | null>("expenses:budgetItemId", null);
  const [startDate, setStartDate] = usePersistentState<string>("expenses:startDate", "");
  const [endDate, setEndDate] = usePersistentState<string>("expenses:endDate", "");
  const [capexOpex, setCapexOpex] = usePersistentState<"" | "capex" | "opex">(
    "expenses:capexOpex",
    ""
  );
  const [statusFilter, setStatusFilter] = usePersistentState<
    "ACTIVE" | "CANCELLED" | "OUT_OF_BUDGET" | "ALL" | "MINE" | "TODAY"
  >("expenses:statusFilter", "ACTIVE");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [listLoadFailed, setListLoadFailed] = useState(false);
  const [listErrorToastOpen, setListErrorToastOpen] = useState(false);
  const [formQuantity, setFormQuantity] = useState<string>("1");
  const [formUnitPrice, setFormUnitPrice] = useState<string>("0");
  const [formBudgetItemId, setFormBudgetItemId] = useState<number | null>(null);
  const [filterModel, setFilterModel] = useState<GridFilterModel>({ items: [] });
  const [sortModel, setSortModel] = useState<GridSortModel>([]);
  const [columnVisibilityModel, setColumnVisibilityModel] =
    useState<GridColumnVisibilityModel>({});
  const [searchText, setSearchText] = useState<string>("");
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 10
  });
  const [, setSelectionModel] = useState<GridRowSelectionModel>([]);
  const [selectedExpenseFilter, setSelectedExpenseFilter] = useState<
    "ALL" | "ACTIVE" | "OUT_OF_BUDGET" | "CANCELLED"
  >("ALL");

  const resolveApiErrorMessage = useCallback(
    (error: unknown, fallback: string) => {
      if (axios.isAxiosError(error)) {
        const detail =
          (error.response?.data as { detail?: string; message?: string } | undefined)?.detail ||
          (error.response?.data as { detail?: string; message?: string } | undefined)?.message;
        if (detail) {
          return detail;
        }
      }
      return fallback;
    },
    []
  );

  const handleRowUpdate = useCallback(
    (updatedRow: Expense, originalRow: Expense) => ({ ...originalRow, ...updatedRow }),
    []
  );

  const { data: scenarios } = useQuery<Scenario[]>({
    queryKey: ["scenarios"],
    queryFn: async () => {
      try {
        const { data } = await client.get<Scenario[]>("/scenarios");
        return data;
      } catch (error) {
        setErrorMessage(resolveApiErrorMessage(error, "Senaryo verileri yüklenemedi."));
        throw error;
      }
    }
  });

  const { data: budgetItems } = useQuery<BudgetItem[]>({
    queryKey: ["budget-items"],
    queryFn: async () => {
      try {
        const { data } = await client.get<BudgetItem[]>("/budget-items");
        return data;
      } catch (error) {
        setErrorMessage(resolveApiErrorMessage(error, "Bütçe kalemleri yüklenemedi."));
        throw error;
      }
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

  const { data: expenses, isFetching, refetch: refetchExpenses } = useQuery<Expense[]>({
    queryKey: [
      "expenses",
      year,
      scenarioId,
      budgetItemId,
      startDate,
      endDate,
      capexOpex,
      statusFilter
    ],
    queryFn: async () => {
      try {
        let includeOutOfBudget = false;
        let showCancelled = false;
        let mineOnly = false;
        let todayOnly = false;
        let statusParam: string | undefined;

        switch (statusFilter) {
          case "ACTIVE":
            statusParam = "recorded";
            break;
          case "CANCELLED":
            statusParam = "cancelled";
            showCancelled = true;
            includeOutOfBudget = true;
            break;
          case "OUT_OF_BUDGET":
            statusParam = "recorded";
            includeOutOfBudget = true;
            break;
          case "MINE":
            mineOnly = true;
            includeOutOfBudget = true;
            showCancelled = true;
            break;
          case "TODAY":
            todayOnly = true;
            includeOutOfBudget = true;
            showCancelled = true;
            break;
          case "ALL":
          default:
            includeOutOfBudget = true;
            showCancelled = true;
            break;
        }
        const params: Record<string, string | number | boolean> = {};
        if (year) params.year = Number(year);
        if (scenarioId) params.scenario_id = scenarioId;
        if (budgetItemId) params.budget_item_id = budgetItemId;
        if (!todayOnly && startDate) params.start_date = startDate;
        if (!todayOnly && endDate) params.end_date = endDate;
        if (capexOpex) params.capex_opex = capexOpex;
        params.include_out_of_budget = includeOutOfBudget;
        params.show_cancelled = showCancelled;
        params.show_out_of_budget = includeOutOfBudget;
        params.mine_only = mineOnly;
        params.today_only = todayOnly;
        if (statusParam) {
          params.status_filter = statusParam;
        }
        const { data } = await client.get<Expense[]>("/expenses", { params });
        return data.map((item) => ({
          ...item,
          expense_date: item.expense_date ?? item.date ?? "",
          is_out_of_budget: item.is_out_of_budget ?? item.out_of_budget ?? false,
          status: item.status ?? (item.is_cancelled ? "cancelled" : "recorded")
        }));
      } catch (error) {
        setErrorMessage(
          resolveApiErrorMessage(error, "Harcama verileri yüklenemedi. Lütfen tekrar deneyin.")
        );
        setListLoadFailed(true);
        setListErrorToastOpen(true);
        throw error;
      }
    },
    onSuccess: () => {
      setErrorMessage(null);
      setListLoadFailed(false);
      setListErrorToastOpen(false);
    },
    onError: () => {
      // handled in queryFn
    }
  });

  const mutation = useMutation({
    mutationFn: async (payload: ExpensePayload) => {
      try {
        if (payload.id) {
          const { id, ...body } = payload;
          const { data } = await client.put<Expense>(`/expenses/${id}`, body);
          return data;
        }
        const { data } = await client.post<Expense>("/expenses", payload);
        return data;
      } catch (error) {
        setErrorMessage(
          resolveApiErrorMessage(error, "Harcama kaydı kaydedilirken bir hata oluştu")
        );
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      refetchExpenses();
      setDialogOpen(false);
      setErrorMessage(null);
    },
    onError: (error: unknown) => {
      console.error(error);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (expenseId: number) => {
      try {
        await client.delete(`/expenses/${expenseId}`);
      } catch (error) {
        setErrorMessage(
          resolveApiErrorMessage(error, "Harcama kaydı silinirken bir hata oluştu")
        );
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setErrorMessage(null);
    },
    onError: (error: unknown) => {
      console.error(error);
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

    if (!payload.scenario_id) {
      setErrorMessage("Senaryo seçmelisiniz.");
      return;
    }

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

  const safeExpenses = useMemo(
    () => (Array.isArray(expenses) ? expenses : []),
    [expenses]
  );

  const showListLoadError = listLoadFailed && !isFetching && safeExpenses.length === 0;

  const outOfBudgetTotal = useMemo(() => {
    return safeExpenses.reduce(
      (sum, expense) => (expense.is_out_of_budget ? sum + expense.amount : sum),
      0
    );
  }, [safeExpenses]);

  const cancelledTotal = useMemo(() => {
    return safeExpenses.reduce(
      (sum, expense) => (expense.status === "cancelled" ? sum + expense.amount : sum),
      0
    );
  }, [safeExpenses]);

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

  const rows = useMemo(() => {
    return safeExpenses.map((expense) => ({
      ...expense,
      budget_item_id: expense?.budget_item_id ?? null
    }));
  }, [safeExpenses]);

  const baseColumns = useMemo<GridColDef[]>(() => {
    return [
      {
        field: "expense_date",
        headerName: "Tarih",
        width: 140,
        valueFormatter: ({ value }) => dayjs(value as string).format("DD MMMM YYYY")
      },
      {
        field: "budget_name",
        headerName: "Bütçe Kalemi",
        width: 240,
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
        width: 180,
        valueGetter: (params) => {
          return params?.row?.capex_opex ?? "-";
        }
      },
      {
        field: "asset_type",
        headerName: "Map Nitelik",
        width: 180,
        valueGetter: (params) => {
          return params?.row?.asset_type ?? "-";
        }
      },
      {
        field: "department",
        headerName: "Departman",
        width: 160,
        valueGetter: (params) => params?.row?.department ?? "-"
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
        type: "boolean",
        valueGetter: (params) => Boolean(params?.row?.is_out_of_budget),
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
  }, [handleDelete, handleEdit, scenarios, renderTextWithTooltip]);

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

  const handleResetFilters = () => {
    setYear(currentYear);
    setScenarioId(null);
    setBudgetItemId(null);
    setStartDate("");
    setEndDate("");
    setCapexOpex("");
    setStatusFilter("ACTIVE");
    setSelectedExpenseFilter("ALL");
    setSearchText("");
    setFilterModel({ items: [], quickFilterValues: [] });
    setSortModel([]);
    setTimeout(() => {
      refetchExpenses();
    }, 0);
  };

  const statusOptions = [
    { value: "ACTIVE", label: "Aktif" },
    { value: "CANCELLED", label: "İptal" },
    { value: "OUT_OF_BUDGET", label: "Bütçe Dışı" },
    { value: "MINE", label: "Sadece Benim" },
    { value: "TODAY", label: "Bugün" },
    { value: "ALL", label: "Tümü" }
  ] as const;

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSearchText(value);
    setFilterModel((prev) => ({
      ...prev,
      quickFilterValues: value ? [value] : []
    }));
  };

  const menuOpen = Boolean(menuAnchorEl);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
  };

  const handleExportCsv = () => {
    apiRef.current.exportDataAsCsv?.();
    handleMenuClose();
  };

  const handleExportXlsx = () => {
    (apiRef.current as { exportDataAsExcel?: () => void }).exportDataAsExcel?.();
    handleMenuClose();
  };

  const handleShowColumns = () => {
    (apiRef.current as { showPreferences?: (panel?: string) => void }).showPreferences?.("columns");
    handleMenuClose();
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
    <ExpensesErrorBoundary>
      <Stack
        spacing={3}
        sx={{
          width: "100%",
          minWidth: 0,
          maxWidth: "100%"
        }}
      >
        {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
        <Snackbar
          open={listErrorToastOpen}
          autoHideDuration={6000}
          onClose={() => setListErrorToastOpen(false)}
          anchorOrigin={{ vertical: "top", horizontal: "center" }}
        >
          <Alert
            severity="error"
            onClose={() => setListErrorToastOpen(false)}
            sx={{ width: "100%" }}
          >
            Liste yüklenemedi.
          </Alert>
        </Snackbar>
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
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setSelectedExpenseFilter((prev) => {
                        return prev === card.key ? "ALL" : card.key;
                      });
                    }}
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

      <Card ref={tableRef}>
        <CardContent
          sx={{
            flexGrow: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            overflow: "visible"
          }}
        >
          <Box sx={{ mb: 3 }}>
            <Box
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 2,
                px: 2,
                py: 2
              }}
            >
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={1.5}
                alignItems={{ xs: "stretch", md: "center" }}
              >
                <Box
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 1.5,
                    flex: 1,
                    minWidth: 0,
                    "& .MuiInputBase-root": { height: 40 },
                    "& .MuiOutlinedInput-input": { padding: "10px 12px" },
                    "& .MuiButton-root": { height: 40 }
                  }}
                >
                  <TextField
                    select
                    label="Durum"
                    size="small"
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(
                        event.target.value as
                          | "ACTIVE"
                          | "CANCELLED"
                          | "OUT_OF_BUDGET"
                          | "MINE"
                          | "TODAY"
                          | "ALL"
                      )
                    }
                    sx={{ minWidth: 200 }}
                  >
                    {statusOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Başlangıç Tarihi"
                    type="date"
                    size="small"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ minWidth: 170 }}
                  />
                  <TextField
                    label="Bitiş Tarihi"
                    type="date"
                    size="small"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ minWidth: 170 }}
                  />
                  <Autocomplete
                    size="small"
                    options={budgetItems ?? []}
                    value={budgetItems?.find((item) => item.id === budgetItemId) ?? null}
                    onChange={(_, value) => setBudgetItemId(value?.id ?? null)}
                    getOptionLabel={(option) => formatBudgetItemLabel(option) || "-"}
                    filterOptions={budgetFilterOptions}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    sx={{ minWidth: 320, flex: 1 }}
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
                    sx={{ minWidth: 170 }}
                  >
                    <MenuItem value="">Tümü</MenuItem>
                    <MenuItem value="capex">Capex</MenuItem>
                    <MenuItem value="opex">Opex</MenuItem>
                  </TextField>
                  <TextField
                    label="Yıl"
                    type="number"
                    size="small"
                    value={year}
                    onChange={(event) => setYear(event.target.value ? Number(event.target.value) : "")}
                    sx={{ minWidth: 110 }}
                  />
                  <TextField
                    select
                    label="Senaryo"
                    size="small"
                    value={scenarioId ?? ""}
                    onChange={(event) =>
                      setScenarioId(event.target.value ? Number(event.target.value) : null)
                    }
                    sx={{ minWidth: 220 }}
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
                    label="Ara"
                    value={searchText}
                    onChange={handleSearchChange}
                    sx={{ minWidth: 200 }}
                  />
                </Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => refetchExpenses()}
                    sx={{ height: 40 }}
                  >
                    Yenile
                  </Button>
                  <IconButton
                    size="small"
                    onClick={handleMenuOpen}
                    aria-label="Daha Fazla"
                    sx={{ height: 40, width: 40 }}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                  <Button
                    variant="text"
                    color="inherit"
                    size="small"
                    onClick={handleResetFilters}
                    sx={{ height: 40 }}
                  >
                    Sıfırla
                  </Button>
                </Stack>
              </Stack>
            </Box>
          </Box>

          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Harcamalar
          </Typography>
          <Menu
            anchorEl={menuAnchorEl}
            open={menuOpen}
            onClose={handleMenuClose}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
          >
            <MenuItem onClick={handleExportCsv}>Dışa Aktar (CSV)</MenuItem>
            <MenuItem onClick={handleExportXlsx}>Dışa Aktar (XLSX)</MenuItem>
            <MenuItem onClick={handleShowColumns}>Kolon Seçimi</MenuItem>
          </Menu>
          <Box sx={{ height: 520, width: "100%" }}>
            {showListLoadError ? (
              <Alert severity="error">Liste yüklenemedi.</Alert>
            ) : (
              <DataGrid
                apiRef={apiRef}
                rows={rows ?? []}
                columns={columns}
                getRowId={(row) => row.id ?? `${row.budget_item_id}-${row.expense_date}-${row.amount}`}
                slots={{ toolbar: null }}
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
            )}
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
                    required
                  >
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
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Switch
                      name="is_cancelled"
                      defaultChecked={editingExpense?.status === "cancelled"}
                    />
                    <Typography variant="body2">İptal Edildi</Typography>
                  </Stack>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Switch
                      name="is_out_of_budget"
                      defaultChecked={editingExpense?.is_out_of_budget ?? false}
                    />
                    <Typography variant="body2">Bütçe Dışı</Typography>
                  </Stack>
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
    </ExpensesErrorBoundary>
  );
}
