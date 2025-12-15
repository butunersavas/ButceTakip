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
)

app = FastAPI()

# --- CORS AYARI BAŞLANGIÇ ---

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://172.24.2.194:5173",
]

# .env içindeki CORS_ORIGINS değerini de istersen ekle (virgülle ayrılmış liste gibi)
env_origins = os.getenv("CORS_ORIGINS")
if env_origins and env_origins != "*":
    extra = [o.strip() for o in env_origins.split(",") if o.strip()]
    ALLOWED_ORIGINS.extend(extra)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,        # Bearer token header ile geliyor, cookie yok
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CORS AYARI BİTİŞ ---


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
app.include_router(purchase_reminders.router)
app.include_router(reports.router)
app.include_router(users.router)


@app.get("/")
def healthcheck() -> dict[str, str]:
    return {"status": "ok", "message": "Budget management API"}
