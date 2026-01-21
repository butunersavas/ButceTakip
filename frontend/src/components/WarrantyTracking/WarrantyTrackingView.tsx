import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type WarrantyItemType = "DEVICE" | "SERVICE" | "DOMAIN_SSL";

type WarrantyItem = {
  id: number | string;
  type: WarrantyItemType | "";
  name: string;
  location: string;
  end_date: string | null;
  start_date?: string | null;
  note?: string | null;
  domain?: string | null;
  issuer?: string | null;
  certificate_issuer?: string | null;
  renewal_owner?: string | null;
  renewal_responsible?: string | null;
  reminder_days?: number | null;
  remind_days?: number | null;
  remind_days_before?: number | null;
  is_active: boolean;
  created_by_name?: string | null;
  updated_by_name?: string | null;
  created_by_username?: string | null;
  updated_by_username?: string | null;
  updated_at?: string | null;
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
  issuer: string;
  renewal_responsible: string;
  reminder_days: string;
  domain: string;
};

const typeOptions: Array<{ value: WarrantyItemType; label: string }> = [
  { value: "DEVICE", label: "Cihaz" },
  { value: "SERVICE", label: "Bakım/Hizmet" },
  { value: "DOMAIN_SSL", label: "Domain SSL" },
];

const calcDaysLeft = (endDate: string | null): number | null => {
  if (!endDate) return null;
  const end = new Date(`${endDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ms = end.getTime() - today.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
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
  if (value === "DOMAIN_SSL") return "Domain SSL";
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
  const remindDaysBefore =
    typeof row?.remind_days === "number"
      ? row.remind_days
      : typeof row?.remind_days_before === "number"
      ? row.remind_days_before
      : typeof row?.reminder_days === "number"
        ? row.reminder_days
        : 30;
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
    certificate_issuer: row?.certificate_issuer ?? row?.issuer ?? null,
    issuer: row?.issuer ?? row?.certificate_issuer ?? null,
    domain: row?.domain ?? null,
    renewal_responsible: row?.renewal_responsible ?? row?.renewal_owner ?? null,
    remind_days: remindDaysBefore,
    remind_days_before: remindDaysBefore,
    reminder_days: remindDaysBefore,
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
  const tableRef = useRef<HTMLDivElement | null>(null);
  const [selectedWarrantyFilter, setSelectedWarrantyFilter] = useState<
    "CRITICAL" | "NEAR" | "EXPIRED" | null
  >(null);
  const [form, setForm] = useState<WarrantyItemForm>({
    type: "DEVICE",
    name: "",
    location: "",
    end_date: "",
    note: "",
    issuer: "",
    renewal_responsible: "",
    reminder_days: "30",
    domain: "",
  });

  const isDomainSsl = form.type === "DOMAIN_SSL";
  const nameLabel = isDomainSsl ? "Domain" : "Ad";
  const locationLabel = isDomainSsl ? "Lokasyon" : "Lokasyon";

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
      const remindDaysBefore =
        item.reminder_days ??
        item.remind_days ??
        item.remind_days_before ??
        30;
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
    if (selectedWarrantyFilter === "CRITICAL") return "Kritik";
    if (selectedWarrantyFilter === "NEAR") return "Yaklaşıyor";
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
      const reminderValue = form.reminder_days ? Number(form.reminder_days) : null;
      const payload = {
        type: form.type,
        name: form.name.trim(),
        location: form.location.trim(),
        domain: form.domain.trim() || null,
        end_date: normalizedEndDate,
        note: form.note.trim() || null,
        issuer: form.issuer.trim() || null,
        renewal_responsible: form.renewal_responsible.trim() || null,
        reminder_days: Number.isFinite(reminderValue) ? reminderValue : null,
      };

      if (editingItem) {
        await client.put(`/warranty-items/${editingItem.id}`, payload);
        setSuccess("Garanti kaydı güncellendi.");
      } else {
        await client.post("/warranty-items", payload);
        setSuccess("Garanti kaydı eklendi.");
      }

      setForm({
        type: "DEVICE",
        name: "",
        location: "",
        end_date: "",
        note: "",
        issuer: "",
        renewal_responsible: "",
        reminder_days: "30",
        domain: ""
      });
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
      issuer: item.issuer ?? item.certificate_issuer ?? "",
      renewal_responsible: item.renewal_responsible ?? item.renewal_owner ?? "",
      reminder_days:
        item.reminder_days != null
          ? String(item.reminder_days)
          : item.remind_days != null
            ? String(item.remind_days)
            : item.remind_days_before != null
              ? String(item.remind_days_before)
              : "30",
      domain: item.domain ?? "",
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
        setForm({
          type: "DEVICE",
          name: "",
          location: "",
          end_date: "",
          note: "",
          issuer: "",
          renewal_responsible: "",
          reminder_days: "30",
          domain: ""
        });
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
        field: "certificate_issuer",
        headerName: "Sertifika Sağlayıcı",
        flex: 1,
        valueGetter: (params) =>
          params?.row?.certificate_issuer ??
          params?.row?.issuer ??
          params?.row?.certificateIssuer ??
          "-",
      },
      {
        field: "domain",
        headerName: "Domain",
        flex: 1,
        valueGetter: (params) => params?.row?.domain ?? "-",
      },
      {
        field: "renewal_responsible",
        headerName: "Yenileme Sorumlusu",
        flex: 1,
        valueGetter: (params) =>
          params?.row?.renewal_responsible ??
          params?.row?.renewal_owner ??
          params?.row?.renewalResponsible ??
          "-",
      },
      {
        field: "end_date",
        headerName: "Bitiş Tarihi",
        flex: 0.9,
        valueGetter: (params) =>
          formatDate(
            params?.row?.end_date ??
              params?.row?.endDate ??
              params?.row?.expiration_date ??
              null
          ),
      },
      {
        field: "updated_at",
        headerName: "Son Güncelleme",
        flex: 0.9,
        valueGetter: (params) =>
          formatDate(params?.row?.updated_at ?? params?.row?.updatedAt ?? null),
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
        flex: 1,
        sortable: false,
        renderCell: (params) => {
          const row = params?.row;
          const daysLeft =
            typeof row?.days_left === "number"
              ? row.days_left
              : calcDaysLeft(row?.end_date ?? null);
          const reminderDays = row?.reminder_days ?? row?.remind_days ?? row?.remind_days_before ?? null;
          const showReminder =
            typeof daysLeft === "number" &&
            typeof reminderDays === "number" &&
            daysLeft >= 0 &&
            daysLeft <= reminderDays;
          return (
            <Stack spacing={0.5}>
              <Typography variant="body2">{row?.status_label ?? "-"}</Typography>
              {showReminder && (
                <Chip label="Yakında yenile" size="small" color="warning" variant="outlined" />
              )}
            </Stack>
          );
        },
      },
      {
        field: "created_by_name",
        headerName: "Kaydı Giren",
        flex: 1,
        valueGetter: (params) =>
          params?.row?.created_by_name ??
          params?.row?.createdByName ??
          "-",
      },
      {
        field: "updated_by_name",
        headerName: "Son Güncelleyen",
        flex: 1,
        valueGetter: (params) =>
          params?.row?.updated_by_name ??
          params?.row?.updatedByName ??
          "-",
      },
      {
        field: "note",
        headerName: "Not",
        flex: 1.2,
        sortable: false,
        valueGetter: (params) => params?.row?.note ?? "-",
      },
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
          { label: "Kritik", value: summary.critical, color: "error", filter: "CRITICAL" as const },
          { label: "Yaklaşıyor", value: summary.upcoming, color: "warning", filter: "NEAR" as const },
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
                    setSelectedWarrantyFilter((prev) => {
                      const next = prev === item.filter ? null : item.filter;
                      requestAnimationFrame(() => {
                        tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      });
                      return next;
                    })
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
        <Grid item xs={12} lg={8} ref={tableRef}>
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
                  label={nameLabel}
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
                <TextField
                  label={locationLabel}
                  value={form.location}
                  onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
                  required
                />
                {isDomainSsl && (
                  <>
                    <TextField
                      label="Domain (FQDN)"
                      value={form.domain}
                      onChange={(event) => setForm((prev) => ({ ...prev, domain: event.target.value }))}
                      placeholder="example.com"
                    />
                    <TextField
                      label="Sertifika Sağlayıcı"
                      value={form.issuer}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, issuer: event.target.value }))
                      }
                      placeholder="Örn. Let's Encrypt"
                    />
                    <TextField
                      label="Yenileme Sorumlusu"
                      value={form.renewal_responsible}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, renewal_responsible: event.target.value }))
                      }
                      placeholder="Sorumlu kişi"
                    />
                    <TextField
                      label="Otomatik hatırlatma (gün)"
                      type="number"
                      value={form.reminder_days}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, reminder_days: event.target.value }))
                      }
                      inputProps={{ min: 0, step: 1 }}
                    />
                  </>
                )}
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
                        setForm({
                          type: "DEVICE",
                          name: "",
                          location: "",
                          end_date: "",
                          note: "",
                          issuer: "",
                          renewal_responsible: "",
                          reminder_days: "30",
                          domain: ""
                        });
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
