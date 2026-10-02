from __future__ import annotations

import logging
import threading
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Callable
from urllib.request import Request, urlopen
from xml.etree import ElementTree


logger = logging.getLogger(__name__)

TCMB_DAILY_RATES_URL = "https://www.tcmb.gov.tr/kurlar/today.xml"
CACHE_TTL = timedelta(minutes=20)
REQUEST_TIMEOUT_SECONDS = 5.0
GOLD_UNAVAILABLE_NOTE = (
    "TCMB günlük kur XML'i gram altın verisi yayımlamıyor; EVDS web servisi ise "
    "API anahtarı gerektiriyor. Resmi ve anahtarsız veri bulunamadığı için gösterilemiyor."
)

MarketRatesPayload = dict[str, object]
XmlFetcher = Callable[[], bytes]

_cache_lock = threading.RLock()
_cached_payload: MarketRatesPayload | None = None
_cache_expires_at: datetime | None = None


def _fetch_tcmb_xml() -> bytes:
    request = Request(
        TCMB_DAILY_RATES_URL,
        headers={"User-Agent": "ButceTakip/1.0 market-indicators"},
    )
    with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        return response.read()


def _read_forex_selling(root: ElementTree.Element, currency_code: str) -> Decimal:
    currency = root.find(f"./Currency[@CurrencyCode='{currency_code}']")
    if currency is None:
        currency = root.find(f"./Currency[@Kod='{currency_code}']")
    if currency is None:
        raise ValueError(f"TCMB XML içinde {currency_code} bulunamadı")

    raw_value = (currency.findtext("ForexSelling") or "").strip()
    raw_unit = (currency.findtext("Unit") or "1").strip()
    try:
        value = Decimal(raw_value)
        unit = Decimal(raw_unit)
    except InvalidOperation as exc:
        raise ValueError(f"{currency_code} döviz satış kuru geçersiz") from exc
    if value <= 0 or unit <= 0:
        raise ValueError(f"{currency_code} döviz satış kuru pozitif olmalıdır")
    return value / unit


def parse_tcmb_rates(
    xml_content: bytes | str,
    *,
    fetched_at: datetime | None = None,
) -> MarketRatesPayload:
    try:
        root = ElementTree.fromstring(xml_content)
    except ElementTree.ParseError as exc:
        raise ValueError("TCMB XML yanıtı ayrıştırılamadı") from exc

    raw_date = (root.attrib.get("Tarih") or "").strip()
    try:
        rate_date = datetime.strptime(raw_date, "%d.%m.%Y").date().isoformat()
    except ValueError as exc:
        raise ValueError("TCMB XML kur tarihi geçersiz") from exc

    fetched_at = fetched_at or datetime.now(timezone.utc)
    if fetched_at.tzinfo is None:
        fetched_at = fetched_at.replace(tzinfo=timezone.utc)

    return {
        "usd_try": _read_forex_selling(root, "USD"),
        "eur_try": _read_forex_selling(root, "EUR"),
        "gram_gold_try": None,
        "source": "Türkiye Cumhuriyet Merkez Bankası (TCMB)",
        "source_url": TCMB_DAILY_RATES_URL,
        "rate_type": "Döviz satış",
        "rate_date": rate_date,
        "fetched_at": fetched_at.astimezone(timezone.utc).isoformat(),
        "stale": False,
        "warning": None,
        "gold_note": GOLD_UNAVAILABLE_NOTE,
    }


def _empty_payload(*, fetched_at: datetime, warning: str) -> MarketRatesPayload:
    return {
        "usd_try": None,
        "eur_try": None,
        "gram_gold_try": None,
        "source": "Türkiye Cumhuriyet Merkez Bankası (TCMB)",
        "source_url": TCMB_DAILY_RATES_URL,
        "rate_type": "Döviz satış",
        "rate_date": None,
        "fetched_at": fetched_at.astimezone(timezone.utc).isoformat(),
        "stale": False,
        "warning": warning,
        "gold_note": GOLD_UNAVAILABLE_NOTE,
    }


def get_market_rates(
    *,
    fetcher: XmlFetcher = _fetch_tcmb_xml,
    now: datetime | None = None,
) -> MarketRatesPayload:
    global _cached_payload, _cache_expires_at

    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    with _cache_lock:
        if _cached_payload is not None and _cache_expires_at is not None and now < _cache_expires_at:
            return deepcopy(_cached_payload)

        try:
            payload = parse_tcmb_rates(fetcher(), fetched_at=now)
        except Exception as exc:
            logger.warning("TCMB piyasa göstergeleri alınamadı: %s", exc)
            warning = "TCMB verilerine şu anda ulaşılamıyor."
            if _cached_payload is not None:
                stale_payload = deepcopy(_cached_payload)
                stale_payload["stale"] = True
                stale_payload["warning"] = f"{warning} Son başarılı veri gösteriliyor."
                return stale_payload
            return _empty_payload(fetched_at=now, warning=warning)

        _cached_payload = deepcopy(payload)
        _cache_expires_at = now + CACHE_TTL
        return deepcopy(payload)


def _reset_cache_for_tests() -> None:
    global _cached_payload, _cache_expires_at
    with _cache_lock:
        _cached_payload = None
        _cache_expires_at = None
