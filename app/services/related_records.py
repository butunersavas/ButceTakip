from dataclasses import dataclass
from functools import lru_cache
from typing import Iterable

from sqlalchemy import MetaData, Table, delete as sa_delete, func, inspect, select
from sqlmodel import Session

from app.database import engine


FILE_TABLE_KEYWORDS = (
    "attachment",
    "attachments",
    "file",
    "files",
    "document",
    "documents",
    "upload",
    "uploads",
    "ek",
    "dosya",
)


@dataclass(frozen=True)
class RelatedFileRelation:
    table_name: str
    column_name: str


def _looks_like_file_table(table_name: str) -> bool:
    normalized = table_name.lower()
    return any(keyword in normalized for keyword in FILE_TABLE_KEYWORDS)


def _normalize_ids(parent_ids: int | Iterable[int]) -> list[int]:
    if isinstance(parent_ids, int):
        return [parent_ids]

    normalized: list[int] = []
    seen: set[int] = set()
    for parent_id in parent_ids:
        if parent_id in seen:
            continue
        seen.add(parent_id)
        normalized.append(parent_id)
    return normalized


@lru_cache(maxsize=64)
def _related_file_relations(parent_table_name: str) -> tuple[RelatedFileRelation, ...]:
    inspector = inspect(engine)
    relations: list[RelatedFileRelation] = []
    seen: set[tuple[str, str]] = set()

    for table_name in inspector.get_table_names():
        if table_name == parent_table_name or not _looks_like_file_table(table_name):
            continue

        for foreign_key in inspector.get_foreign_keys(table_name):
            if foreign_key.get("referred_table") != parent_table_name:
                continue

            constrained_columns = foreign_key.get("constrained_columns") or []
            referred_columns = foreign_key.get("referred_columns") or []
            for column_name, referred_column in zip(constrained_columns, referred_columns):
                if referred_column != "id":
                    continue
                relation_key = (table_name, column_name)
                if relation_key in seen:
                    continue
                seen.add(relation_key)
                relations.append(RelatedFileRelation(table_name, column_name))

    return tuple(relations)


@lru_cache(maxsize=128)
def _reflected_table(table_name: str) -> Table:
    return Table(table_name, MetaData(), autoload_with=engine)


def count_related_file_records(
    session: Session,
    parent_table_name: str,
    parent_ids: int | Iterable[int],
) -> int:
    ids = _normalize_ids(parent_ids)
    if not ids:
        return 0

    total = 0
    for relation in _related_file_relations(parent_table_name):
        table = _reflected_table(relation.table_name)
        total += int(
            session.execute(
                select(func.count())
                .select_from(table)
                .where(table.c[relation.column_name].in_(ids))
            ).scalar_one()
        )
    return total


def delete_related_file_records(
    session: Session,
    parent_table_name: str,
    parent_ids: int | Iterable[int],
) -> int:
    ids = _normalize_ids(parent_ids)
    if not ids:
        return 0

    deleted_count = 0
    for relation in _related_file_relations(parent_table_name):
        table = _reflected_table(relation.table_name)
        result = session.execute(
            sa_delete(table).where(table.c[relation.column_name].in_(ids))
        )
        deleted_count += result.rowcount or 0
    return deleted_count
