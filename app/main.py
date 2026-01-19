import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy import text
from sqlmodel import Session
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.config import get_settings
from app.database import engine, init_db
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

logging.basicConfig(level=logging.DEBUG)

app = FastAPI(redirect_slashes=False)
API_PREFIX = "/api"
settings = get_settings()

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.allowed_hosts,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logging.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    logging.exception("Integrity error on %s", request.url.path)
    return JSONResponse(status_code=400, content={"detail": str(exc.orig) if exc.orig else "Integrity error"})


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_error_handler(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    logging.exception("Database error on %s", request.url.path)
    return JSONResponse(status_code=400, content={"detail": "Database error"})


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


@app.get("/api/health")
def api_healthcheck() -> dict[str, str]:
    try:
        with Session(engine) as session:
            session.exec(text("SELECT 1"))
        return {"status": "ok"}
    except Exception:
        logging.exception("Healthcheck failed")
        return {"status": "db_error"}
