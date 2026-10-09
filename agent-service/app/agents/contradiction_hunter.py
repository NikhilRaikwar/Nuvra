from app.graph.events import trace_event
from app.graph.state import ProofAgentState
from app.models.schemas import EvidenceConflict


NEGATIVE_TERMS = ("manual", "approval", "confirmation", "todo", "planned", "mock", "testnet")


async def contradiction_hunter(state: ProofAgentState) -> dict:
    conflicts: list[EvidenceConflict] = []
    text = " ".join(node.get("excerpt", "") for node in state.get("evidence_nodes", [])).lower()
    if any(term in text for term in NEGATIVE_TERMS):
        for claim in state.get("verified_claims", [])[:2]:
            if claim.get("verdict") in {"supported", "partial"}:
                conflicts.append(
                    EvidenceConflict(
                        id=f"conflict_{len(conflicts) + 1}",
                        claim_id=claim["id"],
                        support_evidence_id=(claim.get("supporting_evidence_ids") or [None])[0],
                        summary="Potential limiting language found in evidence; claim should use safe wording.",
                        severity="medium",
                    )
                )
    event = trace_event(
        run_id=state["run_id"],
        node="contradiction_hunter",
        actor="Contradiction Hunter",
        action="try to falsify strongest claims",
        status="completed",
        output_summary=f"{len(conflicts)} possible conflicts discovered",
    )
    return {
        "conflicts": [conflict.model_dump(mode="json") for conflict in conflicts],
        "current_stage": "contradiction_search",
        "trace_events": state.get("trace_events", []) + [event],
    }

