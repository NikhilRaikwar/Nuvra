from langchain_core.tools import tool


@tool
async def semantic_evidence_search(query: str) -> str:
    """Search embedded evidence by semantic similarity. Placeholder for Phase 5."""
    return f"Semantic evidence search is not implemented yet: {query}."


@tool
async def keyword_evidence_search(query: str) -> str:
    """Search evidence by lexical keyword matching. Placeholder for Phase 5."""
    return f"Keyword evidence search is not implemented yet: {query}."


@tool
async def contradiction_search(claim: str) -> str:
    """Search evidence for contradictions to a claim. Placeholder for Phase 6."""
    return f"Contradiction search is not implemented yet: {claim}."

