import asyncio
import hashlib
import json
from contextlib import AsyncExitStack
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.config import Settings
from app.graph.events import trace_event
from app.graph.workflow import build_graph
from app.models.schemas import (
    EvidenceConflict,
    EvidenceNode,
    GapAnalysis,
    PlanCriticVerdict,
    ProofPacket,
    ProofPlan,
    ProofPlanCandidate,
    Requirement,
    ResearchTask,
    RunCreateRequest,
    RunFailure,
    RunSnapshot,
    RunStatus,
    SourceRecord,
    ToolBudget,
    TraceEvent,
    VerifiedClaim,
)


class RunStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.graph = None
        self._exit_stack: AsyncExitStack | None = None
        self._snapshots: dict[str, RunSnapshot] = {}
        self._inputs: dict[str, RunCreateRequest] = {}
        self._tasks: dict[str, asyncio.Task] = {}
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        if self.graph is not None:
            return
        self._exit_stack = AsyncExitStack()
        checkpointer = await self._exit_stack.enter_async_context(self._open_checkpointer())
        await checkpointer.setup()
        self.graph = build_graph(checkpointer=checkpointer)

    async def stop(self) -> None:
        for task in self._tasks.values():
            if not task.done():
                task.cancel()
        if self._exit_stack:
            await self._exit_stack.aclose()
        self.graph = None
        self._exit_stack = None

    def _open_checkpointer(self):
        if self.settings.database_url:
            from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

            return AsyncPostgresSaver.from_conn_string(self.settings.database_url)

        from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

        Path(self.settings.sqlite_checkpoint_path).parent.mkdir(parents=True, exist_ok=True)
        return AsyncSqliteSaver.from_conn_string(self.settings.sqlite_checkpoint_path)

    def input_hash(self, request: RunCreateRequest) -> str:
        normalized = json.dumps(
            request.model_dump(mode="json"),
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(f"{self.settings.graph_version}:{normalized}".encode()).hexdigest()

    async def create_run(self, request: RunCreateRequest) -> RunSnapshot:
        await self.start()
        async with self._lock:
            existing = self._find_duplicate_running(request)
            if existing:
                return existing
            run_id = str(uuid4())
            snapshot = RunSnapshot(
                runId=run_id,
                status=RunStatus.queued,
                currentStage="queued",
                graphVersion=self.settings.graph_version,
                inputHash=self.input_hash(request),
                startedAt=datetime.now(timezone.utc),
                opportunity=request.opportunity,
                profile=request.profile,
                traceEvents=[
                    TraceEvent(
                        event_id=str(uuid4()),
                        run_id=run_id,
                        node="api",
                        actor="Run API",
                        action="create proof run",
                        status="started",
                        output_summary="run queued",
                    )
                ],
            )
            self._snapshots[run_id] = snapshot
            self._inputs[run_id] = request
            self._tasks[run_id] = asyncio.create_task(self._execute(run_id, request))
            return snapshot

    def get(self, run_id: str) -> RunSnapshot | None:
        return self._snapshots.get(run_id)

    async def retry(self, run_id: str) -> RunSnapshot | None:
        await self.start()
        async with self._lock:
            request = self._inputs.get(run_id)
            snapshot = self._snapshots.get(run_id)
            if not request or not snapshot:
                return None
            if snapshot.status == RunStatus.running:
                return snapshot
            snapshot.status = RunStatus.queued
            snapshot.currentStage = "retry_queued"
            snapshot.traceEvents.append(
                TraceEvent(
                    event_id=str(uuid4()),
                    run_id=run_id,
                    node="api",
                    actor="Run API",
                    action="retry proof run",
                    status="retrying",
                    output_summary="retry queued from stored input",
                )
            )
            self._tasks[run_id] = asyncio.create_task(self._execute(run_id, request))
            return snapshot

    async def cancel(self, run_id: str) -> RunSnapshot | None:
        async with self._lock:
            snapshot = self._snapshots.get(run_id)
            if not snapshot:
                return None
            task = self._tasks.get(run_id)
            if task and not task.done():
                task.cancel()
            snapshot.status = RunStatus.cancelled
            snapshot.currentStage = "cancelled"
            snapshot.completedAt = datetime.now(timezone.utc)
            snapshot.traceEvents.append(
                TraceEvent(
                    event_id=str(uuid4()),
                    run_id=run_id,
                    node="api",
                    actor="Run API",
                    action="cancel proof run",
                    status="completed",
                    output_summary="best-effort cancellation recorded",
                )
            )
            return snapshot

    def _find_duplicate_running(self, request: RunCreateRequest) -> RunSnapshot | None:
        input_hash = self.input_hash(request)
        for snapshot in self._snapshots.values():
            if snapshot.inputHash == input_hash and snapshot.status in {
                RunStatus.queued,
                RunStatus.running,
            }:
                return snapshot
        return None

    async def _execute(self, run_id: str, request: RunCreateRequest) -> None:
        if self.graph is None:
            await self.start()
        if self.graph is None:
            raise RuntimeError("Agent graph did not start.")
        snapshot = self._snapshots[run_id]
        snapshot.status = RunStatus.running
        snapshot.currentStage = "starting"
        initial_state = {
            "run_id": run_id,
            "input_hash": snapshot.inputHash,
            "objective": "Compile the smallest credible proof plan for this opportunity.",
            "opportunity_url": str(request.opportunity.url) if request.opportunity.url else None,
            "opportunity_text": request.opportunity.text,
            "opportunity_snapshot": request.opportunity.model_dump(mode="json"),
            "profile": request.profile.model_dump(mode="json"),
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
            "trace_events": [event.model_dump(mode="json") for event in snapshot.traceEvents],
            "status": "running",
        }
        try:
            config = {"configurable": {"thread_id": run_id}}
            final_state = await self.graph.ainvoke(initial_state, config=config)
            self._apply_state(snapshot, final_state)
            snapshot.status = RunStatus(final_state.get("status", "completed"))
            snapshot.completedAt = datetime.now(timezone.utc)
        except asyncio.CancelledError:
            return
        except Exception as error:
            snapshot.status = RunStatus.failed
            snapshot.currentStage = "failed"
            snapshot.completedAt = datetime.now(timezone.utc)
            snapshot.traceEvents.append(
                TraceEvent.model_validate(
                    trace_event(
                        run_id=run_id,
                        node="graph",
                        actor="Agent Runtime",
                        action="execute graph",
                        status="failed",
                        output_summary=str(error)[:240],
                    )
                )
            )

    def _apply_state(self, snapshot: RunSnapshot, state: dict) -> None:
        snapshot.currentStage = state.get("current_stage", snapshot.currentStage)
        snapshot.requirements = [Requirement.model_validate(item) for item in state.get("requirements", [])]
        snapshot.researchPlan = [
            ResearchTask.model_validate(item) for item in state.get("research_plan", [])
        ]
        snapshot.sourcesInspected = [
            SourceRecord.model_validate(item) for item in state.get("inspected_sources", [])
        ]
        snapshot.evidenceNodes = [
            EvidenceNode.model_validate(item) for item in state.get("evidence_nodes", [])
        ]
        snapshot.verifiedClaims = [
            VerifiedClaim.model_validate(item) for item in state.get("verified_claims", [])
        ]
        snapshot.conflicts = [
            EvidenceConflict.model_validate(item) for item in state.get("conflicts", [])
        ]
        snapshot.gaps = [GapAnalysis.model_validate(item) for item in state.get("gaps", [])]
        snapshot.proofCandidates = [
            ProofPlanCandidate.model_validate(item) for item in state.get("proof_candidates", [])
        ]
        selected_proof = state.get("selected_proof")
        snapshot.selectedProof = ProofPlan.model_validate(selected_proof) if selected_proof else None
        snapshot.criticHistory = [
            PlanCriticVerdict.model_validate(item) for item in state.get("critic_history", [])
        ]
        proof_packet = state.get("proof_packet")
        snapshot.proofPacket = ProofPacket.model_validate(proof_packet) if proof_packet else None
        snapshot.toolBudget = ToolBudget.model_validate(state.get("tool_budget", snapshot.toolBudget))
        snapshot.failures = [RunFailure.model_validate(item) for item in state.get("failures", [])]
        snapshot.traceEvents = [TraceEvent.model_validate(item) for item in state.get("trace_events", [])]
