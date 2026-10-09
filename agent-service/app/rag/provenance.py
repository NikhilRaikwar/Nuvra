from app.rag.documents import EvidenceDocument


def provenance_key(document: EvidenceDocument) -> str:
    parts = [
        document.run_id,
        document.repository or "",
        document.file_path or "",
        document.source_url or "",
        document.document_id,
    ]
    return "::".join(parts)

