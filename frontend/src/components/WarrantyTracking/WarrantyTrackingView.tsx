import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
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

const dayInMs = 1000 * 60 * 60 * 24;

const toLocalDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const getDaysLeft = (endDate: string | null | undefined) => {
  if (!endDate) return 0;
  const end = toLocalDate(endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((end.getTime() - today.getTime()) / dayInMs);
};

const getStatusLabel = (daysLeft: number) => {
  if (daysLeft <= 0) return "Süresi Geçti";
  if (daysLeft <= 30) return "Kritik";
  if (daysLeft <= 60) return "Yaklaşıyor";
  return "Normal";
};

const getStatusChipProps = (daysLeft: number) => {
  if (daysLeft <= 0) {
    return {
      sx: {
        bgcolor: (theme: any) => (theme.palette.mode === "dark" ? "grey.700" : "grey.300"),
        color: "text.primary",
      },
    };
  }
  if (daysLeft <= 30) {
    return { color: "error" as const };
  }
  if (daysLeft <= 60) {
    return { color: "warning" as const };
  }
  return { color: "success" as const };
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = toLocalDate(value);
  return new Intl.DateTimeFormat("tr-TR").format(date);
};

const normalizeWarrantyRow = (row: any): WarrantyItem => {
  const start = row?.start_date ?? row?.startDate ?? null;
  const end = row?.end_date ?? row?.endDate ?? null;
  const serialKey = row?.serial_no ?? row?.serial ?? row?.asset_tag;
  const randomId =
    (typeof globalThis !== "undefined" ? globalThis.crypto?.randomUUID?.() : undefined) ?? `${Math.random()}`;
  const id = row?.id ?? row?.warranty_id ?? row?.uuid ?? row?._id ?? (serialKey ? `${serialKey}-${start ?? "nostart"}` : randomId);

  return {
    ...row,
    id,
    type: row?.type ?? row?.device_type ?? row?.asset_type ?? "",
    start_date: start,
    end_date: end,
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
      const daysLeft = getDaysLeft(item.end_date);
      if (daysLeft <= 0) {
        totals.expired += 1;
      } else if (daysLeft <= 30) {
        totals.critical += 1;
      } else if (daysLeft <= 60) {
        totals.upcoming += 1;
      }
    });
    return totals;
  }, [items]);

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
      const payload = {
        type: form.type,
        name: form.name.trim(),
        location: form.location.trim(),
        end_date: form.end_date,
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
      end_date: item.end_date ?? "",
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
        valueGetter: (params) => {
          const type = params?.row?.type;
          if (type === "DEVICE") return "Cihaz";
          if (type === "SERVICE") return "Bakım/Hizmet";
          return "";
        },
      },
      { field: "name", headerName: "Ad", flex: 1.2 },
      { field: "location", headerName: "Lokasyon", flex: 1 },
      {
        field: "end_date",
        headerName: "Bitiş Tarihi",
        flex: 0.9,
        valueGetter: (params) => formatDate(params?.row?.end_date ?? params?.row?.endDate ?? null),
      },
      {
        field: "days_left",
        headerName: "Kalan Gün",
        flex: 0.8,
        sortable: false,
        renderCell: (params) => {
          const daysLeft = getDaysLeft(params?.row?.end_date ?? params?.row?.endDate ?? null);
          const chipProps = getStatusChipProps(daysLeft);
          return <Chip size="small" {...chipProps} label={`${daysLeft} gün`} />;
        },
      },
      {
        field: "status",
        headerName: "Durum",
        flex: 0.8,
        sortable: false,
        valueGetter: (params) =>
          getStatusLabel(getDaysLeft(params?.row?.end_date ?? params?.row?.endDate ?? null)),
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
          { label: "Toplam", value: summary.total, color: "primary" },
          { label: "Kritik (1-30)", value: summary.critical, color: "error" },
          { label: "Yaklaşıyor (31-60)", value: summary.upcoming, color: "warning" },
          { label: "Süresi Geçti", value: summary.expired, color: "grey" },
        ].map((item) => (
          <Grid item xs={12} sm={6} md={3} key={item.label}>
            <Card variant="outlined">
              <CardContent>
                <Typography color="text.secondary" gutterBottom>
                  {item.label}
                </Typography>
                <Typography variant="h4" fontWeight={700} color={item.color === "grey" ? "text.primary" : `${item.color}.main`}>
                  {item.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3} alignItems="flex-start">
        <Grid item xs={12} lg={8}>
          <Card variant="outlined">
            <CardContent sx={{ height: 560 }}>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Garanti Kayıtları
              </Typography>
              {(items ?? []).length === 0 ? (
                <Alert severity="info">Henüz garanti kaydı yok.</Alert>
              ) : (
                <DataGrid
                  rows={items ?? []}
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
