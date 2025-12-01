from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import init_db
from app.routers import auth, budget_items, dashboard, expenses, import_export, plans, scenarios

settings = get_settings()

app = FastAPI(title=settings.app_name)

default_origins = ["http://localhost:5173"]
configured_origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
allow_credentials = True

if "*" in configured_origins:
    origins = ["*"]
    allow_credentials = False
else:
    origins = configured_origins or default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https?://localhost(?::\d+)?",
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
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
