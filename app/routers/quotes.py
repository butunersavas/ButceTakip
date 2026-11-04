from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from hashlib import sha256
from io import BytesIO
import json
import re
from typing import Iterable, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, Response
from openpyxl import Workbook
from sqlalchemy import func, or_, text
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.dependencies import get_current_user, get_db_session, get_write_user
from app.models import (
    BudgetItem,
    QuoteAuditLog,
    QuoteDocument,
    QuoteNumberSequence,
    QuoteOfferItem,
    QuoteOfferRevision,
    QuoteProcess,
    QuoteProcessItem,
    QuoteVendorOffer,
    User,
)
from app.quote_schemas import (
    QUOTE_STATUSES,
    QuoteAuditRead,
    QuoteComparisonOffer,
    QuoteComparisonRead,
    QuoteDocumentRead,
    QuoteItemComparisonCell,
    QuoteItemComparisonRow,
    QuoteListItem,
    QuoteOfferItemRead,
    QuotePreferredOfferUpdate,
    QuoteProcessCreate,
    QuoteProcessItemRead,
    QuoteProcessRead,
    QuoteProcessUpdate,
    QuoteRevisionCreate,
    QuoteRevisionRead,
    QuoteStatusUpdate,
    QuoteSummaryRead,
    QuoteVendorOfferCreate,
    QuoteVendorOfferRead,
    QuoteVendorOfferUpdate,
)
from app.services.quote_storage import (
    discard_stored_document,
    read_and_validate_upload,
    resolve_document_path,
    store_document,
)


router = APIRouter(prefix="/quotes", tags=["Quote Management"])
MONEY_QUANTUM = Decimal("0.01")


def _money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


def _user_name(user: User | None) -> Optional[str]:
    if not user:
        return None
    return (user.full_name or user.username or "").strip() or None


def _audit(
    session: Session,
    *,
    process_id: int,
    action: str,
    user_id: int,
    vendor_offer_id: int | None = None,
    revision_id: int | None = None,
    document_id: int | None = None,
    details: dict | None = None,
) -> None:
    session.add(
        QuoteAuditLog(
            process_id=process_id,
            vendor_offer_id=vendor_offer_id,
            revision_id=revision_id,
            document_id=document_id,
            action=action,
            details=json.dumps(details, ensure_ascii=False, default=str) if details else None,
            user_id=user_id,
        )
    )


def _get_process(session: Session, process_id: int) -> QuoteProcess:
    process = session.get(QuoteProcess, process_id)
    if not process:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teklif süreci bulunamadı.")
    return process


def _ensure_mutable(process: QuoteProcess) -> None:
    if process.status == "ARCHIVED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Arşivlenmiş teklif süreci değiştirilemez.",
        )


def _get_offer(session: Session, process_id: int, offer_id: int) -> QuoteVendorOffer:
    offer = session.get(QuoteVendorOffer, offer_id)
    if not offer or offer.process_id != process_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Firma teklifi bulunamadı.")
    return offer


def _get_revision(session: Session, offer: QuoteVendorOffer, revision_id: int) -> QuoteOfferRevision:
    revision = session.get(QuoteOfferRevision, revision_id)
    if not revision or revision.vendor_offer_id != offer.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teklif revizyonu bulunamadı.")
    return revision


def _next_quote_number(session: Session, year: int) -> str:
    dialect = session.get_bind().dialect.name
    if dialect in {"postgresql", "sqlite"}:
        value = session.execute(
            text(
                "INSERT INTO quote_number_sequences (year, last_value) VALUES (:year, 1) "
                "ON CONFLICT (year) DO UPDATE SET last_value = quote_number_sequences.last_value + 1 "
                "RETURNING last_value"
            ),
            {"year": year},
        ).scalar_one()
    else:
        sequence = session.get(QuoteNumberSequence, year)
        if not sequence:
            sequence = QuoteNumberSequence(year=year, last_value=1)
        else:
            sequence.last_value += 1
        session.add(sequence)
        session.flush()
        value = sequence.last_value
    return f"TKL-{year}-{int(value):04d}"


def _validate_budget_item(session: Session, budget_item_id: int | None) -> None:
    if budget_item_id is not None and not session.get(BudgetItem, budget_item_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Seçilen bütçe ürünü bulunamadı.")


def _replace_process_items(
    session: Session,
    process: QuoteProcess,
    items: Iterable,
) -> list[QuoteProcessItem]:
    current = session.exec(
        select(QuoteProcessItem).where(QuoteProcessItem.process_id == process.id)
    ).all()
    for existing in current:
        session.delete(existing)
    created: list[QuoteProcessItem] = []
    for index, item in enumerate(items):
        _validate_budget_item(session, item.budget_item_id)
        row = QuoteProcessItem(
            process_id=process.id,
            budget_item_id=item.budget_item_id,
            name=item.name,
            product_code=item.product_code,
            category=item.category,
            description=item.description,
            sort_order=index,
        )
        session.add(row)
        created.append(row)
    return created


def _validate_revision_item_links(
    session: Session,
    process_id: int,
    revision_in: QuoteRevisionCreate,
) -> None:
    valid_ids = set(
        session.exec(
            select(QuoteProcessItem.id).where(QuoteProcessItem.process_id == process_id)
        ).all()
    )
    for item in revision_in.items:
        if item.process_item_id is not None and item.process_item_id not in valid_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Teklif kalemi bu teklif sürecine ait olmayan bir ürüne bağlanamaz.",
            )


def _create_revision_rows(
    session: Session,
    *,
    process_id: int,
    offer: QuoteVendorOffer,
    revision_in: QuoteRevisionCreate,
    current_user: User,
) -> QuoteOfferRevision:
    _validate_revision_item_links(session, process_id, revision_in)
    if session.get_bind().dialect.name == "postgresql":
        session.exec(
            select(QuoteVendorOffer).where(QuoteVendorOffer.id == offer.id).with_for_update()
        ).one()
    latest_number = session.exec(
        select(func.max(QuoteOfferRevision.revision_no)).where(
            QuoteOfferRevision.vendor_offer_id == offer.id
        )
    ).one()
    revision_no = int(latest_number or 0) + 1
    line_rows: list[QuoteOfferItem] = []
    total = Decimal("0.00")
    revision = QuoteOfferRevision(
        vendor_offer_id=offer.id,
        revision_no=revision_no,
        quote_date=revision_in.quote_date,
        valid_until=revision_in.valid_until,
        currency=revision_in.currency,
        total_amount=Decimal("0.00"),
        note=revision_in.note,
        created_by_id=current_user.id,
    )
    session.add(revision)
    session.flush()
    for index, item in enumerate(revision_in.items):
        line_total = _money(item.quantity * item.unit_price)
        total += line_total
        line_rows.append(
            QuoteOfferItem(
                revision_id=revision.id,
                process_item_id=item.process_item_id,
                product_name=item.product_name,
                product_code=item.product_code,
                category=item.category,
                duration_months=item.duration_months,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_total=line_total,
                description=item.description,
                sort_order=index,
            )
        )
    revision.total_amount = _money(total)
    session.add(revision)
    session.add_all(line_rows)
    session.flush()
    return revision


def _document_read(session: Session, document: QuoteDocument) -> QuoteDocumentRead:
    return QuoteDocumentRead(
        **document.model_dump(exclude={"storage_key"}),
        uploaded_by_name=_user_name(session.get(User, document.uploaded_by_id)),
    )


def _item_read(item: QuoteOfferItem) -> QuoteOfferItemRead:
    return QuoteOfferItemRead.from_orm(item)


def _revision_read(session: Session, revision: QuoteOfferRevision) -> QuoteRevisionRead:
    items = session.exec(
        select(QuoteOfferItem)
        .where(QuoteOfferItem.revision_id == revision.id)
        .order_by(QuoteOfferItem.sort_order, QuoteOfferItem.id)
    ).all()
    documents = session.exec(
        select(QuoteDocument)
        .where(QuoteDocument.revision_id == revision.id)
        .order_by(QuoteDocument.created_at.desc())
    ).all()
    return QuoteRevisionRead(
        **revision.model_dump(),
        created_by_name=_user_name(session.get(User, revision.created_by_id)),
        items=[_item_read(item) for item in items],
        documents=[_document_read(session, document) for document in documents],
    )


def _offer_read(session: Session, offer: QuoteVendorOffer, *, include_history: bool) -> QuoteVendorOfferRead:
    revisions = session.exec(
        select(QuoteOfferRevision)
        .where(QuoteOfferRevision.vendor_offer_id == offer.id)
        .order_by(QuoteOfferRevision.revision_no.desc())
    ).all()
    revision_reads = [_revision_read(session, revision) for revision in revisions]
    return QuoteVendorOfferRead(
        **offer.model_dump(),
        current_revision=revision_reads[0] if revision_reads else None,
        revisions=revision_reads if include_history else [],
    )


def _process_read(session: Session, process: QuoteProcess) -> QuoteProcessRead:
    items = session.exec(
        select(QuoteProcessItem)
        .where(QuoteProcessItem.process_id == process.id)
        .order_by(QuoteProcessItem.sort_order, QuoteProcessItem.id)
    ).all()
    offers = session.exec(
        select(QuoteVendorOffer)
        .where(QuoteVendorOffer.process_id == process.id)
        .order_by(QuoteVendorOffer.created_at, QuoteVendorOffer.id)
    ).all()
    logs = session.exec(
        select(QuoteAuditLog)
        .where(QuoteAuditLog.process_id == process.id)
        .order_by(QuoteAuditLog.created_at.desc(), QuoteAuditLog.id.desc())
    ).all()
    audit_reads = [
        QuoteAuditRead(
            **log.model_dump(),
            user_name=_user_name(session.get(User, log.user_id)),
        )
        for log in logs
    ]
    return QuoteProcessRead(
        **process.model_dump(),
        created_by_name=_user_name(session.get(User, process.created_by_id)),
        items=[QuoteProcessItemRead.from_orm(item) for item in items],
        offers=[_offer_read(session, offer, include_history=True) for offer in offers],
        audit_logs=audit_reads,
    )


def _process_matches_filters(
    session: Session,
    process: QuoteProcess,
    *,
    quote_no: str | None,
    product_name: str | None,
    product_code: str | None,
    vendor: str | None,
    category: str | None,
    currency: str | None,
    process_status: str | None,
    start_date: date | None,
    end_date: date | None,
    has_document: bool | None,
) -> bool:
    if quote_no and quote_no.casefold() not in process.quote_no.casefold():
        return False
    if process_status and process.status != process_status:
        return False
    if start_date and process.created_at.date() < start_date:
        return False
    if end_date and process.created_at.date() > end_date:
        return False
    items = session.exec(
        select(QuoteProcessItem).where(QuoteProcessItem.process_id == process.id)
    ).all()
    offers = session.exec(
        select(QuoteVendorOffer).where(QuoteVendorOffer.process_id == process.id)
    ).all()
    if vendor and not any(vendor.casefold() in offer.vendor_name.casefold() for offer in offers):
        return False
    offer_ids = [offer.id for offer in offers]
    revision_ids = (
        session.exec(
            select(QuoteOfferRevision.id).where(QuoteOfferRevision.vendor_offer_id.in_(offer_ids))
        ).all()
        if offer_ids
        else []
    )
    offer_items = (
        session.exec(
            select(QuoteOfferItem).where(QuoteOfferItem.revision_id.in_(revision_ids))
        ).all()
        if revision_ids
        else []
    )
    if category and not (
        any(category.casefold() == item.category.casefold() for item in items)
        or any(category.casefold() == item.category.casefold() for item in offer_items)
    ):
        return False
    if product_name and not (
        any(product_name.casefold() in item.name.casefold() for item in items)
        or any(product_name.casefold() in item.product_name.casefold() for item in offer_items)
    ):
        return False
    if product_code and not (
        any(product_code.casefold() in (item.product_code or "").casefold() for item in items)
        or any(
            product_code.casefold() in (item.product_code or "").casefold()
            for item in offer_items
        )
    ):
        return False
    if currency:
        revisions = session.exec(
            select(QuoteOfferRevision).where(QuoteOfferRevision.id.in_(revision_ids))
        ).all() if revision_ids else []
        if not any(revision.currency == currency for revision in revisions):
            return False
    if has_document is not None:
        count = session.exec(
            select(func.count(QuoteDocument.id)).where(
                QuoteDocument.process_id == process.id,
                QuoteDocument.is_active.is_(True),
            )
        ).one()
        if bool(count) is not has_document:
            return False
    return True


def _list_item(session: Session, process: QuoteProcess) -> QuoteListItem:
    items = session.exec(
        select(QuoteProcessItem).where(QuoteProcessItem.process_id == process.id)
    ).all()
    offers = session.exec(
        select(QuoteVendorOffer).where(
            QuoteVendorOffer.process_id == process.id,
            QuoteVendorOffer.is_active.is_(True),
        )
    ).all()
    offer_ids = [offer.id for offer in offers]
    revision_count = (
        session.exec(
            select(func.count(QuoteOfferRevision.id)).where(
                QuoteOfferRevision.vendor_offer_id.in_(offer_ids)
            )
        ).one()
        if offer_ids
        else 0
    )
    document_count = session.exec(
        select(func.count(QuoteDocument.id)).where(
            QuoteDocument.process_id == process.id,
            QuoteDocument.is_active.is_(True),
        )
    ).one()
    return QuoteListItem(
        id=process.id,
        quote_no=process.quote_no,
        name=process.name,
        categories=sorted({item.category for item in items}),
        vendor_count=len(offers),
        offer_count=int(revision_count),
        status=process.status,
        created_at=process.created_at,
        has_document=bool(document_count),
    )


@router.get("/summary", response_model=QuoteSummaryRead)
def get_quote_summary(
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> QuoteSummaryRead:
    processes = session.exec(select(QuoteProcess)).all()
    return QuoteSummaryRead(
        total_processes=len(processes),
        active_processes=sum(p.status in {"COLLECTING", "EVALUATING"} for p in processes),
        collected_offers=int(
            session.exec(
                select(func.count(QuoteVendorOffer.id)).where(QuoteVendorOffer.is_active.is_(True))
            ).one()
        ),
        completed_processes=sum(p.status == "COMPLETED" for p in processes),
        archived_processes=sum(p.status == "ARCHIVED" for p in processes),
    )


@router.get("", response_model=list[QuoteListItem])
@router.get("/", response_model=list[QuoteListItem], include_in_schema=False)
def list_quote_processes(
    q: str | None = Query(default=None),
    quote_no: str | None = Query(default=None),
    product_name: str | None = Query(default=None),
    product_code: str | None = Query(default=None),
    vendor: str | None = Query(default=None),
    category: str | None = Query(default=None),
    currency: str | None = Query(default=None),
    process_status: str | None = Query(default=None, alias="status"),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    has_document: bool | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> list[QuoteListItem]:
    if process_status:
        process_status = process_status.strip().upper()
        if process_status not in QUOTE_STATUSES:
            raise HTTPException(status_code=400, detail="Geçersiz teklif durumu.")
    if currency:
        currency = currency.strip().upper()
    statement = select(QuoteProcess)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(QuoteProcess.quote_no.ilike(pattern), QuoteProcess.name.ilike(pattern))
        )
    processes = session.exec(statement.order_by(QuoteProcess.created_at.desc())).all()
    return [
        _list_item(session, process)
        for process in processes
        if _process_matches_filters(
            session,
            process,
            quote_no=quote_no,
            product_name=product_name,
            product_code=product_code,
            vendor=vendor,
            category=category,
            currency=currency,
            process_status=process_status,
            start_date=start_date,
            end_date=end_date,
            has_document=has_document,
        )
    ]


@router.get("/export.xlsx")
def export_quote_processes(
    q: str | None = Query(default=None),
    quote_no: str | None = Query(default=None),
    product_name: str | None = Query(default=None),
    product_code: str | None = Query(default=None),
    vendor: str | None = Query(default=None),
    category: str | None = Query(default=None),
    currency: str | None = Query(default=None),
    process_status: str | None = Query(default=None, alias="status"),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    has_document: bool | None = Query(default=None),
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> Response:
    listed = list_quote_processes(
        q, quote_no, product_name, product_code, vendor, category, currency,
        process_status, start_date, end_date, has_document, session, current_user
    )
    process_ids = {row.id for row in listed}
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Teklifler"
    sheet.append([
        "Teklif No", "Süreç", "Firma", "Revizyon", "Ürün", "Ürün Kodu",
        "Kategori", "Adet", "Lisans / Bakım (Ay)", "Para Birimi", "Teklif Tutarı",
        "Teklif Tarihi", "Süreç Durumu", "Belge Var",
    ])
    for process in session.exec(select(QuoteProcess).where(QuoteProcess.id.in_(process_ids))).all() if process_ids else []:
        offers = session.exec(
            select(QuoteVendorOffer).where(QuoteVendorOffer.process_id == process.id)
        ).all()
        for offer in offers:
            revision = session.exec(
                select(QuoteOfferRevision)
                .where(QuoteOfferRevision.vendor_offer_id == offer.id)
                .order_by(QuoteOfferRevision.revision_no.desc())
            ).first()
            if not revision:
                continue
            documents_exist = bool(
                session.exec(
                    select(func.count(QuoteDocument.id)).where(
                        QuoteDocument.revision_id == revision.id,
                        QuoteDocument.is_active.is_(True),
                    )
                ).one()
            )
            for item in session.exec(
                select(QuoteOfferItem)
                .where(QuoteOfferItem.revision_id == revision.id)
                .order_by(QuoteOfferItem.sort_order)
            ).all():
                sheet.append([
                    process.quote_no, process.name, offer.vendor_name, revision.revision_no,
                    item.product_name, item.product_code, item.category, float(item.quantity),
                    item.duration_months, revision.currency, float(item.line_total),
                    revision.quote_date, process.status, "Evet" if documents_exist else "Hayır",
                ])
    for column in sheet.columns:
        sheet.column_dimensions[column[0].column_letter].width = min(
            max(len(str(cell.value or "")) for cell in column) + 2, 42
        )
    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="teklif_yonetimi.xlsx"'},
    )


@router.post("", response_model=QuoteProcessRead, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=QuoteProcessRead, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_quote_process(
    payload: QuoteProcessCreate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_write_user),
) -> QuoteProcessRead:
    try:
        quote_no = _next_quote_number(session, date.today().year)
        process = QuoteProcess(
            quote_no=quote_no,
            name=payload.name,
            description=payload.description,
            created_by_id=current_user.id,
        )
        session.add(process)
        session.flush()
        _replace_process_items(session, process, payload.items)
        _audit(
            session,
            process_id=process.id,
            action="PROCESS_CREATED",
            user_id=current_user.id,
            details={"quote_no": quote_no, "name": process.name},
        )
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="Teklif numarası oluşturulurken çakışma oluştu.") from exc
    session.refresh(process)
    return _process_read(session, process)


@router.get("/{process_id}", response_model=QuoteProcessRead)
def get_quote_process(
    process_id: int,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> QuoteProcessRead:
    return _process_read(session, _get_process(session, process_id))


@router.put("/{process_id}", response_model=QuoteProcessRead)
def update_quote_process(
    process_id: int,
    payload: QuoteProcessUpdate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_write_user),
) -> QuoteProcessRead:
    process = _get_process(session, process_id)
    _ensure_mutable(process)
    if payload.items is not None:
        offer_count = session.exec(
            select(func.count(QuoteVendorOffer.id)).where(QuoteVendorOffer.process_id == process.id)
        ).one()
        if offer_count:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Firma teklifi bulunan süreçte ana kalemler değiştirilemez; yeni revizyon oluşturun.",
            )
        _replace_process_items(session, process, payload.items)
    if payload.name is not None:
        process.name = payload.name
    if "description" in payload.__fields_set__:
        process.description = payload.description
    process.updated_at = datetime.utcnow()
    session.add(process)
    _audit(session, process_id=process.id, action="PROCESS_UPDATED", user_id=current_user.id)
    session.commit()
    session.refresh(process)
    return _process_read(session, process)


@router.patch("/{process_id}/status", response_model=QuoteProcessRead)
def update_quote_status(
    process_id: int,
    payload: QuoteStatusUpdate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_write_user),
) -> QuoteProcessRead:
    process = _get_process(session, process_id)
    previous = process.status
    process.status = payload.status
    process.updated_at = datetime.utcnow()
    if payload.status == "ARCHIVED":
        process.archived_at = datetime.utcnow()
        process.archived_by_id = current_user.id
    elif previous == "ARCHIVED":
        process.archived_at = None
        process.archived_by_id = None
    session.add(process)
    _audit(
        session,
        process_id=process.id,
        action="STATUS_CHANGED",
        user_id=current_user.id,
        details={"from": previous, "to": payload.status},
    )
    session.commit()
    session.refresh(process)
    return _process_read(session, process)


@router.put("/{process_id}/preferred-offer", response_model=QuoteProcessRead)
def set_preferred_offer(
    process_id: int,
    payload: QuotePreferredOfferUpdate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_write_user),
) -> QuoteProcessRead:
    process = _get_process(session, process_id)
    _ensure_mutable(process)
    if payload.offer_id is not None:
        offer = _get_offer(session, process_id, payload.offer_id)
        if not offer.is_active:
            raise HTTPException(status_code=400, detail="Pasif firma teklifi tercih edilemez.")
    process.preferred_offer_id = payload.offer_id
    process.updated_at = datetime.utcnow()
    session.add(process)
    _audit(
        session,
        process_id=process.id,
        vendor_offer_id=payload.offer_id,
        action="PREFERRED_OFFER_CHANGED",
        user_id=current_user.id,
        details={"offer_id": payload.offer_id},
    )
    session.commit()
    session.refresh(process)
    return _process_read(session, process)


@router.post("/{process_id}/offers", response_model=QuoteVendorOfferRead, status_code=201)
def create_vendor_offer(
    process_id: int,
    payload: QuoteVendorOfferCreate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_write_user),
) -> QuoteVendorOfferRead:
    process = _get_process(session, process_id)
    _ensure_mutable(process)
    offer = QuoteVendorOffer(
        process_id=process.id,
        vendor_name=payload.vendor_name,
        created_by_id=current_user.id,
    )
    session.add(offer)
    session.flush()
    revision = _create_revision_rows(
        session,
        process_id=process.id,
        offer=offer,
        revision_in=payload.revision,
        current_user=current_user,
    )
    _audit(
        session,
        process_id=process.id,
        vendor_offer_id=offer.id,
        revision_id=revision.id,
        action="OFFER_CREATED",
        user_id=current_user.id,
        details={"vendor": offer.vendor_name, "revision_no": revision.revision_no},
    )
    session.commit()
    session.refresh(offer)
    return _offer_read(session, offer, include_history=True)


@router.put("/{process_id}/offers/{offer_id}", response_model=QuoteVendorOfferRead)
def update_vendor_offer(
    process_id: int,
    offer_id: int,
    payload: QuoteVendorOfferUpdate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_write_user),
) -> QuoteVendorOfferRead:
    process = _get_process(session, process_id)
    _ensure_mutable(process)
    offer = _get_offer(session, process_id, offer_id)
    old_name = offer.vendor_name
    offer.vendor_name = payload.vendor_name
    offer.updated_at = datetime.utcnow()
    session.add(offer)
    _audit(
        session, process_id=process_id, vendor_offer_id=offer.id,
        action="OFFER_UPDATED", user_id=current_user.id,
        details={"from": old_name, "to": offer.vendor_name},
    )
    session.commit()
    session.refresh(offer)
    return _offer_read(session, offer, include_history=True)


@router.post(
    "/{process_id}/offers/{offer_id}/revisions",
    response_model=QuoteRevisionRead,
    status_code=201,
)
def create_offer_revision(
    process_id: int,
    offer_id: int,
    payload: QuoteRevisionCreate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_write_user),
) -> QuoteRevisionRead:
    process = _get_process(session, process_id)
    _ensure_mutable(process)
    offer = _get_offer(session, process_id, offer_id)
    try:
        revision = _create_revision_rows(
            session,
            process_id=process.id,
            offer=offer,
            revision_in=payload,
            current_user=current_user,
        )
        _audit(
            session,
            process_id=process.id,
            vendor_offer_id=offer.id,
            revision_id=revision.id,
            action="REVISION_CREATED",
            user_id=current_user.id,
            details={"revision_no": revision.revision_no, "total": revision.total_amount},
        )
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="Revizyon numarası oluşturulurken çakışma oluştu.") from exc
    session.refresh(revision)
    return _revision_read(session, revision)


@router.post(
    "/{process_id}/offers/{offer_id}/revisions/{revision_id}/documents",
    response_model=list[QuoteDocumentRead],
    status_code=201,
)
def upload_quote_documents(
    process_id: int,
    offer_id: int,
    revision_id: int,
    files: list[UploadFile] = File(...),
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_write_user),
) -> list[QuoteDocumentRead]:
    process = _get_process(session, process_id)
    _ensure_mutable(process)
    offer = _get_offer(session, process_id, offer_id)
    revision = _get_revision(session, offer, revision_id)
    if not files:
        raise HTTPException(status_code=400, detail="En az bir belge seçmelisiniz.")
    validated = [read_and_validate_upload(file) for file in files]
    stored_keys: list[str] = []
    documents: list[QuoteDocument] = []
    try:
        for document in validated:
            storage_key = store_document(document, process_id=process_id)
            stored_keys.append(storage_key)
            row = QuoteDocument(
                process_id=process_id,
                vendor_offer_id=offer_id,
                revision_id=revision.id,
                original_name=document.original_name,
                storage_key=storage_key,
                content_type=document.content_type,
                size_bytes=document.size_bytes,
                sha256=document.sha256,
                uploaded_by_id=current_user.id,
            )
            session.add(row)
            session.flush()
            documents.append(row)
            _audit(
                session,
                process_id=process_id,
                vendor_offer_id=offer_id,
                revision_id=revision.id,
                document_id=row.id,
                action="DOCUMENT_UPLOADED",
                user_id=current_user.id,
                details={"name": row.original_name, "size": row.size_bytes, "sha256": row.sha256},
            )
        session.commit()
    except Exception:
        session.rollback()
        for storage_key in stored_keys:
            discard_stored_document(storage_key)
        raise
    for document in documents:
        session.refresh(document)
    return [_document_read(session, document) for document in documents]


def _get_active_document(session: Session, document_id: int) -> QuoteDocument:
    document = session.get(QuoteDocument, document_id)
    if not document or not document.is_active:
        raise HTTPException(status_code=404, detail="Belge bulunamadı veya pasife alınmış.")
    return document


def _content_disposition(file_name: str, disposition: str) -> str:
    fallback = re.sub(r"[^A-Za-z0-9._ -]+", "_", file_name).strip(" .") or "belge"
    return f"{disposition}; filename=\"{fallback}\"; filename*=UTF-8''{quote(file_name, safe='')}"


def _verified_document_file(session: Session, document_id: int) -> tuple[QuoteDocument, str]:
    document = _get_active_document(session, document_id)
    path = resolve_document_path(document.storage_key)
    digest = sha256(path.read_bytes()).hexdigest()
    if digest != document.sha256:
        raise HTTPException(status_code=409, detail="Belge bütünlük kontrolü başarısız.")
    return document, str(path)


@router.get("/documents/{document_id}")
def download_quote_document(
    document_id: int,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> FileResponse:
    document, path = _verified_document_file(session, document_id)
    return FileResponse(
        path,
        media_type=document.content_type,
        headers={
            "Content-Disposition": _content_disposition(document.original_name, "attachment"),
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/documents/{document_id}/preview")
def preview_quote_document(
    document_id: int,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> FileResponse:
    document, path = _verified_document_file(session, document_id)
    if document.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Yalnızca PDF belgeleri tarayıcıda önizlenebilir.")
    return FileResponse(
        path,
        media_type="application/pdf",
        headers={
            "Content-Disposition": _content_disposition(document.original_name, "inline"),
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox; default-src 'none'",
        },
    )


@router.get("/documents/{document_id}/integrity")
def verify_quote_document(
    document_id: int,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> dict[str, object]:
    document, _ = _verified_document_file(session, document_id)
    return {"document_id": document.id, "sha256": document.sha256, "valid": True}


@router.delete("/documents/{document_id}", response_model=QuoteDocumentRead)
def deactivate_quote_document(
    document_id: int,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_write_user),
) -> QuoteDocumentRead:
    document = _get_active_document(session, document_id)
    _ensure_mutable(_get_process(session, document.process_id))
    document.is_active = False
    document.deactivated_at = datetime.utcnow()
    document.deactivated_by_id = current_user.id
    document.updated_at = datetime.utcnow()
    session.add(document)
    _audit(
        session,
        process_id=document.process_id,
        vendor_offer_id=document.vendor_offer_id,
        revision_id=document.revision_id,
        document_id=document.id,
        action="DOCUMENT_DEACTIVATED",
        user_id=current_user.id,
        details={"name": document.original_name, "physical_file_retained": True},
    )
    session.commit()
    session.refresh(document)
    return _document_read(session, document)


def _scope_signature(items: list[QuoteOfferItemRead]) -> tuple:
    return tuple(
        sorted(
            (
                item.process_item_id or 0,
                (item.product_code or "").strip().casefold(),
                item.product_name.strip().casefold(),
                item.category.strip().casefold(),
                str(item.quantity.normalize()),
                item.duration_months or 0,
            )
            for item in items
        )
    )


def _comparison_row_key(item: QuoteOfferItemRead) -> tuple[str, str]:
    if item.process_item_id:
        return f"process:{item.process_item_id}", item.product_name
    code_or_name = (item.product_code or item.product_name).strip().casefold()
    return f"manual:{code_or_name}", item.product_name


@router.get("/{process_id}/comparison", response_model=QuoteComparisonRead)
def compare_quote_offers(
    process_id: int,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> QuoteComparisonRead:
    process = _get_process(session, process_id)
    offers = session.exec(
        select(QuoteVendorOffer).where(
            QuoteVendorOffer.process_id == process.id,
            QuoteVendorOffer.is_active.is_(True),
        )
    ).all()
    current: list[tuple[QuoteVendorOffer, QuoteRevisionRead]] = []
    for offer in offers:
        offer_read = _offer_read(session, offer, include_history=False)
        if offer_read.current_revision:
            current.append((offer, offer_read.current_revision))

    by_currency: dict[str, list[tuple[QuoteVendorOffer, QuoteRevisionRead]]] = defaultdict(list)
    for row in current:
        by_currency[row[1].currency].append(row)
    warnings: list[str] = []
    if len(by_currency) > 1:
        warnings.append("Farklı para birimleri kur dönüşümü olmadan birbiriyle karşılaştırılmaz.")
    comparison_offers: list[QuoteComparisonOffer] = []
    for currency, group in by_currency.items():
        signatures = {_scope_signature(revision.items) for _, revision in group}
        comparable = len(group) > 1 and len(signatures) == 1
        lowest = min((revision.total_amount for _, revision in group), default=None) if comparable else None
        if len(group) > 1 and not comparable:
            warnings.append(
                f"{currency} tekliflerinde ürün kapsamı, adet veya lisans/bakım süresi farklı; en düşük teklif işaretlenmedi."
            )
        for offer, revision in group:
            comparison_offers.append(
                QuoteComparisonOffer(
                    offer_id=offer.id,
                    vendor_name=offer.vendor_name,
                    revision_id=revision.id,
                    revision_no=revision.revision_no,
                    currency=currency,
                    total_amount=revision.total_amount,
                    is_comparable=comparable,
                    is_lowest=bool(comparable and revision.total_amount == lowest),
                    is_preferred=process.preferred_offer_id == offer.id,
                    warning=None if comparable else "Kapsam veya para birimi eşdeğer değil.",
                    items=revision.items,
                    documents=[doc for doc in revision.documents if doc.is_active],
                )
            )

    item_map: dict[str, tuple[str, list[QuoteItemComparisonCell]]] = {}
    for offer in comparison_offers:
        for item in offer.items:
            key, label = _comparison_row_key(item)
            if key not in item_map:
                item_map[key] = (label, [])
            item_map[key][1].append(
                QuoteItemComparisonCell(
                    offer_id=offer.offer_id,
                    vendor_name=offer.vendor_name,
                    item=item,
                )
            )
    item_rows = [
        QuoteItemComparisonRow(key=key, label=label, cells=cells)
        for key, (label, cells) in item_map.items()
    ]
    return QuoteComparisonRead(
        process_id=process.id,
        quote_no=process.quote_no,
        process_name=process.name,
        offers=comparison_offers,
        item_rows=item_rows,
        warnings=sorted(set(warnings)),
    )
