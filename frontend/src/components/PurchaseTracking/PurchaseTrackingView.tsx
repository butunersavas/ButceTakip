import { useMemo, useState } from "react";
import { Alert, Button, Card, CardContent, Grid, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import { formatMoney } from "../../utils/formatMoney";

interface RowItem {
  id: number | null;
  plan_item_id: number;
  year: number;
  month: number;
  department?: string | null;
  scenario_id: number;
  budget_item_id: number;
  budget_code?: string | null;
  budget_name?: string | null;
  amount: number;
  purchase_requested: boolean;
  purchase_requested_at?: string | null;
  status: string;
  note?: string | null;
}

const STATUS_OPTIONS = [
  { value: "SURAT_YONETIM_IMZA", label: "Sürat Kargo Yönetim İmza" },
  { value: "SURAT_SATINALMA", label: "Sürat Kargo Satın Alma" },
  { value: "BCC_YONETIM_IMZA", label: "BCC Yönetim İmza" },
  { value: "ORDER_PENDING", label: "Sipariş Bekleniyor" },
  { value: "COMPLETED", label: "Tamamlandı" }
];

const monthOptions = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

export default function PurchaseTrackingView() {
  const client = useAuthorizedClient();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();

  const [year, setYear] = useState<number>(Number(searchParams.get("year")) || currentYear);
  const [month, setMonth] = useState<number | "">(Number(searchParams.get("month")) || "");
  const [department, setDepartment] = useState<string>(searchParams.get("department") || "");
  const [scenarioId, setScenarioId] = useState<number | "">(searchParams.get("scenario_id") ? Number(searchParams.get("scenario_id")) : "");
  const [budgetItemId, setBudgetItemId] = useState<number | "">(searchParams.get("budget_item") ? Number(searchParams.get("budget_item")) : "");
  const [capexOpex, setCapexOpex] = useState<string>(searchParams.get("capex_opex") || "");
  const [appliedFilters, setAppliedFilters] = useState({ year, month, department, scenarioId, budgetItemId, capexOpex });
  const [editStatusByRow, setEditStatusByRow] = useState<Record<number, string>>({});
  const focusId = Number(searchParams.get("focusId")) || null;

  const { data: rows = [], isLoading } = useQuery<RowItem[]>({
    queryKey: ["purchase-tracking", appliedFilters],
    queryFn: async () => {
      const params: Record<string, number | string> = { year: appliedFilters.year };
      if (appliedFilters.month) params.month = Number(appliedFilters.month);
      if (appliedFilters.department) params.department = appliedFilters.department;
      if (appliedFilters.scenarioId) params.scenario_id = Number(appliedFilters.scenarioId);
      if (appliedFilters.budgetItemId) params.budget_item = Number(appliedFilters.budgetItemId);
      if (appliedFilters.capexOpex) params.capex_opex = appliedFilters.capexOpex;
      const { data } = await client.get<RowItem[]>("/purchase-tracking", { params });
      return data ?? [];
    }
  });

  const departments = useMemo(() => Array.from(new Set(rows.map((item) => item.department).filter(Boolean))).sort(), [rows]);

  const mutation = useMutation({
    mutationFn: async ({ planItemId, status }: { planItemId: number; status: string }) => {
      await client.patch(`/purchase-tracking/${planItemId}`, { status, note: "" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["purchase-tracking"] })
  });

  const handleApply = () => {
    setAppliedFilters({ year, month, department, scenarioId, budgetItemId, capexOpex });
  };

  const handleReset = () => {
    setYear(currentYear);
    setMonth("");
    setDepartment("");
    setScenarioId("");
    setBudgetItemId("");
    setCapexOpex("");
    setAppliedFilters({
      year: currentYear,
      month: "",
      department: "",
      scenarioId: "",
      budgetItemId: "",
      capexOpex: ""
    });
  };

  const columns = useMemo<GridColDef[]>(() => [
    { field: "budget", headerName: "Plan Kalemi", flex: 1.4, minWidth: 260, valueGetter: (_v, row) => `${row.budget_code ?? ""} ${row.budget_name ?? ""}`.trim() },
    { field: "department", headerName: "Departman", flex: 0.9, minWidth: 150 },
    { field: "amount", headerName: "Tutar", flex: 0.8, minWidth: 120, valueFormatter: (value) => formatMoney(Number(value) || 0) },
    {
      field: "purchase_requested",
      headerName: "Talep Oluşturuldu",
      flex: 1.2,
      minWidth: 200,
      valueGetter: (_v, row) => row.purchase_requested ? `Evet${row.purchase_requested_at ? ` • ${new Date(row.purchase_requested_at).toLocaleDateString("tr-TR")}` : ""}` : "Hayır"
    },
    {
      field: "status",
      headerName: "Durum",
      flex: 1,
      minWidth: 220,
      renderCell: ({ row }) => (
        <TextField select size="small" value={editStatusByRow[row.plan_item_id] ?? row.status} onChange={(event) => setEditStatusByRow((prev) => ({ ...prev, [row.plan_item_id]: event.target.value }))} fullWidth>
          {STATUS_OPTIONS.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
        </TextField>
      )
    },
    {
      field: "actions",
      headerName: "Kaydet",
      flex: 0.7,
      minWidth: 130,
      sortable: false,
      renderCell: ({ row }) => (
        <Button size="small" variant="contained" onClick={() => mutation.mutate({ planItemId: row.plan_item_id, status: editStatusByRow[row.plan_item_id] ?? row.status })}>Kaydet</Button>
      )
    }
  ], [editStatusByRow, mutation]);

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
            <Typography variant="h6" fontWeight={700}>Satın Alma Talep Takibi</Typography>
            <Button variant="outlined" onClick={() => navigate("/dashboard")}>Dashboard'a Dön</Button>
          </Stack>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={2}><TextField label="Yıl" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || currentYear)} fullWidth /></Grid>
            <Grid item xs={12} sm={2}><TextField select label="Ay" value={month} onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : "")} fullWidth>{monthOptions.map((label, idx) => <MenuItem key={idx} value={idx === 0 ? "" : idx}>{label || "Tümü"}</MenuItem>)}</TextField></Grid>
            <Grid item xs={12} sm={2}><TextField select label="Departman" value={department} onChange={(e) => setDepartment(e.target.value)} fullWidth><MenuItem value="">Tümü</MenuItem>{departments.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField></Grid>
            <Grid item xs={12} sm={2}><TextField label="Senaryo ID" type="number" value={scenarioId} onChange={(e) => setScenarioId(e.target.value ? Number(e.target.value) : "")} fullWidth /></Grid>
            <Grid item xs={12} sm={2}><TextField label="Bütçe Kalemi ID" type="number" value={budgetItemId} onChange={(e) => setBudgetItemId(e.target.value ? Number(e.target.value) : "")} fullWidth /></Grid>
            <Grid item xs={12} sm={2}><TextField select label="Capex/Opex" value={capexOpex} onChange={(e) => setCapexOpex(e.target.value)} fullWidth><MenuItem value="">Tümü</MenuItem><MenuItem value="capex">Capex</MenuItem><MenuItem value="opex">Opex</MenuItem></TextField></Grid>
            <Grid item xs={12}>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button variant="contained" onClick={handleApply}>Uygula</Button>
                <Button variant="outlined" onClick={handleReset}>Sıfırla</Button>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      {focusId && <Alert severity="info">Talep oluşturulan kayıt vurgulandı: #{focusId}</Alert>}
      <Card>
        <CardContent>
          <DataGrid
            autoHeight
            rows={rows}
            columns={columns}
            loading={isLoading || mutation.isPending}
            getRowId={(row) => row.plan_item_id}
            disableRowSelectionOnClick
            getRowClassName={(params) => (focusId && params.row.plan_item_id === focusId ? "focus-row" : "")}
            sx={{ border: "none", "& .focus-row": { backgroundColor: "rgba(25, 118, 210, 0.12)" } }}
          />
        </CardContent>
      </Card>
    </Stack>
  );
}
