import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.database import SessionLocal, engine
from app.models import Base
from app.routers import api_router
from app.services.alerts import alert_loop
from app.services.auth import verify_token
from app.services.seed import seed_all

# API paths reachable without a session. Setup endpoints enforce their own
# single-use guard and become unavailable as soon as setup is completed.
AUTH_EXEMPT_PATHS = {
    "/api/v1/health",
    "/api/v1/auth/login",
    "/api/v1/setup/status",
    "/api/v1/setup/complete",
    "/api/v1/setup/test-telegram",
    "/api/v1/setup/test-llm",
}

settings = get_settings()

logging.basicConfig(
    level=settings.log_level.upper(),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("taskcentral")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Alembic owns schema migrations; create_all only fills in missing tables on
    # a brand-new database so the app can boot before migrations have ever run.
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        seed_all(db)
        if settings.demo_mode:
            from app.services.demo import seed_demo_machines

            seed_demo_machines(db)
    finally:
        db.close()
    logger.info("%s started (env=%s)", settings.app_name, settings.app_env)

    # Background scheduler for pending-task alerts (single uvicorn worker).
    alert_task = asyncio.create_task(alert_loop())
    try:
        yield
    finally:
        alert_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await alert_task


app = FastAPI(
    title="Task Central API",
    version="1.0.0",
    description="Homelab machine provisioning and documentation tracker.",
    lifespan=lifespan,
    # Served under /api/* so the docs remain reachable through the nginx proxy.
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def require_authentication(request: Request, call_next):
    path = request.url.path
    if (
        request.method == "OPTIONS"
        or not path.startswith("/api/v1/")
        or path in AUTH_EXEMPT_PATHS
    ):
        return await call_next(request)
    header = request.headers.get("Authorization", "")
    token = header[7:] if header.startswith("Bearer ") else None
    if verify_token(token) is None:
        return JSONResponse(status_code=401, content={"detail": "Not authenticated"})
    return await call_next(request)


@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > settings.max_import_bytes:
        return JSONResponse(status_code=413, content={"detail": "Request body too large"})
    return await call_next(request)


app.include_router(api_router)
