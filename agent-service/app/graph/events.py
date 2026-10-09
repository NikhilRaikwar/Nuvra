from time import perf_counter
from uuid import uuid4

from app.models.schemas import TraceEvent


def trace_event(
    *,
    run_id: str,
    node: str,
    actor: str,
    action: str,
    status: TraceEvent.model_fields["status"].annotation,
    tool: str | None = None,
    input_summary: str | None = None,
    output_summary: str | None = None,
    started_at: float | None = None,
) -> dict:
    duration_ms = None
    if started_at is not None:
        duration_ms = int((perf_counter() - started_at) * 1000)
    return TraceEvent(
        event_id=str(uuid4()),
        run_id=run_id,
        node=node,
        actor=actor,
        action=action,
        status=status,
        tool=tool,
        input_summary=input_summary,
        output_summary=output_summary,
        duration_ms=duration_ms,
    ).model_dump(mode="json")

