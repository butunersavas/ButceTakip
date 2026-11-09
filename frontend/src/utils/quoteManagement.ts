export const QUOTE_CATEGORIES = [
  "Donanım",
  "Yazılım",
  "Lisans Uzatma",
  "Bakım Anlaşması Uzatma",
] as const;

export const QUOTE_STATUSES = {
  COLLECTING: "Teklif Toplanıyor",
  EVALUATING: "Değerlendiriliyor",
  COMPLETED: "Sonuçlandırıldı",
  CANCELLED: "İptal Edildi",
  ARCHIVED: "Arşivlendi",
} as const;

export const QUOTE_CURRENCIES = ["USD"] as const;
export const QUOTE_DURATIONS = [1, 6, 12, 24, 36, 60] as const;

export type QuoteStatus = keyof typeof QUOTE_STATUSES;
export type QuoteCurrency = string;

export interface QuoteSummary {
  total_processes: number;
  active_processes: number;
  collected_offers: number;
  completed_processes: number;
  archived_processes: number;
}

export interface QuoteListItem {
  id: number;
  quote_no: string;
  name: string;
  categories: string[];
  vendor_count: number;
  offer_count: number;
  status: QuoteStatus;
  created_at: string;
  has_document: boolean;
}

export interface QuoteProcessItem {
  id: number;
  budget_item_id: number | null;
  name: string;
  product_code: string | null;
  category: string;
  description: string | null;
  sort_order: number;
}

export interface QuoteDocument {
  id: number;
  process_id: number;
  vendor_offer_id: number;
  revision_id: number;
  original_name: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  uploaded_by_id: number;
  uploaded_by_name: string | null;
  is_active: boolean;
  created_at: string;
  deactivated_at: string | null;
}

export interface QuoteOfferItem {
  id: number;
  process_item_id: number | null;
  product_name: string;
  product_code: string | null;
  category: string;
  duration_months: number | null;
  quantity: string | number;
  unit_price: string | number;
  line_total: string | number;
  description: string | null;
  sort_order: number;
}

export interface QuoteRevision {
  id: number;
  vendor_offer_id: number;
  revision_no: number;
  quote_date: string;
  valid_until: string | null;
  currency: QuoteCurrency;
  total_amount: string | number;
  note: string | null;
  created_by_id: number;
  created_by_name: string | null;
  created_at: string;
  items: QuoteOfferItem[];
  documents: QuoteDocument[];
}

export interface QuoteVendorOffer {
  id: number;
  process_id: number;
  vendor_name: string;
  created_by_id: number;
  is_active: boolean;
  created_at: string;
  current_revision: QuoteRevision | null;
  revisions: QuoteRevision[];
}

export interface QuoteAuditLog {
  id: number;
  action: string;
  details: string | null;
  user_id: number;
  user_name: string | null;
  vendor_offer_id: number | null;
  revision_id: number | null;
  document_id: number | null;
  created_at: string;
}

export interface QuoteProcess {
  id: number;
  quote_no: string;
  name: string;
  description: string | null;
  status: QuoteStatus;
  created_by_id: number;
  created_by_name: string | null;
  preferred_offer_id: number | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  items: QuoteProcessItem[];
  offers: QuoteVendorOffer[];
  audit_logs: QuoteAuditLog[];
}

export interface QuoteComparisonOffer {
  offer_id: number;
  vendor_name: string;
  revision_id: number;
  revision_no: number;
  currency: QuoteCurrency;
  total_amount: string | number;
  is_comparable: boolean;
  is_lowest: boolean;
  is_preferred: boolean;
  warning: string | null;
  items: QuoteOfferItem[];
  documents: QuoteDocument[];
}

export interface QuoteItemComparisonRow {
  key: string;
  label: string;
  cells: Array<{
    offer_id: number;
    vendor_name: string;
    item: QuoteOfferItem;
  }>;
}

export interface QuoteComparison {
  process_id: number;
  quote_no: string;
  process_name: string;
  offers: QuoteComparisonOffer[];
  item_rows: QuoteItemComparisonRow[];
  warnings: string[];
}

export function formatQuoteCurrency(value: string | number | null | undefined, currency: string) {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

export function calculateQuoteLineTotal(quantity: string | number, unitPrice: string | number) {
  const parsedQuantity = Number(quantity);
  const parsedUnitPrice = Number(unitPrice);
  if (!Number.isFinite(parsedQuantity) || !Number.isFinite(parsedUnitPrice)) return 0;
  return Math.round((parsedQuantity * parsedUnitPrice + Number.EPSILON) * 100) / 100;
}

export function formatQuoteDate(value: string | null | undefined, includeTime = false) {
  if (!value) return "-";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
