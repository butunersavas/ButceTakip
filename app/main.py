from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from app.database import init_db
from app.routers import (
    auth,
    budget_items,
    dashboard,
    expenses,
    import_export,
    plans,
    purchase_reminders,
    reports,
    scenarios,
    users,
    warranty_items,
)

app = FastAPI()
API_PREFIX = "/api"


def _parse_csv_env(name: str) -> list[str]:
    raw = os.getenv(name, "")
    return [x.strip() for x in raw.split(",") if x.strip()]


cors_origins = _parse_csv_env("CORS_ORIGINS")
cors_origin_regex = os.getenv("CORS_ORIGIN_REGEX", "").strip() or None

# ENV yoksa local geliştirme default'u
if not cors_origins and not cors_origin_regex:
    cors_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://172.24.2.128:5173",
    ]
    cors_origin_regex = r"^http://172\.24\.2\.\d{1,3}:5173$"

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(scenarios.router, prefix=API_PREFIX)
app.include_router(budget_items.router, prefix=API_PREFIX)
app.include_router(plans.router, prefix=API_PREFIX)
app.include_router(expenses.router, prefix=API_PREFIX)
app.include_router(dashboard.router, prefix=API_PREFIX)
app.include_router(import_export.router, prefix=API_PREFIX)
app.include_router(purchase_reminders.router, prefix=API_PREFIX)
app.include_router(reports.router, prefix=API_PREFIX)
app.include_router(users.router, prefix=API_PREFIX)
app.include_router(warranty_items.router, prefix=API_PREFIX)


@app.get("/")
def healthcheck() -> dict[str, str]:
    return {"status": "ok", "message": "Budget management API"}
