import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Divider,
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
  Snackbar,
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
  location?: string | null;
  end_date: string | null;
  shipment_date?: string | null;
  end_of_service_life?: string | null;
  note?: string | null;
  domain?: string | null;
  issuer?: string | null;
  certificate_issuer?: string | null;
  renewal_owner?: string | null;
  renewal_responsible?: string | null;
  purchased_from?: string | null;
  brand?: string | null;
  model?: string | null;
  serial_number?: string | null;
  asset_tag?: string | null;
  service_code?: string | null;
  ordered_product_model?: string | null;
  price?: string | number | null;
  status?: string | null;
  computed_status?: string | null;
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
  status_key?: "expired" | "approaching" | "ok" | "unknown";
  type_label?: string;
  certificate_issuer_display?: string;
  domain_display?: string;
  renewal_responsible_display?: string;
  end_date_display?: string;
  created_by_display?: string;
  updated_by_display?: string;
  note_display?: string;
};

type WarrantyItemForm = {
  type: WarrantyItemType;
  name: string;
  location: string;
  end_date: string;
  purchased_from: string;
  brand: string;
  model: string;
  serial_number: string;
  asset_tag: string;
  service_code: string;
  ordered_product_model: string;
  price: string;
  shipment_date: string;
  end_of_service_life: string;
  status: string;
  note: string;
  issuer: string;
  renewal_responsible: string;
  reminder_days: string;
  domain: string;
};

type DeleteDependencyInfo = {
  related_file_count: number;
};

type WarrantyImportPreviewRow = {
  row: number;
  status: string;
  errors?: string[];
  warnings?: string[];
  duplicate_source?: string | null;
  payload?: Record<string, any>;
};

type WarrantyImportReport = {
  mode?: string;
  file?: string;
  sheet?: string;
  excel_columns?: string[];
  column_mapping?: Record<string, string>;
  unmapped_columns?: string[];
  missing_required_columns?: string[];
  summary?: {
    data_rows_read?: number;
    importable_rows?: number;
    invalid_rows?: number;
    duplicate_rows?: number;
    blank_rows?: number;
    total_rows?: number;
    total_amount?: string | number | null;
    added_rows?: number;
    db_active_records_before?: number;
    db_active_records_after?: number;
    date_range?: Record<string, string | null>;
  };
  invalid_row_preview?: WarrantyImportPreviewRow[];
  duplicate_row_preview?: WarrantyImportPreviewRow[];
  importable_row_preview?: WarrantyImportPreviewRow[];
};

const typeOptions: Array<{ value: WarrantyItemType; label: string }> = [
  { value: "DEVICE", label: "Cihaz" },
  { value: "DOMAIN_SSL", label: "Domain" },
  { value: "SERVICE", label: "Lisans Destek" },
];

const getTypeLabel = (value: WarrantyItemType | "" | null | undefined) =>
  typeOptions.find((option) => option.value === value)?.label ?? "Garanti/Bakım";

const createEmptyForm = (type: WarrantyItemType = "DEVICE"): WarrantyItemForm => ({
  type,
  name: "",
  location: "",
  end_date: "",
  purchased_from: "",
  brand: "",
  model: "",
  serial_number: "",
  asset_tag: "",
  service_code: "",
  ordered_product_model: "",
  price: "",
  shipment_date: "",
  end_of_service_life: "",
  status: "",
  note: "",
  issuer: "",
  renewal_responsible: "",
  reminder_days: "30",
  domain: "",
});

const calcDaysLeft = (endDate: string | null): number | null => {
  if (!endDate) return null;
  const end = new Date(`${endDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ms = end.getTime() - today.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
};

const calcStatus = (daysLeft: number | null) => {
  if (daysLeft === null) return { label: "Bilinmiyor", key: "unknown" as const };
  if (daysLeft < 0) return { label: "Süresi Dolmuş", key: "expired" as const };
  if (daysLeft <= 90) return { label: "Yaklaşıyor", key: "approaching" as const };
  return { label: "Aktif", key: "ok" as const };
};

const mapStatusKey = (status?: string | null) => {
  const normalized = status?.toLowerCase?.() ?? "";
  if (normalized.includes("süresi dolmuş") || normalized.includes("süresi geçti")) {
    return "expired" as const;
  }
  if (normalized.includes("yaklaşıyor")) return "approaching" as const;
  if (normalized.includes("aktif")) return "ok" as const;
  if (normalized.includes("bilinmiyor")) return "unknown" as const;
  return "unknown" as const;
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value + "T00:00:00");
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("tr-TR").format(date);
};

const formatTypeLabel = (value?: string | null) => {
  if (value === "DEVICE") return "Cihaz";
  if (value === "SERVICE") return "Lisans Destek";
  if (value === "DOMAIN_SSL") return "Domain";
  return value ?? "-";
};

const formatPrice = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(numeric)) return toDisplayText(String(value));
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
  }).format(numeric);
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

const normalizeOptionalText = (value: string | null | undefined) => {
  if (value == null) return null;
  if (typeof value !== "string") return value as string | null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-" || trimmed === "—") return null;
  return trimmed;
};

const toDisplayText = (value: string | null | undefined) => {
  if (value == null) return "-";
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : "-";
  }
  return String(value);
};

const normalizeWarrantyRow = (row: any): WarrantyItem => {
  const shipment = normalizeDateInput(row?.shipment_date ?? row?.shipmentDate ?? null) || null;
  const endOfServiceLife =
    normalizeDateInput(row?.end_of_service_life ?? row?.endOfServiceLife ?? null) || null;
  const endRaw = row?.end_date ?? row?.endDate ?? row?.expiration_date ?? null;
  const end = normalizeDateInput(endRaw) || null;
  const remindDaysBefore =
    typeof row?.remind_days === "number"
      ? row.remind_days
      : typeof row?.remind_days_before === "number"
      ? row.remind_days_before
      : typeof row?.reminder_days === "number"
        ? row.reminder_days
        : 30;
  const serialKey = row?.serial_number ?? row?.serialNumber ?? row?.serial_no ?? row?.serial ?? row?.asset_tag;
  const randomId =
    (typeof globalThis !== "undefined" ? globalThis.crypto?.randomUUID?.() : undefined) ?? `${Math.random()}`;
  const id =
    row?.id ??
    row?.warranty_id ??
    row?.uuid ??
    row?._id ??
    (serialKey ? `${serialKey}-${shipment ?? "noshipment"}` : randomId);
  const days_left =
    typeof row?.days_left === "number" ? row.days_left : calcDaysLeft(end ?? null);
  const statusLabel = row?.computed_status ?? row?.computedStatus ?? row?.status_label ?? null;
  const status =
    typeof statusLabel === "string" && statusLabel.trim().length
      ? { label: statusLabel, key: mapStatusKey(statusLabel) }
      : calcStatus(days_left);
  const certificateIssuerRaw =
    row?.certificate_issuer ?? row?.issuer ?? row?.certificateIssuer ?? "-";
  const issuerRaw = row?.issuer ?? row?.certificate_issuer ?? row?.certificateIssuer ?? null;
  const domainRaw = row?.domain ?? "-";
  const renewalResponsibleRaw =
    row?.renewal_responsible ?? row?.renewal_owner ?? row?.renewalResponsible ?? "-";
  const noteRaw = row?.note ?? "-";
  const purchasedFromRaw = row?.purchased_from ?? row?.purchasedFrom ?? "-";
  const brandRaw = row?.brand ?? "-";
  const modelRaw = row?.model ?? "-";
  const serialNumberRaw = row?.serial_number ?? row?.serialNumber ?? row?.serial_no ?? "-";
  const assetTagRaw = row?.asset_tag ?? row?.assetTag ?? "-";
  const serviceCodeRaw = row?.service_code ?? row?.serviceCode ?? "-";
  const orderedProductModelRaw =
    row?.ordered_product_model ?? row?.orderedProductModel ?? "-";
  const rawStatus = normalizeOptionalText(row?.status ?? null);
  const createdByRaw = row?.created_by_name ?? row?.createdByName ?? "-";
  const updatedByRaw = row?.updated_by_name ?? row?.updatedByName ?? "-";
  const certificateIssuer = normalizeOptionalText(certificateIssuerRaw);
  const issuer = normalizeOptionalText(issuerRaw);
  const domain = normalizeOptionalText(domainRaw);
  const renewalResponsible = normalizeOptionalText(renewalResponsibleRaw);
  const note = normalizeOptionalText(noteRaw);
  const createdByName = normalizeOptionalText(createdByRaw);
  const updatedByName = normalizeOptionalText(updatedByRaw);
  return {
    ...row,
    id,
    type: row?.type ?? row?.device_type ?? row?.asset_type ?? "",
    shipment_date: shipment,
    end_of_service_life: endOfServiceLife,
    end_date: end,
    days_left,
    status_label: status.label,
    status_key: status.key,
    type_label: formatTypeLabel(row?.type),
    purchased_from: normalizeOptionalText(purchasedFromRaw),
    brand: normalizeOptionalText(brandRaw),
    model: normalizeOptionalText(modelRaw),
    serial_number: normalizeOptionalText(serialNumberRaw),
    asset_tag: normalizeOptionalText(assetTagRaw),
    service_code: normalizeOptionalText(serviceCodeRaw),
    ordered_product_model: normalizeOptionalText(orderedProductModelRaw),
    price: row?.price ?? null,
    status: rawStatus,
    computed_status: row?.computed_status ?? row?.computedStatus ?? null,
    certificate_issuer: certificateIssuer,
    issuer,
    domain,
    renewal_responsible: renewalResponsible,
    note,
    created_by_name: createdByName,
    updated_by_name: updatedByName,
    certificate_issuer_display: toDisplayText(certificateIssuerRaw),
    domain_display: toDisplayText(domainRaw),
    renewal_responsible_display: toDisplayText(renewalResponsibleRaw),
    end_date_display: toDisplayText(endRaw ?? "-"),
    created_by_display: toDisplayText(createdByRaw),
    updated_by_display: toDisplayText(updatedByRaw),
    note_display: toDisplayText(noteRaw),
    remind_days: remindDaysBefore,
    remind_days_before: remindDaysBefore,
    reminder_days: remindDaysBefore,
  };
};

const getApiErrorMessage = (err: unknown, fallback: string) => {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
    return detail || err.message || fallback;
  }
  return fallback;
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
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
  const hasLoggedWarrantyResponse = useRef(false);
  const [selectedWarrantyFilter, setSelectedWarrantyFilter] = useState<
    "NEAR" | "EXPIRED" | "UNKNOWN" | null
  >(null);
  const [activeWarrantyType, setActiveWarrantyType] = useState<WarrantyItemType>("DEVICE");
  const [form, setForm] = useState<WarrantyItemForm>(() => createEmptyForm("DEVICE"));
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importReport, setImportReport] = useState<WarrantyImportReport | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importCommitting, setImportCommitting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const nameLabel = form.type === "DOMAIN_SSL" ? "DOMAİN ADLARI" : "Ürün";
  const activeTypeLabel = getTypeLabel(activeWarrantyType);
  const formDaysLeft = useMemo(() => calcDaysLeft(normalizeDateInput(form.end_date) || null), [form.end_date]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await client.get("/warranty-items");
      const raw = Array.isArray(data) ? data : (data as { items?: WarrantyItem[] } | null)?.items ?? [];
      if (import.meta.env.DEV && !hasLoggedWarrantyResponse.current && raw[0]) {
        console.debug("[Warranty] First row response", raw[0]);
        hasLoggedWarrantyResponse.current = true;
      }
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
  }, [activeWarrantyType, client]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const sectionItems = useMemo(() => {
    return items.filter((item) => item.type === activeWarrantyType);
  }, [items, activeWarrantyType]);

  const summary = useMemo(() => {
    const totals = {
      total: sectionItems.length,
      upcoming: 0,
      expired: 0,
      unknown: 0,
    };
    sectionItems.forEach((item) => {
      const daysLeft = item.days_left ?? calcDaysLeft(item.end_date);
      if (daysLeft === null) {
        totals.unknown += 1;
        return;
      }
      if (daysLeft < 0) {
        totals.expired += 1;
      } else if (daysLeft <= 90) {
        totals.upcoming += 1;
      }
    });
    return totals;
  }, [sectionItems]);

  const filteredItems = useMemo(() => {
    if (!selectedWarrantyFilter) return sectionItems;
    if (selectedWarrantyFilter === "NEAR") {
      return sectionItems.filter((item) => item.status_key === "approaching");
    }
    if (selectedWarrantyFilter === "UNKNOWN") {
      return sectionItems.filter((item) => item.status_key === "unknown");
    }
    return sectionItems.filter((item) => item.status_key === "expired");
  }, [sectionItems, selectedWarrantyFilter]);

  const activeFilterLabel = useMemo(() => {
    if (!selectedWarrantyFilter) return null;
    if (selectedWarrantyFilter === "NEAR") return "Yaklaşıyor";
    if (selectedWarrantyFilter === "UNKNOWN") return "Bilinmiyor";
    return "Süresi Dolmuş";
  }, [selectedWarrantyFilter]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const resolvedName = form.name.trim() || (form.type === "DOMAIN_SSL" ? form.domain.trim() : "");
    if (!resolvedName) {
      setError(`${nameLabel} alanı zorunludur.`);
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
        name: resolvedName,
        location: form.location.trim() || null,
        domain: form.type === "DOMAIN_SSL" ? (form.domain.trim() || resolvedName || null) : (form.domain.trim() || null),
        end_date: normalizedEndDate || null,
        purchased_from: form.purchased_from.trim() || null,
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        serial_number: form.serial_number.trim() || null,
        asset_tag: form.asset_tag.trim() || null,
        service_code: form.service_code.trim() || null,
        ordered_product_model: form.ordered_product_model.trim() || null,
        price: form.price.trim() || null,
        shipment_date: normalizeDateInput(form.shipment_date) || null,
        end_of_service_life: normalizeDateInput(form.end_of_service_life) || null,
        status: form.status.trim() || null,
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

      setForm(createEmptyForm(activeWarrantyType));
      setEditingItem(null);
      setFormOpen(false);
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
    if (item.type) {
      setActiveWarrantyType(item.type);
    }
    setEditingItem(item);
    setFormOpen(true);
    setForm({
      type: item.type || "DEVICE",
      name: item.name,
      location: item.location ?? "",
      end_date: normalizeDateInput(item.end_date) ?? "",
      purchased_from: item.purchased_from ?? "",
      brand: item.brand ?? "",
      model: item.model ?? "",
      serial_number: item.serial_number ?? "",
      asset_tag: item.asset_tag ?? "",
      service_code: item.service_code ?? "",
      ordered_product_model: item.ordered_product_model ?? "",
      price: item.price == null ? "" : String(item.price),
      shipment_date: normalizeDateInput(item.shipment_date) ?? "",
      end_of_service_life: normalizeDateInput(item.end_of_service_life) ?? "",
      status: item.status ?? "",
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
    let relatedFileCount: number | null = null;
    try {
      const { data } = await client.get<DeleteDependencyInfo>(
        `/warranty-items/${item.id}/delete-info`
      );
      relatedFileCount = data.related_file_count ?? 0;
    } catch (error) {
      console.error(error);
    }

    const confirmMessage =
      relatedFileCount === null
        ? "Bu kaydı silmek istediğinize emin misiniz? Bağlı ek/dosya varsa ekler de silinecek. Devam etmek istiyor musunuz?"
        : relatedFileCount > 0
          ? `Bu kayda bağlı ${relatedFileCount} ek/dosya var. Silerseniz ekler de silinecek. Devam etmek istiyor musunuz?`
          : "Garanti kaydını silmek istediğinize emin misiniz?";
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await client.delete(`/warranty-items/${item.id}`, {
        params: { delete_related: relatedFileCount === null || relatedFileCount > 0 }
      });
      await loadItems();
      setSuccess("Garanti kaydı silindi.");
      if (editingItem?.id === item.id) {
        setEditingItem(null);
        setForm(createEmptyForm(activeWarrantyType));
        setFormOpen(false);
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
  }, [activeWarrantyType, client, editingItem?.id, loadItems]);

  const handleDownloadTemplate = useCallback(async () => {
    setError(null);
    try {
      const response = await client.get("/warranty-items/import/template", {
        responseType: "blob",
        params: { template_type: activeWarrantyType, _t: Date.now() },
      });
      downloadBlob(
        new Blob([response.data], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `garanti_${activeWarrantyType.toLowerCase()}_import_sablonu.xlsx`
      );
    } catch (err) {
      console.error(err);
      setError(getApiErrorMessage(err, "Şablon indirilemedi."));
    }
  }, [activeWarrantyType, client]);

  const resetImportModal = useCallback(() => {
    setImportFile(null);
    setImportReport(null);
    setImportLoading(false);
    setImportCommitting(false);
    if (importInputRef.current) {
      importInputRef.current.value = "";
    }
  }, []);

  const handlePreviewImport = useCallback(async () => {
    if (!importFile) {
      setError("Önce Excel dosyası seçin.");
      return;
    }
    setImportLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      formData.append("default_type", activeWarrantyType);
      const { data } = await client.post<WarrantyImportReport>(
        "/warranty-items/import/preview",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      setImportReport(data);
    } catch (err) {
      console.error(err);
      setImportReport(null);
      setError(getApiErrorMessage(err, "Excel önizleme sırasında hata oluştu."));
    } finally {
      setImportLoading(false);
    }
  }, [activeWarrantyType, client, importFile]);

  const handleConfirmImport = useCallback(async () => {
    if (!importFile) {
      setError("Önce Excel dosyası seçin.");
      return;
    }
    const importableRows = importReport?.summary?.importable_rows ?? 0;
    if (importableRows <= 0) {
      setError("Import edilebilir geçerli satır bulunamadı.");
      return;
    }
    const confirmed = window.confirm(
      `${importableRows} geçerli Garanti/Bakım kaydı DB'ye aktarılacak. Devam etmek istiyor musunuz?`
    );
    if (!confirmed) return;

    setImportCommitting(true);
    setError(null);
    setSuccess(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      formData.append("default_type", activeWarrantyType);
      const { data } = await client.post<WarrantyImportReport>(
        "/warranty-items/import/confirm",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      setImportReport(data);
      await loadItems();
      setSuccess(
        `Import tamamlandı. Eklenen: ${data.summary?.added_rows ?? 0}, duplicate atlanan: ${data.summary?.duplicate_rows ?? 0}, hatalı: ${data.summary?.invalid_rows ?? 0}.`
      );
    } catch (err) {
      console.error(err);
      setError(getApiErrorMessage(err, "Excel import sırasında hata oluştu."));
    } finally {
      setImportCommitting(false);
    }
  }, [activeWarrantyType, client, importFile, importReport?.summary?.importable_rows, loadItems]);

  const renderImportRows = (title: string, rows: WarrantyImportPreviewRow[] | undefined, severity: "error" | "warning" | "info") => {
    if (!rows || rows.length === 0) return null;
    return (
      <Box sx={{ mt: 2 }}>
        <Alert severity={severity} sx={{ mb: 1 }}>
          {title} ({rows.length} örnek satır gösteriliyor)
        </Alert>
        <Box sx={{ overflowX: "auto", border: 1, borderColor: "divider", borderRadius: 1 }}>
          <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <Box component="thead" sx={{ bgcolor: "action.hover" }}>
              <Box component="tr">
                {["Satır", ...importPreviewColumns.map((column) => column.label), "Hata/Uyarı"].map((header) => (
                  <Box
                    key={header}
                    component="th"
                    sx={{ p: 1, textAlign: "left", borderBottom: 1, borderColor: "divider", fontSize: 12 }}
                  >
                    {header}
                  </Box>
                ))}
              </Box>
            </Box>
            <Box component="tbody">
              {rows.map((row) => {
                const payload = row.payload ?? {};
                const messages = [
                  ...(row.errors ?? []),
                  ...(row.warnings ?? []),
                  row.duplicate_source ? `Duplicate: ${row.duplicate_source}` : null,
                ].filter(Boolean);
                return (
                  <Box component="tr" key={`${row.status}-${row.row}`}>
                    <Box component="td" sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}>{row.row}</Box>
                    {importPreviewColumns.map((column) => (
                      <Box key={column.label} component="td" sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}>
                        {column.render(payload)}
                      </Box>
                    ))}
                    <Box component="td" sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}>
                      {messages.length ? messages.join(" | ") : "-"}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>
      </Box>
    );
  };

  const renderDaysChip = useCallback((params: any) => {
    const daysLeft = params?.row?.days_left ?? null;
    const statusKey = params?.row?.status_key ?? "unknown";
    const chipProps =
      statusKey === "expired"
        ? { color: "error" as const }
        : statusKey === "approaching"
          ? { color: "warning" as const }
          : statusKey === "ok"
            ? { color: "success" as const }
            : { color: "default" as const };
    const label = daysLeft === null ? "-" : `${daysLeft} gün`;
    return <Chip size="small" {...chipProps} label={label} />;
  }, []);

  const actionColumn = useMemo<GridColDef>(
    () => ({
      field: "actions",
      headerName: "İşlemler",
      width: 150,
      minWidth: 150,
      align: "center",
      headerAlign: "center",
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      cellClassName: "sticky-actions-cell",
      headerClassName: "sticky-actions-header",
      renderCell: (params) => {
        if (!params?.row) return null;
        return (
          <Stack direction="row" spacing={1} justifyContent="center" sx={{ width: "100%" }}>
            <IconButton size="small" onClick={() => handleEdit(params.row)}>
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" color="error" onClick={() => handleDelete(params.row)}>
              <DeleteOutlineOutlinedIcon fontSize="small" />
            </IconButton>
          </Stack>
        );
      },
    }),
    [handleDelete, handleEdit]
  );

  const columns = useMemo<GridColDef[]>(() => {
    if (activeWarrantyType === "DOMAIN_SSL") {
      return [
        { field: "domain", headerName: "DOMAİN ADLARI", flex: 1.5, minWidth: 260, valueGetter: (_value, row) => toDisplayText((row as any)?.domain || (row as any)?.name) },
        { field: "end_date", headerName: "SÖZLEŞME BİTİŞ TARİHİ", flex: 1, minWidth: 210, valueGetter: (_value, row) => formatDate((row as any)?.end_date) },
        { field: "days_left", headerName: "SÖZLEŞME KALAN GÜN SAYISI", flex: 1.1, minWidth: 240, sortable: false, renderCell: (params) => renderDaysChip(params) },
        { field: "renewal_responsible", headerName: "İLGİLİ FİRMA", flex: 1.2, minWidth: 210, valueGetter: (_value, row) => toDisplayText((row as any)?.renewal_responsible || (row as any)?.renewal_owner) },
        { field: "purchased_from", headerName: "HİZMET ALINAN HOSTİNG FİRMASI", flex: 1.6, minWidth: 300, valueGetter: (_value, row) => toDisplayText((row as any)?.purchased_from || (row as any)?.issuer) },
        actionColumn,
      ];
    }

    if (activeWarrantyType === "SERVICE") {
      return [
        { field: "purchased_from", headerName: "Alınan Kurum", flex: 1.1, minWidth: 190, valueGetter: (_value, row) => toDisplayText((row as any)?.purchased_from) },
        { field: "name", headerName: "Ürün", flex: 1.2, minWidth: 220 },
        { field: "service_code", headerName: "Lisans Adedi", flex: 0.9, minWidth: 150, valueGetter: (_value, row) => toDisplayText((row as any)?.service_code) },
        { field: "price", headerName: "Fiyat", flex: 0.9, minWidth: 150, valueGetter: (_value, row) => formatPrice((row as any)?.price) },
        { field: "shipment_date", headerName: "Alım Tarihi", flex: 0.9, minWidth: 160, valueGetter: (_value, row) => formatDate((row as any)?.shipment_date) },
        { field: "end_date", headerName: "Bitiş Tarihi", flex: 0.9, minWidth: 160, valueGetter: (_value, row) => formatDate((row as any)?.end_date) },
        { field: "days_left", headerName: "Destek Kalan Gün", flex: 0.9, minWidth: 170, sortable: false, renderCell: (params) => renderDaysChip(params) },
        { field: "status", headerName: "Garanti Süresi Uzatma İşlemi Yapıldı Mı?", flex: 1.5, minWidth: 300, valueGetter: (_value, row) => toDisplayText((row as any)?.status) },
        actionColumn,
      ];
    }

    return [
      { field: "purchased_from", headerName: "Alınan Kurum", flex: 1, minWidth: 170, valueGetter: (_value, row) => toDisplayText((row as any)?.purchased_from) },
      { field: "name", headerName: "Ürün", flex: 1.2, minWidth: 190 },
      { field: "brand", headerName: "Marka", flex: 0.8, minWidth: 130, valueGetter: (_value, row) => toDisplayText((row as any)?.brand) },
      { field: "model", headerName: "Model", flex: 0.9, minWidth: 150, valueGetter: (_value, row) => toDisplayText((row as any)?.model) },
      { field: "serial_number", headerName: "Seri No", flex: 1, minWidth: 160, valueGetter: (_value, row) => toDisplayText((row as any)?.serial_number) },
      { field: "asset_tag", headerName: "Demirbaş", flex: 0.9, minWidth: 150, valueGetter: (_value, row) => toDisplayText((row as any)?.asset_tag) },
      { field: "service_code", headerName: "Ekspres Servis Kodu", flex: 1, minWidth: 190, valueGetter: (_value, row) => toDisplayText((row as any)?.service_code) },
      { field: "ordered_product_model", headerName: "Ordered Product Model", flex: 1, minWidth: 210, valueGetter: (_value, row) => toDisplayText((row as any)?.ordered_product_model) },
      { field: "price", headerName: "Fiyat", flex: 0.8, minWidth: 140, valueGetter: (_value, row) => formatPrice((row as any)?.price) },
      { field: "shipment_date", headerName: "Gönderim Tarihi", flex: 0.9, minWidth: 160, valueGetter: (_value, row) => formatDate((row as any)?.shipment_date) },
      { field: "end_date", headerName: "Destek Sonu Tarihi", flex: 0.9, minWidth: 170, valueGetter: (_value, row) => formatDate((row as any)?.end_date) },
      { field: "end_of_service_life", headerName: "End of Service Life", flex: 0.9, minWidth: 180, valueGetter: (_value, row) => formatDate((row as any)?.end_of_service_life) },
      { field: "days_left", headerName: "Kalan Gün", flex: 0.8, minWidth: 130, sortable: false, renderCell: (params) => renderDaysChip(params) },
      { field: "computed_status", headerName: "Durum", flex: 0.9, minWidth: 150, sortable: false, renderCell: (params) => (<Typography variant="body2">{params?.row?.status_label ?? "Bilinmiyor"}</Typography>) },
      { field: "note", headerName: "Not", flex: 1.2, minWidth: 190, sortable: false, valueGetter: (_value, row) => toDisplayText((row as any)?.note) },
      actionColumn,
    ];
  }, [actionColumn, activeWarrantyType, renderDaysChip]);

  const importPreviewColumns = useMemo(() => {
    if (activeWarrantyType === "DOMAIN_SSL") {
      return [
        { label: "DOMAİN ADLARI", render: (payload: Record<string, any>) => toDisplayText(payload.domain || payload.name) },
        { label: "SÖZLEŞME BİTİŞ TARİHİ", render: (payload: Record<string, any>) => formatDate(payload.end_date) },
        { label: "SÖZLEŞME KALAN GÜN SAYISI", render: (payload: Record<string, any>) => {
          const days = calcDaysLeft(payload.end_date ?? null);
          return days === null ? "-" : `${days} gün`;
        } },
        { label: "İLGİLİ FİRMA", render: (payload: Record<string, any>) => toDisplayText(payload.renewal_responsible || payload.renewal_owner) },
        { label: "HİZMET ALINAN HOSTİNG FİRMASI", render: (payload: Record<string, any>) => toDisplayText(payload.purchased_from || payload.issuer) },
      ];
    }
    if (activeWarrantyType === "SERVICE") {
      return [
        { label: "Alınan Kurum", render: (payload: Record<string, any>) => toDisplayText(payload.purchased_from) },
        { label: "Ürün", render: (payload: Record<string, any>) => toDisplayText(payload.name) },
        { label: "Lisans Adedi", render: (payload: Record<string, any>) => toDisplayText(payload.service_code) },
        { label: "Fiyat", render: (payload: Record<string, any>) => formatPrice(payload.price) },
        { label: "Alım Tarihi", render: (payload: Record<string, any>) => formatDate(payload.shipment_date) },
        { label: "Bitiş Tarihi", render: (payload: Record<string, any>) => formatDate(payload.end_date) },
        { label: "Destek Kalan Gün", render: (payload: Record<string, any>) => {
          const days = calcDaysLeft(payload.end_date ?? null);
          return days === null ? "-" : `${days} gün`;
        } },
        { label: "Garanti Süresi Uzatma İşlemi Yapıldı Mı?", render: (payload: Record<string, any>) => toDisplayText(payload.status) },
      ];
    }
    return [
      { label: "Alınan Kurum", render: (payload: Record<string, any>) => toDisplayText(payload.purchased_from) },
      { label: "Ürün", render: (payload: Record<string, any>) => toDisplayText(payload.name) },
      { label: "Marka", render: (payload: Record<string, any>) => toDisplayText(payload.brand) },
      { label: "Model", render: (payload: Record<string, any>) => toDisplayText(payload.model) },
      { label: "Seri No", render: (payload: Record<string, any>) => toDisplayText(payload.serial_number) },
      { label: "Demirbaş", render: (payload: Record<string, any>) => toDisplayText(payload.asset_tag) },
      { label: "Ekspres Servis Kodu", render: (payload: Record<string, any>) => toDisplayText(payload.service_code) },
      { label: "Ordered Product Model", render: (payload: Record<string, any>) => toDisplayText(payload.ordered_product_model) },
      { label: "Fiyat", render: (payload: Record<string, any>) => formatPrice(payload.price) },
      { label: "Gönderim Tarihi", render: (payload: Record<string, any>) => formatDate(payload.shipment_date) },
      { label: "Destek Sonu Tarihi", render: (payload: Record<string, any>) => formatDate(payload.end_date) },
      { label: "End of Service Life", render: (payload: Record<string, any>) => formatDate(payload.end_of_service_life) },
      { label: "Durum", render: (payload: Record<string, any>) => toDisplayText(payload.status) },
      { label: "Not", render: (payload: Record<string, any>) => toDisplayText(payload.note) },
    ];
  }, [activeWarrantyType]);

  const renderFormFields = () => {
    if (form.type === "DOMAIN_SSL") {
      return (
        <>
          <TextField
            label="DOMAİN ADLARI"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value, domain: event.target.value }))}
            required
          />
          <TextField
            label="SÖZLEŞME BİTİŞ TARİHİ"
            type="date"
            value={form.end_date}
            onChange={(event) => setForm((prev) => ({ ...prev, end_date: event.target.value }))}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="SÖZLEŞME KALAN GÜN SAYISI"
            value={formDaysLeft === null ? "" : `${formDaysLeft} gün`}
            InputProps={{ readOnly: true }}
            helperText="Bitiş tarihinden otomatik hesaplanır."
          />
          <TextField
            label="İLGİLİ FİRMA"
            value={form.renewal_responsible}
            onChange={(event) => setForm((prev) => ({ ...prev, renewal_responsible: event.target.value }))}
          />
          <TextField
            label="HİZMET ALINAN HOSTİNG FİRMASI"
            value={form.purchased_from}
            onChange={(event) => setForm((prev) => ({ ...prev, purchased_from: event.target.value }))}
          />
        </>
      );
    }

    if (form.type === "SERVICE") {
      return (
        <>
          <TextField
            label="Alınan Kurum"
            value={form.purchased_from}
            onChange={(event) => setForm((prev) => ({ ...prev, purchased_from: event.target.value }))}
          />
          <TextField
            label="Ürün"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            required
          />
          <TextField
            label="Lisans Adedi"
            value={form.service_code}
            onChange={(event) => setForm((prev) => ({ ...prev, service_code: event.target.value }))}
          />
          <TextField
            label="Fiyat"
            value={form.price}
            onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
          />
          <TextField
            label="Alım Tarihi"
            type="date"
            value={form.shipment_date}
            onChange={(event) => setForm((prev) => ({ ...prev, shipment_date: event.target.value }))}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Bitiş Tarihi"
            type="date"
            value={form.end_date}
            onChange={(event) => setForm((prev) => ({ ...prev, end_date: event.target.value }))}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Destek Kalan Gün"
            value={formDaysLeft === null ? "" : `${formDaysLeft} gün`}
            InputProps={{ readOnly: true }}
            helperText="Bitiş tarihinden otomatik hesaplanır."
          />
          <TextField
            label="Garanti Süresi Uzatma İşlemi Yapıldı Mı?"
            value={form.status}
            onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
          />
        </>
      );
    }

    return (
      <>
        <TextField
          label="Ürün"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          required
        />
        <TextField
          label="Alınan Kurum"
          value={form.purchased_from}
          onChange={(event) => setForm((prev) => ({ ...prev, purchased_from: event.target.value }))}
        />
        <TextField
          label="Marka"
          value={form.brand}
          onChange={(event) => setForm((prev) => ({ ...prev, brand: event.target.value }))}
        />
        <TextField
          label="Model"
          value={form.model}
          onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
        />
        <TextField
          label="Seri No"
          value={form.serial_number}
          onChange={(event) => setForm((prev) => ({ ...prev, serial_number: event.target.value }))}
        />
        <TextField
          label="Demirbaş"
          value={form.asset_tag}
          onChange={(event) => setForm((prev) => ({ ...prev, asset_tag: event.target.value }))}
        />
        <TextField
          label="Ekspres Servis Kodu"
          value={form.service_code}
          onChange={(event) => setForm((prev) => ({ ...prev, service_code: event.target.value }))}
        />
        <TextField
          label="Ordered Product Model"
          value={form.ordered_product_model}
          onChange={(event) => setForm((prev) => ({ ...prev, ordered_product_model: event.target.value }))}
        />
        <TextField
          label="Fiyat"
          value={form.price}
          onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
        />
        <TextField
          label="Gönderim Tarihi"
          type="date"
          value={form.shipment_date}
          onChange={(event) => setForm((prev) => ({ ...prev, shipment_date: event.target.value }))}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="Destek Sonu Tarihi"
          type="date"
          value={form.end_date}
          onChange={(event) => setForm((prev) => ({ ...prev, end_date: event.target.value }))}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="End of Service Life"
          type="date"
          value={form.end_of_service_life}
          onChange={(event) => setForm((prev) => ({ ...prev, end_of_service_life: event.target.value }))}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="Durum"
          value={form.status}
          onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
        />
        <TextField
          label="Not"
          value={form.note}
          onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
          multiline
          minRows={3}
          sx={{ gridColumn: "1 / -1" }}
        />
      </>
    );
  };


  return (
    <Stack spacing={2.5} sx={{ width: "100%", maxWidth: "none" }}>
      <Snackbar
        open={Boolean(success)}
        autoHideDuration={4000}
        onClose={() => setSuccess(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity="success" onClose={() => setSuccess(null)} sx={{ width: "100%" }}>
          {success}
        </Alert>
      </Snackbar>
      <Snackbar
        open={Boolean(error)}
        autoHideDuration={5000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity="error" onClose={() => setError(null)} sx={{ width: "100%" }}>
          {error}
        </Alert>
      </Snackbar>
      <Dialog
        open={importOpen}
        onClose={() => {
          if (!importLoading && !importCommitting) {
            setImportOpen(false);
          }
        }}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>{activeTypeLabel} Excel Import</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info">
              {activeTypeLabel} için dosyayı seçip Önizle / Dry-run çalıştırın. Onayla ve Aktar demeden DB'ye kayıt yazılmaz.
            </Alert>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "stretch", sm: "center" }}>
              <Button variant="outlined" component="label">
                Excel Dosyası Seç
                <input
                  ref={importInputRef}
                  hidden
                  type="file"
                  accept=".xlsx,.xlsm"
                  onChange={(event) => {
                    const selected = event.target.files?.[0] ?? null;
                    setImportFile(selected);
                    setImportReport(null);
                  }}
                />
              </Button>
              <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                {importFile ? importFile.name : "Henüz dosya seçilmedi."}
              </Typography>
              <Button variant="contained" onClick={handlePreviewImport} disabled={!importFile || importLoading || importCommitting}>
                Önizle / Dry-run
              </Button>
            </Stack>

            {(importLoading || importCommitting) && <LinearProgress />}

            {importReport && (
              <Box>
                <Divider sx={{ my: 2 }} />
                <Typography variant="h6" fontWeight={700} gutterBottom>
                  Import Özeti
                </Typography>
                <Grid container spacing={1.5}>
                  {[
                    { label: "Okunan Satır", value: importReport.summary?.data_rows_read ?? 0 },
                    { label: "Import Edilebilir", value: importReport.summary?.importable_rows ?? 0 },
                    { label: "Hatalı", value: importReport.summary?.invalid_rows ?? 0 },
                    { label: "Duplicate", value: importReport.summary?.duplicate_rows ?? 0 },
                    { label: "Toplam Tutar", value: formatPrice(importReport.summary?.total_amount ?? null) },
                    { label: "Eklenen", value: importReport.summary?.added_rows ?? 0 },
                  ].map((item) => (
                    <Grid item xs={12} sm={6} md={4} key={item.label}>
                      <Card variant="outlined">
                        <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                          <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                          <Typography variant="h6" fontWeight={700}>{item.value}</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>

                {(importReport.missing_required_columns ?? []).length > 0 && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    Eksik zorunlu kolon: {importReport.missing_required_columns?.join(", ")}
                  </Alert>
                )}

                {renderImportRows("Hatalı Satırlar", importReport.invalid_row_preview, "error")}
                {renderImportRows("Duplicate Satırlar", importReport.duplicate_row_preview, "warning")}
                {renderImportRows("Geçerli Satır Önizleme", importReport.importable_row_preview, "info")}
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setImportOpen(false);
              resetImportModal();
            }}
            disabled={importLoading || importCommitting}
          >
            Kapat
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleConfirmImport}
            disabled={!importFile || !importReport || importCommitting || importLoading || (importReport.summary?.importable_rows ?? 0) <= 0}
          >
            Onayla ve Aktar
          </Button>
        </DialogActions>
      </Dialog>

      <Box>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", md: "center" }}
        >
          <Box>
            <Typography variant="h4" fontWeight={700} gutterBottom>
              Garanti Takibi
            </Typography>
            <Typography color="text.secondary">
              Cihaz ve bakım/hizmet garanti kayıtlarını yönetin.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              variant="contained"
              color="success"
              onClick={() => {
                setEditingItem(null);
                setForm(createEmptyForm(activeWarrantyType));
                setFormOpen(true);
                requestAnimationFrame(() => {
                  tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                });
              }}
            >
              Kayıt Ekle
            </Button>
            <Button variant="outlined" onClick={handleDownloadTemplate}>
              Şablon İndir
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                resetImportModal();
                setImportOpen(true);
              }}
            >
              Excel’den Import Et
            </Button>
          </Stack>
        </Stack>
      </Box>

      <Card variant="outlined" sx={{ p: 1.5 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "stretch", sm: "center" }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ minWidth: 90 }}>
            Seçenekler
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {typeOptions.map((option) => (
              <Button
                key={option.value}
                variant={activeWarrantyType === option.value ? "contained" : "outlined"}
                color={activeWarrantyType === option.value ? "primary" : "inherit"}
                onClick={() => {
                  setActiveWarrantyType(option.value);
                  setSelectedWarrantyFilter(null);
                  setEditingItem(null);
                  setForm(createEmptyForm(option.value));
                  setFormOpen(false);
                }}
              >
                {option.label}
              </Button>
            ))}
          </Stack>
        </Stack>
      </Card>

      <Grid container spacing={2}>
        {[
          { label: "Toplam", value: summary.total, color: "primary", filter: null },
          { label: "Yaklaşıyor", value: summary.upcoming, color: "warning", filter: "NEAR" as const },
          { label: "Süresi Dolmuş", value: summary.expired, color: "error", filter: "EXPIRED" as const },
          { label: "Bilinmiyor", value: summary.unknown, color: "grey", filter: "UNKNOWN" as const },
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

      <Grid container spacing={2} alignItems="flex-start">
        {formOpen && (
        <Grid item xs={12}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                {editingItem ? "Kaydı Güncelle" : `Yeni ${getTypeLabel(form.type)} Kaydı`}
              </Typography>
              <Box
                component="form"
                onSubmit={handleSubmit}
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
                  gap: 2
                }}
              >
                <TextField
                  select
                  label="Tip"
                  value={form.type}
                  onChange={(event) => {
                    const nextType = event.target.value as WarrantyItemType;
                    setActiveWarrantyType(nextType);
                    setForm(createEmptyForm(nextType));
                  }}
                >
                  {typeOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
                {renderFormFields()}
                <Stack
                  direction="row"
                  spacing={1}
                  justifyContent="flex-end"
                  flexWrap="wrap"
                  sx={{ gridColumn: "1 / -1", rowGap: 1 }}
                >
                  <Button
                    variant="text"
                    onClick={() => {
                      setEditingItem(null);
                      setForm(createEmptyForm(activeWarrantyType));
                      setFormOpen(false);
                    }}
                  >
                    İptal
                  </Button>
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
        )}
        <Grid item xs={12} ref={tableRef}>
          <Card variant="outlined">
            <CardContent
              sx={{
                height: { xs: 700, md: "calc(100vh - 260px)" },
                minHeight: 700,
                p: { xs: 1.5, md: 2 },
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
                spacing={1}
                sx={{ mb: 1.5 }}
              >
                <Typography variant="h6" fontWeight={600}>
                  {activeTypeLabel} Kayıtları
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Toplam {(filteredItems ?? []).length} kayıt
                </Typography>
              </Stack>
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
                <Box sx={{ width: "100%", flex: 1, minHeight: 0 }}>
                  <DataGrid
                    rows={filteredItems ?? []}
                    getRowId={(row) => row?.id}
                    columns={columns}
                    loading={loading}
                    disableRowSelectionOnClick
                    autoHeight={false}
                    density="compact"
                    pageSizeOptions={[12, 20, 30, 50, 100]}
                    initialState={{ pagination: { paginationModel: { pageSize: 12, page: 0 } } }}
                    sx={{
                      border: "none",
                      height: "100%",
                      width: "100%",
                      "& .MuiDataGrid-columnHeaders": { minHeight: 44 },
                      "& .MuiDataGrid-cell": { whiteSpace: "nowrap" },
                      "& .MuiDataGrid-main": { overflow: "hidden" },
                      "& .MuiDataGrid-virtualScroller": { overflowX: "auto" },
                      "& .MuiDataGrid-footerContainer": {
                        minHeight: 56,
                        borderTop: 1,
                        borderColor: "divider",
                        backgroundColor: "background.paper",
                      },
                      "& .MuiTablePagination-toolbar": {
                        minHeight: 52,
                        pr: 1,
                      },
                      "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": {
                        m: 0,
                        fontWeight: 600,
                      },
                      "& .MuiTablePagination-select": {
                        py: 0.5,
                      },
                      "& .sticky-actions-cell, & .sticky-actions-header": {
                        position: "sticky",
                        right: 0,
                        zIndex: 2,
                        backgroundColor: "background.paper",
                        overflow: "visible",
                        boxShadow: "-8px 0 12px -12px rgba(15, 23, 42, 0.45)"
                      },
                      "& .sticky-actions-header": {
                        zIndex: 3
                      }
                    }}
                  />
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
