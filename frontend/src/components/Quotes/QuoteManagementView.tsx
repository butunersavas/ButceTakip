import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  FormGroup,
  IconButton,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import AttachFileOutlinedIcon from "@mui/icons-material/AttachFileOutlined";
import CloudDownloadOutlinedIcon from "@mui/icons-material/CloudDownloadOutlined";
import CompareArrowsOutlinedIcon from "@mui/icons-material/CompareArrowsOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import KeyboardArrowDownOutlinedIcon from "@mui/icons-material/KeyboardArrowDownOutlined";
import KeyboardArrowUpOutlinedIcon from "@mui/icons-material/KeyboardArrowUpOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import RestoreFromTrashOutlinedIcon from "@mui/icons-material/RestoreFromTrashOutlined";
import StarOutlineOutlinedIcon from "@mui/icons-material/StarOutlineOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import { useAuth } from "../../context/AuthContext";
import {
  QUOTE_CATEGORIES,
  QUOTE_CURRENCIES,
  QUOTE_DURATIONS,
  QUOTE_PROCESS_TYPES,
  QUOTE_STATUSES,
  calculateQuoteLineTotal,
  formatFileSize,
  formatQuoteCurrency,
  formatQuoteDate,
  getVendorChipSx,
  type QuoteComparison,
  type QuoteDocument,
  type QuoteListItem,
  type QuoteProcess,
  type QuoteProcessType,
  type QuoteRevision,
  type QuoteStatus,
  type QuoteSummary,
  type QuoteVendorOffer,
} from "../../utils/quoteManagement";


type BudgetItem = {
  id: number;
  code: string;
  name: string;
  map_category?: string | null;
};

type ProcessItemForm = {
  id: number | null;
  source: "budget" | "manual";
  budget_item_id: string;
  name: string;
  product_code: string;
  category: string;
  description: string;
  requested_quantity: string;
  requested_duration_months: string;
};

type OfferItemForm = {
  process_item_id: string;
  product_name: string;
  product_code: string;
  category: string;
  duration_months: string;
  quantity: string;
  unit_price: string;
  description: string;
};

const emptyProcessItem = (): ProcessItemForm => ({
  id: null,
  source: "manual",
  budget_item_id: "",
  name: "",
  product_code: "",
  category: QUOTE_CATEGORIES[0],
  description: "",
  requested_quantity: "1",
  requested_duration_months: "",
});

const emptyFilters = {
  q: "",
  product_name: "",
  product_code: "",
  vendor: "",
  category: "",
  currency: "",
  status: "",
  start_date: "",
  end_date: "",
  has_document: "",
};

function apiErrorMessage(error: any) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((row) => row?.msg ?? String(row)).join(" ");
  return "İşlem tamamlanamadı.";
}

function SummaryMetric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card variant="outlined" elevation={0} sx={{ height: "100%", borderRadius: 3 }}>
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
          <Box>
            <Typography color="text.secondary" variant="body2">{label}</Typography>
            <Typography variant="h4" fontWeight={800}>{value}</Typography>
          </Box>
          <Box sx={{ color: "primary.main", display: "flex" }}>{icon}</Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function StatusChip({ status }: { status: QuoteStatus }) {
  const color = status === "COMPLETED" ? "success" : status === "CANCELLED" ? "error" : status === "ARCHIVED" ? "default" : status === "EVALUATING" ? "warning" : "info";
  return <Chip size="small" color={color} label={QUOTE_STATUSES[status] ?? status} />;
}

function ProcessDialog({
  open,
  editing,
  budgetItems,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  editing: QuoteProcess | null;
  budgetItems: BudgetItem[];
  saving: boolean;
  onClose: () => void;
  onSave: (payload: any) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [processType, setProcessType] = useState<QuoteProcessType>("SINGLE");
  const [items, setItems] = useState<ProcessItemForm[]>([emptyProcessItem()]);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
    setProcessType(editing?.process_type ?? "SINGLE");
    setItems(
      editing?.items.length
        ? editing.items.map((item) => ({
            id: item.id,
            source: item.budget_item_id ? "budget" : "manual",
            budget_item_id: item.budget_item_id ? String(item.budget_item_id) : "",
            name: item.name,
            product_code: item.product_code ?? "",
            category: item.category,
            description: item.description ?? "",
            requested_quantity: String(item.requested_quantity),
            requested_duration_months: item.requested_duration_months ? String(item.requested_duration_months) : "",
          }))
        : [emptyProcessItem()],
    );
  }, [editing, open]);

  const updateItem = (index: number, patch: Partial<ProcessItemForm>) => {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  const selectBudgetItem = (index: number, value: string) => {
    const selected = budgetItems.find((item) => String(item.id) === value);
    updateItem(index, {
      budget_item_id: value,
      name: selected?.name ?? "",
      product_code: selected?.code ?? "",
      category: selected?.map_category || QUOTE_CATEGORIES[0],
    });
  };

  const submit = async () => {
    const payload: any = { name: name.trim(), description: description.trim() || null, process_type: processType };
    payload.items = items.map((item) => ({
        id: item.id,
        budget_item_id: item.source === "budget" && item.budget_item_id ? Number(item.budget_item_id) : null,
        name: item.name.trim(),
        product_code: item.product_code.trim() || null,
        category: item.category,
        description: item.description.trim() || null,
        requested_quantity: item.requested_quantity,
        requested_duration_months: item.requested_duration_months ? Number(item.requested_duration_months) : null,
      }));
    await onSave(payload);
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>{editing ? "Teklif Sürecini Düzenle" : "Yeni Teklif Süreci"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          <TextField label="Teklif süreci adı" required fullWidth value={name} onChange={(event) => setName(event.target.value)} />
          <TextField label="Açıklama / Not" fullWidth multiline minRows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
          <TextField select label="Süreç Türü" required value={processType} onChange={(event) => { const next = event.target.value as QuoteProcessType; setProcessType(next); if (next === "SINGLE") setItems((current) => [current[0] ?? emptyProcessItem()]); }}>
            {Object.entries(QUOTE_PROCESS_TYPES).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </TextField>
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
              <Typography variant="subtitle1" fontWeight={700}>Ürün / Hizmet Kalemleri</Typography>
              {processType === "PACKAGE" && <Button startIcon={<AddOutlinedIcon />} onClick={() => setItems((current) => [...current, emptyProcessItem()])}>Kalem Ekle</Button>}
            </Stack>
            {editing?.offers.length ? <Alert severity="info" sx={{ mb: 2 }}>Geçmiş revizyonların kullandığı kaldırılmış kalemler arşivlenir; fiziksel olarak silinmez ve eski karşılaştırmalar korunur.</Alert> : null}
            <Stack spacing={2}>
              {items.map((item, index) => (
                <Paper key={index} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Stack spacing={1.5}>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                      <TextField select label="Giriş yöntemi" value={item.source} onChange={(event) => updateItem(index, { source: event.target.value as ProcessItemForm["source"], budget_item_id: "", name: "", product_code: "" })} sx={{ minWidth: 210 }}>
                        <MenuItem value="budget">Mevcut bütçe ürünü</MenuItem>
                        <MenuItem value="manual">Manuel ürün / hizmet</MenuItem>
                      </TextField>
                      {item.source === "budget" ? (
                        <Autocomplete
                          fullWidth
                          options={budgetItems}
                          value={budgetItems.find((budgetItem) => String(budgetItem.id) === item.budget_item_id) ?? null}
                          getOptionLabel={(budgetItem) => `${budgetItem.code} · ${budgetItem.name}`}
                          isOptionEqualToValue={(option, value) => option.id === value.id}
                          noOptionsText="Eşleşen bütçe ürünü bulunamadı"
                          onChange={(_, selected) => selectBudgetItem(index, selected ? String(selected.id) : "")}
                          renderInput={(params) => <TextField {...params} label="Bütçe ürünü ara" required />}
                        />
                      ) : (
                        <TextField label="Ürün / hizmet adı" required fullWidth value={item.name} onChange={(event) => updateItem(index, { name: event.target.value })} />
                      )}
                    </Stack>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                      <TextField label="Ürün kodu" fullWidth value={item.product_code} disabled={item.source === "budget"} onChange={(event) => updateItem(index, { product_code: event.target.value })} />
                      <TextField select label="Kategori" required fullWidth value={item.category} onChange={(event) => updateItem(index, { category: event.target.value })}>
                        {QUOTE_CATEGORIES.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
                      </TextField>
                    </Stack>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                      <TextField label="İstenen Adet" type="number" inputProps={{ min: 0.0001, step: 1 }} value={item.requested_quantity} onChange={(event) => updateItem(index, { requested_quantity: event.target.value })} />
                      <TextField select label="İstenen Süre" value={item.requested_duration_months} onChange={(event) => updateItem(index, { requested_duration_months: event.target.value })}><MenuItem value="">Süre Yok</MenuItem>{QUOTE_DURATIONS.map((duration) => <MenuItem key={duration} value={duration}>{duration} Ay</MenuItem>)}</TextField>
                    </Stack>
                    <TextField label="Kalem açıklaması" fullWidth value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} />
                    {processType === "PACKAGE" && <Stack direction="row" spacing={0.5}>
                      <Tooltip title="Yukarı taşı"><span><IconButton size="small" disabled={index === 0} onClick={() => setItems((current) => { const copy = [...current]; [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]]; return copy; })}><KeyboardArrowUpOutlinedIcon /></IconButton></span></Tooltip>
                      <Tooltip title="Aşağı taşı"><span><IconButton size="small" disabled={index === items.length - 1} onClick={() => setItems((current) => { const copy = [...current]; [copy[index], copy[index + 1]] = [copy[index + 1], copy[index]]; return copy; })}><KeyboardArrowDownOutlinedIcon /></IconButton></span></Tooltip>
                      {items.length > 1 && <Button color="error" startIcon={<DeleteOutlineOutlinedIcon />} onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Kalemi Kaldır</Button>}
                    </Stack>}
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>İptal</Button>
        <Button variant="contained" onClick={submit} disabled={saving || !name.trim() || items.some((item) => !item.name.trim() || Number(item.requested_quantity) <= 0)}>{saving ? <CircularProgress size={22} /> : "Kaydet"}</Button>
      </DialogActions>
    </Dialog>
  );
}

function OfferDialog({
  open,
  process,
  offer,
  revision,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  process: QuoteProcess;
  offer: QuoteVendorOffer | null;
  revision: QuoteRevision | null;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: any, files: File[]) => Promise<void>;
}) {
  const [vendorName, setVendorName] = useState("");
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<OfferItemForm[]>([]);
  const [revisionScope, setRevisionScope] = useState<"ALL" | "SELECTED">("ALL");
  const [selectedProcessItemIds, setSelectedProcessItemIds] = useState<number[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const isEditing = Boolean(revision);

  useEffect(() => {
    if (!open) return;
    const current = revision ?? offer?.current_revision;
    setVendorName(offer?.vendor_name ?? "");
    setQuoteDate(revision?.quote_date ?? new Date().toISOString().slice(0, 10));
    setValidUntil(revision?.valid_until ?? "");
    setNote(revision?.note ?? "");
    setFiles([]);
    setRevisionScope("ALL");
    setSelectedProcessItemIds(process.items.map((item) => item.id));
    const existing = current?.items.map((item) => ({
      process_item_id: item.process_item_id ? String(item.process_item_id) : "",
      product_name: item.product_name,
      product_code: item.product_code ?? "",
      category: item.category,
      duration_months: item.duration_months ? String(item.duration_months) : "",
      quantity: String(item.quantity),
      unit_price: String(item.unit_price),
      description: item.description ?? "",
    })) ?? [];
    if (revision) {
      setItems(existing);
      return;
    }
    const byProcessId = new Map(existing.filter((item) => item.process_item_id).map((item) => [item.process_item_id, item]));
    const processRows = process.items.map((item) => byProcessId.get(String(item.id)) ?? ({
      process_item_id: String(item.id),
      product_name: item.name,
      product_code: item.product_code ?? "",
      category: item.category,
      duration_months: item.requested_duration_months ? String(item.requested_duration_months) : "",
      quantity: String(item.requested_quantity),
      unit_price: "",
      description: item.description ?? "",
    }));
    setItems([...processRows, ...existing.filter((item) => !item.process_item_id)]);
  }, [offer, open, process.items, revision]);

  const updateItem = (index: number, patch: Partial<OfferItemForm>) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const visibleItems = isEditing || revisionScope === "ALL"
    ? items
    : items.filter((item) => item.process_item_id && selectedProcessItemIds.includes(Number(item.process_item_id)));
  // Kısmi revizyonda görünmeyen kalemler önceki geçerli revizyondan taşınır.
  // Firma toplamı bu nedenle yalnız seçili satırları değil, oluşacak tam snapshot'ı göstermelidir.
  const total = items.reduce((sum, item) => sum + calculateQuoteLineTotal(item.quantity, item.unit_price), 0);
  const submit = async () => {
    const revisionPayload: any = {
      quote_date: quoteDate,
      valid_until: validUntil || null,
      note: note.trim() || null,
      items: visibleItems.map((item) => ({
        process_item_id: item.process_item_id ? Number(item.process_item_id) : null,
        product_name: item.product_name.trim(),
        product_code: item.product_code.trim() || null,
        category: item.category,
        duration_months: item.duration_months ? Number(item.duration_months) : null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        description: item.description.trim() || null,
      })),
    };
    if (!isEditing) {
      revisionPayload.currency = "USD";
      revisionPayload.revision_scope = revisionScope;
      revisionPayload.selected_process_item_ids = revisionScope === "SELECTED" ? selectedProcessItemIds : [];
    }
    await onSave(isEditing || offer ? revisionPayload : { vendor_name: vendorName.trim(), revision: revisionPayload }, files);
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="lg" fullWidth>
      <DialogTitle>{revision ? `${offer?.vendor_name} · Revizyon ${revision.revision_no} Düzenle` : offer ? `${offer.vendor_name} · Yeni Revizyon` : "Yeni Firma Teklifi"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          {!offer && <TextField label="Satıcı Firma" required fullWidth value={vendorName} onChange={(event) => setVendorName(event.target.value)} />}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 1.5 }}>
            <TextField label="Teklif Tarihi" type="date" required value={quoteDate} onChange={(event) => setQuoteDate(event.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField label="Geçerlilik Tarihi" type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField label="Para Birimi" value="USD" InputProps={{ readOnly: true }} helperText="Yeni teklifler yalnız USD olarak kaydedilir." />
            <TextField label="Firma Toplamı" value={formatQuoteCurrency(total, "USD")} InputProps={{ readOnly: true }} />
          </Box>
          <TextField label="Revizyon Notu (İsteğe Bağlı)" size="small" fullWidth value={note} onChange={(event) => setNote(event.target.value)} />
          {!isEditing && process.process_type === "PACKAGE" && <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <TextField select label="Revizyon Kapsamı" value={revisionScope} onChange={(event) => setRevisionScope(event.target.value as "ALL" | "SELECTED")} sx={{ minWidth: 280 }}>
              <MenuItem value="ALL">Tüm paket</MenuItem>
              <MenuItem value="SELECTED">Belirli ürün(ler)</MenuItem>
            </TextField>
            {revisionScope === "SELECTED" && <FormGroup row sx={{ mt: 1.5 }}>
              {process.items.map((item) => <FormControlLabel key={item.id} control={<Checkbox checked={selectedProcessItemIds.includes(item.id)} onChange={(event) => setSelectedProcessItemIds((current) => event.target.checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id))} />} label={item.name} />)}
            </FormGroup>}
            <Typography variant="body2" color="text.secondary" mt={1}>Belirli ürün revizyonunda seçilmeyen satırlar önceki geçerli revizyondan aynen taşınır.</Typography>
          </Paper>}
          <Box>
            <Typography variant="subtitle1" fontWeight={700} mb={1.5}>Teklif Kalemleri</Typography>
            <Stack spacing={1.5}>
              {visibleItems.map((item) => {
                const index = items.indexOf(item);
                return (
                <Paper key={`${item.process_item_id || "manual"}-${index}`} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" }, gap: 1.25 }}>
                    <TextField size="small" label="Ürün / Hizmet Adı" required fullWidth sx={{ gridColumn: { md: "span 2" }, minWidth: 0 }} value={item.product_name} onChange={(event) => updateItem(index, { product_name: event.target.value })} />
                    <TextField label="Ürün Kodu" value={item.product_code} onChange={(event) => updateItem(index, { product_code: event.target.value })} />
                    <TextField select label="Kategori" value={item.category} onChange={(event) => updateItem(index, { category: event.target.value })}>{QUOTE_CATEGORIES.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}</TextField>
                    <TextField select label="Süre" value={item.duration_months} onChange={(event) => updateItem(index, { duration_months: event.target.value })}><MenuItem value="">Süre Yok</MenuItem>{QUOTE_DURATIONS.map((duration) => <MenuItem key={duration} value={duration}>{duration} Ay</MenuItem>)}</TextField>
                    <TextField label="Adet" type="number" inputProps={{ min: 0.0001, step: 1 }} value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} />
                    <TextField size="small" fullWidth label="Birim Fiyat (USD)" type="number" sx={{ gridColumn: { xs: "1 / -1", md: "span 3" }, minWidth: 0 }} inputProps={{ min: 0, step: 0.01 }} value={item.unit_price} onChange={(event) => updateItem(index, { unit_price: event.target.value })} />
                  </Box>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} mt={1.25} alignItems={{ md: "center" }} justifyContent="space-between">
                    <TextField size="small" label="Kısa Açıklama (İsteğe Bağlı)" fullWidth sx={{ maxWidth: { md: 440 }, minWidth: 0 }} value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} />
                    <Box sx={{ bgcolor: "action.hover", borderRadius: 2, px: 2, py: 1, minWidth: 230, textAlign: { xs: "left", md: "right" }, flexShrink: 0 }}>
                      <Typography variant="caption" color="text.secondary">SATIR TOPLAMI (USD)</Typography>
                      <Typography fontWeight={900} variant="h6" sx={{ whiteSpace: "nowrap" }}>{formatQuoteCurrency(calculateQuoteLineTotal(item.quantity, item.unit_price), "USD")}</Typography>
                    </Box>
                  </Stack>
                </Paper>
              )})}
              {!visibleItems.length && <Alert severity="warning">Revize edilecek en az bir ürün seçin.</Alert>}
            </Stack>
          </Box>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} alignItems="center"><AttachFileOutlinedIcon color="primary" /><Typography fontWeight={700}>Fiyat Teklifi PDF / Excel Ekle</Typography></Stack>
              <Typography variant="body2" color="text.secondary">PDF, XLSX veya XLS · En fazla 20 MB · Dosya bilgileri ilgili firma revizyonuna bağlanır.</Typography>
              <Button component="label" variant="outlined" sx={{ alignSelf: "flex-start" }} startIcon={<AttachFileOutlinedIcon />}>Dosya Seç<input hidden type="file" multiple accept=".pdf,.xlsx,.xls,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></Button>
              {files.map((file) => <Typography key={`${file.name}-${file.size}`} variant="body2">{file.name} · {formatFileSize(file.size)}</Typography>)}
            </Stack>
          </Paper>
          <Alert severity="info">Bu kayıt satın alma veya harcama oluşturmaz; bütçeden tutar düşmez. KDV alanı/hesabı uygulanmaz.</Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>İptal</Button>
        <Button variant="contained" onClick={submit} disabled={saving || (!offer && !vendorName.trim()) || !quoteDate || !visibleItems.length || visibleItems.some((item) => !item.product_name.trim() || Number(item.quantity) <= 0 || item.unit_price === "" || Number(item.unit_price) < 0)}>{saving ? <CircularProgress size={22} /> : revision ? "Değişiklikleri Kaydet" : offer ? "Revizyonu Kaydet" : "Teklifi Kaydet"}</Button>
      </DialogActions>
    </Dialog>
  );
}

function DocumentActions({ document, readOnly, onPreview, onDownload, onDeactivate }: { document: QuoteDocument; readOnly: boolean; onPreview: (document: QuoteDocument) => void; onDownload: (document: QuoteDocument) => void; onDeactivate: (document: QuoteDocument) => void }) {
  return (
    <Stack direction="row" spacing={0.5}>
      {document.is_active && document.content_type === "application/pdf" && <Tooltip title="Görüntüle"><IconButton size="small" onClick={() => onPreview(document)}><VisibilityOutlinedIcon fontSize="small" /></IconButton></Tooltip>}
      {document.is_active && <Tooltip title="İndir"><IconButton size="small" onClick={() => onDownload(document)}><CloudDownloadOutlinedIcon fontSize="small" /></IconButton></Tooltip>}
      {document.is_active && !readOnly && <Tooltip title="Pasife al"><IconButton size="small" color="error" onClick={() => onDeactivate(document)}><DeleteOutlineOutlinedIcon fontSize="small" /></IconButton></Tooltip>}
    </Stack>
  );
}

function DetailDialog({
  open,
  process,
  loading,
  comparison,
  comparisonLoading,
  readOnly,
  isAdmin,
  actionBusy,
  onClose,
  onEdit,
  onAddOffer,
  onAddRevision,
  onEditRevision,
  onDeleteRevision,
  onRestoreRevision,
  onDeleteProcess,
  onStatus,
  onPreferred,
  onPreview,
  onDownload,
  onDeactivate,
  onUploadDocuments,
}: {
  open: boolean;
  process: QuoteProcess | undefined;
  loading: boolean;
  comparison: QuoteComparison | undefined;
  comparisonLoading: boolean;
  readOnly: boolean;
  isAdmin: boolean;
  actionBusy: boolean;
  onClose: () => void;
  onEdit: () => void;
  onAddOffer: () => void;
  onAddRevision: (offer: QuoteVendorOffer) => void;
  onEditRevision: (offer: QuoteVendorOffer, revision: QuoteRevision) => void;
  onDeleteRevision: (offer: QuoteVendorOffer, revision: QuoteRevision) => void;
  onRestoreRevision: (offer: QuoteVendorOffer, revision: QuoteRevision) => void;
  onDeleteProcess: (process: QuoteProcess) => void;
  onStatus: (status: QuoteStatus) => void;
  onPreferred: (offerId: number | null) => void;
  onPreview: (document: QuoteDocument) => void;
  onDownload: (document: QuoteDocument) => void;
  onDeactivate: (document: QuoteDocument) => void;
  onUploadDocuments: (offer: QuoteVendorOffer, revision: QuoteRevision, files: File[]) => void;
}) {
  const [tab, setTab] = useState(0);
  const [historyShownForOffers, setHistoryShownForOffers] = useState<number[]>([]);
  useEffect(() => { if (open) { setTab(0); setHistoryShownForOffers([]); } }, [open, process?.id]);
  const allDocuments = process?.offers.flatMap((offer) => offer.revisions.flatMap((revision) => revision.documents.map((document) => ({ document, offer, revision })))) ?? [];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth fullScreen={false} PaperProps={{ sx: { minHeight: { md: "82vh" } } }}>
      <DialogTitle>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1} alignItems={{ sm: "center" }}>
          <Box><Typography variant="h6" fontWeight={800}>{process?.quote_no ?? "Teklif Detayı"}</Typography><Typography variant="body2" color="text.secondary">{process?.name}</Typography></Box>
          {process && <Stack direction="row" spacing={1} alignItems="center"><StatusChip status={process.status} /><Chip size="small" variant="outlined" label={QUOTE_PROCESS_TYPES[process.process_type]} />{!readOnly && <Button startIcon={<EditOutlinedIcon />} onClick={onEdit}>Düzenle</Button>}{!readOnly && <Button color="error" startIcon={<DeleteOutlineOutlinedIcon />} onClick={() => onDeleteProcess(process)}>Sil</Button>}</Stack>}
        </Stack>
      </DialogTitle>
      <Divider />
      {loading || !process ? <Box sx={{ display: "grid", placeItems: "center", minHeight: 400 }}><CircularProgress /></Box> : (
        <>
          <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto" sx={{ px: 2 }}>
            <Tab label="Genel ve Firmalar" />
            <Tab icon={<CompareArrowsOutlinedIcon />} iconPosition="start" label="Karşılaştırma" />
            <Tab icon={<DescriptionOutlinedIcon />} iconPosition="start" label={`Teklif Belgeleri (${allDocuments.filter((row) => row.document.is_active).length})`} />
            <Tab icon={<HistoryOutlinedIcon />} iconPosition="start" label="İşlem Geçmişi" />
          </Tabs>
          <DialogContent dividers sx={{ bgcolor: "background.default" }}>
            {tab === 0 && (
              <Stack spacing={2.5}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
                    <Box><Typography variant="caption" color="text.secondary">Oluşturan</Typography><Typography>{process.created_by_name ?? "-"}</Typography></Box>
                    <Box><Typography variant="caption" color="text.secondary">Oluşturma Tarihi</Typography><Typography>{formatQuoteDate(process.created_at, true)}</Typography></Box>
                    <Box><Typography variant="caption" color="text.secondary">Firma / Revizyon</Typography><Typography>{process.offers.length} / {process.offers.reduce((sum, offer) => sum + offer.revisions.length, 0)}</Typography></Box>
                    {!readOnly ? <TextField select size="small" label="Durum" value={process.status} disabled={actionBusy} onChange={(event) => onStatus(event.target.value as QuoteStatus)}>{Object.entries(QUOTE_STATUSES).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField> : <Box><Typography variant="caption" color="text.secondary">Durum</Typography><Box mt={0.5}><StatusChip status={process.status} /></Box></Box>}
                  </Box>
                  {process.description && <Typography mt={2}>{process.description}</Typography>}
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" fontWeight={800} mb={1}>
                      {process.process_type === "PACKAGE" ? "Paket İçeriği" : "Ürün / Hizmet"} · {process.items.length} kalem
                    </Typography>
                    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, overflowX: "auto" }}>
                      <Table size="small" aria-label="Paket ürünleri" sx={{ minWidth: 620 }}>
                        <TableHead><TableRow sx={{ bgcolor: "action.hover" }}>
                          <TableCell sx={{ fontWeight: 700 }}>Ürün / Hizmet</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Ürün Kodu</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Kategori</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>Adet</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Süre</TableCell>
                        </TableRow></TableHead>
                        <TableBody>{process.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>{item.name}</TableCell>
                            <TableCell>{item.product_code || "—"}</TableCell>
                            <TableCell>{item.category}</TableCell>
                            <TableCell align="right">{item.requested_quantity}</TableCell>
                            <TableCell>{item.requested_duration_months ? `${item.requested_duration_months} Ay` : "Süre Yok"}</TableCell>
                          </TableRow>
                        ))}</TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                </Paper>
                <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }}>
                  <Typography variant="h6" fontWeight={800}>Firma Teklifleri</Typography>
                  {!readOnly && process.status !== "ARCHIVED" && <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={onAddOffer}>Firma Teklifi Ekle</Button>}
                </Stack>
                {!process.offers.length && <Alert severity="info">Henüz firma teklifi eklenmedi.</Alert>}
                {process.offers.map((offer) => (
                  <Accordion key={offer.id} defaultExpanded sx={{ borderRadius: "12px !important", overflow: "hidden", "&:before": { display: "none" } }}>
                    <AccordionSummary expandIcon={<ExpandMoreOutlinedIcon />}>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }} width="100%" mr={2}>
                        <Box sx={{ flexGrow: 1 }}><Chip label={offer.vendor_name} sx={getVendorChipSx(offer.vendor_name, process.offers.map((row) => row.vendor_name))} /></Box>
                        {process.preferred_offer_id === offer.id && <Chip color="success" size="small" icon={<StarOutlineOutlinedIcon />} label="Tercih Edilen" />}
                        {offer.current_revision ? <Typography fontWeight={800}>{formatQuoteCurrency(offer.current_revision.total_amount, offer.current_revision.currency)}</Typography> : <Typography color="text.secondary">Teklif yok</Typography>}
                        <Chip size="small" label={`${offer.revisions.length} revizyon`} />
                      </Stack>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Stack spacing={2}>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="space-between" alignItems={{ sm: "center" }}>
                          {!readOnly && process.status !== "ARCHIVED" && <Button variant="outlined" startIcon={<AddOutlinedIcon />} onClick={() => onAddRevision(offer)}>Yeni Revizyon</Button>}
                          {offer.revisions.length > 1 && <Button size="small" variant="text" startIcon={<HistoryOutlinedIcon />} onClick={() => setHistoryShownForOffers((current) => current.includes(offer.id) ? current.filter((id) => id !== offer.id) : [...current, offer.id])}>
                            {historyShownForOffers.includes(offer.id) ? "Geçmiş Revizyonları Gizle" : `Geçmiş Revizyonları Göster (${offer.revisions.length - 1})`}
                          </Button>}
                        </Stack>
                        {offer.revisions.filter((revision) => revision.id === offer.current_revision?.id || historyShownForOffers.includes(offer.id)).map((revision) => (
                          <Paper key={revision.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="space-between" mb={1.5}>
                              <Box><Typography fontWeight={800}>Revizyon {revision.revision_no}</Typography><Typography variant="body2" color="text.secondary">{formatQuoteDate(revision.quote_date)} · Geçerlilik: {formatQuoteDate(revision.valid_until)}</Typography></Box>
                              <Stack direction="row" spacing={1} alignItems="center"><Typography variant="h6" fontWeight={800}>{formatQuoteCurrency(revision.total_amount, revision.currency)}</Typography>{!readOnly && <Button size="small" startIcon={<EditOutlinedIcon />} onClick={() => onEditRevision(offer, revision)}>Düzenle</Button>}{!readOnly && <Button size="small" color="error" startIcon={<DeleteOutlineOutlinedIcon />} onClick={() => onDeleteRevision(offer, revision)}>Sil</Button>}</Stack>
                            </Stack>
                            <TableContainer sx={{ overflowX: "auto" }}><Table size="small" sx={{ minWidth: 720 }}><TableHead><TableRow><TableCell>Ürün</TableCell><TableCell>Kod</TableCell><TableCell>Süre</TableCell><TableCell align="right">Adet</TableCell><TableCell align="right">Birim Fiyat</TableCell><TableCell align="right">Tutar</TableCell></TableRow></TableHead><TableBody>{revision.items.map((item) => <TableRow key={item.id} sx={item.process_item_id && revision.changed_process_item_ids.includes(item.process_item_id) ? { bgcolor: "action.hover" } : undefined}><TableCell><Stack direction="row" spacing={0.75} alignItems="center"><span>{item.product_name}</span>{item.process_item_id && revision.changed_process_item_ids.includes(item.process_item_id) && <Chip size="small" color="info" label="Değişti" />}</Stack></TableCell><TableCell>{item.product_code ?? "-"}</TableCell><TableCell>{item.duration_months ? `${item.duration_months} Ay` : "-"}</TableCell><TableCell align="right">{item.quantity}</TableCell><TableCell align="right">{formatQuoteCurrency(item.unit_price, revision.currency)}</TableCell><TableCell align="right">{formatQuoteCurrency(item.line_total, revision.currency)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
                            {process.items.filter((processItem) => !revision.items.some((item) => item.process_item_id === processItem.id)).length > 0 && <Alert severity="info" sx={{ mt: 1.5 }}>{process.items.filter((processItem) => !revision.items.some((item) => item.process_item_id === processItem.id)).map((item) => item.name).join(", ")} için teklif verilmedi.</Alert>}
                            {revision.note && <Typography mt={1.5} variant="body2">{revision.note}</Typography>}
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }} mt={1.5}>
                              {!readOnly && <Button component="label" size="small" variant="outlined" startIcon={<AttachFileOutlinedIcon />}>Bu Revizyona Belge Ekle<input hidden type="file" multiple accept=".pdf,.xlsx,.xls,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { const selected = Array.from(event.target.files ?? []); if (selected.length) onUploadDocuments(offer, revision, selected); event.target.value = ""; }} /></Button>}
                              <Typography variant="caption" color="text.secondary">PDF / XLSX / XLS · Eski belgeler korunur</Typography>
                            </Stack>
                            {revision.documents.length > 0 && <Stack mt={1.5} spacing={0.75}>{revision.documents.map((document) => <Stack key={document.id} direction="row" spacing={1} alignItems="center"><AttachFileOutlinedIcon fontSize="small" color={document.is_active ? "primary" : "disabled"} /><Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }} noWrap>{document.original_name} · {formatFileSize(document.size_bytes)}</Typography>{!document.is_active && <Chip size="small" label="Pasif" />}<DocumentActions document={document} readOnly={readOnly} onPreview={onPreview} onDownload={onDownload} onDeactivate={onDeactivate} /></Stack>)}</Stack>}
                          </Paper>
                        ))}
                        {isAdmin && offer.deleted_revisions.length > 0 && <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, borderStyle: "dashed" }}><Typography fontWeight={800} mb={1}>Silinen Revizyonlar</Typography><Stack spacing={1}>{offer.deleted_revisions.map((revision) => <Stack key={revision.id} direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1}><Box><Typography>Revizyon {revision.revision_no} · {formatQuoteCurrency(revision.total_amount, revision.currency)}</Typography><Typography variant="caption" color="text.secondary">Silinme: {formatQuoteDate(revision.deleted_at, true)}{revision.deleted_reason ? ` · ${revision.deleted_reason}` : ""}</Typography></Box><Button startIcon={<RestoreFromTrashOutlinedIcon />} onClick={() => onRestoreRevision(offer, revision)}>Geri Al</Button></Stack>)}</Stack></Paper>}
                      </Stack>
                    </AccordionDetails>
                  </Accordion>
                ))}
              </Stack>
            )}
            {tab === 1 && (comparisonLoading || !comparison ? <Box sx={{ display: "grid", placeItems: "center", minHeight: 300 }}><CircularProgress /></Box> : (
              <Stack spacing={2.5}>
                {comparison.warnings.map((warning) => <Alert key={warning} severity="warning">{warning}</Alert>)}
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" }, gap: 2 }}>
                  {comparison.offers.map((offer) => <Card key={offer.offer_id} variant="outlined" sx={{ borderColor: offer.is_lowest ? "success.main" : offer.is_preferred ? "primary.main" : "divider", borderWidth: offer.is_lowest || offer.is_preferred ? 2 : 1, borderRadius: 3 }}><CardContent><Stack spacing={1.25}><Stack direction="row" justifyContent="space-between" spacing={1}><Chip label={offer.vendor_name} sx={getVendorChipSx(offer.vendor_name, comparison.offers.map((row) => row.vendor_name))} /><Stack direction="row" spacing={0.5}>{offer.is_lowest && <Chip color="success" size="small" label="En Düşük" />}{offer.is_preferred && <Chip color="primary" size="small" label="Tercih" />}</Stack></Stack><Typography variant="h5" fontWeight={900}>{formatQuoteCurrency(offer.total_amount, offer.currency)}</Typography><Typography variant="body2" color="text.secondary">Son geçerli revizyon: {offer.revision_no}</Typography>{offer.warning && <Alert severity="info" sx={{ py: 0 }}>{offer.warning}</Alert>}<Stack direction="row" spacing={1}>{!readOnly && <Button size="small" variant={offer.is_preferred ? "outlined" : "contained"} startIcon={<StarOutlineOutlinedIcon />} onClick={() => onPreferred(offer.is_preferred ? null : offer.offer_id)}>{offer.is_preferred ? "Tercihi Kaldır" : "Tercih Et"}</Button>}{offer.documents.map((document) => document.content_type === "application/pdf" ? <Button key={document.id} size="small" onClick={() => onPreview(document)}>PDF Görüntüle</Button> : null)}</Stack></Stack></CardContent></Card>)}
                </Box>
                <Paper variant="outlined" sx={{ borderRadius: 2 }}><TableContainer sx={{ overflowX: "auto" }}><Table size="small" sx={{ minWidth: 820 }}><TableHead><TableRow><TableCell>Kalem</TableCell>{comparison.offers.map((offer) => <TableCell key={offer.offer_id}><Chip size="small" label={offer.vendor_name} sx={getVendorChipSx(offer.vendor_name, comparison.offers.map((row) => row.vendor_name))} /></TableCell>)}</TableRow></TableHead><TableBody>{comparison.item_rows.map((row) => <TableRow key={row.key}><TableCell sx={{ fontWeight: 700 }}>{row.label}</TableCell>{comparison.offers.map((offer) => { const cell = row.cells.find((candidate) => candidate.offer_id === offer.offer_id); return <TableCell key={offer.offer_id}>{cell ? <Stack spacing={0.25}><Typography variant="body2">{cell.item.quantity} adet · {cell.item.duration_months ? `${cell.item.duration_months} ay` : "süre yok"}</Typography><Typography fontWeight={700}>{formatQuoteCurrency(cell.item.line_total, offer.currency)}</Typography></Stack> : <Typography color="text.secondary">Teklif verilmedi</Typography>}</TableCell>; })}</TableRow>)}</TableBody></Table></TableContainer></Paper>
              </Stack>
            ))}
            {tab === 2 && (
              <Stack spacing={1.5}>
                {!allDocuments.length && <Alert severity="info">Bu süreçte belge bulunmuyor.</Alert>}
                {allDocuments.map(({ document, offer, revision }) => <Paper key={document.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}><Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}><Box sx={{ color: document.content_type === "application/pdf" ? "error.main" : "success.main", display: "flex" }}>{document.content_type === "application/pdf" ? <PictureAsPdfOutlinedIcon /> : <DescriptionOutlinedIcon />}</Box><Box sx={{ flexGrow: 1, minWidth: 0 }}><Typography fontWeight={700} noWrap title={document.original_name}>{document.original_name}</Typography><Typography variant="caption" color="text.secondary">{offer.vendor_name} · Revizyon {revision.revision_no} · {formatQuoteDate(document.created_at, true)} · {formatFileSize(document.size_bytes)} · {document.uploaded_by_name ?? "-"}</Typography></Box>{!document.is_active && <Chip size="small" label="Pasife Alındı" />}<DocumentActions document={document} readOnly={readOnly} onPreview={onPreview} onDownload={onDownload} onDeactivate={onDeactivate} /></Stack></Paper>)}
              </Stack>
            )}
            {tab === 3 && <Stack spacing={1}>{process.audit_logs.map((log) => <Paper key={log.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}><Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}><Box><Typography fontWeight={700}>{log.action}</Typography><Typography variant="body2" color="text.secondary">{log.user_name ?? "-"}{log.details ? ` · ${log.details}` : ""}</Typography></Box><Typography variant="caption" color="text.secondary">{formatQuoteDate(log.created_at, true)}</Typography></Stack></Paper>)}</Stack>}
          </DialogContent>
        </>
      )}
      <DialogActions><Button onClick={onClose}>Kapat</Button></DialogActions>
    </Dialog>
  );
}

export default function QuoteManagementView() {
  const client = useAuthorizedClient();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const readOnly = ["viewer", "readonly", "read_only"].includes(String(user?.role ?? "").toLowerCase());
  const isAdmin = Boolean(user?.is_admin);
  const [filters, setFilters] = useState(emptyFilters);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [processDialogOpen, setProcessDialogOpen] = useState(false);
  const [editingProcess, setEditingProcess] = useState<QuoteProcess | null>(null);
  const [offerDialog, setOfferDialog] = useState<{ open: boolean; offer: QuoteVendorOffer | null; revision: QuoteRevision | null }>({ open: false, offer: null, revision: null });
  const [deletedDialogOpen, setDeletedDialogOpen] = useState(false);
  const [deleteProcessTarget, setDeleteProcessTarget] = useState<Pick<QuoteProcess, "id" | "quote_no" | "name"> | QuoteListItem | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ severity: "success" | "error"; message: string } | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  const params = useMemo(() => Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== "")), [filters]);
  const summaryQuery = useQuery({ queryKey: ["quote-summary"], queryFn: async () => (await client.get<QuoteSummary>("/quotes/summary")).data });
  const listQuery = useQuery({ queryKey: ["quotes", params], queryFn: async () => (await client.get<QuoteListItem[]>("/quotes", { params })).data });
  const deletedQuery = useQuery({ queryKey: ["quotes-deleted"], queryFn: async () => (await client.get<QuoteListItem[]>("/quotes/deleted")).data, enabled: isAdmin });
  const budgetItemsQuery = useQuery({ queryKey: ["budget-items-for-quotes"], queryFn: async () => (await client.get<BudgetItem[]>("/budget-items")).data, staleTime: 5 * 60 * 1000 });
  const detailQuery = useQuery({ queryKey: ["quote-detail", selectedId], queryFn: async () => (await client.get<QuoteProcess>(`/quotes/${selectedId}`)).data, enabled: selectedId !== null });
  const comparisonQuery = useQuery({ queryKey: ["quote-comparison", selectedId], queryFn: async () => (await client.get<QuoteComparison>(`/quotes/${selectedId}/comparison`)).data, enabled: selectedId !== null });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["quote-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["quotes"] }),
      queryClient.invalidateQueries({ queryKey: ["quote-detail"] }),
      queryClient.invalidateQueries({ queryKey: ["quote-comparison"] }),
      queryClient.invalidateQueries({ queryKey: ["quotes-deleted"] }),
    ]);
  };

  const showError = (error: any) => setFeedback({ severity: "error", message: apiErrorMessage(error) });
  const openEdit = async (id: number) => {
    try {
      const response = await client.get<QuoteProcess>(`/quotes/${id}`);
      setEditingProcess(response.data);
      setProcessDialogOpen(true);
    } catch (error) { showError(error); }
  };
  const saveProcess = async (payload: any) => {
    try {
      setSaving(true);
      const response = editingProcess
        ? await client.put<QuoteProcess>(`/quotes/${editingProcess.id}`, payload)
        : await client.post<QuoteProcess>("/quotes", payload);
      setProcessDialogOpen(false);
      setEditingProcess(null);
      setSelectedId(response.data.id);
      setFeedback({ severity: "success", message: editingProcess ? "Teklif süreci güncellendi." : `${response.data.quote_no} oluşturuldu.` });
      await invalidate();
    } catch (error) { showError(error); } finally { setSaving(false); }
  };
  const saveOffer = async (payload: any, files: File[]) => {
    if (!selectedId) return;
    try {
      setSaving(true);
      let revision: QuoteRevision;
      if (offerDialog.offer && offerDialog.revision) {
        revision = (await client.put<QuoteRevision>(`/quotes/${selectedId}/offers/${offerDialog.offer.id}/revisions/${offerDialog.revision.id}`, payload)).data;
      } else if (offerDialog.offer) {
        revision = (await client.post<QuoteRevision>(`/quotes/${selectedId}/offers/${offerDialog.offer.id}/revisions`, payload)).data;
      } else {
        const created = (await client.post<QuoteVendorOffer>(`/quotes/${selectedId}/offers`, payload)).data;
        if (!created.current_revision) throw new Error("Revizyon oluşturulamadı.");
        revision = created.current_revision;
      }
      if (files.length) {
        const formData = new FormData();
        files.forEach((file) => formData.append("files", file));
        await client.post(`/quotes/${selectedId}/offers/${revision.vendor_offer_id}/revisions/${revision.id}/documents`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      }
      setOfferDialog({ open: false, offer: null, revision: null });
      setFeedback({ severity: "success", message: offerDialog.revision ? "Revizyon aynı numara ve belge bağları korunarak güncellendi." : files.length ? "Teklif ve belgeleri kaydedildi." : "Teklif kaydedildi." });
      await invalidate();
    } catch (error) { showError(error); } finally { setSaving(false); }
  };
  const changeStatus = async (nextStatus: QuoteStatus) => {
    if (!selectedId) return;
    if (nextStatus === "ARCHIVED" && !window.confirm("Teklif süreci arşivlensin mi? Kayıtlar ve belgeler fiziksel olarak silinmez.")) return;
    try { setActionBusy(true); await client.patch(`/quotes/${selectedId}/status`, { status: nextStatus }); await invalidate(); setFeedback({ severity: "success", message: "Teklif durumu güncellendi." }); } catch (error) { showError(error); } finally { setActionBusy(false); }
  };
  const setPreferred = async (offerId: number | null) => {
    if (!selectedId) return;
    try { setActionBusy(true); await client.put(`/quotes/${selectedId}/preferred-offer`, { offer_id: offerId }); await invalidate(); setFeedback({ severity: "success", message: offerId ? "Tercih edilen teklif kaydedildi. Satın alma/harcama oluşturulmadı." : "Teklif tercihi kaldırıldı." }); } catch (error) { showError(error); } finally { setActionBusy(false); }
  };
  const archiveFromList = async (id: number) => {
    if (!window.confirm("Teklif süreci arşivlensin mi? Kayıtlar ve belgeler korunur.")) return;
    try { await client.patch(`/quotes/${id}/status`, { status: "ARCHIVED" }); await invalidate(); setFeedback({ severity: "success", message: "Teklif süreci arşivlendi." }); } catch (error) { showError(error); }
  };
  const deleteRevision = async (offer: QuoteVendorOffer, revision: QuoteRevision) => {
    if (!selectedId) return;
    const reason = window.prompt(`${offer.vendor_name} · Revizyon ${revision.revision_no} silinsin mi? Belgeler fiziksel olarak korunur. İsteğe bağlı silme nedeni:`, "");
    if (reason === null) return;
    try { setActionBusy(true); await client.delete(`/quotes/${selectedId}/offers/${offer.id}/revisions/${revision.id}`, { data: { reason: reason.trim() || null } }); await invalidate(); setFeedback({ severity: "success", message: "Revizyon silindi; önceki geçerli revizyon otomatik olarak aktif oldu." }); } catch (error) { showError(error); } finally { setActionBusy(false); }
  };
  const restoreRevision = async (offer: QuoteVendorOffer, revision: QuoteRevision) => {
    if (!selectedId) return;
    try { setActionBusy(true); await client.post(`/quotes/${selectedId}/offers/${offer.id}/revisions/${revision.id}/restore`); await invalidate(); setFeedback({ severity: "success", message: `Revizyon ${revision.revision_no} geri alındı.` }); } catch (error) { showError(error); } finally { setActionBusy(false); }
  };
  const deleteProcess = async () => {
    if (!deleteProcessTarget) return;
    try {
      setActionBusy(true);
      await client.delete(`/quotes/${deleteProcessTarget.id}`, { data: { reason: deleteReason.trim() || null } });
      if (selectedId === deleteProcessTarget.id) setSelectedId(null);
      setDeleteProcessTarget(null);
      setDeleteReason("");
      await invalidate();
      setFeedback({ severity: "success", message: "Teklif süreci silindi; teklifler, revizyonlar, belgeler ve işlem geçmişi korundu." });
    } catch (error) { showError(error); } finally { setActionBusy(false); }
  };
  const restoreProcess = async (row: QuoteListItem) => {
    try { setActionBusy(true); await client.post(`/quotes/deleted/${row.id}/restore`); await invalidate(); setFeedback({ severity: "success", message: `${row.quote_no} geri alındı.` }); } catch (error) { showError(error); } finally { setActionBusy(false); }
  };
  const previewDocument = async (document: QuoteDocument) => {
    try {
      const response = await client.get(`/quotes/documents/${document.id}/preview`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      if (preview?.url) URL.revokeObjectURL(preview.url);
      setPreview({ url, name: document.original_name });
    } catch (error) { showError(error); }
  };
  const downloadDocument = async (document: QuoteDocument) => {
    try {
      const response = await client.get(`/quotes/documents/${document.id}`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = document.original_name;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) { showError(error); }
  };
  const deactivateDocument = async (document: QuoteDocument) => {
    if (!window.confirm(`${document.original_name} pasife alınsın mı? Fiziksel dosya ve işlem kaydı korunur.`)) return;
    try { await client.delete(`/quotes/documents/${document.id}`); await invalidate(); setFeedback({ severity: "success", message: "Belge pasife alındı; fiziksel dosya ve geçmiş korundu." }); } catch (error) { showError(error); }
  };
  const uploadDocuments = async (offer: QuoteVendorOffer, revision: QuoteRevision, files: File[]) => {
    if (!selectedId || !files.length) return;
    try {
      setActionBusy(true);
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      await client.post(`/quotes/${selectedId}/offers/${offer.id}/revisions/${revision.id}/documents`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      await invalidate();
      setFeedback({ severity: "success", message: `${files.length} belge Revizyon ${revision.revision_no} kaydına eklendi.` });
    } catch (error) { showError(error); } finally { setActionBusy(false); }
  };
  const exportExcel = async () => {
    try {
      const response = await client.get("/quotes/export.xlsx", { params, responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = "teklif_yonetimi.xlsx";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) { showError(error); }
  };

  const summary = summaryQuery.data ?? { total_processes: 0, active_processes: 0, collected_offers: 0, completed_processes: 0, archived_processes: 0, deleted_processes: 0 };
  return (
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={2} mb={3}>
        <Box><Typography variant="h4" fontWeight={900}>Teklif Yönetimi</Typography><Typography color="text.secondary">Firma tekliflerini, revizyonları ve orijinal belgeleri bütçe akışından bağımsız yönetin.</Typography></Box>
        <Stack direction="row" spacing={1}>{isAdmin && <Button variant="outlined" startIcon={<RestoreFromTrashOutlinedIcon />} onClick={() => setDeletedDialogOpen(true)}>Silinen Teklifler ({summary.deleted_processes})</Button>}<Button variant="outlined" startIcon={<CloudDownloadOutlinedIcon />} onClick={exportExcel}>Excel Aktar</Button>{!readOnly && <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={() => { setEditingProcess(null); setProcessDialogOpen(true); }}>Yeni Teklif Süreci</Button>}</Stack>
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", xl: isAdmin ? "repeat(6, 1fr)" : "repeat(5, 1fr)" }, gap: 2, mb: 3 }}>
        <SummaryMetric label="Toplam Süreç" value={summary.total_processes} icon={<DescriptionOutlinedIcon fontSize="large" />} />
        <SummaryMetric label="Aktif Süreç" value={summary.active_processes} icon={<RefreshOutlinedIcon fontSize="large" />} />
        <SummaryMetric label="Toplanan Teklif" value={summary.collected_offers} icon={<CompareArrowsOutlinedIcon fontSize="large" />} />
        <SummaryMetric label="Sonuçlandırılan" value={summary.completed_processes} icon={<StarOutlineOutlinedIcon fontSize="large" />} />
        <SummaryMetric label="Arşivlenen" value={summary.archived_processes} icon={<ArchiveOutlinedIcon fontSize="large" />} />
        {isAdmin && <SummaryMetric label="Silinen" value={summary.deleted_processes} icon={<RestoreFromTrashOutlinedIcon fontSize="large" />} />}
      </Box>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)", xl: "repeat(5, 1fr)" }, gap: 1.5 }}>
          <TextField size="small" label="Teklif No / Süreç" value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} />
          <TextField size="small" label="Ürün Adı" value={filters.product_name} onChange={(event) => setFilters((current) => ({ ...current, product_name: event.target.value }))} />
          <TextField size="small" label="Ürün Kodu" value={filters.product_code} onChange={(event) => setFilters((current) => ({ ...current, product_code: event.target.value }))} />
          <TextField size="small" label="Satıcı Firma" value={filters.vendor} onChange={(event) => setFilters((current) => ({ ...current, vendor: event.target.value }))} />
          <TextField size="small" select label="Kategori" value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}><MenuItem value="">Tümü</MenuItem>{QUOTE_CATEGORIES.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}</TextField>
          <TextField size="small" select label="Para Birimi" value={filters.currency} onChange={(event) => setFilters((current) => ({ ...current, currency: event.target.value }))}><MenuItem value="">Tümü</MenuItem>{QUOTE_CURRENCIES.map((currency) => <MenuItem key={currency} value={currency}>{currency}</MenuItem>)}</TextField>
          <TextField size="small" select label="Durum" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><MenuItem value="">Tümü</MenuItem>{Object.entries(QUOTE_STATUSES).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
          <TextField size="small" type="date" label="Başlangıç" InputLabelProps={{ shrink: true }} value={filters.start_date} onChange={(event) => setFilters((current) => ({ ...current, start_date: event.target.value }))} />
          <TextField size="small" type="date" label="Bitiş" InputLabelProps={{ shrink: true }} value={filters.end_date} onChange={(event) => setFilters((current) => ({ ...current, end_date: event.target.value }))} />
          <TextField size="small" select label="Belge Durumu" value={filters.has_document} onChange={(event) => setFilters((current) => ({ ...current, has_document: event.target.value }))}><MenuItem value="">Tümü</MenuItem><MenuItem value="true">Belgesi Var</MenuItem><MenuItem value="false">Belgesi Yok</MenuItem></TextField>
        </Box>
        <Button sx={{ mt: 1.5 }} onClick={() => setFilters(emptyFilters)}>Filtreleri Temizle</Button>
      </Paper>
      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
        {listQuery.isLoading ? <Box sx={{ display: "grid", placeItems: "center", minHeight: 280 }}><CircularProgress /></Box> : (
          <TableContainer sx={{ overflowX: "auto" }}><Table sx={{ minWidth: 1100 }}><TableHead><TableRow><TableCell>Teklif No</TableCell><TableCell>Ürün / Süreç Adı</TableCell><TableCell>Kategori</TableCell><TableCell>Firma</TableCell><TableCell align="center">Teklif / Revizyon</TableCell><TableCell>Durum</TableCell><TableCell>Oluşturma</TableCell><TableCell>Belge</TableCell><TableCell align="right">İşlemler</TableCell></TableRow></TableHead><TableBody>{listQuery.data?.map((row) => <TableRow key={row.id} hover><TableCell><Button onClick={() => setSelectedId(row.id)} sx={{ fontWeight: 800 }}>{row.quote_no}</Button></TableCell><TableCell><Stack><Typography fontWeight={700} noWrap maxWidth={280}>{row.name}</Typography><Typography variant="caption" color="text.secondary">{QUOTE_PROCESS_TYPES[row.process_type]}</Typography></Stack></TableCell><TableCell><Stack direction="row" spacing={0.5}>{row.categories.slice(0, 2).map((category) => <Chip key={category} size="small" label={category} />)}{row.categories.length > 2 && <Chip size="small" label={`+${row.categories.length - 2}`} />}</Stack></TableCell><TableCell><Stack direction="row" spacing={0.5} flexWrap="wrap">{row.vendor_names.map((vendor) => <Chip key={vendor} size="small" label={vendor} sx={getVendorChipSx(vendor, row.vendor_names)} />)}{!row.vendor_names.length && "-"}</Stack></TableCell><TableCell align="center">{row.offer_count}</TableCell><TableCell><StatusChip status={row.status} /></TableCell><TableCell>{formatQuoteDate(row.created_at)}</TableCell><TableCell>{row.has_document ? <AttachFileOutlinedIcon color="primary" fontSize="small" /> : "-"}</TableCell><TableCell align="right"><Tooltip title="Detay"><IconButton onClick={() => setSelectedId(row.id)}><VisibilityOutlinedIcon /></IconButton></Tooltip>{!readOnly && <><Tooltip title="Düzenle"><IconButton onClick={() => openEdit(row.id)}><EditOutlinedIcon /></IconButton></Tooltip>{row.status !== "ARCHIVED" && <Tooltip title="Arşivle"><IconButton color="warning" onClick={() => archiveFromList(row.id)}><ArchiveOutlinedIcon /></IconButton></Tooltip>}<Tooltip title="Sil"><IconButton color="error" onClick={() => { setDeleteProcessTarget(row); setDeleteReason(""); }}><DeleteOutlineOutlinedIcon /></IconButton></Tooltip></>}</TableCell></TableRow>)}{!listQuery.data?.length && <TableRow><TableCell colSpan={9} align="center" sx={{ py: 6 }}>Filtrelerle eşleşen teklif süreci bulunamadı.</TableCell></TableRow>}</TableBody></Table></TableContainer>
        )}
      </Paper>
      <ProcessDialog open={processDialogOpen} editing={editingProcess} budgetItems={budgetItemsQuery.data ?? []} saving={saving} onClose={() => { setProcessDialogOpen(false); setEditingProcess(null); }} onSave={saveProcess} />
      {detailQuery.data && <OfferDialog open={offerDialog.open} process={detailQuery.data} offer={offerDialog.offer} revision={offerDialog.revision} saving={saving} onClose={() => setOfferDialog({ open: false, offer: null, revision: null })} onSave={saveOffer} />}
      <DetailDialog open={selectedId !== null} process={detailQuery.data} loading={detailQuery.isLoading} comparison={comparisonQuery.data} comparisonLoading={comparisonQuery.isLoading} readOnly={readOnly} isAdmin={isAdmin} actionBusy={actionBusy} onClose={() => setSelectedId(null)} onEdit={() => { if (detailQuery.data) { setEditingProcess(detailQuery.data); setProcessDialogOpen(true); } }} onAddOffer={() => setOfferDialog({ open: true, offer: null, revision: null })} onAddRevision={(offer) => setOfferDialog({ open: true, offer, revision: null })} onEditRevision={(offer, revision) => setOfferDialog({ open: true, offer, revision })} onDeleteRevision={deleteRevision} onRestoreRevision={restoreRevision} onDeleteProcess={(process) => { setDeleteProcessTarget(process); setDeleteReason(""); }} onStatus={changeStatus} onPreferred={setPreferred} onPreview={previewDocument} onDownload={downloadDocument} onDeactivate={deactivateDocument} onUploadDocuments={uploadDocuments} />
      <Dialog open={Boolean(deleteProcessTarget)} onClose={actionBusy ? undefined : () => setDeleteProcessTarget(null)} maxWidth="sm" fullWidth><DialogTitle>Teklif Sürecini Sil</DialogTitle><DialogContent dividers><Alert severity="warning" sx={{ mb: 2 }}><strong>{deleteProcessTarget?.quote_no}</strong> · {deleteProcessTarget?.name} kullanıcı listesi, özet, karşılaştırma ve Excel çıktısından kaldırılacak. Teklifler, revizyonlar, belge dosyaları ve işlem geçmişi fiziksel olarak korunacaktır.</Alert><TextField label="Silme nedeni (isteğe bağlı)" fullWidth multiline minRows={2} value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} /></DialogContent><DialogActions><Button onClick={() => setDeleteProcessTarget(null)} disabled={actionBusy}>Vazgeç</Button><Button color="error" variant="contained" onClick={deleteProcess} disabled={actionBusy}>Sil</Button></DialogActions></Dialog>
      <Dialog open={deletedDialogOpen} onClose={() => setDeletedDialogOpen(false)} maxWidth="md" fullWidth><DialogTitle>Silinen Teklifler</DialogTitle><DialogContent dividers><Stack spacing={1.5}>{deletedQuery.isLoading && <CircularProgress sx={{ alignSelf: "center" }} />}{deletedQuery.data?.map((row) => <Paper key={row.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}><Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1}><Box><Typography fontWeight={800}>{row.quote_no} · {row.name}</Typography><Typography variant="body2" color="text.secondary">Silinme: {formatQuoteDate(row.deleted_at, true)}{row.deleted_reason ? ` · ${row.deleted_reason}` : ""}</Typography></Box><Button startIcon={<RestoreFromTrashOutlinedIcon />} onClick={() => restoreProcess(row)} disabled={actionBusy}>Geri Al</Button></Stack></Paper>)}{deletedQuery.data && !deletedQuery.data.length && <Alert severity="info">Silinen teklif süreci bulunmuyor.</Alert>}</Stack></DialogContent><DialogActions><Button onClick={() => setDeletedDialogOpen(false)}>Kapat</Button></DialogActions></Dialog>
      <Dialog open={Boolean(preview)} onClose={() => { if (preview?.url) URL.revokeObjectURL(preview.url); setPreview(null); }} maxWidth="lg" fullWidth><DialogTitle>{preview?.name}</DialogTitle><DialogContent dividers sx={{ p: 0, height: "75vh" }}>{preview && <Box component="iframe" title={preview.name} src={preview.url} sx={{ width: "100%", height: "100%", border: 0 }} />}</DialogContent><DialogActions><Button onClick={() => { if (preview?.url) URL.revokeObjectURL(preview.url); setPreview(null); }}>Kapat</Button></DialogActions></Dialog>
      <Snackbar open={Boolean(feedback)} autoHideDuration={5000} onClose={() => setFeedback(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>{feedback ? <Alert severity={feedback.severity} onClose={() => setFeedback(null)}>{feedback.message}</Alert> : undefined}</Snackbar>
    </Box>
  );
}
