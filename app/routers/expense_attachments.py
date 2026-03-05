import logging
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session, select

from app.config import get_settings
from app.dependencies import get_current_user, get_db_session
from app.models import Expense, ExpenseAttachment, User
from app.schemas import ExpenseAttachmentRead

router = APIRouter(tags=["Expense Attachments"])
logger = logging.getLogger(__name__)
settings = get_settings()


def _upload_root() -> Path:
    return Path(settings.expense_upload_dir).resolve()


def _to_read(item: ExpenseAttachment) -> ExpenseAttachmentRead:
    return ExpenseAttachmentRead(
        id=item.id,
        expense_id=item.expense_id,
        filename=item.filename,
        content_type=item.content_type,
        size_bytes=item.size_bytes,
        uploaded_at=item.uploaded_at,
        uploaded_by=item.uploaded_by,
        download_url=f"/api/attachments/{item.id}/download",
    )


@router.post("/expenses/{expense_id}/attachments", response_model=ExpenseAttachmentRead, status_code=201)
async def upload_expense_attachment(
    expense_id: int,
    file: UploadFile = File(...),
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> ExpenseAttachmentRead:
    expense = session.get(Expense, expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    content = await file.read()
    max_bytes = max(1, settings.max_pdf_mb) * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.max_pdf_mb} MB limit")

    if not content.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Invalid PDF signature")

    stored_filename = f"{uuid4()}.pdf"
    expense_dir = _upload_root() / str(expense_id)
    try:
        expense_dir.mkdir(parents=True, exist_ok=True)
        storage_path = expense_dir / stored_filename
        storage_path.write_bytes(content)
    except OSError as exc:
        logger.exception("Failed to persist attachment for expense_id=%s", expense_id)
        raise HTTPException(status_code=500, detail="Failed to store file") from exc

    attachment = ExpenseAttachment(
        expense_id=expense_id,
        filename=file.filename,
        stored_filename=stored_filename,
        content_type=file.content_type,
        size_bytes=len(content),
        storage_path=str(storage_path),
        uploaded_by=current_user.username,
    )
    session.add(attachment)
    session.commit()
    session.refresh(attachment)
    return _to_read(attachment)


@router.get("/expenses/{expense_id}/attachments", response_model=list[ExpenseAttachmentRead])
def list_expense_attachments(
    expense_id: int,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> list[ExpenseAttachmentRead]:
    if not session.get(Expense, expense_id):
        raise HTTPException(status_code=404, detail="Expense not found")

    attachments = session.exec(
        select(ExpenseAttachment)
        .where(ExpenseAttachment.expense_id == expense_id)
        .order_by(ExpenseAttachment.uploaded_at.desc())
    ).all()
    return [_to_read(item) for item in attachments]


@router.get("/attachments/{attachment_id}/download")
def download_attachment(
    attachment_id: int,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    attachment = session.get(ExpenseAttachment, attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    path = Path(attachment.storage_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Attachment file not found")

    return FileResponse(
        path,
        media_type="application/pdf",
        filename=attachment.filename,
    )


@router.delete("/attachments/{attachment_id}", status_code=204)
def delete_attachment(
    attachment_id: int,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> None:
    attachment = session.get(ExpenseAttachment, attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    if not current_user.is_admin and attachment.uploaded_by != current_user.username:
        raise HTTPException(status_code=403, detail="Not allowed")

    storage_path = Path(attachment.storage_path)
    session.delete(attachment)
    session.commit()

    try:
        if storage_path.exists():
            storage_path.unlink()
    except OSError:
        logger.exception("Failed to delete attachment file id=%s", attachment_id)
