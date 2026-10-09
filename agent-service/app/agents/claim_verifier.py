from app.graph.events import trace_event
from app.graph.state import ProofAgentState
from app.models.schemas import VerifiedClaim


async def claim_verifier(state: ProofAgentState) -> dict:
    claims: list[VerifiedClaim] = []
    evidence_nodes = state.get("evidence_nodes", [])
    for requirement in state.get("requirements", [])[:6]:
        supporting = [
            node["id"]
            for node in evidence_nodes
            if requirement["id"] in node.get("supports_requirements", [])
        ]
        verdict = "partial" if supporting else "unresolved"
        claims.append(
            VerifiedClaim(
                id=f"claim_{len(claims) + 1}",
                claim=f"Candidate has evidence related to {requirement['label']}",
                verdict=verdict,
                supporting_evidence_ids=supporting,
                strongest_evidence_type=evidence_nodes[0]["evidence_type"] if supporting else None,
                confidence=0.55 if supporting else 0.25,
                safe_wording=(
                    f"Candidate has partial evidence related to {requirement['label']}."
                    if supporting
                    else f"Evidence for {requirement['label']} is not yet resolved."
                ),
                rejection_reason=None if supporting else "No source evidence ID currently supports this claim.",
            )
        )
    event = trace_event(
        run_id=state["run_id"],
        node="claim_verifier",
        actor="Claim Verifier",
        action="verify claims from evidence IDs",
        status="completed",
        output_summary=f"{len(claims)} claims checked",
    )
    return {
        "verified_claims": [claim.model_dump(mode="json") for claim in claims],
        "current_stage": "claim_verification",
        "trace_events": state.get("trace_events", []) + [event],
    }

