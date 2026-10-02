from fastapi import APIRouter

from app.services.market_rates import get_market_rates


router = APIRouter(prefix="/market-rates", tags=["Market Rates"])


@router.get("")
def read_market_rates() -> dict[str, object]:
    """Return informational TCMB indicators without touching application data."""

    return get_market_rates()
