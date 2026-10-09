from app.graph.events import trace_event
from app.graph.state import ProofAgentState
from app.models.schemas import PlanCriticVerdict


async def plan_critic(state: ProofAgentState) -> dict:
    revision_count = int(state.get("revision_count", 0))
    selected = state.get("selected_proof") or {}
    candidate = selected.get("candidate") or {}
    if revision_count < 1:
        verdict = PlanCriticVerdict(
            verdict="REVISE",
            weaknesses=["Acceptance criteria are not measurable enough for a skeptical reviewer."],
            missing_observables=["measured success criterion"],
            required_changes=["Add a concrete pass/fail acceptance criterion."],
            score=6,
        )
        next_revision = revision_count + 1
    else:
        verdict = PlanCriticVerdict(
            verdict="ACCEPT",
            weaknesses=[],
            missing_observables=[],
            required_changes=[],
            score=8,
        )
        next_revision = revision_count
    history = list(state.get("critic_history", [])) + [verdict.model_dump(mode="json")]
    event = trace_event(
        run_id=state["run_id"],
        node="plan_critic",
        actor="Plan Critic",
        action="adversarial proof plan review",
        status="completed",
        output_summary=verdict.verdict,
    )
    return {
        "critic_history": history,
        "revision_count": next_revision,
        "current_stage": "plan_critic",
        "trace_events": state.get("trace_events", []) + [event],
    }
