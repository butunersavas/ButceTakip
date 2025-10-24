from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import init_db
from app.routers import auth, budget_items, dashboard, expenses, import_export, plans, scenarios

settings = get_settings()

app = FastAPI(title=settings.app_name)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
