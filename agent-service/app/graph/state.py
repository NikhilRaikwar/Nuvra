from typing import TypedDict


class ProofAgentState(TypedDict, total=False):
    run_id: str
    input_hash: str
    objective: str
    opportunity_url: str | None
    opportunity_text: str
    opportunity_snapshot: dict | None
    profile: dict
    requirements: list[dict]
    research_plan: list[dict]
    repo_candidates: list[dict]
    inspected_sources: list[dict]
    evidence_nodes: list[dict]
    verified_claims: list[dict]
    conflicts: list[dict]
    gaps: list[dict]
    proof_candidates: list[dict]
    selected_proof: dict | None
    critic_history: list[dict]
    revision_count: int
    proof_packet: dict | None
    tool_budget: dict
    failures: list[dict]
    current_stage: str
    trace_events: list[dict]
    status: str

