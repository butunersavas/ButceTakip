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
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
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
  QUOTE_STATUSES,
  calculateQuoteLineTotal,
  formatFileSize,
  formatQuoteCurrency,
  formatQuoteDate,
  type QuoteComparison,
  type QuoteCurrency,
  type QuoteDocument,
  type QuoteListItem,
  type QuoteProcess,
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
  source: "budget" | "manual";
  budget_item_id: string;
  name: string;
  product_code: string;
  category: string;
  description: string;
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
  source: "manual",
  budget_item_id: "",
  name: "",
  product_code: "",
  category: QUOTE_CATEGORIES[0],
  description: "",
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
  const [items, setItems] = useState<ProcessItemForm[]>([emptyProcessItem()]);
  const itemsLocked = Boolean(editing?.offers.length);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
    setItems(
      editing?.items.length
        ? editing.items.map((item) => ({
            source: item.budget_item_id ? "budget" : "manual",
            budget_item_id: item.budget_item_id ? String(item.budget_item_id) : "",
            name: item.name,
            product_code: item.product_code ?? "",
            category: item.category,
            description: item.description ?? "",
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
    const payload: any = { name: name.trim(), description: description.trim() || null };
    if (!itemsLocked) {
      payload.items = items.map((item) => ({
        budget_item_id: item.source === "budget" && item.budget_item_id ? Number(item.budget_item_id) : null,
        name: item.name.trim(),
        product_code: item.product_code.trim() || null,
        category: item.category,
        description: item.description.trim() || null,
      }));
    }
    await onSave(payload);
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>{editing ? "Teklif Sürecini Düzenle" : "Yeni Teklif Süreci"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          <TextField label="Teklif süreci adı" required fullWidth value={name} onChange={(event) => setName(event.target.value)} />
          <TextField label="Açıklama / Not" fullWidth multiline minRows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
              <Typography variant="subtitle1" fontWeight={700}>Ürün / Hizmet Kalemleri</Typography>
              {!itemsLocked && <Button startIcon={<AddOutlinedIcon />} onClick={() => setItems((current) => [...current, emptyProcessItem()])}>Kalem Ekle</Button>}
            </Stack>
            {itemsLocked && <Alert severity="info" sx={{ mb: 2 }}>Firma teklifi bulunan süreçte ana kalemler kilitlidir. Fiyat/kapsam değişikliği için yeni firma revizyonu oluşturun.</Alert>}
            <Stack spacing={2}>
              {items.map((item, index) => (
                <Paper key={index} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Stack spacing={1.5}>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                      <TextField select label="Giriş yöntemi" value={item.source} disabled={itemsLocked} onChange={(event) => updateItem(index, { source: event.target.value as ProcessItemForm["source"], budget_item_id: "", name: "", product_code: "" })} sx={{ minWidth: 210 }}>
                        <MenuItem value="budget">Mevcut bütçe ürünü</MenuItem>
                        <MenuItem value="manual">Manuel ürün / hizmet</MenuItem>
                      </TextField>
                      {item.source === "budget" ? (
                        <Autocomplete
                          fullWidth
                          options={budgetItems}
                          value={budgetItems.find((budgetItem) => String(budgetItem.id) === item.budget_item_id) ?? null}
                          disabled={itemsLocked}
                          getOptionLabel={(budgetItem) => `${budgetItem.code} · ${budgetItem.name}`}
                          isOptionEqualToValue={(option, value) => option.id === value.id}
                          noOptionsText="Eşleşen bütçe ürünü bulunamadı"
                          onChange={(_, selected) => selectBudgetItem(index, selected ? String(selected.id) : "")}
                          renderInput={(params) => <TextField {...params} label="Bütçe ürünü ara" required />}
                        />
                      ) : (
                        <TextField label="Ürün / hizmet adı" required fullWidth value={item.name} disabled={itemsLocked} onChange={(event) => updateItem(index, { name: event.target.value })} />
                      )}
                    </Stack>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                      <TextField label="Ürün kodu" fullWidth value={item.product_code} disabled={itemsLocked || item.source === "budget"} onChange={(event) => updateItem(index, { product_code: event.target.value })} />
                      <TextField select label="Kategori" required fullWidth value={item.category} disabled={itemsLocked} onChange={(event) => updateItem(index, { category: event.target.value })}>
                        {QUOTE_CATEGORIES.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
                      </TextField>
                    </Stack>
                    <TextField label="Kalem açıklaması" fullWidth value={item.description} disabled={itemsLocked} onChange={(event) => updateItem(index, { description: event.target.value })} />
                    {!itemsLocked && items.length > 1 && <Button color="error" startIcon={<DeleteOutlineOutlinedIcon />} onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} sx={{ alignSelf: "flex-start" }}>Kalemi Kaldır</Button>}
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>İptal</Button>
        <Button variant="contained" onClick={submit} disabled={saving || !name.trim() || items.some((item) => !item.name.trim())}>{saving ? <CircularProgress size={22} /> : "Kaydet"}</Button>
      </DialogActions>
    </Dialog>
  );
}

function OfferDialog({
  open,
  process,
  offer,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  process: QuoteProcess;
  offer: QuoteVendorOffer | null;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: any, files: File[]) => Promise<void>;
}) {
  const [vendorName, setVendorName] = useState("");
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState("");
  const [currency, setCurrency] = useState<QuoteCurrency>("USD");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<OfferItemForm[]>([]);
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    if (!open) return;
    const current = offer?.current_revision;
    setVendorName(offer?.vendor_name ?? "");
    setQuoteDate(new Date().toISOString().slice(0, 10));
    setValidUntil("");
    setCurrency(current?.currency ?? "USD");
    setNote("");
    setFiles([]);
    setItems(
      current?.items.length
        ? current.items.map((item) => ({
            process_item_id: item.process_item_id ? String(item.process_item_id) : "",
            product_name: item.product_name,
            product_code: item.product_code ?? "",
            category: item.category,
            duration_months: item.duration_months ? String(item.duration_months) : "",
            quantity: String(item.quantity),
            unit_price: String(item.unit_price),
            description: item.description ?? "",
          }))
        : process.items.map((item) => ({
            process_item_id: String(item.id),
            product_name: item.name,
            product_code: item.product_code ?? "",
            category: item.category,
            duration_months: "",
            quantity: "1",
            unit_price: "0",
            description: "",
          })),
    );
  }, [offer, open, process.items]);

  const updateItem = (index: number, patch: Partial<OfferItemForm>) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const selectProcessItem = (index: number, value: string) => {
    const selected = process.items.find((item) => String(item.id) === value);
    updateItem(index, {
      process_item_id: value,
      product_name: selected?.name ?? "",
      product_code: selected?.product_code ?? "",
      category: selected?.category ?? QUOTE_CATEGORIES[0],
    });
  };
  const total = items.reduce((sum, item) => sum + calculateQuoteLineTotal(item.quantity, item.unit_price), 0);
  const submit = async () => {
    const revision = {
      quote_date: quoteDate,
      valid_until: validUntil || null,
      currency,
      note: note.trim() || null,
      items: items.map((item) => ({
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
    await onSave(offer ? revision : { vendor_name: vendorName.trim(), revision }, files);
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="lg" fullWidth>
      <DialogTitle>{offer ? `${offer.vendor_name} · Yeni Revizyon` : "Yeni Firma Teklifi"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          {!offer && <TextField label="Satıcı Firma" required fullWidth value={vendorName} onChange={(event) => setVendorName(event.target.value)} />}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 1.5 }}>
            <TextField label="Teklif Tarihi" type="date" required value={quoteDate} onChange={(event) => setQuoteDate(event.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField label="Geçerlilik Tarihi" type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField select label="Para Birimi" value={currency} onChange={(event) => setCurrency(event.target.value as QuoteCurrency)}>{QUOTE_CURRENCIES.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField>
            <TextField label="Firma Toplamı" value={formatQuoteCurrency(total, currency)} InputProps={{ readOnly: true }} />
          </Box>
          <TextField label="Revizyon açıklaması" fullWidth value={note} onChange={(event) => setNote(event.target.value)} />
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
              <Typography variant="subtitle1" fontWeight={700}>Teklif Kalemleri</Typography>
              <Button startIcon={<AddOutlinedIcon />} onClick={() => setItems((current) => [...current, { process_item_id: "", product_name: "", product_code: "", category: QUOTE_CATEGORIES[0], duration_months: "", quantity: "1", unit_price: "0", description: "" }])}>Kalem Ekle</Button>
            </Stack>
            <Stack spacing={1.5}>
              {items.map((item, index) => (
                <Paper key={index} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr 1fr 0.8fr 0.9fr 1fr" }, gap: 1.25 }}>
                    <TextField select label="Süreç Kalemi" value={item.process_item_id} onChange={(event) => selectProcessItem(index, event.target.value)}>
                      <MenuItem value="">Manuel kalem</MenuItem>
                      {process.items.map((processItem) => <MenuItem key={processItem.id} value={processItem.id}>{processItem.name}</MenuItem>)}
                    </TextField>
                    <TextField label="Ürün Kodu" value={item.product_code} onChange={(event) => updateItem(index, { product_code: event.target.value })} />
                    <TextField select label="Kategori" value={item.category} onChange={(event) => updateItem(index, { category: event.target.value })}>{QUOTE_CATEGORIES.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}</TextField>
                    <TextField select label="Süre" value={item.duration_months} onChange={(event) => updateItem(index, { duration_months: event.target.value })}><MenuItem value="">Uygulanmaz</MenuItem>{QUOTE_DURATIONS.map((duration) => <MenuItem key={duration} value={duration}>{duration} Ay</MenuItem>)}</TextField>
                    <TextField label="Adet" type="number" inputProps={{ min: 0.0001, step: 1 }} value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} />
                    <TextField label="Birim Fiyat" type="number" inputProps={{ min: 0, step: 0.01 }} value={item.unit_price} onChange={(event) => updateItem(index, { unit_price: event.target.value })} />
                  </Box>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} mt={1.25} alignItems="center">
                    <TextField label="Ürün / Hizmet Adı" required fullWidth value={item.product_name} onChange={(event) => updateItem(index, { product_name: event.target.value })} />
                    <TextField label="Açıklama" fullWidth value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} />
                    <Typography fontWeight={700} noWrap>{formatQuoteCurrency(calculateQuoteLineTotal(item.quantity, item.unit_price), currency)}</Typography>
                    {items.length > 1 && <IconButton color="error" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><DeleteOutlineOutlinedIcon /></IconButton>}
                  </Stack>
                </Paper>
              ))}
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
        <Button variant="contained" onClick={submit} disabled={saving || (!offer && !vendorName.trim()) || !quoteDate || !items.length || items.some((item) => !item.product_name.trim() || Number(item.quantity) <= 0 || Number(item.unit_price) < 0)}>{saving ? <CircularProgress size={22} /> : offer ? "Revizyonu Kaydet" : "Teklifi Kaydet"}</Button>
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
  actionBusy,
  onClose,
  onEdit,
  onAddOffer,
  onAddRevision,
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
  actionBusy: boolean;
  onClose: () => void;
  onEdit: () => void;
  onAddOffer: () => void;
  onAddRevision: (offer: QuoteVendorOffer) => void;
  onStatus: (status: QuoteStatus) => void;
  onPreferred: (offerId: number | null) => void;
  onPreview: (document: QuoteDocument) => void;
  onDownload: (document: QuoteDocument) => void;
  onDeactivate: (document: QuoteDocument) => void;
  onUploadDocuments: (offer: QuoteVendorOffer, revision: QuoteRevision, files: File[]) => void;
}) {
  const [tab, setTab] = useState(0);
  useEffect(() => { if (open) setTab(0); }, [open, process?.id]);
  const allDocuments = process?.offers.flatMap((offer) => offer.revisions.flatMap((revision) => revision.documents.map((document) => ({ document, offer, revision })))) ?? [];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth fullScreen={false} PaperProps={{ sx: { minHeight: { md: "82vh" } } }}>
      <DialogTitle>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1} alignItems={{ sm: "center" }}>
          <Box><Typography variant="h6" fontWeight={800}>{process?.quote_no ?? "Teklif Detayı"}</Typography><Typography variant="body2" color="text.secondary">{process?.name}</Typography></Box>
          {process && <Stack direction="row" spacing={1} alignItems="center"><StatusChip status={process.status} />{!readOnly && <Button startIcon={<EditOutlinedIcon />} onClick={onEdit}>Düzenle</Button>}</Stack>}
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
                  <Stack direction="row" spacing={1} flexWrap="wrap" mt={2}>{process.items.map((item) => <Chip key={item.id} label={`${item.name} · ${item.category}`} variant="outlined" />)}</Stack>
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
                        <Typography fontWeight={800} sx={{ flexGrow: 1 }}>{offer.vendor_name}</Typography>
                        {process.preferred_offer_id === offer.id && <Chip color="success" size="small" icon={<StarOutlineOutlinedIcon />} label="Tercih Edilen" />}
                        {offer.current_revision && <Typography fontWeight={800}>{formatQuoteCurrency(offer.current_revision.total_amount, offer.current_revision.currency)}</Typography>}
                        <Chip size="small" label={`${offer.revisions.length} revizyon`} />
                      </Stack>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Stack spacing={2}>
                        {!readOnly && process.status !== "ARCHIVED" && <Button variant="outlined" startIcon={<AddOutlinedIcon />} onClick={() => onAddRevision(offer)} sx={{ alignSelf: "flex-start" }}>Yeni Revizyon</Button>}
                        {offer.revisions.map((revision) => (
                          <Paper key={revision.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="space-between" mb={1.5}>
                              <Box><Typography fontWeight={800}>Revizyon {revision.revision_no}</Typography><Typography variant="body2" color="text.secondary">{formatQuoteDate(revision.quote_date)} · Geçerlilik: {formatQuoteDate(revision.valid_until)}</Typography></Box>
                              <Typography variant="h6" fontWeight={800}>{formatQuoteCurrency(revision.total_amount, revision.currency)}</Typography>
                            </Stack>
                            <TableContainer sx={{ overflowX: "auto" }}><Table size="small" sx={{ minWidth: 720 }}><TableHead><TableRow><TableCell>Ürün</TableCell><TableCell>Kod</TableCell><TableCell>Süre</TableCell><TableCell align="right">Adet</TableCell><TableCell align="right">Birim Fiyat</TableCell><TableCell align="right">Tutar</TableCell></TableRow></TableHead><TableBody>{revision.items.map((item) => <TableRow key={item.id}><TableCell>{item.product_name}</TableCell><TableCell>{item.product_code ?? "-"}</TableCell><TableCell>{item.duration_months ? `${item.duration_months} Ay` : "-"}</TableCell><TableCell align="right">{item.quantity}</TableCell><TableCell align="right">{formatQuoteCurrency(item.unit_price, revision.currency)}</TableCell><TableCell align="right">{formatQuoteCurrency(item.line_total, revision.currency)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
                            {revision.note && <Typography mt={1.5} variant="body2">{revision.note}</Typography>}
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }} mt={1.5}>
                              {!readOnly && <Button component="label" size="small" variant="outlined" startIcon={<AttachFileOutlinedIcon />}>Bu Revizyona Belge Ekle<input hidden type="file" multiple accept=".pdf,.xlsx,.xls,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { const selected = Array.from(event.target.files ?? []); if (selected.length) onUploadDocuments(offer, revision, selected); event.target.value = ""; }} /></Button>}
                              <Typography variant="caption" color="text.secondary">PDF / XLSX / XLS · Eski belgeler korunur</Typography>
                            </Stack>
                            {revision.documents.length > 0 && <Stack mt={1.5} spacing={0.75}>{revision.documents.map((document) => <Stack key={document.id} direction="row" spacing={1} alignItems="center"><AttachFileOutlinedIcon fontSize="small" color={document.is_active ? "primary" : "disabled"} /><Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }} noWrap>{document.original_name} · {formatFileSize(document.size_bytes)}</Typography>{!document.is_active && <Chip size="small" label="Pasif" />}<DocumentActions document={document} readOnly={readOnly} onPreview={onPreview} onDownload={onDownload} onDeactivate={onDeactivate} /></Stack>)}</Stack>}
                          </Paper>
                        ))}
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
                  {comparison.offers.map((offer) => <Card key={offer.offer_id} variant="outlined" sx={{ borderColor: offer.is_lowest ? "success.main" : offer.is_preferred ? "primary.main" : "divider", borderWidth: offer.is_lowest || offer.is_preferred ? 2 : 1, borderRadius: 3 }}><CardContent><Stack spacing={1.25}><Stack direction="row" justifyContent="space-between" spacing={1}><Typography fontWeight={800} noWrap>{offer.vendor_name}</Typography><Stack direction="row" spacing={0.5}>{offer.is_lowest && <Chip color="success" size="small" label="En Düşük" />}{offer.is_preferred && <Chip color="primary" size="small" label="Tercih" />}</Stack></Stack><Typography variant="h5" fontWeight={900}>{formatQuoteCurrency(offer.total_amount, offer.currency)}</Typography><Typography variant="body2" color="text.secondary">Son geçerli revizyon: {offer.revision_no}</Typography>{offer.warning && <Alert severity="info" sx={{ py: 0 }}>{offer.warning}</Alert>}<Stack direction="row" spacing={1}>{!readOnly && <Button size="small" variant={offer.is_preferred ? "outlined" : "contained"} startIcon={<StarOutlineOutlinedIcon />} onClick={() => onPreferred(offer.is_preferred ? null : offer.offer_id)}>{offer.is_preferred ? "Tercihi Kaldır" : "Tercih Et"}</Button>}{offer.documents.map((document) => document.content_type === "application/pdf" ? <Button key={document.id} size="small" onClick={() => onPreview(document)}>PDF Görüntüle</Button> : null)}</Stack></Stack></CardContent></Card>)}
                </Box>
                <Paper variant="outlined" sx={{ borderRadius: 2 }}><TableContainer sx={{ overflowX: "auto" }}><Table size="small" sx={{ minWidth: 820 }}><TableHead><TableRow><TableCell>Kalem</TableCell>{comparison.offers.map((offer) => <TableCell key={offer.offer_id}>{offer.vendor_name}</TableCell>)}</TableRow></TableHead><TableBody>{comparison.item_rows.map((row) => <TableRow key={row.key}><TableCell sx={{ fontWeight: 700 }}>{row.label}</TableCell>{comparison.offers.map((offer) => { const cell = row.cells.find((candidate) => candidate.offer_id === offer.offer_id); return <TableCell key={offer.offer_id}>{cell ? <Stack spacing={0.25}><Typography variant="body2">{cell.item.quantity} adet · {cell.item.duration_months ? `${cell.item.duration_months} ay` : "süre yok"}</Typography><Typography fontWeight={700}>{formatQuoteCurrency(cell.item.line_total, offer.currency)}</Typography></Stack> : "-"}</TableCell>; })}</TableRow>)}</TableBody></Table></TableContainer></Paper>
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
  const [filters, setFilters] = useState(emptyFilters);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [processDialogOpen, setProcessDialogOpen] = useState(false);
  const [editingProcess, setEditingProcess] = useState<QuoteProcess | null>(null);
  const [offerDialog, setOfferDialog] = useState<{ open: boolean; offer: QuoteVendorOffer | null }>({ open: false, offer: null });
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ severity: "success" | "error"; message: string } | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  const params = useMemo(() => Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== "")), [filters]);
  const summaryQuery = useQuery({ queryKey: ["quote-summary"], queryFn: async () => (await client.get<QuoteSummary>("/quotes/summary")).data });
  const listQuery = useQuery({ queryKey: ["quotes", params], queryFn: async () => (await client.get<QuoteListItem[]>("/quotes", { params })).data });
  const budgetItemsQuery = useQuery({ queryKey: ["budget-items-for-quotes"], queryFn: async () => (await client.get<BudgetItem[]>("/budget-items")).data, staleTime: 5 * 60 * 1000 });
  const detailQuery = useQuery({ queryKey: ["quote-detail", selectedId], queryFn: async () => (await client.get<QuoteProcess>(`/quotes/${selectedId}`)).data, enabled: selectedId !== null });
  const comparisonQuery = useQuery({ queryKey: ["quote-comparison", selectedId], queryFn: async () => (await client.get<QuoteComparison>(`/quotes/${selectedId}/comparison`)).data, enabled: selectedId !== null });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["quote-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["quotes"] }),
      queryClient.invalidateQueries({ queryKey: ["quote-detail"] }),
      queryClient.invalidateQueries({ queryKey: ["quote-comparison"] }),
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
      if (offerDialog.offer) {
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
      setOfferDialog({ open: false, offer: null });
      setFeedback({ severity: "success", message: files.length ? "Teklif ve belgeleri kaydedildi." : "Teklif kaydedildi." });
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

  const summary = summaryQuery.data ?? { total_processes: 0, active_processes: 0, collected_offers: 0, completed_processes: 0, archived_processes: 0 };
  return (
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={2} mb={3}>
        <Box><Typography variant="h4" fontWeight={900}>Teklif Yönetimi</Typography><Typography color="text.secondary">Firma tekliflerini, revizyonları ve orijinal belgeleri bütçe akışından bağımsız yönetin.</Typography></Box>
        <Stack direction="row" spacing={1}><Button variant="outlined" startIcon={<CloudDownloadOutlinedIcon />} onClick={exportExcel}>Excel Aktar</Button>{!readOnly && <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={() => { setEditingProcess(null); setProcessDialogOpen(true); }}>Yeni Teklif Süreci</Button>}</Stack>
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", xl: "repeat(5, 1fr)" }, gap: 2, mb: 3 }}>
        <SummaryMetric label="Toplam Süreç" value={summary.total_processes} icon={<DescriptionOutlinedIcon fontSize="large" />} />
        <SummaryMetric label="Aktif Süreç" value={summary.active_processes} icon={<RefreshOutlinedIcon fontSize="large" />} />
        <SummaryMetric label="Toplanan Teklif" value={summary.collected_offers} icon={<CompareArrowsOutlinedIcon fontSize="large" />} />
        <SummaryMetric label="Sonuçlandırılan" value={summary.completed_processes} icon={<StarOutlineOutlinedIcon fontSize="large" />} />
        <SummaryMetric label="Arşivlenen" value={summary.archived_processes} icon={<ArchiveOutlinedIcon fontSize="large" />} />
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
          <TableContainer sx={{ overflowX: "auto" }}><Table sx={{ minWidth: 980 }}><TableHead><TableRow><TableCell>Teklif No</TableCell><TableCell>Ürün / Süreç Adı</TableCell><TableCell>Kategori</TableCell><TableCell align="center">Firma</TableCell><TableCell align="center">Teklif / Revizyon</TableCell><TableCell>Durum</TableCell><TableCell>Oluşturma</TableCell><TableCell>Belge</TableCell><TableCell align="right">İşlemler</TableCell></TableRow></TableHead><TableBody>{listQuery.data?.map((row) => <TableRow key={row.id} hover><TableCell><Button onClick={() => setSelectedId(row.id)} sx={{ fontWeight: 800 }}>{row.quote_no}</Button></TableCell><TableCell><Typography fontWeight={700} noWrap maxWidth={280}>{row.name}</Typography></TableCell><TableCell><Stack direction="row" spacing={0.5}>{row.categories.slice(0, 2).map((category) => <Chip key={category} size="small" label={category} />)}{row.categories.length > 2 && <Chip size="small" label={`+${row.categories.length - 2}`} />}</Stack></TableCell><TableCell align="center">{row.vendor_count}</TableCell><TableCell align="center">{row.offer_count}</TableCell><TableCell><StatusChip status={row.status} /></TableCell><TableCell>{formatQuoteDate(row.created_at)}</TableCell><TableCell>{row.has_document ? <AttachFileOutlinedIcon color="primary" fontSize="small" /> : "-"}</TableCell><TableCell align="right"><Tooltip title="Detay"><IconButton onClick={() => setSelectedId(row.id)}><VisibilityOutlinedIcon /></IconButton></Tooltip>{!readOnly && <><Tooltip title="Düzenle"><IconButton onClick={() => openEdit(row.id)}><EditOutlinedIcon /></IconButton></Tooltip>{row.status !== "ARCHIVED" && <Tooltip title="Arşivle"><IconButton color="warning" onClick={() => archiveFromList(row.id)}><ArchiveOutlinedIcon /></IconButton></Tooltip>}</>}</TableCell></TableRow>)}{!listQuery.data?.length && <TableRow><TableCell colSpan={9} align="center" sx={{ py: 6 }}>Filtrelerle eşleşen teklif süreci bulunamadı.</TableCell></TableRow>}</TableBody></Table></TableContainer>
        )}
      </Paper>
      <ProcessDialog open={processDialogOpen} editing={editingProcess} budgetItems={budgetItemsQuery.data ?? []} saving={saving} onClose={() => { setProcessDialogOpen(false); setEditingProcess(null); }} onSave={saveProcess} />
      {detailQuery.data && <OfferDialog open={offerDialog.open} process={detailQuery.data} offer={offerDialog.offer} saving={saving} onClose={() => setOfferDialog({ open: false, offer: null })} onSave={saveOffer} />}
      <DetailDialog open={selectedId !== null} process={detailQuery.data} loading={detailQuery.isLoading} comparison={comparisonQuery.data} comparisonLoading={comparisonQuery.isLoading} readOnly={readOnly} actionBusy={actionBusy} onClose={() => setSelectedId(null)} onEdit={() => { if (detailQuery.data) { setEditingProcess(detailQuery.data); setProcessDialogOpen(true); } }} onAddOffer={() => setOfferDialog({ open: true, offer: null })} onAddRevision={(offer) => setOfferDialog({ open: true, offer })} onStatus={changeStatus} onPreferred={setPreferred} onPreview={previewDocument} onDownload={downloadDocument} onDeactivate={deactivateDocument} onUploadDocuments={uploadDocuments} />
      <Dialog open={Boolean(preview)} onClose={() => { if (preview?.url) URL.revokeObjectURL(preview.url); setPreview(null); }} maxWidth="lg" fullWidth><DialogTitle>{preview?.name}</DialogTitle><DialogContent dividers sx={{ p: 0, height: "75vh" }}>{preview && <Box component="iframe" title={preview.name} src={preview.url} sx={{ width: "100%", height: "100%", border: 0 }} />}</DialogContent><DialogActions><Button onClick={() => { if (preview?.url) URL.revokeObjectURL(preview.url); setPreview(null); }}>Kapat</Button></DialogActions></Dialog>
      <Snackbar open={Boolean(feedback)} autoHideDuration={5000} onClose={() => setFeedback(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>{feedback ? <Alert severity={feedback.severity} onClose={() => setFeedback(null)}>{feedback.message}</Alert> : undefined}</Snackbar>
    </Box>
  );
}
