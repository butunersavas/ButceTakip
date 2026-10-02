import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.services.market_rates import (
    _reset_cache_for_tests,
    get_market_rates,
    parse_tcmb_rates,
)


VALID_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="01.10.2026" Date="10/01/2026" Bulten_No="2026/185">
  <Currency Kod="USD" CurrencyCode="USD">
    <Unit>1</Unit><ForexSelling>49.0348</ForexSelling>
  </Currency>
  <Currency Kod="EUR" CurrencyCode="EUR">
    <Unit>1</Unit><ForexSelling>55.3963</ForexSelling>
  </Currency>
</Tarih_Date>
"""


class MarketRatesTests(unittest.TestCase):
    def setUp(self) -> None:
        _reset_cache_for_tests()
        self.now = datetime(2026, 10, 2, 8, 0, tzinfo=timezone.utc)

    def tearDown(self) -> None:
        _reset_cache_for_tests()

    def test_parses_official_forex_selling_rates_and_date(self) -> None:
        payload = parse_tcmb_rates(VALID_XML, fetched_at=self.now)

        self.assertEqual(Decimal("49.0348"), payload["usd_try"])
        self.assertEqual(Decimal("55.3963"), payload["eur_try"])
        self.assertEqual("2026-10-01", payload["rate_date"])
        self.assertEqual("Döviz satış", payload["rate_type"])
        self.assertIsNone(payload["gram_gold_try"])
        self.assertIn("API anahtarı", str(payload["gold_note"]))

    def test_successful_response_is_cached_for_twenty_minutes(self) -> None:
        calls = 0

        def fetcher() -> bytes:
            nonlocal calls
            calls += 1
            return VALID_XML

        first = get_market_rates(fetcher=fetcher, now=self.now)
        second = get_market_rates(fetcher=fetcher, now=self.now + timedelta(minutes=19))

        self.assertEqual(1, calls)
        self.assertEqual(first, second)

    def test_provider_failure_returns_safe_empty_payload_without_raising(self) -> None:
        def failing_fetcher() -> bytes:
            raise TimeoutError("provider timeout")

        payload = get_market_rates(fetcher=failing_fetcher, now=self.now)

        self.assertIsNone(payload["usd_try"])
        self.assertIsNone(payload["eur_try"])
        self.assertIsNone(payload["gram_gold_try"])
        self.assertEqual("TCMB verilerine şu anda ulaşılamıyor.", payload["warning"])

    def test_expired_cache_is_used_as_stale_fallback_on_failure(self) -> None:
        get_market_rates(fetcher=lambda: VALID_XML, now=self.now)

        def failing_fetcher() -> bytes:
            raise TimeoutError("provider timeout")

        payload = get_market_rates(
            fetcher=failing_fetcher,
            now=self.now + timedelta(minutes=21),
        )

        self.assertEqual(Decimal("49.0348"), payload["usd_try"])
        self.assertTrue(payload["stale"])
        self.assertIn("Son başarılı veri", str(payload["warning"]))

    def test_malformed_or_incomplete_xml_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "ayrıştırılamadı"):
            parse_tcmb_rates(b"<not-closed", fetched_at=self.now)

        with self.assertRaisesRegex(ValueError, "EUR bulunamadı"):
            parse_tcmb_rates(
                VALID_XML.replace(
                    b'<Currency Kod="EUR" CurrencyCode="EUR">',
                    b'<Currency Kod="GBP" CurrencyCode="GBP">',
                ),
                fetched_at=self.now,
            )


if __name__ == "__main__":
    unittest.main()
