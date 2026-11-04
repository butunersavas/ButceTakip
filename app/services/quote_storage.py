from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from io import BytesIO
from pathlib import Path
import re
import unicodedata
from uuid import uuid4
from zipfile import BadZipFile, ZipFile

from fastapi import HTTPException, UploadFile, status

from app.config import get_settings


ALLOWED_EXTENSIONS = {".pdf", ".xlsx", ".xls"}
CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
}
OLE_SIGNATURE = bytes.fromhex("D0CF11E0A1B11AE1")


@dataclass(frozen=True)
class ValidatedQuoteDocument:
    original_name: str
    extension: str
    content_type: str
    content: bytes
    sha256: str

    @property
    def size_bytes(self) -> int:
        return len(self.content)


def sanitize_original_name(file_name: str | None) -> str:
    normalized = unicodedata.normalize("NFKC", Path(file_name or "belge").name)
    normalized = re.sub(r"[\x00-\x1f\x7f]+", "", normalized)
    normalized = normalized.replace("/", "_").replace("\\", "_").strip(" .")
    if not normalized:
        normalized = "belge"
    return normalized[:255]


def _validate_xlsx(content: bytes) -> None:
    try:
        with ZipFile(BytesIO(content)) as archive:
            names = set(archive.namelist())
    except BadZipFile as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="XLSX dosyası geçerli bir Office belgesi değil.",
        ) from exc
    if "[Content_Types].xml" not in names or not any(name.startswith("xl/") for name in names):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="XLSX dosyası geçerli bir Excel belgesi değil.",
        )


def validate_document_content(file_name: str | None, content: bytes) -> ValidatedQuoteDocument:
    safe_name = sanitize_original_name(file_name)
    extension = Path(safe_name).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Yalnızca PDF, XLSX veya XLS belgesi yüklenebilir.",
        )
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Yüklenen dosya boş.")

    if extension == ".pdf" and not content[:1024].lstrip().startswith(b"%PDF-"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dosya uzantısı PDF olsa da içerik geçerli bir PDF değil.",
        )
    if extension == ".xls" and not content.startswith(OLE_SIGNATURE):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dosya uzantısı XLS olsa da içerik geçerli bir Excel belgesi değil.",
        )
    if extension == ".xlsx":
        _validate_xlsx(content)

    return ValidatedQuoteDocument(
        original_name=safe_name,
        extension=extension,
        content_type=CONTENT_TYPES[extension],
        content=content,
        sha256=sha256(content).hexdigest(),
    )


def read_and_validate_upload(file: UploadFile) -> ValidatedQuoteDocument:
    settings = get_settings()
    max_bytes = settings.quote_document_max_bytes
    content = file.file.read(max_bytes + 1)
    if len(content) > max_bytes:
        max_mb = max_bytes / (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Belge boyutu {max_mb:g} MB sınırını aşamaz.",
        )
    return validate_document_content(file.filename, content)


def _storage_root() -> Path:
    return Path(get_settings().quote_storage_path).expanduser().resolve()


def store_document(document: ValidatedQuoteDocument, *, process_id: int) -> str:
    root = _storage_root()
    relative = Path(str(process_id)) / f"{uuid4().hex}{document.extension}"
    target = (root / relative).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise RuntimeError("Geçersiz belge depolama yolu.") from exc

    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(f"{target.suffix}.tmp-{uuid4().hex}")
    try:
        with temporary.open("xb") as handle:
            handle.write(document.content)
            handle.flush()
        temporary.replace(target)
    finally:
        if temporary.exists():
            temporary.unlink()
    return relative.as_posix()


def resolve_document_path(storage_key: str) -> Path:
    root = _storage_root()
    target = (root / storage_key).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Belge dosyası bulunamadı."
        ) from exc
    if not target.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Belge dosyası bulunamadı."
        )
    return target


def discard_stored_document(storage_key: str) -> None:
    """Remove a just-written file when its metadata transaction cannot be committed."""

    try:
        target = resolve_document_path(storage_key)
        target.unlink(missing_ok=True)
    except HTTPException:
        return
