import argparse
import logging

from app.config import get_settings
from app.database import (
    CURRENT_SCHEMA_VERSION,
    apply_schema_migrations,
    baseline_schema_version,
    validate_database_schema,
)


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="BütçeTakip veritabanı şemasını açık ve kontrollü biçimde yönetir."
    )
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument(
        "--check",
        action="store_true",
        help="Şema sürümünü ve sözleşmesini salt okunur doğrula.",
    )
    action.add_argument(
        "--apply",
        action="store_true",
        help="Bekleyen şema değişikliklerini açıkça uygula.",
    )
    action.add_argument(
        "--baseline",
        action="store_true",
        help=(
            "Mevcut şema sözleşmesi zaten tam ise DDL/DML migration çalıştırmadan "
            "sürüm işaretini oluştur."
        ),
    )
    parser.add_argument(
        "--backup-confirmed",
        action="store_true",
        help="Production yedeğinin ve geri yükleme provasının doğrulandığını beyan et.",
    )
    args = parser.parse_args()

    settings = get_settings()
    settings.validate_runtime_security()

    if args.check:
        validate_database_schema(require_postgresql=settings.is_production)
        logger.info("Database schema check succeeded for version %s.", CURRENT_SCHEMA_VERSION)
        return

    if settings.is_production and not args.backup_confirmed:
        parser.error("Production migration or baseline requires --backup-confirmed.")

    if args.baseline:
        baseline_schema_version()
        logger.info("Database schema baseline recorded at version %s.", CURRENT_SCHEMA_VERSION)
        return

    apply_schema_migrations()
    logger.info("Database migration completed at version %s.", CURRENT_SCHEMA_VERSION)


if __name__ == "__main__":
    main()
