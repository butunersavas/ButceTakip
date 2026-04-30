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
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import SearchIcon from "@mui/icons-material/Search";
import { DataGrid, type GridColDef, type GridPaginationModel } from "@mui/x-data-grid";
import axios from "axios";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "../../constants/pagination";

type WarrantyItemType = "WARRANTY" | "CERTIFICATE" | "CONTRACT";

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
  ssl_certificate?: string | null;
  certificate_type?: string | null;
  contract_end_date?: string | null;
  vendor_company?: string | null;
  tax_number?: string | null;
  service_type?: string | null;
  subscription_circuit_number?: string | null;
  location_name?: string | null;
  service_number?: string | null;
  speed?: string | null;
  commitment_end_date?: string | null;
  billing_account_number?: string | null;
  plan_entry_id?: number | null;
  workflow_status?: string | null;
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
  status_key?: "expired" | "warning" | "ok" | "unknown";
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
  note: string;
  issuer: string;
  renewal_responsible: string;
  reminder_days: string;
  domain: string;
  ssl_certificate: string;
  certificate_type: string;
  contract_end_date: string;
  vendor_company: string;
  tax_number: string;
  service_type: string;
  subscription_circuit_number: string;
  location_name: string;
  service_number: string;
  speed: string;
  commitment_end_date: string;
  billing_account_number: string;
  plan_entry_id: string;
  workflow_status: string;
};
type WarrantyFormMode = "create" | "edit" | "copy";

const typeOptions: Array<{ value: WarrantyItemType; label: string }> = [
  { value: "WARRANTY", label: "Garanti" },
  { value: "CERTIFICATE", label: "Sertifika" },
  { value: "CONTRACT", label: "Sözleşme" },
];

const typeSpecificFormFields: Record<WarrantyItemType, Array<keyof WarrantyItemForm>> = {
  WARRANTY: ["domain", "issuer", "renewal_responsible", "reminder_days"],
  CERTIFICATE: ["issuer", "ssl_certificate", "certificate_type", "contract_end_date", "vendor_company"],
  CONTRACT: ["vendor_company", "tax_number", "service_type", "contract_end_date", "commitment_end_date", "billing_account_number"],
};

const typeSpecificColumnFields: Record<WarrantyItemType, string[]> = {
  WARRANTY: ["name", "location", "domain", "certificate_issuer", "renewal_responsible"],
  CERTIFICATE: ["name", "location", "certificate_issuer", "ssl_certificate", "certificate_type", "vendor_company"],
  CONTRACT: ["name", "location", "vendor_company", "tax_number", "service_type", "contract_end_date"],
};

const INITIAL_FORM_STATE: WarrantyItemForm = {
  type: "WARRANTY",
  name: "",
  location: "",
  end_date: "",
  note: "",
  issuer: "",
  renewal_responsible: "",
  reminder_days: "30",
  domain: "",
  ssl_certificate: "",
  certificate_type: "",
  contract_end_date: "",
  vendor_company: "",
  tax_number: "",
  service_type: "",
  subscription_circuit_number: "",
  location_name: "",
  service_number: "",
  speed: "",
  commitment_end_date: "",
  billing_account_number: "",
  plan_entry_id: "",
  workflow_status: "Aktif",
};

const resetTypeSpecificFields = (nextType: WarrantyItemType, prevState: WarrantyItemForm): WarrantyItemForm => {
  const allowedFields = new Set(typeSpecificFormFields[nextType]);
  const nextState = { ...prevState, type: nextType };
  Object.keys(prevState).forEach((key) => {
    if (
      key !== "type" &&
      key !== "name" &&
      key !== "location" &&
      key !== "end_date" &&
      key !== "note" &&
      !allowedFields.has(key as keyof WarrantyItemForm)
    ) {
      (nextState as any)[key] = INITIAL_FORM_STATE[key as keyof WarrantyItemForm];
    }
  });
  return nextState;
};

const sanitizePayloadByType = (payload: Record<string, unknown>, type: WarrantyItemType) => {
  const allowed = new Set(typeSpecificFormFields[type]);
  const typeSpecificKeys = [
    "domain",
    "issuer",
    "renewal_responsible",
    "ssl_certificate",
    "certificate_type",
    "contract_end_date",
    "vendor_company",
    "tax_number",
    "service_type",
    "subscription_circuit_number",
    "location_name",
    "service_number",
    "speed",
    "commitment_end_date",
    "billing_account_number",
    "reminder_days",
  ];
  typeSpecificKeys.forEach((key) => {
    if (!allowed.has(key as keyof WarrantyItemForm)) {
      payload[key] = null;
    }
  });
  return payload;
};

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
  if (daysLeft <= 0) return { label: "Süresi Geçti", key: "expired" as const };
  if (daysLeft <= 30) return { label: "Yakında Yenile", key: "warning" as const };
  return { label: "Aktif", key: "ok" as const };
};

const mapStatusKey = (status?: string | null) => {
  const normalized = status?.toLowerCase?.() ?? "";
  if (normalized.includes("süresi geçti")) return "expired" as const;
  if (normalized.includes("yakında yenile") || normalized.includes("kritik")) return "warning" as const;
  if (normalized.includes("aktif")) return "ok" as const;
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
  if (value === "WARRANTY" || value === "DEVICE" || value === "MAINTENANCE" || value === "SERVICE" || value === "LICENSE" || value === "DOMAIN_SSL") return "Garanti";
  if (value === "CERTIFICATE") return "Sertifika";
  if (value === "CONTRACT") return "Sözleşme";
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

const normalizeWarrantyType = (value: unknown): WarrantyItemType => {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "CERTIFICATE") return "CERTIFICATE";
  if (normalized === "CONTRACT") return "CONTRACT";
  return "WARRANTY";
};

const normalizeWarrantyRow = (row: any): WarrantyItem => {
  const start = row?.start_date ?? row?.startDate ?? null;
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
  const certificateIssuerRaw =
    row?.certificate_issuer ?? row?.issuer ?? row?.certificateIssuer ?? "-";
  const issuerRaw = row?.issuer ?? row?.certificate_issuer ?? row?.certificateIssuer ?? null;
  const domainRaw = row?.domain ?? "-";
  const renewalResponsibleRaw =
    row?.renewal_responsible ?? row?.renewal_owner ?? row?.renewalResponsible ?? "-";
  const noteRaw = row?.note ?? "-";
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
    type: normalizeWarrantyType(row?.type ?? row?.device_type ?? row?.asset_type),
    start_date: start,
    end_date: end,
    days_left,
    status_label: status.label,
    status_key: status.key,
    type_label: formatTypeLabel(row?.type),
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
    plan_entry_id: row?.plan_entry_id ?? null,
    workflow_status: row?.workflow_status ?? "Aktif",
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
  const [formMode, setFormMode] = useState<WarrantyFormMode>("create");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const tableRef = useRef<HTMLDivElement | null>(null);
  const hasLoggedWarrantyResponse = useRef(false);
  const [selectedWarrantyFilter, setSelectedWarrantyFilter] = useState<
    "CRITICAL" | "NEAR" | "EXPIRED" | null
  >(null);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<WarrantyItemType | "ALL">("ALL");
  const [form, setForm] = useState<WarrantyItemForm>(INITIAL_FORM_STATE);

  const isWarrantyType = form.type === "WARRANTY";
  const isCertificateType = form.type === "CERTIFICATE";
  const isContractType = form.type === "CONTRACT";
  const nameLabel = isWarrantyType ? "Cihaz / Ürün Adı" : isCertificateType ? "Sertifika Adı" : "Sözleşme Adı";
  const locationLabel = "Lokasyon";
  const endDateLabel = isContractType
    ? "Sözleşme Bitiş Tarihi"
    : isCertificateType
      ? "Sertifika Bitiş Tarihi"
      : "Garanti Bitiş Tarihi";
  const handleExportXlsx = useCallback(() => {
    const exportFile = async () => {
      try {
        const response = await client.get<Blob>("/warranty-items/export/xlsx", {
          responseType: "blob"
        });
        const blobUrl = URL.createObjectURL(response.data);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = "garanti-takibi.xlsx";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(blobUrl);
      } catch (_error) {
        setError("Excel dışa aktarma başarısız oldu.");
      }
    };
    void exportFile();
  }, [client]);

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
  }, [client]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const typeFilteredItems = useMemo(() => {
    if (selectedTypeFilter === "ALL") {
      return items;
    }
    return items.filter((item) => item.type === selectedTypeFilter);
  }, [items, selectedTypeFilter]);

  const summary = useMemo(() => {
    const totals = {
      total: typeFilteredItems.length,
      warning: 0,
      expired: 0,
    };
    typeFilteredItems.forEach((item) => {
      const daysLeft = item.days_left ?? calcDaysLeft(item.end_date);
      if (daysLeft === null) {
        return;
      }
      if (daysLeft <= 0) {
        totals.expired += 1;
      } else if (daysLeft <= 30) {
        totals.warning += 1;
      }
    });
    return totals;
  }, [typeFilteredItems]);

  const statusFilteredItems = useMemo(() => {
    if (!selectedWarrantyFilter) return typeFilteredItems;
    if (selectedWarrantyFilter === "CRITICAL") {
      return typeFilteredItems.filter((item) => item.status_key === "warning");
    }
    if (selectedWarrantyFilter === "NEAR") {
      return typeFilteredItems.filter((item) => item.status_key === "warning");
    }
    return typeFilteredItems.filter((item) => item.status_key === "expired");
  }, [typeFilteredItems, selectedWarrantyFilter]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchText.trim().toLocaleLowerCase("tr-TR");
    if (!normalizedSearch) {
      return statusFilteredItems;
    }
    return statusFilteredItems.filter((item) => {
      const fields = [
        item.name,
        item.vendor_company,
        item.location,
        item.location_name,
        item.type_label,
        item.status_label,
        item.tax_number,
        item.service_number,
        item.subscription_circuit_number,
        item.billing_account_number,
        item.ssl_certificate,
        item.service_type,
        item.note,
      ];
      return fields.some((field) =>
        String(field ?? "")
          .toLocaleLowerCase("tr-TR")
          .includes(normalizedSearch)
      );
    });
  }, [searchText, statusFilteredItems]);

  const activeFilterLabel = useMemo(() => {
    if (!selectedWarrantyFilter) return null;
    if (selectedWarrantyFilter === "CRITICAL") return "Yakında Yenile";
    if (selectedWarrantyFilter === "NEAR") return "Yakında Yenile";
    return "Süresi Geçti";
  }, [selectedWarrantyFilter]);

  useEffect(() => {
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
  }, [searchText, selectedWarrantyFilter, selectedTypeFilter]);

  const populateFormFromItem = useCallback(
    (item: WarrantyItem, mode: WarrantyFormMode): WarrantyItemForm => ({
      type: item.type || "WARRANTY",
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
      ssl_certificate: item.ssl_certificate ?? "",
      certificate_type: item.certificate_type ?? "",
      contract_end_date: normalizeDateInput(item.contract_end_date) ?? "",
      vendor_company: item.vendor_company ?? "",
      tax_number: item.tax_number ?? "",
      service_type: item.service_type ?? "",
      subscription_circuit_number: item.subscription_circuit_number ?? "",
      location_name: item.location_name ?? "",
      service_number: item.service_number ?? "",
      speed: item.speed ?? "",
      commitment_end_date: normalizeDateInput(item.commitment_end_date) ?? "",
      billing_account_number: item.billing_account_number ?? "",
      plan_entry_id: mode === "edit" && item.plan_entry_id != null ? String(item.plan_entry_id) : "",
      workflow_status: item.workflow_status ?? "Aktif",
    }),
    []
  );

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
      const normalizedPlanEntryId = Number(form.plan_entry_id);
      const parsedPlanEntryId =
        form.plan_entry_id.trim() && Number.isFinite(normalizedPlanEntryId) && normalizedPlanEntryId > 0
          ? normalizedPlanEntryId
          : null;
      const payload = sanitizePayloadByType({
        type: form.type,
        name: form.name.trim(),
        location: form.location.trim(),
        domain: form.domain.trim() || null,
        end_date: normalizedEndDate,
        note: form.note.trim() || null,
        issuer: form.issuer.trim() || null,
        renewal_responsible: form.renewal_responsible.trim() || null,
        reminder_days: Number.isFinite(reminderValue) ? reminderValue : null,
        ssl_certificate: form.ssl_certificate.trim() || null,
        certificate_type: form.certificate_type.trim() || null,
        contract_end_date: normalizeDateInput(form.contract_end_date) || null,
        vendor_company: form.vendor_company.trim() || null,
        tax_number: form.tax_number.trim() || null,
        service_type: form.service_type.trim() || null,
        subscription_circuit_number: form.subscription_circuit_number.trim() || null,
        location_name: form.location_name.trim() || null,
        service_number: form.service_number.trim() || null,
        speed: form.speed.trim() || null,
        commitment_end_date: normalizeDateInput(form.commitment_end_date) || null,
        billing_account_number: form.billing_account_number.trim() || null,
        plan_entry_id: parsedPlanEntryId,
        workflow_status: form.workflow_status.trim() || "Aktif",
      }, form.type);
      delete (payload as { id?: unknown }).id;
      if (parsedPlanEntryId == null) {
        delete (payload as { plan_entry_id?: unknown }).plan_entry_id;
      }

      if (formMode === "edit" && editingItem) {
        await client.put(`/warranty-items/${editingItem.id}`, payload);
        setSuccess("Garanti kaydı güncellendi.");
      } else {
        await client.post("/warranty-items", payload);
        setSuccess(formMode === "copy" ? "Kayıt kopyalanarak oluşturuldu." : "Garanti kaydı eklendi.");
      }

      setForm(INITIAL_FORM_STATE);
      setEditingItem(null);
      setFormMode("create");
      setIsFormOpen(false);
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
    setFormMode("edit");
    setEditingItem(item);
    setIsFormOpen(true);
    setForm(populateFormFromItem(item, "edit"));
  }, [populateFormFromItem]);

  const handleCopy = useCallback((item: WarrantyItem) => {
    setFormMode("copy");
    setEditingItem(null);
    setIsFormOpen(true);
    setForm(populateFormFromItem(item, "copy"));
  }, [populateFormFromItem]);

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
        setFormMode("create");
        setForm(INITIAL_FORM_STATE);
        setIsFormOpen(false);
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
    () => {
      const activeType = selectedTypeFilter === "ALL" ? null : selectedTypeFilter;
      const typeFields = activeType ? typeSpecificColumnFields[activeType] : null;
      const shouldShow = (field: string) => !typeFields || typeFields.includes(field);
      return [
      
      {
        field: "type",
        headerName: "Tip",
        flex: 0.7,
        valueGetter: (_value, row) => {
          const r = row as any;
          return formatTypeLabel(r?.type);
        },
      },
      { field: "name", headerName: "Ad", flex: 1.2 },
      { field: "location", headerName: "Lokasyon", flex: 1 },
      {
        field: "certificate_issuer",
        headerName: "Sertifika Sağlayıcı",
        flex: 1,
        valueGetter: (_value, row) => {
          const r = row as any;
          const value = r?.certificate_issuer ?? r?.issuer ?? r?.certificateIssuer ?? "-";
          return toDisplayText(value);
        },
      },
      {
        field: "domain",
        headerName: "Domain",
        flex: 1,
        valueGetter: (_value, row) => {
          const r = row as any;
          const value = r?.domain ?? "-";
          return toDisplayText(value);
        },
      },
      {
        field: "renewal_responsible",
        headerName: "Yenileme Sorumlusu",
        flex: 1,
        valueGetter: (_value, row) => {
          const r = row as any;
          const value =
            r?.renewal_responsible ?? r?.renewal_owner ?? r?.renewalResponsible ?? "-";
          return toDisplayText(value);
        },
      },
      {
        field: "service_type",
        headerName: "Hizmet Türü",
        flex: 1,
        valueGetter: (_value, row) => toDisplayText((row as any)?.service_type ?? "-"),
      },
      {
        field: "service_number",
        headerName: "Hizmet No",
        flex: 0.8,
        valueGetter: (_value, row) => toDisplayText((row as any)?.service_number ?? "-"),
      },
      {
        field: "location_name",
        headerName: "Lokasyon Adı",
        flex: 1,
        valueGetter: (_value, row) => toDisplayText((row as any)?.location_name ?? "-"),
      },
      {
        field: "speed",
        headerName: "Hız",
        flex: 0.7,
        valueGetter: (_value, row) => toDisplayText((row as any)?.speed ?? "-"),
      },
      {
        field: "billing_account_number",
        headerName: "Fatura Hesap No",
        flex: 1,
        valueGetter: (_value, row) => toDisplayText((row as any)?.billing_account_number ?? "-"),
      },
      {
        field: "ssl_certificate",
        headerName: "SSL Sertifikası",
        flex: 1,
        valueGetter: (_value, row) => toDisplayText((row as any)?.ssl_certificate ?? "-"),
      },
      {
        field: "certificate_type",
        headerName: "Sertifika Türü",
        flex: 1,
        valueGetter: (_value, row) => toDisplayText((row as any)?.certificate_type ?? "-"),
      },
      {
        field: "vendor_company",
        headerName: "Firma",
        flex: 1,
        valueGetter: (_value, row) => toDisplayText((row as any)?.vendor_company ?? "-"),
      },
      {
        field: "tax_number",
        headerName: "VKN",
        flex: 0.8,
        valueGetter: (_value, row) => toDisplayText((row as any)?.tax_number ?? "-"),
      },
      {
        field: "contract_end_date",
        headerName: "Sözleşme Bitiş",
        flex: 0.9,
        valueGetter: (_value, row) => formatDate((row as any)?.contract_end_date ?? null),
      },
      {
        field: "end_date",
        headerName: "Garanti/Sertifika/Sözleşme Bitiş",
        flex: 0.9,
        valueGetter: (_value, row) => {
          const r = row as any;
          const value = r?.end_date ?? r?.endDate ?? r?.expiration_date ?? "-";
          return formatDate(value);
        },
      },
      {
        field: "updated_at",
        headerName: "Son Güncelleme",
        flex: 0.9,
        valueGetter: (_value, row) => {
          const r = row as any;
          return formatDate(r?.updated_at ?? r?.updatedAt ?? null);
        },
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
              : statusKey === "warning"
                ? { color: "error" as const }
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
        valueGetter: (_value, row) => {
          const r = row as any;
          const value = r?.created_by_name ?? r?.createdByName ?? "-";
          return toDisplayText(value);
        },
      },
      {
        field: "updated_by_name",
        headerName: "Son Güncelleyen",
        flex: 1,
        valueGetter: (_value, row) => {
          const r = row as any;
          const value = r?.updated_by_name ?? r?.updatedByName ?? "-";
          return toDisplayText(value);
        },
      },
      {
        field: "note",
        headerName: "Not",
        flex: 1.2,
        sortable: false,
        valueGetter: (_value, row) => {
          const r = row as any;
          const value = r?.note ?? "-";
          return toDisplayText(value);
        },
      },
      {
        field: "actions",
        headerName: "İşlemler",
        width: 150,
        minWidth: 150,
        sortable: false,
        renderCell: (params) => {
          if (!params?.row) return null;
          return (
            <Stack direction="row" spacing={0.5} sx={{ minWidth: 120, flexWrap: "nowrap" }}>
              <IconButton size="small" onClick={() => handleEdit(params.row)}>
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => handleCopy(params.row)}>
                <ContentCopyOutlinedIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" color="error" onClick={() => handleDelete(params.row)}>
                <DeleteOutlineOutlinedIcon fontSize="small" />
              </IconButton>
            </Stack>
          );
        },
      },
    ].filter((column) => {
      const alwaysVisible = new Set([
        "type",
        "end_date",
        "updated_at",
        "days_left",
        "status",
        "created_by_name",
        "updated_by_name",
        "note",
        "actions",
      ]);
      return alwaysVisible.has(column.field) || shouldShow(column.field);
    });
  },
    [handleCopy, handleDelete, handleEdit, selectedTypeFilter]
  );

  const tableMinWidth = useMemo(() => {
    const calculatedWidth = columns.reduce((total, column) => {
      if (typeof column.width === "number") return total + column.width;
      if (typeof column.minWidth === "number") return total + column.minWidth;
      if (typeof column.flex === "number") return total + Math.round(column.flex * 160);
      return total + 140;
    }, 0);
    return Math.max(calculatedWidth, 1400);
  }, [columns]);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Garanti Takibi
        </Typography>
        <Typography color="text.secondary">
          Cihaz, bakım, hizmet ve lisans garanti kayıtlarını yönetin.
        </Typography>
        <Button
          variant="contained"
          sx={{ mt: 2 }}
          onClick={() => {
            setError(null);
            setSuccess(null);
            setEditingItem(null);
            setFormMode("create");
            setForm(INITIAL_FORM_STATE);
            setIsFormOpen(true);
          }}
        >
          Yeni Garanti Kaydı
        </Button>
        <Button variant="outlined" sx={{ mt: 2, ml: 1 }} startIcon={<DownloadIcon />} onClick={handleExportXlsx}>
          Excel Dışa Aktar
        </Button>
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <TextField
            select
            label="Garanti Tipi"
            value={selectedTypeFilter}
            onChange={(event) => setSelectedTypeFilter(event.target.value as WarrantyItemType | "ALL")}
            fullWidth
          >
            <MenuItem value="ALL">Tüm Tipler</MenuItem>
            {typeOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
      </Grid>

      <Grid container spacing={2} alignItems="stretch">
        {[
          { label: "Toplam", value: summary.total, color: "primary", filter: null },
          { label: "Yakında Yenile", value: summary.warning, color: "warning", filter: "CRITICAL" as const },
          { label: "Süresi Geçti", value: summary.expired, color: "grey", filter: "EXPIRED" as const },
        ].map((item) => {
          const isSelected = selectedWarrantyFilter === item.filter;
          return (
            <Grid item xs={12} sm={6} md={3} key={item.label} sx={{ display: "flex" }}>
              <Card
                variant="outlined"
                sx={{
                  width: "100%",
                  height: "100%",
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
                  <CardContent sx={{ minHeight: 112, display: "flex", flexDirection: "column", justifyContent: "center" }}>
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
        <Grid item xs={12} ref={tableRef}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Garanti Kayıtları
              </Typography>
              <TextField
                fullWidth
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Garanti kayıtlarında ara..."
                sx={{ mb: 2 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
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
                <Alert severity="info">
                  {searchText.trim() ? "Aramanızla eşleşen kayıt bulunamadı." : "Henüz garanti kaydı yok."}
                </Alert>
              ) : (
                <Box
                  sx={{
                    width: "100%",
                    overflowX: "auto",
                    overflowY: "hidden",
                    pb: 0.5,
                    "&::-webkit-scrollbar": { height: 10 },
                    "&::-webkit-scrollbar-thumb": {
                      backgroundColor: "rgba(120,120,120,0.45)",
                      borderRadius: 8,
                    },
                  }}
                >
                  <Box sx={{ minWidth: tableMinWidth }}>
                    <DataGrid
                      rows={filteredItems ?? []}
                      getRowId={(row) => row?.id}
                      columns={columns}
                      loading={loading}
                      disableRowSelectionOnClick
                      autoHeight
                      pageSizeOptions={PAGE_SIZE_OPTIONS}
                      paginationModel={paginationModel}
                      onPaginationModelChange={setPaginationModel}
                      sx={{
                        border: "none",
                        minWidth: tableMinWidth,
                        "& .MuiDataGrid-cell": { py: 1 },
                        "& .MuiDataGrid-cell:focus, & .MuiDataGrid-columnHeader:focus": { outline: "none" },
                      }}
                    />
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Dialog open={isFormOpen} onClose={() => setIsFormOpen(false)} fullWidth maxWidth="md">
          <DialogTitle>
            {formMode === "edit"
              ? "Kaydı Güncelle"
              : formMode === "copy"
                ? "Garanti Kaydını Kopyala"
                : "Yeni Garanti Kaydı"}
          </DialogTitle>
          <Box component="form" onSubmit={handleSubmit}>
            <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <TextField
                    select
                    label="Tip"
                    value={form.type}
                    onChange={(event) =>
                      setForm((prev) => resetTypeSpecificFields(event.target.value as WarrantyItemType, prev))
                    }
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
                  {isWarrantyType && (
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
                  {isCertificateType && (
                    <>
                      <TextField
                        label="Sertifika Sağlayıcı"
                        value={form.issuer}
                        onChange={(event) => setForm((prev) => ({ ...prev, issuer: event.target.value }))}
                      />
                      <TextField
                        label="SSL Sertifikası"
                        value={form.ssl_certificate}
                        onChange={(event) => setForm((prev) => ({ ...prev, ssl_certificate: event.target.value }))}
                      />
                      <TextField
                        label="Sertifika Türü"
                        value={form.certificate_type}
                        onChange={(event) => setForm((prev) => ({ ...prev, certificate_type: event.target.value }))}
                      />
                      <TextField
                        label="Sözleşme Bitiş Tarihi"
                        type="date"
                        value={form.contract_end_date}
                        onChange={(event) => setForm((prev) => ({ ...prev, contract_end_date: event.target.value }))}
                        InputLabelProps={{ shrink: true }}
                      />
                      <TextField
                        label="Firma"
                        value={form.vendor_company}
                        onChange={(event) => setForm((prev) => ({ ...prev, vendor_company: event.target.value }))}
                      />
                    </>
                  )}
                  {isContractType && (
                    <>
                      <TextField label="VKN" value={form.tax_number} onChange={(event) => setForm((prev) => ({ ...prev, tax_number: event.target.value }))} />
                      <TextField label="Hizmet Türü" value={form.service_type} onChange={(event) => setForm((prev) => ({ ...prev, service_type: event.target.value }))} />
                      <TextField label="Abonelik Devre Numarası" value={form.subscription_circuit_number} onChange={(event) => setForm((prev) => ({ ...prev, subscription_circuit_number: event.target.value }))} />
                      <TextField label="Lokasyon Adı" value={form.location_name} onChange={(event) => setForm((prev) => ({ ...prev, location_name: event.target.value }))} />
                      <TextField label="Hizmet No" value={form.service_number} onChange={(event) => setForm((prev) => ({ ...prev, service_number: event.target.value }))} />
                      <TextField label="Hız" value={form.speed} onChange={(event) => setForm((prev) => ({ ...prev, speed: event.target.value }))} />
                      <TextField
                        label="Taahhüt Bitiş Tarihi"
                        type="date"
                        value={form.commitment_end_date}
                        onChange={(event) => setForm((prev) => ({ ...prev, commitment_end_date: event.target.value }))}
                        InputLabelProps={{ shrink: true }}
                      />
                      <TextField label="Fatura Hesap No" value={form.billing_account_number} onChange={(event) => setForm((prev) => ({ ...prev, billing_account_number: event.target.value }))} />
                    </>
                  )}
                  <TextField
                    label={endDateLabel}
                    type="date"
                    value={form.end_date}
                    onChange={(event) => setForm((prev) => ({ ...prev, end_date: event.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    required
                  />
                  <TextField
                    label="Plan Kaydı ID (opsiyonel)"
                    type="number"
                    value={form.plan_entry_id}
                    onChange={(event) => setForm((prev) => ({ ...prev, plan_entry_id: event.target.value }))}
                    inputProps={{ min: 1, step: 1 }}
                  />
                  <TextField
                    select
                    label="Garanti Durumu"
                    value={form.workflow_status}
                    onChange={(event) => setForm((prev) => ({ ...prev, workflow_status: event.target.value }))}
                  >
                    <MenuItem value="Aktif">Aktif</MenuItem>
                    <MenuItem value="Tamamlandı">Tamamlandı</MenuItem>
                    <MenuItem value="Beklemede">Beklemede</MenuItem>
                  </TextField>
                  <TextField
                    label="Not"
                    value={form.note}
                    onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
                    multiline
                    minRows={3}
                  />
                {error && <Alert severity="error">{error}</Alert>}
              </DialogContent>
              <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button
                  variant="text"
                  onClick={() => {
                    setEditingItem(null);
                    setFormMode("create");
                    setForm(INITIAL_FORM_STATE);
                    setIsFormOpen(false);
                  }}
                >
                  İptal
                </Button>
                <Button variant="contained" type="submit" disabled={submitting}>
                  {formMode === "edit" ? "Güncelle" : "Kaydet"}
                </Button>
              </DialogActions>
            </Box>
          </Dialog>
      </Grid>
      {success && <Alert severity="success">{success}</Alert>}
    </Stack>
  );
}
