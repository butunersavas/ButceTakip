import {
  Add as AddIcon,
  ArrowBack as ArrowBackIcon,
  CheckCircleOutline as CompleteIcon,
  DeleteOutline as DeleteIcon,
  EditOutlined as EditIcon,
  SaveOutlined as SaveIcon,
} from "@mui/icons-material";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import { formatCurrency } from "../../utils/currency";
import useSortableRows from "../../hooks/useSortableRows";

const months = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

type PreparationStatus = "DRAFT" | "ACTIVE";
type DistributionMethod = "SINGLE_MONTH" | "EQUAL" | "CUSTOM";

interface Allocation {
  id?: number;
  year: number;
  month: number;
  amount: number;
}

interface PreparationItem {
  id: number;
  preparation_id: number;
  budget_name: string;
  budget_code: string;
  total_amount: number;
  currency: string;
  capex_opex: "CAPEX" | "OPEX" | null;
  department: string | null;
  map_attribute: string | null;
  description: string | null;
  distribution_method: DistributionMethod;
  single_month: number | null;
  start_year: number | null;
  start_month: number | null;
  month_count: number | null;
  is_carryover: boolean;
  allocations: Allocation[];
  allocated_amount: number;
  remaining_amount: number;
  is_complete: boolean;
  validation_errors: string[];
}

interface Preparation {
  id: number;
  year: number;
  name: string;
  currency: string;
  note: string | null;
  status: PreparationStatus;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  activated_scenario_id: number | null;
  item_count: number;
  total_budget: number;
  incomplete_item_count: number;
  capex_total: number;
  opex_total: number;
  items: PreparationItem[];
}

interface Metadata {
  departments: string[];
  attributes: string[];
}

interface CompletionIssue {
  item_id?: number;
  budget_code?: string;
  message: string;
}

interface CompletionResponse {
  scenario_id: number;
  created_plan_entries: number;
}

type SaveSource = "auto" | "manual";
type Feedback = { severity: "success" | "error"; message: string };

interface ItemFormState {
  id?: number;
  budget_name: string;
  total_amount: string;
  capex_opex: "" | "CAPEX" | "OPEX";
  department: string;
  map_attribute: string;
  description: string;
  distribution_method: DistributionMethod;
  single_month: number | "";
  start_month: number | "";
  month_count: number | "";
  allocations: string[];
}

const emptyItemForm = (): ItemFormState => ({
  budget_name: "",
  total_amount: "",
  capex_opex: "",
  department: "",
  map_attribute: "",
  description: "",
  distribution_method: "CUSTOM",
  single_month: "",
  start_month: 1,
  month_count: 12,
  allocations: Array(12).fill(""),
});

function parseAmount(value: string): number {
  const raw = value.trim().replace(/\s/g, "");
  let normalized = raw;
  if (raw.includes(",") && raw.includes(".")) {
    const decimalSeparator = raw.lastIndexOf(",") > raw.lastIndexOf(".") ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    normalized = raw.split(thousandsSeparator).join("").replace(decimalSeparator, ".");
  } else if (raw.includes(",")) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (raw.includes(".")) {
    const decimalDigits = raw.length - raw.lastIndexOf(".") - 1;
    normalized = decimalDigits <= 2 ? raw : raw.replace(/\./g, "");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusLabel(status: PreparationStatus) {
  return status === "ACTIVE" ? "AKTİF" : "TASLAK";
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}

const validationFieldLabels: Record<string, string> = {
  allocations: "Aylık dağıtım",
  budget_code: "Bütçe kalemi",
  budget_name: "Bütçe kalemi",
  capex_opex: "CAPEX / OPEX",
  department: "Departman",
  map_attribute: "Nitelik",
  name: "Bütçe adı",
  note: "Açıklama / Not",
  total_amount: "Toplam tutar",
  year: "Bütçe yılı",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validationLocation(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .filter((part) => !["body", "query", "path"].includes(String(part)))
    .map((part) => validationFieldLabels[String(part)] ?? String(part))
    .join(" / ");
}

function turkishValidationMessage(message: string): string {
  const normalized = message.trim().toLocaleLowerCase("en-US");
  if (normalized === "field required") return "Bu alan zorunludur.";
  if (normalized.includes("valid integer")) return "Geçerli bir tam sayı girin.";
  if (normalized.includes("valid number") || normalized.includes("valid float")) return "Geçerli bir sayı girin.";
  if (normalized.includes("not an allowed value")) return "İzin verilen değerlerden birini seçin.";
  if (normalized.includes("valid list")) return "Geçerli bir liste girin.";
  if (normalized.includes("greater than")) return "Sıfırdan büyük bir değer girin.";
  if (normalized.includes("string should have at least") || normalized.includes("too short")) return "Girilen metin çok kısa.";
  return message;
}

function readableDetail(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const messages = value.map(readableDetail).filter((message): message is string => Boolean(message));
    return messages.length ? messages.join(" • ") : null;
  }
  if (!isRecord(value)) return null;

  const directMessage = readableDetail(value.message) ?? readableDetail(value.msg);
  const location = validationLocation(value.loc);
  if (directMessage) {
    const localizedMessage = value.loc ? turkishValidationMessage(directMessage) : directMessage;
    return location ? `${location}: ${localizedMessage}` : localizedMessage;
  }

  return readableDetail(value.errors) ?? readableDetail(value.detail);
}

function apiErrorMessage(error: unknown, fallback: string): string {
  const responseData = isRecord(error) && isRecord(error.response) ? error.response.data : undefined;
  if (!isRecord(responseData)) return fallback;
  return readableDetail(responseData.detail) ?? readableDetail(responseData.message) ?? fallback;
}

function completionIssues(error: unknown): CompletionIssue[] {
  const responseData = isRecord(error) && isRecord(error.response) ? error.response.data : undefined;
  const detail = isRecord(responseData) ? responseData.detail : undefined;
  const candidates = isRecord(detail) && Array.isArray(detail.errors)
    ? detail.errors
    : Array.isArray(detail) ? detail : [detail];
  const issues = candidates.flatMap((candidate): CompletionIssue[] => {
    if (!isRecord(candidate)) {
      const message = readableDetail(candidate);
      return message ? [{ message }] : [];
    }
    const message = readableDetail(candidate);
    if (!message) return [];
    return [{
      item_id: typeof candidate.item_id === "number" ? candidate.item_id : undefined,
      budget_code: typeof candidate.budget_code === "string" ? candidate.budget_code : undefined,
      message,
    }];
  });
  return issues.length ? issues : [{ message: apiErrorMessage(error, "Bütçe tamamlanamadı.") }];
}

export default function BudgetPreparationView() {
  const { preparationId } = useParams();
  const id = preparationId ? Number(preparationId) : null;
  return id ? <PreparationDetail preparationId={id} /> : <PreparationList />;
}

function PreparationList() {
  const client = useAuthorizedClient();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isViewer = ["viewer", "readonly", "read_only"].includes(String(user?.role ?? "").toLowerCase());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newYear, setNewYear] = useState(new Date().getFullYear() + 1);
  const [newName, setNewName] = useState("");
  const [newNote, setNewNote] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Preparation | null>(null);
  const [deleteFeedback, setDeleteFeedback] = useState<Feedback | null>(null);

  const preparationsQuery = useQuery<Preparation[]>({
    queryKey: ["budget-preparations", search, statusFilter, yearFilter],
    queryFn: async () => {
      const { data } = await client.get<Preparation[]>("/budget-preparations", {
        params: {
          search: search || undefined,
          status: statusFilter || undefined,
          year: yearFilter || undefined,
        },
      });
      return data;
    },
  });

  const sameYearPreparationsQuery = useQuery<Preparation[]>({
    queryKey: ["budget-preparations", "same-year-warning", newYear],
    queryFn: async () => (await client.get<Preparation[]>("/budget-preparations", { params: { year: newYear } })).data,
    enabled: createOpen && Number.isInteger(newYear),
  });

  const sameYearPreparations = sameYearPreparationsQuery.data ?? [];
  const sameYearDraftCount = sameYearPreparations.filter((preparation) => preparation.status === "DRAFT").length;
  const sameYearActiveCount = sameYearPreparations.filter((preparation) => preparation.status === "ACTIVE").length;

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await client.post<Preparation>("/budget-preparations", {
        year: newYear,
        name: newName,
        currency: "USD",
        note: newNote || null,
      });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["budget-preparations"] });
      setCreateOpen(false);
      navigate(`/budget-preparation/${data.id}`);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async (preparationId: number) => client.delete(`/budget-preparations/${preparationId}`),
    onSuccess: async () => {
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["budget-preparations"] });
      setDeleteFeedback({ severity: "success", message: "Bütçe çalışması silindi." });
    },
    onError: (error) => setDeleteFeedback({
      severity: "error",
      message: apiErrorMessage(error, "Bütçe çalışması silinemedi."),
    }),
  });

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={2}>
        <Box>
          <Typography variant="h4" fontWeight={800}>Bütçe Hazırlama</Typography>
          <Typography color="text.secondary">Yeni bütçe yıllarını taslak olarak hazırlayın ve kontrollerden sonra aktifleştirin.</Typography>
        </Box>
        {!isViewer && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>Yeni Bütçe</Button>}
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <TextField fullWidth label="Bütçe adı ara" value={search} onChange={(event) => setSearch(event.target.value)} />
          <TextField label="Yıl" type="number" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} sx={{ minWidth: 140 }} />
          <FormControl sx={{ minWidth: 160 }}>
            <InputLabel>Durum</InputLabel>
            <Select label="Durum" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <MenuItem value="">Tümü</MenuItem>
              <MenuItem value="DRAFT">TASLAK</MenuItem>
              <MenuItem value="ACTIVE">AKTİF</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      {preparationsQuery.isError && <Alert severity="error">Bütçe taslakları alınamadı.</Alert>}
      <Grid container spacing={2}>
        {(preparationsQuery.data ?? []).map((preparation) => (
          <Grid item xs={12} md={6} xl={4} key={preparation.id}>
            <Card variant="outlined" elevation={0} sx={{ height: "100%", borderRadius: 3, cursor: "pointer" }} onClick={() => navigate(`/budget-preparation/${preparation.id}`)}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" gap={2}>
                  <Box>
                    <Typography variant="h6" fontWeight={750}>{preparation.name}</Typography>
                    <Typography color="text.secondary">{preparation.year} · {preparation.currency}</Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5} alignItems="flex-start">
                    <Chip label={statusLabel(preparation.status)} color={preparation.status === "ACTIVE" ? "success" : "warning"} />
                    {!isViewer && preparation.status === "DRAFT" && <Tooltip title="Bütçe çalışmasını sil">
                      <IconButton
                        aria-label={`${preparation.name} bütçe çalışmasını sil`}
                        color="error"
                        disabled={deleteMutation.isPending}
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteFeedback(null);
                          setDeleteTarget(preparation);
                        }}
                      ><DeleteIcon /></IconButton>
                    </Tooltip>}
                  </Stack>
                </Stack>
                <Grid container spacing={2} sx={{ mt: 1 }}>
                  <Grid item xs={6}><Typography variant="caption" color="text.secondary">Kalem</Typography><Typography fontWeight={700}>{preparation.item_count}</Typography></Grid>
                  <Grid item xs={6}><Typography variant="caption" color="text.secondary">Toplam</Typography><Typography fontWeight={700}>{formatCurrency(preparation.total_budget)}</Typography></Grid>
                  <Grid item xs={6}><Typography variant="caption" color="text.secondary">Eksik Kalem</Typography><Typography fontWeight={700} color={preparation.incomplete_item_count ? "error.main" : "success.main"}>{preparation.incomplete_item_count}</Typography></Grid>
                  <Grid item xs={6}><Typography variant="caption" color="text.secondary">Son Güncelleme</Typography><Typography variant="body2">{formatDate(preparation.updated_at)}</Typography></Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
      {!preparationsQuery.isLoading && !(preparationsQuery.data?.length) && <Alert severity="info">Filtrelere uygun bütçe taslağı bulunamadı.</Alert>}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Yeni Bütçe Oluştur</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Bütçe Yılı" type="number" value={newYear} onChange={(event) => setNewYear(Number(event.target.value))} />
            <TextField required label="Bütçe Adı" value={newName} onChange={(event) => setNewName(event.target.value)} />
            <TextField label="Para Birimi" value="USD" disabled />
            <TextField label="Açıklama / Not" multiline minRows={3} value={newNote} onChange={(event) => setNewNote(event.target.value)} />
            {sameYearPreparations.length > 0 && <Alert severity="warning">
              {newYear} yılı için {sameYearDraftCount ? `${sameYearDraftCount} taslak` : ""}{sameYearDraftCount && sameYearActiveCount ? " ve " : ""}{sameYearActiveCount ? `${sameYearActiveCount} aktif` : ""} bütçe zaten mevcut. Scenario yapısı nedeniyle yeni bütçe oluşturabilirsiniz; doğru bütçeyle çalıştığınızdan emin olun.
            </Alert>}
            {createMutation.isError && <Alert severity="error">{apiErrorMessage(createMutation.error, "Bütçe taslağı oluşturulamadı.")}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>İptal</Button>
          <Button variant="contained" disabled={!newName.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>Oluştur</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(deleteTarget)} onClose={() => !deleteMutation.isPending && setDeleteTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Bütçe Çalışmasını Sil</DialogTitle>
        <DialogContent dividers>
          <Typography>
            “{deleteTarget?.name}” adlı taslak bütçe çalışması ve içindeki bütçe kalemleri kalıcı olarak silinecek.
          </Typography>
          <Typography sx={{ mt: 2 }} fontWeight={700}>Bu işlem geri alınamaz.</Typography>
          <Typography sx={{ mt: 2 }}>Devam etmek istiyor musunuz?</Typography>
          {deleteMutation.isError && deleteFeedback?.severity === "error" && <Alert severity="error" sx={{ mt: 2 }}>{deleteFeedback.message}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button disabled={deleteMutation.isPending} onClick={() => setDeleteTarget(null)}>İptal</Button>
          <Button
            variant="contained"
            color="error"
            disabled={!deleteTarget || deleteMutation.isPending}
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
          >{deleteMutation.isPending ? "Siliniyor…" : "Bütçe Çalışmasını Sil"}</Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={Boolean(deleteFeedback) && deleteFeedback.severity === "success"}
        autoHideDuration={5000}
        onClose={(_event, reason) => {
          if (reason !== "clickaway") setDeleteFeedback(null);
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" variant="filled" onClose={() => setDeleteFeedback(null)}>{deleteFeedback?.message ?? ""}</Alert>
      </Snackbar>
    </Stack>
  );
}

function PreparationDetail({ preparationId }: { preparationId: number }) {
  const client = useAuthorizedClient();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isViewer = ["viewer", "readonly", "read_only"].includes(String(user?.role ?? "").toLowerCase());
  const [header, setHeader] = useState({ year: new Date().getFullYear() + 1, name: "", note: "" });
  const [itemOpen, setItemOpen] = useState(false);
  const [itemForm, setItemForm] = useState<ItemFormState>(emptyItemForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [completionErrors, setCompletionErrors] = useState<CompletionIssue[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [completedScenarioId, setCompletedScenarioId] = useState<number | null>(null);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [capexOpex, setCapexOpex] = useState("");
  const [attribute, setAttribute] = useState("");
  const [itemStatus, setItemStatus] = useState("");

  const detailQuery = useQuery<Preparation>({
    queryKey: ["budget-preparation", preparationId],
    queryFn: async () => (await client.get<Preparation>(`/budget-preparations/${preparationId}`)).data,
  });
  const metadataQuery = useQuery<Metadata>({
    queryKey: ["budget-preparation-metadata"],
    queryFn: async () => (await client.get<Metadata>("/budget-preparations/metadata")).data,
  });

  useEffect(() => {
    if (detailQuery.data) {
      setHeader({ year: detailQuery.data.year, name: detailQuery.data.name, note: detailQuery.data.note ?? "" });
    }
  }, [detailQuery.data]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["budget-preparation", preparationId] });
  const updateHeaderMutation = useMutation({
    mutationFn: async (_source: SaveSource) => client.put(`/budget-preparations/${preparationId}`, { ...header, currency: "USD" }),
    onSuccess: async (_data, source) => {
      await refresh();
      setFeedback({ severity: "success", message: source === "auto" ? "Değişiklikler otomatik kaydedildi." : "Taslak başarıyla kaydedildi." });
    },
    onError: (error, source) => setFeedback({
      severity: "error",
      message: apiErrorMessage(error, source === "auto" ? "Otomatik kayıt başarısız oldu." : "Taslak kaydedilemedi."),
    }),
  });
  const deleteDraftMutation = useMutation({
    mutationFn: async () => client.delete(`/budget-preparations/${preparationId}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["budget-preparations"] }); navigate("/budget-preparation"); },
    onError: (error) => setFeedback({ severity: "error", message: apiErrorMessage(error, "Bütçe taslağı silinemedi.") }),
  });
  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: number) => client.delete(`/budget-preparations/${preparationId}/items/${itemId}`),
    onSuccess: async () => { await refresh(); setFeedback({ severity: "success", message: "Bütçe kalemi silindi." }); },
    onError: (error) => setFeedback({ severity: "error", message: apiErrorMessage(error, "Bütçe kalemi silinemedi.") }),
  });
  const completeMutation = useMutation({
    mutationFn: async () => (await client.post<CompletionResponse>(`/budget-preparations/${preparationId}/complete`)).data,
    onSuccess: async (result) => {
      setCompletionErrors([]);
      setCompletedScenarioId(result.scenario_id);
      await refresh();
      queryClient.invalidateQueries({ queryKey: ["scenarios"] });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setFeedback({ severity: "success", message: "Bütçe tamamlandı ve aktif Scenario oluşturuldu." });
    },
    onError: (error) => {
      const issues = completionIssues(error);
      setCompletionErrors(issues);
      setFeedback({ severity: "error", message: issues.map((issue) => issue.message).join(" • ") });
    },
  });

  const preparation = detailQuery.data;
  const isLocked = preparation?.status === "ACTIVE";
  const canEdit = !isViewer && !isLocked;
  const saveHeader = (source: SaveSource) => {
    if (!canEdit || updateHeaderMutation.isPending) return;
    setFeedback(null);
    updateHeaderMutation.mutate(source);
  };
  const canonicalOptions = (values: string[]) => Array.from(new Map(values.filter(Boolean).map((value) => [value.trim().toLocaleLowerCase("tr-TR"), value.trim()])).values()).sort((a, b) => a.localeCompare(b, "tr-TR"));
  const departmentOptions = useMemo(() => canonicalOptions([...(metadataQuery.data?.departments ?? []), ...(preparation?.items ?? []).map((item) => item.department).filter(Boolean) as string[]]), [metadataQuery.data, preparation]);
  const attributeOptions = useMemo(() => canonicalOptions([...(metadataQuery.data?.attributes ?? []), ...(preparation?.items ?? []).map((item) => item.map_attribute).filter(Boolean) as string[]]), [metadataQuery.data, preparation]);
  const filteredItems = useMemo(() => (preparation?.items ?? []).filter((item) => {
    const term = search.trim().toLocaleLowerCase("tr-TR");
    return (!term || item.budget_name.toLocaleLowerCase("tr-TR").includes(term))
      && (!department || item.department === department)
      && (!capexOpex || item.capex_opex === capexOpex)
      && (!attribute || item.map_attribute === attribute)
      && (!itemStatus || (itemStatus === "COMPLETE" ? item.is_complete : !item.is_complete));
  }), [preparation, search, department, capexOpex, attribute, itemStatus]);
  const { sortedRows: sortedItems, sort: itemSort, toggleSort: toggleItemSort } = useSortableRows(filteredItems);

  const openItem = (item?: PreparationItem) => {
    setFormError(null);
    if (!item) {
      setItemForm(emptyItemForm());
    } else {
      const allocationValues = Array(12).fill("");
      item.allocations.forEach((allocation) => { allocationValues[allocation.month - 1] = String(allocation.amount); });
      setItemForm({
        id: item.id,
        budget_name: item.budget_name,
        total_amount: String(item.total_amount),
        capex_opex: item.capex_opex ?? "",
        department: item.department ?? "",
        map_attribute: item.map_attribute ?? "",
        description: item.description ?? "",
        distribution_method: item.distribution_method,
        single_month: item.single_month ?? "",
        start_month: item.start_month ?? 1,
        month_count: item.month_count ?? 12,
        allocations: allocationValues,
      });
    }
    setItemOpen(true);
  };

  const allocatedPreview = useMemo(() => {
    const total = parseAmount(itemForm.total_amount);
    if (itemForm.distribution_method === "SINGLE_MONTH") return itemForm.single_month ? total : 0;
    if (itemForm.distribution_method === "EQUAL") {
      const start = Number(itemForm.start_month || 0);
      const count = Number(itemForm.month_count || 0);
      return start && count ? total : 0;
    }
    return itemForm.allocations.reduce((sum, value) => sum + parseAmount(value), 0);
  }, [itemForm]);
  const distributionPreview = useMemo(() => {
    const rows: Array<{ year: number; month: number; amount: number }> = [];
    const totalCents = Math.round(parseAmount(itemForm.total_amount) * 100);
    if (itemForm.distribution_method === "SINGLE_MONTH" && itemForm.single_month) {
      rows.push({ year: preparation?.year ?? header.year, month: Number(itemForm.single_month), amount: totalCents / 100 });
    } else if (itemForm.distribution_method === "EQUAL" && itemForm.start_month && itemForm.month_count) {
      const count = Number(itemForm.month_count);
      const baseCents = Math.floor(totalCents / count);
      Array.from({ length: count }).forEach((_, offset) => {
        const zeroBased = Number(itemForm.start_month) - 1 + offset;
        rows.push({
          year: (preparation?.year ?? header.year) + Math.floor(zeroBased / 12),
          month: zeroBased % 12 + 1,
          amount: (offset === count - 1 ? totalCents - baseCents * (count - 1) : baseCents) / 100,
        });
      });
    } else if (itemForm.distribution_method === "CUSTOM") {
      itemForm.allocations.forEach((amount, index) => {
        if (parseAmount(amount)) rows.push({ year: preparation?.year ?? header.year, month: index + 1, amount: parseAmount(amount) });
      });
    }
    return rows;
  }, [header.year, itemForm, preparation?.year]);
  const distributionYears = useMemo(() => Array.from(new Set(distributionPreview.map((row) => row.year))), [distributionPreview]);

  const saveItem = async () => {
    if (isSavingItem) return;
    const totalAmount = parseAmount(itemForm.total_amount);
    if (!itemForm.budget_name.trim() || !itemForm.department || !itemForm.map_attribute || !itemForm.capex_opex) {
      setFormError("Bütçe adı, departman, nitelik ve CAPEX/OPEX zorunludur.");
      return;
    }
    const payload = {
      budget_name: itemForm.budget_name,
      total_amount: totalAmount,
      currency: "USD",
      capex_opex: itemForm.capex_opex || null,
      department: itemForm.department || null,
      map_attribute: itemForm.map_attribute || null,
      description: itemForm.description || null,
      distribution_method: itemForm.distribution_method,
      single_month: itemForm.single_month || null,
      start_year: preparation.year,
      start_month: itemForm.start_month || null,
      month_count: itemForm.month_count || null,
      allocations: itemForm.allocations.map((amount, index) => ({ year: preparation.year, month: index + 1, amount: parseAmount(amount) })),
      is_carryover: false,
    };
    setIsSavingItem(true);
    setFormError(null);
    try {
      if (itemForm.id) await client.put(`/budget-preparations/${preparationId}/items/${itemForm.id}`, payload);
      else await client.post(`/budget-preparations/${preparationId}/items`, payload);
      setItemOpen(false);
      await refresh();
      setFeedback({ severity: "success", message: "Bütçe kalemi taslağa kaydedildi." });
    } catch (error: unknown) {
      setFormError(apiErrorMessage(error, "Bütçe kalemi kaydedilemedi."));
    } finally {
      setIsSavingItem(false);
    }
  };

  if (detailQuery.isLoading) return <Typography>Bütçe taslağı yükleniyor…</Typography>;
  if (!preparation) return <Alert severity="error">Bütçe taslağı bulunamadı.</Alert>;

  const cards = [
    ["Toplam Yeni Bütçe", preparation.total_budget],
    ["OPEX", preparation.opex_total],
    ["CAPEX", preparation.capex_total],
    ["Bütçe Kalemi Sayısı", preparation.item_count],
    ["Tamamlanmamış Kalem", preparation.incomplete_item_count],
  ] as const;

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <IconButton onClick={() => navigate("/budget-preparation")}><ArrowBackIcon /></IconButton>
          <Box><Typography variant="h4" fontWeight={800}>{preparation.name}</Typography><Typography color="text.secondary">{preparation.year} bütçe hazırlığı · Son güncelleme {formatDate(preparation.updated_at)}</Typography></Box>
          <Chip label={statusLabel(preparation.status)} color={isLocked ? "success" : "warning"} />
        </Stack>
        {canEdit && <Stack direction="row" spacing={1}>
          <Button startIcon={<SaveIcon />} variant="outlined" disabled={updateHeaderMutation.isPending || completeMutation.isPending} onClick={() => saveHeader("manual")}>{updateHeaderMutation.isPending ? "Kaydediliyor…" : "Taslağı Kaydet"}</Button>
          <Button startIcon={<CompleteIcon />} variant="contained" color="success" disabled={completeMutation.isPending || updateHeaderMutation.isPending} onClick={() => completeMutation.mutate()}>{completeMutation.isPending ? "Tamamlanıyor…" : "Bütçeyi Tamamla"}</Button>
        </Stack>}
      </Stack>

      {isLocked && <Alert severity="info" action={completedScenarioId || preparation.activated_scenario_id ? <Button color="inherit" size="small" onClick={() => navigate(`/plans?year=${preparation.year}&scenario_id=${completedScenarioId ?? preparation.activated_scenario_id}&source=budget-preparation`)}>Plan Yönetiminde Gör</Button> : undefined}>Bu bütçe aktiftir. Hazırlama ekranından düzenlenemez. Plan Yönetimi ve Dashboard akışlarında kullanılabilir.</Alert>}
      {isViewer && !isLocked && <Alert severity="info">Sadece görüntüleme yetkiniz var. Taslak üzerinde değişiklik yapamazsınız.</Alert>}
      {completionErrors.length > 0 && <Alert severity="error"><Typography fontWeight={700}>Bütçe tamamlanamadı</Typography>{completionErrors.map((error, index) => <Button key={index} size="small" color="inherit" sx={{ display: "block", textAlign: "left" }} onClick={() => error.item_id && document.getElementById(`budget-item-${error.item_id}`)?.scrollIntoView({ behavior: "smooth" })}>{error.message}</Button>)}</Alert>}

      <Grid container spacing={2}>{cards.map(([label, value], index) => <Grid item xs={12} sm={6} lg key={label}><Card variant="outlined" elevation={0} sx={{ borderRadius: 3 }}><CardContent><Typography color="text.secondary" variant="body2">{label}</Typography><Typography variant="h5" fontWeight={800}>{index < 3 ? formatCurrency(Number(value)) : value}</Typography></CardContent></Card></Grid>)}</Grid>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
        <Typography variant="h6" fontWeight={750} gutterBottom>Bütçe Başlığı</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={2}><TextField fullWidth label="Bütçe Yılı" type="number" disabled={!canEdit || updateHeaderMutation.isPending} value={header.year} onChange={(event) => setHeader((current) => ({ ...current, year: Number(event.target.value) }))} onBlur={() => saveHeader("auto")} /></Grid>
          <Grid item xs={12} md={5}><TextField fullWidth label="Bütçe Adı" disabled={!canEdit || updateHeaderMutation.isPending} value={header.name} onChange={(event) => setHeader((current) => ({ ...current, name: event.target.value }))} onBlur={() => saveHeader("auto")} /></Grid>
          <Grid item xs={12} md={2}><TextField fullWidth label="Para Birimi" value="USD" disabled /></Grid>
          <Grid item xs={12} md={3}><TextField fullWidth label="Oluşturan" value={preparation.created_by_name ?? "—"} disabled /></Grid>
          <Grid item xs={12}><TextField fullWidth label="Açıklama / Not" multiline minRows={2} disabled={!canEdit || updateHeaderMutation.isPending} value={header.note} onChange={(event) => setHeader((current) => ({ ...current, note: event.target.value }))} onBlur={() => saveHeader("auto")} /></Grid>
        </Grid>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Stack direction={{ xs: "column", lg: "row" }} spacing={1.5} alignItems={{ lg: "center" }}>
          <TextField size="small" label="Bütçe adı" value={search} onChange={(event) => setSearch(event.target.value)} sx={{ minWidth: 240 }} />
          <FilterSelect label="Departman" value={department} values={departmentOptions} onChange={setDepartment} />
          <FilterSelect label="CAPEX/OPEX" value={capexOpex} values={["CAPEX", "OPEX"]} onChange={setCapexOpex} />
          <FilterSelect label="Nitelik" value={attribute} values={attributeOptions} onChange={setAttribute} />
          <FilterSelect label="Durum" value={itemStatus} values={["COMPLETE", "INCOMPLETE"]} labels={{ COMPLETE: "Tamam", INCOMPLETE: "Eksik" }} onChange={setItemStatus} />
          <Box flexGrow={1} />
          {canEdit && <Button variant="contained" startIcon={<AddIcon />} onClick={() => openItem()}>Bütçe Kalemi Ekle</Button>}
        </Stack>
      </Paper>

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
        <Table sx={{ minWidth: 1050 }}>
          <TableHead><TableRow><SortableHeader label="Durum" field="is_complete" sort={itemSort} onSort={toggleItemSort} /><SortableHeader label="Bütçe Kalemi" field="budget_name" sort={itemSort} onSort={toggleItemSort} /><SortableHeader label="Departman" field="department" sort={itemSort} onSort={toggleItemSort} /><SortableHeader label="Nitelik" field="map_attribute" sort={itemSort} onSort={toggleItemSort} /><SortableHeader label="CAPEX/OPEX" field="capex_opex" sort={itemSort} onSort={toggleItemSort} /><SortableHeader label="Toplam" field="total_amount" align="right" sort={itemSort} onSort={toggleItemSort} /><SortableHeader label="Dağıtılan" field="allocated_amount" align="right" sort={itemSort} onSort={toggleItemSort} /><SortableHeader label="Kalan" field="remaining_amount" align="right" sort={itemSort} onSort={toggleItemSort} /><TableCell align="right">İşlem</TableCell></TableRow></TableHead>
          <TableBody>
            {sortedItems.map((item) => <TableRow id={`budget-item-${item.id}`} key={item.id} hover sx={{ bgcolor: item.is_complete ? undefined : "error.50" }}>
              <TableCell><Tooltip title={item.validation_errors.join(" ")}><Chip size="small" label={item.is_complete ? "Tamam" : "Eksik"} color={item.is_complete ? "success" : "error"} /></Tooltip></TableCell>
              <TableCell>{item.budget_name}</TableCell><TableCell>{item.department || "—"}</TableCell><TableCell>{item.map_attribute || "—"}</TableCell><TableCell>{item.capex_opex || "—"}</TableCell>
              <TableCell align="right">{formatCurrency(item.total_amount)}</TableCell><TableCell align="right">{formatCurrency(item.allocated_amount)}</TableCell><TableCell align="right">{formatCurrency(item.remaining_amount)}</TableCell>
              <TableCell align="right">{canEdit && <><IconButton aria-label="Düzenle" disabled={deleteItemMutation.isPending} onClick={() => openItem(item)}><EditIcon /></IconButton><IconButton aria-label="Sil" color="error" disabled={deleteItemMutation.isPending} onClick={() => window.confirm("Bütçe kalemi silinsin mi?") && deleteItemMutation.mutate(item.id)}><DeleteIcon /></IconButton></>}</TableCell>
            </TableRow>)}
            {!filteredItems.length && <TableRow><TableCell colSpan={9} align="center">Filtrelere uygun bütçe kalemi bulunamadı.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>

      {canEdit && <Button color="error" variant="text" startIcon={<DeleteIcon />} sx={{ alignSelf: "flex-start" }} disabled={deleteDraftMutation.isPending} onClick={() => window.confirm("Bu bütçe taslağı ve tüm kalemleri silinecek. Devam edilsin mi?") && deleteDraftMutation.mutate()}>{deleteDraftMutation.isPending ? "Siliniyor…" : "Taslağı Sil"}</Button>}

      <Dialog open={itemOpen} onClose={() => !isSavingItem && setItemOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle>{itemForm.id ? "Bütçe Kalemini Düzenle" : "Bütçe Kalemi Ekle"}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ pt: 0.5 }}>
            <Grid item xs={12} md={8}><TextField required fullWidth label="Bütçe Kalemi / Bütçe Adı" value={itemForm.budget_name} onChange={(event) => setItemForm((current) => ({ ...current, budget_name: event.target.value }))} /></Grid>
            <Grid item xs={12} md={4}><TextField required fullWidth label="Toplam Tutar (USD)" value={itemForm.total_amount} onChange={(event) => setItemForm((current) => ({ ...current, total_amount: event.target.value }))} /></Grid>
            <Grid item xs={12} md={4}><EditableSelect label="CAPEX / OPEX" value={itemForm.capex_opex} values={["CAPEX", "OPEX"]} onChange={(value) => setItemForm((current) => ({ ...current, capex_opex: value as ItemFormState["capex_opex"] }))} /></Grid>
            <Grid item xs={12} md={4}><Autocomplete options={departmentOptions} value={itemForm.department || null} onChange={(_, value) => setItemForm((current) => ({ ...current, department: value ?? "" }))} renderInput={(params) => <TextField {...params} required label="Departman" />} /></Grid>
            <Grid item xs={12} md={4}><Autocomplete options={attributeOptions} value={itemForm.map_attribute || null} onChange={(_, value) => setItemForm((current) => ({ ...current, map_attribute: value ?? "" }))} renderInput={(params) => <TextField {...params} required label="Nitelik" />} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Açıklama / Not" multiline minRows={2} value={itemForm.description} onChange={(event) => setItemForm((current) => ({ ...current, description: event.target.value }))} /></Grid>
            <Grid item xs={12}><Card variant="outlined" sx={{ borderRadius: 3, bgcolor: "background.default" }}><CardContent><Stack spacing={2.5}>
              <Box><Typography variant="h6" fontWeight={800}>Aylık Bütçe Dağıtımı</Typography><Typography variant="body2" color="text.secondary">Dağıtım yöntemi, başlangıç dönemi ve süreyi belirleyin. Yıl aşan tutarlar ilgili yıl altında gösterilir.</Typography></Box>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}><EditableSelect label="Dağıtım Yöntemi" value={itemForm.distribution_method} values={["SINGLE_MONTH", "EQUAL", "CUSTOM"]} labels={{ SINGLE_MONTH: "Tek Ay", EQUAL: "Eşit Dağıtım", CUSTOM: "Özel Dağıtım" }} onChange={(value) => setItemForm((current) => ({ ...current, distribution_method: value as DistributionMethod }))} /></Grid>
                {itemForm.distribution_method === "SINGLE_MONTH" && <Grid item xs={12} md={4}><EditableSelect label="Ay" value={String(itemForm.single_month)} values={months.map((_, index) => String(index + 1))} labels={Object.fromEntries(months.map((month, index) => [String(index + 1), month]))} onChange={(value) => setItemForm((current) => ({ ...current, single_month: Number(value) }))} /></Grid>}
                {itemForm.distribution_method === "EQUAL" && <><Grid item xs={12} md={4}><EditableSelect label="Başlangıç Ayı" value={String(itemForm.start_month)} values={months.map((_, index) => String(index + 1))} labels={Object.fromEntries(months.map((month, index) => [String(index + 1), month]))} onChange={(value) => setItemForm((current) => ({ ...current, start_month: Number(value) }))} /></Grid><Grid item xs={12} md={4}><TextField fullWidth label="Ay Sayısı" type="number" inputProps={{ min: 1, max: 36 }} value={itemForm.month_count} onChange={(event) => setItemForm((current) => ({ ...current, month_count: Number(event.target.value) }))} helperText="1–36 ay" /></Grid></>}
              </Grid>
              {itemForm.distribution_method === "CUSTOM" && <Grid container spacing={1.5}>{months.map((month, index) => <Grid item xs={12} sm={6} md={3} key={month}><TextField fullWidth size="small" label={`${month} ${preparation.year} (USD)`} value={itemForm.allocations[index]} onChange={(event) => setItemForm((current) => ({ ...current, allocations: current.allocations.map((value, itemIndex) => itemIndex === index ? event.target.value : value) }))} /></Grid>)}</Grid>}
              {distributionYears.map((year) => <Box key={year}><Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>{year}</Typography><Grid container spacing={1}>{distributionPreview.filter((row) => row.year === year).map((row) => <Grid item xs={6} sm={4} md={2} key={`${row.year}-${row.month}`}><Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}><Typography variant="caption" color="text.secondary">{months[row.month - 1]}</Typography><Typography fontWeight={750}>{formatCurrency(row.amount)}</Typography></Paper></Grid>)}</Grid></Box>)}
              <Paper variant="outlined" sx={{ p: 2, borderColor: Math.abs(parseAmount(itemForm.total_amount) - allocatedPreview) > 0.009 ? "warning.main" : "success.main", bgcolor: Math.abs(parseAmount(itemForm.total_amount) - allocatedPreview) > 0.009 ? "warning.50" : "success.50" }}><Stack direction={{ xs: "column", sm: "row" }} spacing={4}><Box><Typography variant="caption">Toplam Bütçe</Typography><Typography fontWeight={800}>{formatCurrency(parseAmount(itemForm.total_amount))}</Typography></Box><Box><Typography variant="caption">Aylara Dağıtılan</Typography><Typography fontWeight={800}>{formatCurrency(allocatedPreview)}</Typography></Box><Box><Typography variant="caption">Kalan</Typography><Typography fontWeight={800} color={Math.abs(parseAmount(itemForm.total_amount) - allocatedPreview) > 0.009 ? "warning.main" : "success.main"}>{formatCurrency(parseAmount(itemForm.total_amount) - allocatedPreview)}</Typography></Box></Stack></Paper>
            </Stack></CardContent></Card></Grid>
            {Math.abs(parseAmount(itemForm.total_amount) - allocatedPreview) > 0.009 && <Grid item xs={12}><Alert severity="warning">{formatCurrency(parseAmount(itemForm.total_amount) - allocatedPreview)} henüz aylara dağıtılmadı. Taslak kaydedilebilir; bütçe tamamlanamaz.</Alert></Grid>}
            {formError && <Grid item xs={12}><Alert severity="error">{formError}</Alert></Grid>}
          </Grid>
        </DialogContent>
        <DialogActions><Button disabled={isSavingItem} onClick={() => setItemOpen(false)}>İptal</Button><Button variant="contained" disabled={isSavingItem} onClick={saveItem}>{isSavingItem ? "Kaydediliyor…" : "Taslağa Kaydet"}</Button></DialogActions>
      </Dialog>
      <Snackbar open={Boolean(feedback)} autoHideDuration={5000} onClose={() => setFeedback(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity={feedback?.severity ?? "success"} variant="filled" onClose={() => setFeedback(null)}>{feedback?.message ?? ""}</Alert>
      </Snackbar>
    </Stack>
  );
}

function FilterSelect({ label, value, values, labels = {}, onChange }: { label: string; value: string; values: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return <FormControl size="small" sx={{ minWidth: 150 }}><InputLabel>{label}</InputLabel><Select label={label} value={value} onChange={(event) => onChange(event.target.value)}><MenuItem value="">Tümü</MenuItem>{values.map((option) => <MenuItem key={option} value={option}>{labels[option] ?? option}</MenuItem>)}</Select></FormControl>;
}

function EditableSelect({ label, value, values, labels = {}, onChange }: { label: string; value: string; values: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return <FormControl fullWidth><InputLabel>{label}</InputLabel><Select label={label} value={value} onChange={(event) => onChange(event.target.value)}><MenuItem value=""><em>Seçiniz</em></MenuItem>{values.map((option) => <MenuItem key={option} value={option}>{labels[option] ?? option}</MenuItem>)}</Select></FormControl>;
}

function SortableHeader({ label, field, sort, onSort, align = "left" }: { label: string; field: keyof PreparationItem; sort: { key: keyof PreparationItem; direction: "asc" | "desc" } | null; onSort: (field: keyof PreparationItem) => void; align?: "left" | "right" }) {
  return <TableCell align={align} sortDirection={sort?.key === field ? sort.direction : false}><TableSortLabel active={sort?.key === field} direction={sort?.key === field ? sort.direction : "asc"} onClick={() => onSort(field)}>{label}</TableSortLabel></TableCell>;
}
