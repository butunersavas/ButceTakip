from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Optional

from pydantic import BaseModel, Field, root_validator, validator


QUOTE_STATUSES = {
    "COLLECTING",
    "EVALUATING",
    "COMPLETED",
    "CANCELLED",
    "ARCHIVED",
}
QUOTE_CURRENCIES = {"USD"}
QUOTE_DURATIONS = {1, 6, 12, 24, 36, 60}


def _required_text(value: str, label: str) -> str:
    normalized = (value or "").strip()
    if not normalized:
        raise ValueError(f"{label} zorunludur.")
    return normalized


def _optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _decimal(value: object, label: str) -> Decimal:
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError(f"{label} geçerli bir sayı olmalıdır.") from exc
    if not parsed.is_finite():
        raise ValueError(f"{label} geçerli bir sayı olmalıdır.")
    return parsed


class QuoteProcessItemInput(BaseModel):
    budget_item_id: Optional[int] = None
    name: str = Field(min_length=1, max_length=250)
    product_code: Optional[str] = Field(default=None, max_length=120)
    category: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None

    _name = validator("name", allow_reuse=True)(lambda value: _required_text(value, "Ürün / hizmet adı"))
    _category = validator("category", allow_reuse=True)(lambda value: _required_text(value, "Kategori"))
    _product_code = validator("product_code", allow_reuse=True)(_optional_text)
    _description = validator("description", allow_reuse=True)(_optional_text)


class QuoteProcessCreate(BaseModel):
    name: str = Field(min_length=1, max_length=250)
    description: Optional[str] = None
    items: list[QuoteProcessItemInput] = Field(min_items=1)

    _name = validator("name", allow_reuse=True)(lambda value: _required_text(value, "Teklif süreci adı"))
    _description = validator("description", allow_reuse=True)(_optional_text)


class QuoteProcessUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=250)
    description: Optional[str] = None
    items: Optional[list[QuoteProcessItemInput]] = None

    @validator("name")
    def validate_name(cls, value: Optional[str]) -> Optional[str]:
        return None if value is None else _required_text(value, "Teklif süreci adı")

    _description = validator("description", allow_reuse=True)(_optional_text)

    @validator("items")
    def validate_items(cls, value: Optional[list[QuoteProcessItemInput]]):
        if value is not None and not value:
            raise ValueError("En az bir ürün veya hizmet kalemi olmalıdır.")
        return value


class QuoteStatusUpdate(BaseModel):
    status: str

    @validator("status")
    def validate_status(cls, value: str) -> str:
        normalized = value.strip().upper()
        if normalized not in QUOTE_STATUSES:
            raise ValueError("Geçersiz teklif durumu.")
        return normalized


class QuotePreferredOfferUpdate(BaseModel):
    offer_id: Optional[int] = None


class QuoteOfferItemInput(BaseModel):
    process_item_id: Optional[int] = None
    product_name: str = Field(min_length=1, max_length=250)
    product_code: Optional[str] = Field(default=None, max_length=120)
    category: str = Field(min_length=1, max_length=100)
    duration_months: Optional[int] = None
    quantity: Decimal
    unit_price: Decimal
    description: Optional[str] = None

    _product_name = validator("product_name", allow_reuse=True)(
        lambda value: _required_text(value, "Ürün / hizmet adı")
    )
    _category = validator("category", allow_reuse=True)(lambda value: _required_text(value, "Kategori"))
    _product_code = validator("product_code", allow_reuse=True)(_optional_text)
    _description = validator("description", allow_reuse=True)(_optional_text)

    @validator("duration_months")
    def validate_duration(cls, value: Optional[int]) -> Optional[int]:
        if value is not None and value not in QUOTE_DURATIONS:
            raise ValueError("Süre 1, 6, 12, 24, 36, 60 ay veya uygulanmaz olmalıdır.")
        return value

    @validator("quantity", pre=True)
    def validate_quantity(cls, value: object) -> Decimal:
        parsed = _decimal(value, "Adet")
        if parsed <= 0:
            raise ValueError("Adet sıfırdan büyük olmalıdır.")
        return parsed

    @validator("unit_price", pre=True)
    def validate_price(cls, value: object) -> Decimal:
        parsed = _decimal(value, "Birim fiyat")
        if parsed < 0:
            raise ValueError("Birim fiyat negatif olamaz.")
        return parsed


class QuoteRevisionCreate(BaseModel):
    quote_date: date
    valid_until: Optional[date] = None
    currency: str = "USD"
    note: Optional[str] = None
    items: list[QuoteOfferItemInput] = Field(min_items=1)

    @validator("currency")
    def validate_currency(cls, value: str) -> str:
        normalized = value.strip().upper()
        if normalized not in QUOTE_CURRENCIES:
            raise ValueError("Yeni teklifler yalnız USD para birimiyle oluşturulabilir.")
        return normalized

    _note = validator("note", allow_reuse=True)(_optional_text)

    @root_validator
    def validate_dates(cls, values: dict):
        quote_date = values.get("quote_date")
        valid_until = values.get("valid_until")
        if quote_date and valid_until and valid_until < quote_date:
            raise ValueError("Teklif geçerlilik tarihi teklif tarihinden önce olamaz.")
        return values


class QuoteVendorOfferCreate(BaseModel):
    vendor_name: str = Field(min_length=1, max_length=250)
    revision: QuoteRevisionCreate

    _vendor_name = validator("vendor_name", allow_reuse=True)(
        lambda value: _required_text(value, "Satıcı firma")
    )


class QuoteVendorOfferUpdate(BaseModel):
    vendor_name: str = Field(min_length=1, max_length=250)

    _vendor_name = validator("vendor_name", allow_reuse=True)(
        lambda value: _required_text(value, "Satıcı firma")
    )


class QuoteProcessItemRead(BaseModel):
    id: int
    budget_item_id: Optional[int] = None
    name: str
    product_code: Optional[str] = None
    category: str
    description: Optional[str] = None
    sort_order: int

    class Config:
        orm_mode = True


class QuoteDocumentRead(BaseModel):
    id: int
    process_id: int
    vendor_offer_id: int
    revision_id: int
    original_name: str
    content_type: str
    size_bytes: int
    sha256: str
    uploaded_by_id: int
    uploaded_by_name: Optional[str] = None
    is_active: bool
    created_at: datetime
    deactivated_at: Optional[datetime] = None


class QuoteOfferItemRead(BaseModel):
    id: int
    process_item_id: Optional[int] = None
    product_name: str
    product_code: Optional[str] = None
    category: str
    duration_months: Optional[int] = None
    quantity: Decimal
    unit_price: Decimal
    line_total: Decimal
    description: Optional[str] = None
    sort_order: int

    class Config:
        orm_mode = True


class QuoteRevisionRead(BaseModel):
    id: int
    vendor_offer_id: int
    revision_no: int
    quote_date: date
    valid_until: Optional[date] = None
    currency: str
    total_amount: Decimal
    note: Optional[str] = None
    created_by_id: int
    created_by_name: Optional[str] = None
    created_at: datetime
    items: list[QuoteOfferItemRead] = Field(default_factory=list)
    documents: list[QuoteDocumentRead] = Field(default_factory=list)


class QuoteVendorOfferRead(BaseModel):
    id: int
    process_id: int
    vendor_name: str
    created_by_id: int
    is_active: bool
    created_at: datetime
    current_revision: Optional[QuoteRevisionRead] = None
    revisions: list[QuoteRevisionRead] = Field(default_factory=list)


class QuoteAuditRead(BaseModel):
    id: int
    action: str
    details: Optional[str] = None
    user_id: int
    user_name: Optional[str] = None
    vendor_offer_id: Optional[int] = None
    revision_id: Optional[int] = None
    document_id: Optional[int] = None
    created_at: datetime


class QuoteProcessRead(BaseModel):
    id: int
    quote_no: str
    name: str
    description: Optional[str] = None
    status: str
    created_by_id: int
    created_by_name: Optional[str] = None
    preferred_offer_id: Optional[int] = None
    archived_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    items: list[QuoteProcessItemRead] = Field(default_factory=list)
    offers: list[QuoteVendorOfferRead] = Field(default_factory=list)
    audit_logs: list[QuoteAuditRead] = Field(default_factory=list)


class QuoteListItem(BaseModel):
    id: int
    quote_no: str
    name: str
    categories: list[str] = Field(default_factory=list)
    vendor_count: int = 0
    offer_count: int = 0
    status: str
    created_at: datetime
    has_document: bool = False


class QuoteSummaryRead(BaseModel):
    total_processes: int = 0
    active_processes: int = 0
    collected_offers: int = 0
    completed_processes: int = 0
    archived_processes: int = 0


class QuoteComparisonOffer(BaseModel):
    offer_id: int
    vendor_name: str
    revision_id: int
    revision_no: int
    currency: str
    total_amount: Decimal
    is_comparable: bool
    is_lowest: bool
    is_preferred: bool
    warning: Optional[str] = None
    items: list[QuoteOfferItemRead] = Field(default_factory=list)
    documents: list[QuoteDocumentRead] = Field(default_factory=list)


class QuoteItemComparisonCell(BaseModel):
    offer_id: int
    vendor_name: str
    item: QuoteOfferItemRead


class QuoteItemComparisonRow(BaseModel):
    key: str
    label: str
    cells: list[QuoteItemComparisonCell] = Field(default_factory=list)


class QuoteComparisonRead(BaseModel):
    process_id: int
    quote_no: str
    process_name: str
    offers: list[QuoteComparisonOffer] = Field(default_factory=list)
    item_rows: list[QuoteItemComparisonRow] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
