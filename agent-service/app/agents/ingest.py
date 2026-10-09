from app.config import get_settings
from app.graph.events import trace_event
from app.graph.state import ProofAgentState
from app.models.schemas import RunFailure, ToolBudget
from app.tools.opportunity import fetch_opportunity_url, load_speedrun_opportunity


async def ingest_opportunity(state: ProofAgentState) -> dict:
    settings = get_settings()
    budget = ToolBudget.model_validate(state.get("tool_budget", {}))
    text_parts = [state.get("opportunity_text", "")]
    snapshot = state.get("opportunity_snapshot") or {}
    failures = list(state.get("failures", []))
    events = list(state.get("trace_events", []))

    speedrun_job_id = snapshot.get("speedrunJobId")
    if speedrun_job_id and budget.web_fetches < budget.max_web_fetches:
        try:
            loaded = await load_speedrun_opportunity(speedrun_job_id, settings)
            if loaded:
                text_parts.append(loaded)
            budget.web_fetches += 1
            events.append(
                trace_event(
                    run_id=state["run_id"],
                    node="ingest_opportunity",
                    actor="Opportunity Tool",
                    action="load Speedrun opportunity",
                    status="tool_result",
                    tool="load_speedrun_opportunity",
                    output_summary="Speedrun opportunity text loaded",
                )
            )
        except Exception as error:
            failures.append(
                RunFailure(
                    stage="ingest_opportunity",
                    message=f"Speedrun opportunity fetch failed: {error}",
                    recoverable=bool(state.get("opportunity_text")),
                ).model_dump(mode="json")
            )

    opportunity_url = state.get("opportunity_url")
    if opportunity_url and budget.web_fetches < budget.max_web_fetches:
        try:
            fetched = await fetch_opportunity_url(opportunity_url, settings)
            if fetched:
                text_parts.append(fetched)
            budget.web_fetches += 1
            events.append(
                trace_event(
                    run_id=state["run_id"],
                    node="ingest_opportunity",
                    actor="Opportunity Tool",
                    action="fetch opportunity URL",
                    status="tool_result",
                    tool="fetch_opportunity_url",
                    output_summary="Opportunity URL text loaded",
                )
            )
        except Exception as error:
            failures.append(
                RunFailure(
                    stage="ingest_opportunity",
                    message=f"Opportunity URL fetch failed: {error}",
                    recoverable=bool(state.get("opportunity_text")),
                ).model_dump(mode="json")
            )

    merged = "\n\n".join(part for part in text_parts if part).strip()
    status = "completed" if merged else "failed"
    events.append(
        trace_event(
            run_id=state["run_id"],
            node="ingest_opportunity",
            actor="Ingest Agent",
            action="normalize opportunity input",
            status=status,
            output_summary=f"{len(merged)} opportunity characters available",
        )
    )
    return {
        "opportunity_text": merged,
        "tool_budget": budget.model_dump(mode="json"),
        "failures": failures,
        "current_stage": "opportunity_ingested",
        "trace_events": events,
    }
