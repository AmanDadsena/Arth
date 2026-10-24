"""Arth API. Run: uvicorn app.main:app --port 8000  (from backend/)."""

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth import FirebaseVerifier
from .config import Settings, get_settings
from .db import Database, load_or_create_key
from .errors import install_error_handlers
from .llm import LLM
from .middleware import ProtectionMiddleware
from .routers import router
from .services.mandi import MandiService
from .services.sync import CloudSync
from .stt import GemmaSTT, WhisperSTT

log = logging.getLogger("arth")


async def _purge_loop(db: Database) -> None:
    while True:
        db.purge_expired()
        await asyncio.sleep(6 * 3600)


def create_app(settings: Settings | None = None, *, http: httpx.AsyncClient | None = None,
               stt=None, warm_up: bool = True) -> FastAPI:
    settings = settings or get_settings()
    settings.check_safe()
    settings.data_dir.mkdir(parents=True, exist_ok=True)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        client = http or httpx.AsyncClient(
            limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
            headers={"User-Agent": "arth-backend"},
        )
        key = load_or_create_key(settings.data_dir, settings.data_key)
        db = Database(settings.data_dir / "arth.db", key, settings.history_ttl_days)
        s = app.state
        s.settings, s.http, s.db = settings, client, db
        s.verifier = (FirebaseVerifier(settings.firebase_project_id, client, settings.data_dir / "jwks.json")
                      if settings.firebase_project_id else None)
        s.llm = LLM(client, settings.ollama_url, settings.model, label=settings.model_label,
                    timeout_s=settings.llm_timeout_s, max_concurrency=settings.llm_max_concurrency,
                    num_ctx=settings.llm_num_ctx, keep_alive=settings.llm_keep_alive)
        s.stt = stt or (
            GemmaSTT(s.llm, settings.max_audio_seconds) if settings.stt_backend == "gemma"
            else WhisperSTT(settings.whisper_model, settings.whisper_device,
                            settings.whisper_compute_type, settings.max_audio_seconds))
        s.mandi = MandiService(client, db, api_key=settings.data_gov_in_api_key,
                               resource_id=settings.mandi_resource_id, state=settings.mandi_state,
                               rs_per_quintal_km=settings.transport_rs_per_quintal_km,
                               timeout=settings.http_timeout_s)
        s.sync = CloudSync(client, db, settings.sync_url, settings.sync_secret,
                           timeout_s=min(settings.http_timeout_s, 5.0), interval_s=settings.sync_interval_s)
        if settings.auth_disabled:
            log.warning("AUTH DISABLED: every request is user %r. Development only.", settings.dev_uid)
        tasks = [asyncio.create_task(_purge_loop(db)), asyncio.create_task(s.sync.run())]
        if warm_up:
            # Load both models in the background so the first farmer request is fast.
            tasks.append(s.llm.start_warm_up())  # tracked, so /health stays "not ready" until done
            tasks.append(asyncio.create_task(s.stt.load()))
        try:
            yield
        finally:
            for t in tasks:
                t.cancel()
                with contextlib.suppress(BaseException):
                    await t
            db.close()
            if http is None:
                await client.aclose()

    app = FastAPI(
        title="Arth API",
        version="1.0.0",
        lifespan=lifespan,
        # Interactive docs only while developing; production exposes no schema.
        docs_url="/docs" if settings.env == "development" else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.env == "development" else None,
    )
    install_error_handlers(app)
    app.include_router(router, prefix=settings.api_prefix)
    # Middleware added later wraps earlier ones. Rate limit + size cap run first
    # inside CORS, so even a 429/413 carries CORS headers the browser can read.
    app.add_middleware(ProtectionMiddleware, prefix=settings.api_prefix,
                       max_body=settings.max_image_bytes + 512 * 1024,
                       rate=settings.rate_limit_rps, burst=settings.rate_limit_burst)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,  # bearer tokens, never cookies
        allow_methods=["GET", "PUT", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )
    return app


def app_factory() -> FastAPI:
    """Entry point for `uvicorn app.main:app_factory --factory`."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    # httpx logs full request URLs at INFO, which would include the data.gov.in key.
    for noisy in ("httpx", "httpx2", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    # Uvicorn's access log prints query strings (farm coordinates); ours logs path only.
    logging.getLogger("uvicorn.access").disabled = True
    return create_app()
