import asyncio

from app.graph.workflow import build_graph
from app.models.schemas import ToolBudget


async def main() -> None:
    state = {
        "run_id": "smoke",
        "input_hash": "hash",
        "objective": "Compile proof",
        "opportunity_url": None,
        "opportunity_text": "We need an agentic RAG system with retrieval traces and tests.",
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
    result = await build_graph().ainvoke(state, config={"configurable": {"thread_id": "smoke"}})
    verdicts = [item["verdict"] for item in result["critic_history"]]
    assert result["status"] == "completed"
    assert verdicts == ["REVISE", "ACCEPT"]
    assert result["proof_packet"]
    print("graph smoke ok")


if __name__ == "__main__":
    asyncio.run(main())
