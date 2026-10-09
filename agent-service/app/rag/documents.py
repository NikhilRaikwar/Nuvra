from datetime import datetime, timezone

from pydantic import BaseModel, Field


class EvidenceDocument(BaseModel):
    document_id: str
    run_id: str
    repository: str | None = None
    file_path: str | None = None
    source_url: str | None = None
    source_type: str
    evidence_type: str
    content: str
    retrieved_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    trust_level: str = "unverified"

