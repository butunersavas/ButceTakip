from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import init_db
from app.routers import auth, budget_items, dashboard, expenses, import_export, plans, scenarios

app = FastAPI()

settings = get_settings()

allowed_origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
allow_all_origins = "*" in allowed_origins

default_origins = [
    "http://localhost:5173",
    "http://localhost:4173",
    "http://localhost:4174",
    "https://butcetakip.erban.com.tr",
    "https://api.butcetakip.erban.com.tr",
]

cors_params = {
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}

if allow_all_origins:
    cors_params["allow_origin_regex"] = r".*"
else:
    cors_params["allow_origins"] = allowed_origins or default_origins

app.add_middleware(
    CORSMiddleware,
    **cors_params,
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


app.include_router(auth.router)
app.include_router(scenarios.router)
app.include_router(budget_items.router)
app.include_router(plans.router)
app.include_router(expenses.router)
app.include_router(dashboard.router)
app.include_router(import_export.router)


@app.get("/")
def healthcheck() -> dict[str, str]:
    return {"status": "ok", "message": "Budget management API"}
