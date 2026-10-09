from app.rag.documents import EvidenceDocument


class InMemoryEvidenceStore:
    def __init__(self) -> None:
        self._documents: list[EvidenceDocument] = []

    def add_documents(self, documents: list[EvidenceDocument]) -> None:
        self._documents.extend(documents)

    def all_for_run(self, run_id: str) -> list[EvidenceDocument]:
        return [document for document in self._documents if document.run_id == run_id]

