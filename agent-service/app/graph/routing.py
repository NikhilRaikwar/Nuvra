from app.graph.state import ProofAgentState


def after_research(state: ProofAgentState) -> str:
    if not state.get("research_plan"):
        return "gap_analyzer"
    if len(state.get("evidence_nodes", [])) < 1 and state.get("opportunity_text"):
        return "evidence_research_agent"
    return "evidence_indexer"


def after_contradiction(state: ProofAgentState) -> str:
    unresolved = [
        claim
        for claim in state.get("verified_claims", [])
        if claim.get("verdict") == "unresolved" and claim.get("confidence", 0) < 0.5
    ]
    budget = state.get("tool_budget", {})
    used = int(budget.get("retrieval_queries", 0))
    limit = int(budget.get("max_retrieval_queries", 20))
    if unresolved and used < min(limit, 2):
        return "evidence_research_agent"
    return "gap_analyzer"


def after_critic(state: ProofAgentState) -> str:
    history = state.get("critic_history", [])
    latest = history[-1] if history else {}
    verdict = latest.get("verdict")
    if verdict == "ACCEPT":
        return "packet_builder"
    if verdict == "REVISE" and int(state.get("revision_count", 0)) < 2:
        return "proof_planner"
    return "rejected_packet"

