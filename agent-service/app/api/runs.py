from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.run_store import RunStore
from app.main_dependencies import get_run_store
from app.models.schemas import RunCreateRequest, RunCreateResponse, RunSnapshot

router = APIRouter(prefix="/v1/runs", tags=["runs"])


@router.post("", response_model=RunCreateResponse)
async def create_run(
    payload: RunCreateRequest,
    request: Request,
    store: RunStore = Depends(get_run_store),
) -> RunCreateResponse:
    if len(await request.body()) > 80_000:
        raise HTTPException(status_code=413, detail="Request body is too large.")
    snapshot = await store.create_run(payload)
    return RunCreateResponse(runId=snapshot.runId, status=snapshot.status)


@router.get("/{run_id}", response_model=RunSnapshot)
async def get_run(run_id: str, store: RunStore = Depends(get_run_store)) -> RunSnapshot:
    snapshot = store.get(run_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Run not found.")
    return snapshot


@router.post("/{run_id}/retry", response_model=RunSnapshot)
async def retry_run(run_id: str, store: RunStore = Depends(get_run_store)) -> RunSnapshot:
    snapshot = await store.retry(run_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Run not found.")
    return snapshot


@router.post("/{run_id}/cancel", response_model=RunSnapshot)
async def cancel_run(run_id: str, store: RunStore = Depends(get_run_store)) -> RunSnapshot:
    snapshot = await store.cancel(run_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Run not found.")
    return snapshot

