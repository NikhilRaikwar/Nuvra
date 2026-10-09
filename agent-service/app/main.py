from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.runs import router as runs_router
from app.api.stream import router as stream_router
from app.config import get_settings
from app.main_dependencies import start_run_store, stop_run_store

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    await start_run_store()
    try:
        yield
    finally:
        await stop_run_store()


app = FastAPI(
    title="Nuvra Agent Service",
    version="0.1.0",
    description="Stateful proof compiler runtime for Nuvra.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["content-type"],
)

app.include_router(health_router)
app.include_router(runs_router)
app.include_router(stream_router)
