#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from sqlmodel import Session

from app.database import engine
from app.models import WarrantyItemType
from app.services.warranty_import import confirm_warranty_import, json_safe, preview_warranty_import


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Dry-run and optionally import warranty_items records from an Excel file."
    )
    parser.add_argument("--file", required=True, help="Path to .xlsx or .xlsm input file.")
    parser.add_argument("--sheet", help="Worksheet name. Defaults to Garanti Bakım Import or first worksheet.")
    parser.add_argument(
        "--default-type",
        choices=[item.value for item in WarrantyItemType],
        default=WarrantyItemType.DEVICE.value,
        help="Use when the file has no type column. Defaults to DEVICE.",
    )
    parser.add_argument("--commit", action="store_true", help="Write importable rows to the database.")
    parser.add_argument(
        "--backup-confirmed",
        action="store_true",
        help="Required with --commit after a DB backup has been taken.",
    )
    parser.add_argument(
        "--init-test-db",
        action="store_true",
        help="Kept for backward compatibility; this script does not drop or recreate data.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    path = Path(args.file).expanduser().resolve()
    if not path.exists():
        print(json.dumps({"error": f"File was not found: {path}"}, ensure_ascii=False, indent=2))
        return 1
    if args.commit and not args.backup_confirmed:
        print(
            json.dumps(
                {"error": "--commit requires --backup-confirmed after a database backup."},
                ensure_ascii=False,
                indent=2,
            )
        )
        return 2

    content = path.read_bytes()
    try:
        with Session(engine) as session:
            if args.commit:
                report = confirm_warranty_import(
                    session=session,
                    content=content,
                    filename=path.name,
                    sheet_name=args.sheet,
                    default_type=WarrantyItemType(args.default_type),
                )
            else:
                report = preview_warranty_import(
                    session=session,
                    content=content,
                    filename=path.name,
                    sheet_name=args.sheet,
                    default_type=WarrantyItemType(args.default_type),
                )
        print(json.dumps(json_safe(report), ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        print(json.dumps({"error": f"{type(exc).__name__}: {exc}"}, ensure_ascii=False, indent=2))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
