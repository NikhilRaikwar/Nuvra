import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.api.run_store import RunStore
from app.main_dependencies import get_run_store

router = APIRouter(prefix="/v1/runs", tags=["stream"])


@router.get("/{run_id}/events")
async def stream_run_events(run_id: str, store: RunStore = Depends(get_run_store)) -> StreamingResponse:
    if not store.get(run_id):
        raise HTTPException(status_code=404, detail="Run not found.")

    async def event_generator():
        sent = 0
        while True:
            snapshot = store.get(run_id)
            if not snapshot:
                break
            events = snapshot.traceEvents[sent:]
            for event in events:
                sent += 1
                yield f"id: {event.event_id}\nevent: trace\ndata: {json.dumps(event.model_dump(mode='json'))}\n\n"
            if snapshot.status in {"completed", "failed", "partial", "cancelled"}:
                yield f"event: done\ndata: {json.dumps({'status': snapshot.status})}\n\n"
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

