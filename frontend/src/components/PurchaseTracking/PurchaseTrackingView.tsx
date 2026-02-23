import { useMemo, useState } from "react";
import { Alert, Button, Card, CardContent, Grid, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";

interface RowItem {
  id: number | null;
  plan_item_id: number;
  year: number;
  month: number;
  department?: string | null;
  scenario_id: number;
  budget_code?: string | null;
  budget_name?: string | null;
  amount: number;
  purchase_requested: boolean;
  status: string;
  note?: string | null;
}

const STATUS_OPTIONS = [
  { value: "SURAT_YONETIM_IMZA", label: "Sürat Kargo Yönetim İmza" },
  { value: "BCC_YONETIM_IMZA", label: "BCC Yönetim İmza" },
  { value: "SURAT_SATINALMA", label: "Sürat Kargo Satın Alma Departmanında" },
];

export default function PurchaseTrackingView() {
  const client = useAuthorizedClient();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();

  const [year, setYear] = useState<number>(Number(searchParams.get("year")) || currentYear);
  const [month, setMonth] = useState<number | "">(Number(searchParams.get("month")) || "");
  const [department, setDepartment] = useState<string>(searchParams.get("department") || "");
  const [scenarioId, setScenarioId] = useState<number | "">("");
  const [editStatusByRow, setEditStatusByRow] = useState<Record<number, string>>({});
  const focusId = Number(searchParams.get("focusId")) || null;

  const { data: rows = [], isLoading } = useQuery<RowItem[]>({
    queryKey: ["purchase-tracking", year, month, department, scenarioId],
    queryFn: async () => {
      const params: Record<string, number | string> = { year };
      if (month) params.month = Number(month);
      if (department) params.department = department;
      if (scenarioId) params.scenario_id = Number(scenarioId);
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

  const columns = useMemo<GridColDef[]>(() => [
    { field: "budget", headerName: "Plan Kalemi", flex: 1.4, minWidth: 260, valueGetter: (_v, row) => `${row.budget_code ?? ""} ${row.budget_name ?? ""}`.trim() },
    { field: "department", headerName: "Departman", flex: 0.9, minWidth: 150 },
    { field: "amount", headerName: "Tutar", flex: 0.8, minWidth: 120, valueFormatter: (value) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "USD" }).format(Number(value) || 0) },
    { field: "purchase_requested", headerName: "Talep", flex: 0.7, minWidth: 120, valueGetter: (_v, row) => row.purchase_requested ? "✓" : "-" },
    {
      field: "status",
      headerName: "Mevcut Status",
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
            <Grid item xs={12} sm={3}><TextField label="Yıl" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || currentYear)} fullWidth /></Grid>
            <Grid item xs={12} sm={3}><TextField label="Ay" type="number" value={month} onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : "")} fullWidth /></Grid>
            <Grid item xs={12} sm={3}><TextField select label="Departman" value={department} onChange={(e) => setDepartment(e.target.value)} fullWidth><MenuItem value="">Tümü</MenuItem>{departments.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField></Grid>
            <Grid item xs={12} sm={3}><TextField label="Senaryo ID" type="number" value={scenarioId} onChange={(e) => setScenarioId(e.target.value ? Number(e.target.value) : "")} fullWidth /></Grid>
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
