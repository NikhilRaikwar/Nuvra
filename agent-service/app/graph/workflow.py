from langgraph.graph import END, START, StateGraph
from langgraph.checkpoint.memory import InMemorySaver

from app.agents.ingest import ingest_opportunity
from app.agents.claim_verifier import claim_verifier
from app.agents.contradiction_hunter import contradiction_hunter
from app.agents.gap_analyzer import gap_analyzer
from app.agents.plan_critic import plan_critic
from app.agents.proof_planner import packet_builder, proof_planner, rejected_packet
from app.agents.requirements import requirement_agent
from app.agents.research import evidence_indexer, evidence_research_agent, research_planner
from app.graph.routing import after_contradiction, after_critic, after_research
from app.graph.state import ProofAgentState


def build_graph(checkpointer=None):
    builder = StateGraph(ProofAgentState)
    builder.add_node("ingest_opportunity", ingest_opportunity)
    builder.add_node("requirement_agent", requirement_agent)
    builder.add_node("research_planner", research_planner)
    builder.add_node("evidence_research_agent", evidence_research_agent)
    builder.add_node("evidence_indexer", evidence_indexer)
    builder.add_node("claim_verifier", claim_verifier)
    builder.add_node("contradiction_hunter", contradiction_hunter)
    builder.add_node("gap_analyzer", gap_analyzer)
    builder.add_node("proof_planner", proof_planner)
    builder.add_node("plan_critic", plan_critic)
    builder.add_node("packet_builder", packet_builder)
    builder.add_node("rejected_packet", rejected_packet)

    builder.add_edge(START, "ingest_opportunity")
    builder.add_edge("ingest_opportunity", "requirement_agent")
    builder.add_edge("requirement_agent", "research_planner")
    builder.add_edge("research_planner", "evidence_research_agent")
    builder.add_conditional_edges(
        "evidence_research_agent",
        after_research,
        {
            "evidence_research_agent": "evidence_research_agent",
            "evidence_indexer": "evidence_indexer",
            "gap_analyzer": "gap_analyzer",
        },
    )
    builder.add_edge("evidence_indexer", "claim_verifier")
    builder.add_edge("claim_verifier", "contradiction_hunter")
    builder.add_conditional_edges(
        "contradiction_hunter",
        after_contradiction,
        {
            "evidence_research_agent": "evidence_research_agent",
            "gap_analyzer": "gap_analyzer",
        },
    )
    builder.add_edge("gap_analyzer", "proof_planner")
    builder.add_edge("proof_planner", "plan_critic")
    builder.add_conditional_edges(
        "plan_critic",
        after_critic,
        {
            "proof_planner": "proof_planner",
            "packet_builder": "packet_builder",
            "rejected_packet": "rejected_packet",
        },
    )
    builder.add_edge("packet_builder", END)
    builder.add_edge("rejected_packet", END)
    return builder.compile(checkpointer=checkpointer or InMemorySaver())
