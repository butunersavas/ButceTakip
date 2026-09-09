import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import UndoOutlinedIcon from "@mui/icons-material/UndoOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import useAuthorizedClient from "../hooks/useAuthorizedClient";
import { formatBudgetItemLabel } from "../utils/budgetLabel";

type PurchaseStatus = "pending" | "request_created";
type PurchaseStatusFilter = PurchaseStatus | "all";

type PurchasePendingItem = {
  id: number;
  budget_item_id: number;
  scenario_id: number;
  year: number;
  month: number;
  department?: string | null;
  budget_code?: string | null;
  budget_name?: string | null;
  title: string;
  capex_opex?: string | null;
  nitelik?: string | null;
  planned_amount: number;
  actual_amount?: number | null;
  remaining_amount?: number | null;
  requested: boolean;
  status: PurchaseStatus;
  requested_at?: string | null;
  requested_by?: string | null;
};

type PurchaseStatusResponse = {
  item_id: number;
  requested: boolean;
  status: PurchaseStatus;
  requested_at?: string | null;
  requested_by?: string | null;
};

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
  "Aralık",
];

const currencyFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 2,
});

function formatCurrency(value?: number | null) {
  return currencyFormatter.format(Number(value ?? 0));
}

function getInitialYear(rawYear: string | null) {
  const parsed = Number(rawYear);
  return Number.isFinite(parsed) && parsed > 2000 ? parsed : new Date().getFullYear();
}

function getInitialMonth(rawMonth: string | null) {
  const parsed = Number(rawMonth);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 12 ? parsed : new Date().getMonth() + 1;
}

function getFriendlyError(error: unknown) {
  const detail = (error as any)?.response?.data?.detail ?? (error as any)?.response?.data?.message;
  if (detail) {
    return String(detail);
  }
  return "Satın alma takip durumu güncellenemedi. Lütfen API bağlantısını kontrol edin.";
}

export default function PurchasePendingView() {
  const client = useAuthorizedClient();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [year] = useState(() => getInitialYear(searchParams.get("year")));
  const [selectedMonth, setSelectedMonth] = useState(() => getInitialMonth(searchParams.get("month")));
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [statusFilter, setStatusFilter] = useState<PurchaseStatusFilter>("pending");
  const [savingItemId, setSavingItemId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; severity: "success" | "error" } | null>(null);

  const isViewer = ["viewer", "readonly", "read_only"].includes(String(user?.role ?? "").toLowerCase());

  const purchaseQuery = useQuery<PurchasePendingItem[]>({
    queryKey: ["purchase-pending", year, selectedMonth],
    queryFn: async () => {
      const { data } = await client.get<PurchasePendingItem[]>("/plan-items/purchase-pending", {
        suppressGlobalError: true,
        params: { year, month: selectedMonth, status: "all" },
      });
      return data ?? [];
    },
  });

  const items = purchaseQuery.data ?? [];
  const departments = useMemo(() => {
    const unique = new Set<string>();
    items.forEach((item) => {
      const department = item.department?.trim();
      if (department) {
        unique.add(department);
      }
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b, "tr"));
  }, [items]);

  useEffect(() => {
    if (selectedDepartment && !departments.includes(selectedDepartment)) {
      setSelectedDepartment("");
    }
  }, [departments, selectedDepartment]);

  const departmentItems = useMemo(() => {
    if (!selectedDepartment) {
      return items;
    }
    return items.filter((item) => item.department === selectedDepartment);
  }, [items, selectedDepartment]);

  const pendingCount = departmentItems.filter((item) => item.status === "pending").length;
  const requestedCount = departmentItems.filter((item) => item.status === "request_created").length;

  const filteredItems = useMemo(() => {
    if (statusFilter === "all") {
      return departmentItems;
    }
    return departmentItems.filter((item) => item.status === statusFilter);
  }, [departmentItems, statusFilter]);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ item, requested }: { item: PurchasePendingItem; requested: boolean }) => {
      const { data } = await client.patch<PurchaseStatusResponse>(
        `/plan-items/${item.id}/purchase-requested`,
        { requested },
        { suppressGlobalError: true }
      );
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-pending"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "purchase-alert"] });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      setFeedback({
        message: variables.requested
          ? "Kayıt Talep Oluşturuldu durumuna alındı."
          : "Kayıt yeniden Bekleyen durumuna alındı.",
        severity: "success",
      });
    },
    onError: (error) => {
      console.error("Purchase pending status update failed", error);
      setFeedback({ message: getFriendlyError(error), severity: "error" });
    },
    onSettled: () => setSavingItemId(null),
  });

  const handleToggleStatus = (item: PurchasePendingItem) => {
    if (isViewer) {
      setFeedback({ message: "Bu kullanıcı yalnızca görüntüleme yetkisine sahiptir.", severity: "error" });
      return;
    }
    const requested = item.status !== "request_created";
    setSavingItemId(item.id);
    updateStatusMutation.mutate({ item, requested });
  };

  const columns = useMemo<GridColDef<PurchasePendingItem>[]>(
    () => [
      {
        field: "department",
        headerName: "Departman",
        minWidth: 150,
        flex: 0.9,
        valueGetter: (_value, row) => row.department || "-",
      },
      {
        field: "budget",
        headerName: "Bütçe Kalemi / Ürün",
        minWidth: 260,
        flex: 1.5,
        valueGetter: (_value, row) =>
          formatBudgetItemLabel({ code: row.budget_code ?? "", name: row.budget_name ?? row.title }) || row.title,
      },
      {
        field: "capex_opex",
        headerName: "Capex/Opex",
        minWidth: 120,
        flex: 0.6,
        valueGetter: (_value, row) => row.capex_opex || "-",
      },
      {
        field: "nitelik",
        headerName: "Nitelik",
        minWidth: 140,
        flex: 0.8,
        valueGetter: (_value, row) => row.nitelik || "-",
      },
      {
        field: "planned_month",
        headerName: "Planlanan Ay",
        minWidth: 140,
        flex: 0.7,
        valueGetter: (_value, row) => `${MONTH_NAMES_TR[row.month] ?? row.month} ${row.year}`,
      },
      {
        field: "planned_amount",
        headerName: "Planlanan Tutar",
        minWidth: 150,
        flex: 0.8,
        align: "right",
        headerAlign: "right",
        renderCell: ({ row }) => formatCurrency(row.planned_amount),
      },
      {
        field: "actual_amount",
        headerName: "Gerçekleşen Tutar",
        minWidth: 160,
        flex: 0.8,
        align: "right",
        headerAlign: "right",
        renderCell: ({ row }) => formatCurrency(row.actual_amount),
      },
      {
        field: "remaining_amount",
        headerName: "Kalan / Bekleyen Tutar",
        minWidth: 180,
        flex: 0.9,
        align: "right",
        headerAlign: "right",
        renderCell: ({ row }) => formatCurrency(row.remaining_amount),
      },
      {
        field: "status",
        headerName: "Durum",
        minWidth: 165,
        flex: 0.8,
        renderCell: ({ row }) => {
          const requested = row.status === "request_created";
          return (
            <Chip
              size="small"
              color={requested ? "success" : "warning"}
              icon={requested ? <TaskAltIcon /> : <PendingActionsOutlinedIcon />}
              label={requested ? "Talep Oluşturuldu" : "Bekleyen"}
            />
          );
        },
      },
      {
        field: "actions",
        headerName: "İşlem",
        minWidth: 190,
        sortable: false,
        filterable: false,
        align: "right",
        headerAlign: "right",
        renderCell: ({ row }) => {
          if (isViewer) {
            return <Chip size="small" label="Sadece görüntüleme" variant="outlined" />;
          }
          const requested = row.status === "request_created";
          return (
            <Button
              size="small"
              variant={requested ? "outlined" : "contained"}
              color={requested ? "warning" : "primary"}
              startIcon={requested ? <UndoOutlinedIcon /> : <TaskAltIcon />}
              disabled={savingItemId === row.id || updateStatusMutation.isPending}
              onClick={() => handleToggleStatus(row)}
              sx={{ whiteSpace: "nowrap" }}
            >
              {requested ? "Geri Al" : "Talep Oluşturuldu"}
            </Button>
          );
        },
      },
    ],
    [isViewer, savingItemId, updateStatusMutation.isPending]
  );

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between" alignItems={{ md: "center" }}>
        <Box>
          <Typography variant="h4" fontWeight={800}>
            Satın Alma Bekleyen
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {MONTH_NAMES_TR[selectedMonth]} ayı kayıtları
          </Typography>
        </Box>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ width: { xs: "100%", md: "auto" } }}>
          <TextField
            select
            label="Ay"
            size="small"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(Number(event.target.value))}
            sx={{ width: { xs: "100%", sm: 180 } }}
          >
            {MONTH_NAMES_TR.slice(1).map((monthName, index) => (
              <MenuItem key={monthName} value={index + 1}>
                {monthName}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Departman"
            size="small"
            value={selectedDepartment}
            onChange={(event) => setSelectedDepartment(event.target.value)}
            sx={{ width: { xs: "100%", sm: 220 } }}
          >
            <MenuItem value="">Tümü</MenuItem>
            {departments.map((department) => (
              <MenuItem key={department} value={department}>
                {department}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Stack>

      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <Card
          variant="outlined"
          sx={{
            flex: 1,
            borderRadius: 2,
            borderColor: statusFilter === "pending" ? "primary.main" : "divider",
            bgcolor: statusFilter === "pending" ? "action.selected" : "background.paper",
          }}
        >
          <CardActionArea onClick={() => setStatusFilter("pending")}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Bekleyen
              </Typography>
              <Typography variant="h5" fontWeight={800}>
                {pendingCount}
              </Typography>
            </CardContent>
          </CardActionArea>
        </Card>
        <Card
          variant="outlined"
          sx={{
            flex: 1,
            borderRadius: 2,
            borderColor: statusFilter === "request_created" ? "primary.main" : "divider",
            bgcolor: statusFilter === "request_created" ? "action.selected" : "background.paper",
          }}
        >
          <CardActionArea onClick={() => setStatusFilter("request_created")}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Talep Oluşturuldu
              </Typography>
              <Typography variant="h5" fontWeight={800}>
                {requestedCount}
              </Typography>
            </CardContent>
          </CardActionArea>
        </Card>
        <Card
          variant="outlined"
          sx={{
            flex: 1,
            borderRadius: 2,
            borderColor: statusFilter === "all" ? "primary.main" : "divider",
            bgcolor: statusFilter === "all" ? "action.selected" : "background.paper",
          }}
        >
          <CardActionArea onClick={() => setStatusFilter("all")}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Tümü
              </Typography>
              <Typography variant="h5" fontWeight={800}>
                {departmentItems.length}
              </Typography>
            </CardContent>
          </CardActionArea>
        </Card>
      </Stack>

      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              {statusFilter === "pending"
                ? "Bekleyen kayıtlar"
                : statusFilter === "request_created"
                  ? "Talep Oluşturuldu kayıtları"
                  : "Tüm kayıtlar"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {filteredItems.length} kayıt
            </Typography>
          </Stack>
          <Box sx={{ width: "100%", overflowX: "auto" }}>
            <DataGrid
              autoHeight
              rows={filteredItems}
              columns={columns}
              loading={purchaseQuery.isFetching}
              getRowId={(row) => row.id}
              disableRowSelectionOnClick
              initialState={{ pagination: { paginationModel: { pageSize: 20, page: 0 } } }}
              pageSizeOptions={[12, 20, 30, 50, 100]}
              sx={{
                minWidth: 1480,
                border: "none",
                "& .MuiDataGrid-columnHeaders": {
                  bgcolor: "action.hover",
                },
              }}
            />
          </Box>
        </CardContent>
      </Card>

      <Snackbar
        open={Boolean(feedback)}
        autoHideDuration={4000}
        onClose={() => setFeedback(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        {feedback && (
          <Alert severity={feedback.severity} onClose={() => setFeedback(null)} sx={{ width: "100%" }}>
            {feedback.message}
          </Alert>
        )}
      </Snackbar>
    </Stack>
  );
}
