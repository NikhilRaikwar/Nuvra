from datetime import datetime, timezone
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator


class RunStatus(str, Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"
    partial = "partial"
    cancelled = "cancelled"


class OpportunityInput(BaseModel):
    url: HttpUrl | None = None
    text: str = Field(default="", max_length=50_000)
    speedrunJobId: str | None = Field(default=None, max_length=200)

    @field_validator("text")
    @classmethod
    def clean_text(cls, value: str) -> str:
        return value.strip()


class ProfileInput(BaseModel):
    identity: str = Field(default="", max_length=500)
    resumeText: str = Field(default="", max_length=50_000)
    githubUrl: str = Field(default="", max_length=500)
    portfolioUrl: str = Field(default="", max_length=500)
    targetRoles: list[str] = Field(default_factory=list, max_length=20)


class RunCreateRequest(BaseModel):
    opportunity: OpportunityInput
    profile: ProfileInput


class RunCreateResponse(BaseModel):
    runId: str
    status: RunStatus


class ToolBudget(BaseModel):
    max_repo_metadata_reads: int = 30
    max_deep_repos: int = 6
    max_file_reads: int = 24
    max_code_searches: int = 12
    max_web_fetches: int = 6
    max_retrieval_queries: int = 20
    max_llm_calls: int = 16
    max_critic_revisions: int = 2

    repo_metadata_reads: int = 0
    deep_repos: int = 0
    file_reads: int = 0
    code_searches: int = 0
    web_fetches: int = 0
    retrieval_queries: int = 0
    llm_calls: int = 0
    critic_revisions: int = 0


class TraceEvent(BaseModel):
    event_id: str
    run_id: str
    node: str
    actor: str
    action: str
    status: Literal[
        "started",
        "tool_call",
        "tool_result",
        "completed",
        "failed",
        "retrying",
        "checkpointed",
    ]
    tool: str | None = None
    input_summary: str | None = None
    output_summary: str | None = None
    duration_ms: int | None = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Requirement(BaseModel):
    id: str
    label: str
    type: Literal["explicit", "inferred"]
    source_text: str
    source_url: str | None = None
    confidence: float = Field(ge=0, le=1)
    rationale: str
    priority: Literal["high", "medium", "low"] = "medium"


class ResearchTask(BaseModel):
    id: str
    question: str
    preferredSources: list[str] = Field(default_factory=list)
    searchTerms: list[str] = Field(default_factory=list)
    priority: Literal["high", "medium", "low"] = "medium"


class SourceRecord(BaseModel):
    id: str
    source_type: str
    source_url: str | None = None
    summary: str
    status: Literal["read", "unavailable", "skipped"] = "read"


class EvidenceNode(BaseModel):
    id: str
    claim: str
    source_type: str
    source_url: str | None = None
    repository: str | None = None
    file_path: str | None = None
    excerpt: str
    retrieved_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    evidence_type: Literal[
        "code",
        "test",
        "deployment",
        "architecture",
        "documentation",
        "commit",
        "profile_claim",
    ]
    verification_status: Literal["verified", "self_reported", "unverified"]
    base_strength: float = Field(ge=0, le=1)
    relevance_score: float = Field(ge=0, le=1)
    corroboration_bonus: float = Field(default=0, ge=0, le=0.2)
    contradiction_penalty: float = Field(default=0, ge=0, le=0.5)
    final_strength: float = Field(ge=0, le=1)
    supports_requirements: list[str] = Field(default_factory=list)


class VerifiedClaim(BaseModel):
    id: str
    claim: str
    verdict: Literal["supported", "partial", "unsupported", "unresolved"]
    supporting_evidence_ids: list[str] = Field(default_factory=list)
    contradicting_evidence_ids: list[str] = Field(default_factory=list)
    strongest_evidence_type: str | None = None
    confidence: float = Field(ge=0, le=1)
    safe_wording: str
    rejection_reason: str | None = None


class EvidenceConflict(BaseModel):
    id: str
    claim_id: str
    support_evidence_id: str | None = None
    contradiction_evidence_id: str | None = None
    summary: str
    severity: Literal["high", "medium", "low"] = "medium"


class GapAnalysis(BaseModel):
    requirement_id: str
    status: Literal["PROVEN", "WEAK", "MISSING"]
    supporting_claim_ids: list[str] = Field(default_factory=list)
    missing_observables: list[str] = Field(default_factory=list)
    priority: Literal["high", "medium", "low"] = "medium"
    why_it_matters: str


class EvidenceContract(BaseModel):
    must_produce: list[str] = Field(default_factory=list)
    acceptance_criteria: list[str] = Field(default_factory=list)
    reviewer_can_inspect: list[str] = Field(default_factory=list)


class ProofPlanCandidate(BaseModel):
    id: str
    title: str
    capability: str
    summary: str
    reviewer_signal: float = Field(ge=0, le=10)
    estimated_complexity: float = Field(ge=1, le=10)
    estimated_build_time_hours: int = Field(ge=1, le=200)
    dependency_risk: float = Field(ge=1, le=10)
    demo_reliability: float = Field(ge=0, le=10)
    evidence_coverage: float = Field(ge=0, le=10)
    evidence_contract: EvidenceContract
    proof_value: float = 0


class ProofPlan(BaseModel):
    selected_candidate_id: str
    title: str
    selection_rationale: str
    candidate: ProofPlanCandidate


class PlanCriticVerdict(BaseModel):
    verdict: Literal["ACCEPT", "REVISE", "REJECT"]
    weaknesses: list[str] = Field(default_factory=list)
    missing_observables: list[str] = Field(default_factory=list)
    required_changes: list[str] = Field(default_factory=list)
    score: float = Field(ge=0, le=10)


class ProofPacket(BaseModel):
    gap: str
    proof_objective: str
    existing_evidence: list[str]
    missing_observable_evidence: list[str]
    evidence_contract: EvidenceContract
    build_specification: list[str]
    acceptance_tests: list[str]
    demo_scenario: list[str]
    reviewer_inspection_checklist: list[str]
    readme_draft: str
    resume_bullet_draft: str
    launch_post_draft: str


class RunFailure(BaseModel):
    stage: str
    message: str
    recoverable: bool = True
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RunSnapshot(BaseModel):
    runId: str
    status: RunStatus
    currentStage: str
    graphVersion: str
    inputHash: str
    startedAt: datetime
    completedAt: datetime | None = None
    opportunity: OpportunityInput
    profile: ProfileInput
    requirements: list[Requirement] = Field(default_factory=list)
    researchPlan: list[ResearchTask] = Field(default_factory=list)
    sourcesInspected: list[SourceRecord] = Field(default_factory=list)
    evidenceNodes: list[EvidenceNode] = Field(default_factory=list)
    verifiedClaims: list[VerifiedClaim] = Field(default_factory=list)
    conflicts: list[EvidenceConflict] = Field(default_factory=list)
    gaps: list[GapAnalysis] = Field(default_factory=list)
    proofCandidates: list[ProofPlanCandidate] = Field(default_factory=list)
    selectedProof: ProofPlan | None = None
    criticHistory: list[PlanCriticVerdict] = Field(default_factory=list)
    proofPacket: ProofPacket | None = None
    toolBudget: ToolBudget = Field(default_factory=ToolBudget)
    failures: list[RunFailure] = Field(default_factory=list)
    traceEvents: list[TraceEvent] = Field(default_factory=list)

