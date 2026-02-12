from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel

from app.dependencies import get_admin_user, get_db_session
from app.models import User


class BackupPayload(BaseModel):
    tables: dict[str, list[dict[str, Any]]]


router = APIRouter(prefix="/backup", tags=["Backup"])


def _get_table_names(session: Session) -> list[str]:
    inspector = inspect(session.get_bind())
    return [
        name for name in SQLModel.metadata.tables.keys() if inspector.has_table(name)
    ]


def _fetch_table_rows(session: Session, table_name: str) -> list[dict[str, Any]]:
    rows = session.exec(text(f'SELECT * FROM "{table_name}"')).mappings().all()
    return [dict(row) for row in rows]


def _backup_tables(session: Session, table_names: list[str]) -> dict[str, list[dict[str, Any]]]:
    return {name: _fetch_table_rows(session, name) for name in table_names}


@router.get("/full")
def download_full_backup(
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> dict[str, dict[str, list[dict[str, Any]]]]:
    table_names = _get_table_names(session)
    return {"tables": _backup_tables(session, table_names)}


@router.get("/users")
def download_users_backup(
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> dict[str, dict[str, list[dict[str, Any]]]]:
    table_names = [name for name in _get_table_names(session) if name == "users"]
    return {"tables": _backup_tables(session, table_names)}


@router.post("/restore/full")
def restore_full_backup(
    payload: BackupPayload,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> dict[str, str]:
    if not payload.tables:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Backup data missing.")

    table_names = _get_table_names(session)
    bind = session.get_bind()
    dialect_name = bind.dialect.name

    if dialect_name == "postgresql":
        quoted_tables = ", ".join(f'"{name}"' for name in table_names)
        session.exec(text(f"TRUNCATE TABLE {quoted_tables} RESTART IDENTITY CASCADE"))
    elif dialect_name == "sqlite":
        session.exec(text("PRAGMA foreign_keys=OFF"))
        for table_name in table_names:
            session.exec(text(f'DELETE FROM "{table_name}"'))
        session.exec(text("PRAGMA foreign_keys=ON"))
    else:
        for table_name in table_names:
            session.exec(text(f'DELETE FROM "{table_name}"'))

    for table_name in table_names:
        rows = payload.tables.get(table_name, [])
        if not rows:
            continue
        table = SQLModel.metadata.tables.get(table_name)
        if table is None:
            continue
        session.execute(table.insert(), rows)

    session.commit()
    return {"detail": "Yedek geri yüklendi."}
