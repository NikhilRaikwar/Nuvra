from app.rag.documents import EvidenceDocument


def keyword_search(documents: list[EvidenceDocument], query: str, limit: int = 5) -> list[EvidenceDocument]:
    terms = [term for term in query.lower().split() if len(term) > 2]
    scored = []
    for document in documents:
        text = document.content.lower()
        score = sum(1 for term in terms if term in text)
        if score:
            scored.append((score, document))
    return [document for _, document in sorted(scored, key=lambda item: item[0], reverse=True)[:limit]]

