import re

from app.graph.events import trace_event
from app.graph.state import ProofAgentState
from app.models.schemas import Requirement
from app.security.untrusted_text import clean_untrusted_text


KEYWORDS = (
    "agent",
    "rag",
    "retrieval",
    "python",
    "typescript",
    "react",
    "postgres",
    "deployment",
    "github",
    "api",
    "llm",
    "evaluation",
)


async def requirement_agent(state: ProofAgentState) -> dict:
    run_id = state["run_id"]
    clean_text, suspicious = clean_untrusted_text(state.get("opportunity_text", ""))
    sentences = re.split(r"(?<=[.!?])\s+", clean_text)
    requirements: list[Requirement] = []
    for sentence in sentences:
        lowered = sentence.lower()
        matched = [term for term in KEYWORDS if term in lowered]
        if not matched:
            continue
        requirement = Requirement(
            id=f"req_{len(requirements) + 1}",
            label=", ".join(matched[:3]),
            type="explicit",
            source_text=sentence[:500],
            source_url=state.get("opportunity_url"),
            confidence=0.9,
            rationale="Directly stated in the supplied opportunity text.",
            priority="high" if any(term in matched for term in ("agent", "rag", "api")) else "medium",
        )
        requirements.append(requirement)
        if len(requirements) >= 8:
            break
    if not requirements and clean_text:
        requirements.append(
            Requirement(
                id="req_1",
                label="role-specific proof",
                type="explicit",
                source_text=clean_text[:500],
                source_url=state.get("opportunity_url"),
                confidence=0.7,
                rationale="The supplied opportunity text needs role-specific evidence.",
                priority="medium",
            )
        )
    event = trace_event(
        run_id=run_id,
        node="requirement_agent",
        actor="Requirement Agent",
        action="extract requirements",
        status="completed",
        output_summary=f"{len(requirements)} requirements extracted"
        + ("; prompt-injection-like text removed" if suspicious else ""),
    )
    return {
        "requirements": [item.model_dump(mode="json") for item in requirements],
        "current_stage": "requirements",
        "trace_events": state.get("trace_events", []) + [event],
    }

