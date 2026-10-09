import pytest

from app.graph.workflow import build_graph
from app.models.schemas import ToolBudget


@pytest.mark.asyncio
async def test_graph_compiles_packet_with_critic_revision():
    graph = build_graph()
    state = {
        "run_id": "test-run",
        "input_hash": "hash",
        "objective": "Compile proof",
        "opportunity_url": None,
        "opportunity_text": "We need an agentic RAG system with retrieval, traces, and tests.",
        "opportunity_snapshot": None,
        "profile": {
            "identity": "AI builder",
            "resumeText": "Built a RAG project with manual approval and tests.",
            "githubUrl": "https://github.com/example",
            "portfolioUrl": "",
            "targetRoles": ["AI Engineer"],
        },
        "requirements": [],
        "research_plan": [],
        "repo_candidates": [],
        "inspected_sources": [],
        "evidence_nodes": [],
        "verified_claims": [],
        "conflicts": [],
        "gaps": [],
        "proof_candidates": [],
        "selected_proof": None,
        "critic_history": [],
        "revision_count": 0,
        "proof_packet": None,
        "tool_budget": ToolBudget().model_dump(mode="json"),
        "failures": [],
        "current_stage": "starting",
        "trace_events": [],
        "status": "running",
    }
    result = await graph.ainvoke(state, config={"configurable": {"thread_id": "test-run"}})
    assert result["status"] == "completed"
    assert result["proof_packet"]
    assert [item["verdict"] for item in result["critic_history"]] == ["REVISE", "ACCEPT"]

