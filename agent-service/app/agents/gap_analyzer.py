from app.graph.events import trace_event
from app.graph.state import ProofAgentState
from app.models.schemas import GapAnalysis


async def gap_analyzer(state: ProofAgentState) -> dict:
    gaps: list[GapAnalysis] = []
    claims = state.get("verified_claims", [])
    for requirement in state.get("requirements", []):
        supporting = [
            claim["id"]
            for claim in claims
            if requirement["label"].lower() in claim.get("claim", "").lower()
            and claim.get("verdict") in {"supported", "partial"}
        ]
        status = "WEAK" if supporting else "MISSING"
        gaps.append(
            GapAnalysis(
                requirement_id=requirement["id"],
                status=status,
                supporting_claim_ids=supporting,
                missing_observables=[
                    "source code or tests",
                    "deployed demo",
                    "traceable evaluation",
                ]
                if status != "PROVEN"
                else [],
                priority=requirement.get("priority", "medium"),
                why_it_matters=f"Reviewer needs inspectable proof for {requirement['label']}.",
            )
        )
    event = trace_event(
        run_id=state["run_id"],
        node="gap_analyzer",
        actor="Gap Analyzer",
        action="classify proven weak missing capabilities",
        status="completed",
        output_summary=f"{len(gaps)} gaps classified",
    )
    return {
        "gaps": [gap.model_dump(mode="json") for gap in gaps],
        "current_stage": "gap_analysis",
        "trace_events": state.get("trace_events", []) + [event],
    }

