import logging
import os
from uuid import uuid4

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy import text
from sqlmodel import Session
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.config import get_settings
from app.database import engine, init_db
from app.dependencies import is_viewer_user
from app.models import User
from app.routers import (
    auth,
    backup,
    budget_items,
    dashboard,
    expenses,
    import_export,
    plans,
    purchase_alerts,
    purchase_reminders,
    reports,
    scenarios,
    users,
    warranty_items,
)
from app.utils.security import decode_access_token

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = FastAPI(redirect_slashes=False)
API_PREFIX = "/api"
settings = get_settings()
default_cors_origins = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://172.24.2.128:5173",
    "http://10.10.3.4:5173",
}
cors_origins = sorted({*settings.cors_origins, *default_cors_origins})

trusted_hosts = settings.trusted_hosts
trusted_hosts_env = os.getenv("TRUSTED_HOSTS")
if trusted_hosts is None and settings.environment.lower() in {"development", "dev", "local"}:
    trusted_hosts = []
elif trusted_hosts is None and trusted_hosts_env is None:
    trusted_hosts = settings.allowed_hosts

if trusted_hosts:
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=trusted_hosts,
    )


@app.middleware("http")
async def readonly_user_guard(request: Request, call_next):
    if request.method.upper() in {"POST", "PUT", "PATCH", "DELETE"}:
        path = request.url.path.rstrip("/")
        if path != f"{API_PREFIX}/auth/token":
            authorization = request.headers.get("authorization", "")
            scheme, _, token = authorization.partition(" ")
            if scheme.lower() == "bearer" and token:
                try:
                    token_data = decode_access_token(token)
                    with Session(engine) as session:
                        user = session.get(User, token_data.user_id)
                        if is_viewer_user(user):
                            return JSONResponse(
                                status_code=status.HTTP_403_FORBIDDEN,
                                content={
                                    "detail": "Bu kullanıcı yalnızca görüntüleme yetkisine sahiptir."
                                },
                            )
                except Exception:
                    pass
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    error_id = str(uuid4())
    logger.exception("Unhandled error on %s [error_id=%s]", request.url.path, error_id)
    response = {"detail": "Internal server error"}
    if settings.environment.lower() != "production":
        response["error_id"] = error_id
    return JSONResponse(status_code=500, content=response)


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    logger.exception("Integrity error on %s", request.url.path)
    return JSONResponse(
        status_code=400,
        content={"detail": "Bu kayıt bağlı başka veriler nedeniyle silinemedi."},
    )


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_error_handler(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    logger.exception("Database error on %s", request.url.path)
    return JSONResponse(status_code=400, content={"detail": "Database error"})


app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(backup.router, prefix=API_PREFIX)
app.include_router(scenarios.router, prefix=API_PREFIX)
app.include_router(budget_items.router, prefix=API_PREFIX)
app.include_router(plans.router, prefix=API_PREFIX)
app.include_router(expenses.router, prefix=API_PREFIX)
app.include_router(dashboard.router, prefix=API_PREFIX)
app.include_router(purchase_alerts.router, prefix=API_PREFIX)
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
