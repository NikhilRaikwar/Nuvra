from app.rag.documents import EvidenceDocument


def chunk_document(document: EvidenceDocument, max_chars: int = 1200) -> list[EvidenceDocument]:
    chunks: list[EvidenceDocument] = []
    content = document.content.strip()
    for index, start in enumerate(range(0, len(content), max_chars)):
        chunk = content[start : start + max_chars].strip()
        if not chunk:
            continue
        chunks.append(
            document.model_copy(
                update={
                    "document_id": f"{document.document_id}:chunk:{index + 1}",
                    "content": chunk,
                }
            )
        )
    return chunks

