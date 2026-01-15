import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import axios from "axios";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";

type WarrantyItemType = "DEVICE" | "SERVICE";

type WarrantyItem = {
  id: number | string;
  type: WarrantyItemType | "";
  name: string;
  location: string;
  end_date: string | null;
  start_date?: string | null;
  note?: string | null;
  is_active: boolean;
  created_by_name?: string | null;
  updated_by_name?: string | null;
  created_by_username?: string | null;
  updated_by_username?: string | null;
  days_left?: number | null;
  status_label?: string;
  status_key?: "expired" | "critical" | "approaching" | "ok" | "unknown";
  type_label?: string;
};

type WarrantyItemForm = {
  type: WarrantyItemType;
  name: string;
  location: string;
  end_date: string;
  note: string;
};

const typeOptions: Array<{ value: WarrantyItemType; label: string }> = [
  { value: "DEVICE", label: "Cihaz" },
  { value: "SERVICE", label: "Bakım/Hizmet" },
];

const calcDaysLeft = (endDate: string | null): number | null => {
  if (!endDate) return null;
  const end = new Date(`${endDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ms = end.getTime() - today.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
};

const calcStatus = (daysLeft: number | null) => {
  if (daysLeft === null) return { label: "-", key: "unknown" as const };
  if (daysLeft < 0) return { label: "Süresi Geçti", key: "expired" as const };
  if (daysLeft <= 30) return { label: "Kritik", key: "critical" as const };
  if (daysLeft <= 60) return { label: "Yaklaşıyor", key: "approaching" as const };
  return { label: "Aktif", key: "ok" as const };
};

const mapStatusKey = (status?: string | null) => {
  const normalized = status?.toLowerCase?.() ?? "";
  if (normalized.includes("süresi geçti")) return "expired" as const;
  if (normalized.includes("kritik")) return "critical" as const;
  if (normalized.includes("yaklaşıyor")) return "approaching" as const;
  if (normalized.includes("aktif")) return "ok" as const;
  return "unknown" as const;
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value + "T00:00:00");
  return new Intl.DateTimeFormat("tr-TR").format(date);
};

const formatTypeLabel = (value?: string | null) => {
  if (value === "DEVICE") return "Cihaz";
  if (value === "SERVICE") return "Bakım/Hizmet";
  return value ?? "-";
};

const normalizeDateInput = (value: string | null | undefined) => {
  if (!value) return "";
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  const trMatch = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (trMatch) {
    return `${trMatch[3]}-${trMatch[2]}-${trMatch[1]}`;
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return value;
};

const normalizeWarrantyRow = (row: any): WarrantyItem => {
  const start = row?.start_date ?? row?.startDate ?? null;
  const end = normalizeDateInput(row?.end_date ?? row?.endDate ?? null) || null;
  const serialKey = row?.serial_no ?? row?.serial ?? row?.asset_tag;
  const randomId =
    (typeof globalThis !== "undefined" ? globalThis.crypto?.randomUUID?.() : undefined) ?? `${Math.random()}`;
  const id =
    row?.id ??
    row?.warranty_id ??
    row?.uuid ??
    row?._id ??
    (serialKey ? `${serialKey}-${start ?? "nostart"}` : randomId);
  const days_left =
    typeof row?.days_left === "number" ? row.days_left : calcDaysLeft(end ?? null);
  const statusLabel = row?.status ?? row?.status_label ?? null;
  const status =
    typeof statusLabel === "string" && statusLabel.trim().length
      ? { label: statusLabel, key: mapStatusKey(statusLabel) }
      : calcStatus(days_left);
  return {
    ...row,
    id,
    type: row?.type ?? row?.device_type ?? row?.asset_type ?? "",
    start_date: start,
    end_date: end,
    days_left,
    status_label: status.label,
    status_key: status.key,
    type_label: formatTypeLabel(row?.type),
  };
};

export default function WarrantyTrackingView() {
  const client = useAuthorizedClient();
  const [items, setItems] = useState<WarrantyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<WarrantyItem | null>(null);
  const [selectedWarrantyFilter, setSelectedWarrantyFilter] = useState<
    "CRITICAL" | "NEAR" | "EXPIRED" | null
  >(null);
  const [form, setForm] = useState<WarrantyItemForm>({
    type: "DEVICE",
    name: "",
    location: "",
    end_date: "",
    note: "",
  });

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await client.get("/warranty-items");
      const raw = Array.isArray(data) ? data : (data as { items?: WarrantyItem[] } | null)?.items ?? [];
      const normalized = raw.filter(Boolean).map(normalizeWarrantyRow);
      setItems(normalized);
    } catch (err) {
      console.error(err);
      if (axios.isAxiosError(err)) {
        const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
        setError(detail || "Garanti kayıtları alınamadı.");
      } else {
        setError("Garanti kayıtları alınamadı.");
      }
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const summary = useMemo(() => {
    const totals = {
      total: items.length,
      critical: 0,
      upcoming: 0,
      expired: 0,
    };
    items.forEach((item) => {
      const daysLeft = item.days_left ?? calcDaysLeft(item.end_date);
      if (daysLeft === null) {
        return;
      }
      if (daysLeft < 0) {
        totals.expired += 1;
      } else if (daysLeft <= 30) {
        totals.critical += 1;
      } else if (daysLeft <= 60) {
        totals.upcoming += 1;
      }
    });
    return totals;
  }, [items]);

  const filteredItems = useMemo(() => {
    if (!selectedWarrantyFilter) return items;
    if (selectedWarrantyFilter === "CRITICAL") {
      return items.filter((item) => item.status_key === "critical");
    }
    if (selectedWarrantyFilter === "NEAR") {
      return items.filter((item) => item.status_key === "approaching");
    }
    return items.filter((item) => item.status_key === "expired");
  }, [items, selectedWarrantyFilter]);

  const activeFilterLabel = useMemo(() => {
    if (!selectedWarrantyFilter) return null;
    if (selectedWarrantyFilter === "CRITICAL") return "Kritik (1-30)";
    if (selectedWarrantyFilter === "NEAR") return "Yaklaşıyor (31-60)";
    return "Süresi Geçti";
  }, [selectedWarrantyFilter]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim() || !form.location.trim() || !form.end_date) {
      setError("Tip, ad, lokasyon ve bitiş tarihi zorunludur.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const normalizedEndDate = normalizeDateInput(form.end_date);
      const payload = {
        type: form.type,
        name: form.name.trim(),
        location: form.location.trim(),
        end_date: normalizedEndDate,
        note: form.note.trim() || null,
      };

      if (editingItem) {
        await client.put(`/warranty-items/${editingItem.id}`, payload);
        setSuccess("Garanti kaydı güncellendi.");
      } else {
        await client.post("/warranty-items", payload);
        setSuccess("Garanti kaydı eklendi.");
      }

      setForm({ type: "DEVICE", name: "", location: "", end_date: "", note: "" });
      setEditingItem(null);
      await loadItems();
    } catch (err) {
      console.error(err);
      if (axios.isAxiosError(err)) {
        const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
        setError(detail || "Garanti kaydı kaydedilemedi.");
      } else {
        setError("Garanti kaydı kaydedilemedi.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = useCallback((item: WarrantyItem) => {
    setEditingItem(item);
    setForm({
      type: item.type || "DEVICE",
      name: item.name,
      location: item.location,
      end_date: normalizeDateInput(item.end_date) ?? "",
      note: item.note ?? "",
    });
  }, []);

  const handleDelete = useCallback(async (item: WarrantyItem) => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await client.delete(`/warranty-items/${item.id}`);
      await loadItems();
      setSuccess("Garanti kaydı silindi.");
      if (editingItem?.id === item.id) {
        setEditingItem(null);
        setForm({ type: "DEVICE", name: "", location: "", end_date: "", note: "" });
      }
    } catch (err) {
      console.error(err);
      if (axios.isAxiosError(err)) {
        const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
        setError(detail || "Garanti kaydı silinemedi.");
      } else {
        setError("Garanti kaydı silinemedi.");
      }
    } finally {
      setSubmitting(false);
    }
  }, [client, editingItem?.id, loadItems]);

  const columns = useMemo<GridColDef[]>(
    () => [
      {
        field: "type",
        headerName: "Tip",
        flex: 0.7,
        valueGetter: (params) => formatTypeLabel(params?.row?.type),
      },
      { field: "name", headerName: "Ad", flex: 1.2 },
      { field: "location", headerName: "Lokasyon", flex: 1 },
      {
        field: "end_date",
        headerName: "Bitiş Tarihi",
        flex: 0.9,
        valueGetter: (params) => formatDate(params?.row?.end_date ?? null),
      },
      {
        field: "days_left",
        headerName: "Kalan Gün",
        flex: 0.8,
        sortable: false,
        renderCell: (params) => {
          const daysLeft = params?.row?.days_left ?? null;
          const statusKey = params?.row?.status_key ?? "unknown";
          const chipProps =
            statusKey === "expired"
              ? {
                  sx: {
                    bgcolor: (theme: any) =>
                      theme.palette.mode === "dark" ? "grey.700" : "grey.300",
                    color: "text.primary",
                  },
                }
              : statusKey === "critical"
                ? { color: "error" as const }
                : statusKey === "approaching"
                  ? { color: "warning" as const }
                  : statusKey === "ok"
                    ? { color: "success" as const }
                    : { color: "default" as const };
          const label = daysLeft === null ? "-" : `${daysLeft} gün`;
          return <Chip size="small" {...chipProps} label={label} />;
        },
      },
      {
        field: "status",
        headerName: "Durum",
        flex: 0.8,
        sortable: false,
        valueGetter: (params) => params?.row?.status_label ?? "-",
      },
      {
        field: "created_by",
        headerName: "Kaydı Giren",
        flex: 1,
        valueGetter: (params) =>
          params?.row?.created_by_username ??
          params?.row?.created_by_name ??
          "-",
      },
      {
        field: "updated_by",
        headerName: "Son Güncelleyen",
        flex: 1,
        valueGetter: (params) =>
          params?.row?.updated_by_username ??
          params?.row?.updated_by_name ??
          "-",
      },
      { field: "note", headerName: "Not", flex: 1.2, sortable: false },
      {
        field: "actions",
        headerName: "İşlemler",
        flex: 0.7,
        sortable: false,
        renderCell: (params) => {
          if (!params?.row) return null;
          return (
            <Stack direction="row" spacing={1}>
              <IconButton size="small" onClick={() => handleEdit(params.row)}>
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" color="error" onClick={() => handleDelete(params.row)}>
                <DeleteOutlineOutlinedIcon fontSize="small" />
              </IconButton>
            </Stack>
          );
        },
      },
    ],
    [handleDelete, handleEdit]
  );

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Garanti Takibi
        </Typography>
        <Typography color="text.secondary">
          Cihaz ve bakım/hizmet garanti kayıtlarını yönetin.
        </Typography>
      </Box>

      <Grid container spacing={2}>
        {[
          { label: "Toplam", value: summary.total, color: "primary", filter: null },
          { label: "Kritik (1-30)", value: summary.critical, color: "error", filter: "CRITICAL" as const },
          { label: "Yaklaşıyor (31-60)", value: summary.upcoming, color: "warning", filter: "NEAR" as const },
          { label: "Süresi Geçti", value: summary.expired, color: "grey", filter: "EXPIRED" as const },
        ].map((item) => {
          const isSelected = selectedWarrantyFilter === item.filter;
          return (
            <Grid item xs={12} sm={6} md={3} key={item.label}>
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
                    setSelectedWarrantyFilter((prev) => (prev === item.filter ? null : item.filter))
                  }
                  sx={{ height: "100%" }}
                >
                  <CardContent>
                    <Typography color="text.secondary" gutterBottom>
                      {item.label}
                    </Typography>
                    <Typography
                      variant="h4"
                      fontWeight={700}
                      color={item.color === "grey" ? "text.primary" : `${item.color}.main`}
                    >
                      {item.value}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      <Grid container spacing={3} alignItems="flex-start">
        <Grid item xs={12} lg={8}>
          <Card variant="outlined">
            <CardContent sx={{ height: 560 }}>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Garanti Kayıtları
              </Typography>
              {activeFilterLabel && (
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  <Chip
                    color="primary"
                    size="small"
                    label={`Aktif filtre: ${activeFilterLabel}`}
                    onDelete={() => setSelectedWarrantyFilter(null)}
                  />
                  <Button size="small" variant="text" onClick={() => setSelectedWarrantyFilter(null)}>
                    Temizle
                  </Button>
                </Stack>
              )}
              {(filteredItems ?? []).length === 0 ? (
                <Alert severity="info">Henüz garanti kaydı yok.</Alert>
              ) : (
                <DataGrid
                  rows={filteredItems ?? []}
                  getRowId={(row) => row?.id}
                  columns={columns}
                  loading={loading}
                  disableRowSelectionOnClick
                  autoHeight={false}
                  pageSizeOptions={[5, 10, 20]}
                  initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
                  sx={{ border: "none" }}
                />
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} lg={4}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                {editingItem ? "Kaydı Güncelle" : "Yeni Garanti Kaydı"}
              </Typography>
              <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <TextField
                  select
                  label="Tip"
                  value={form.type}
                  onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as WarrantyItemType }))}
                >
                  {typeOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Ad"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
                <TextField
                  label="Lokasyon"
                  value={form.location}
                  onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
                  required
                />
                <TextField
                  label="Bitiş Tarihi"
                  type="date"
                  value={form.end_date}
                  onChange={(event) => setForm((prev) => ({ ...prev, end_date: event.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  required
                />
                <TextField
                  label="Not"
                  value={form.note}
                  onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
                  multiline
                  minRows={3}
                />
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  {editingItem && (
                    <Button
                      variant="text"
                      onClick={() => {
                        setEditingItem(null);
                        setForm({ type: "DEVICE", name: "", location: "", end_date: "", note: "" });
                      }}
                    >
                      İptal
                    </Button>
                  )}
                  <Button variant="contained" type="submit" disabled={submitting}>
                    {editingItem ? "Güncelle" : "Kaydet"}
                  </Button>
                </Stack>
              </Box>
              {error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {error}
                </Alert>
              )}
              {success && (
                <Alert severity="success" sx={{ mt: 2 }}>
                  {success}
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
