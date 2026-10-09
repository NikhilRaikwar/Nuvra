from app.graph.events import trace_event
from app.graph.state import ProofAgentState
from app.models.schemas import EvidenceContract, ProofPacket, ProofPlan, ProofPlanCandidate
from app.scoring.proof_value import rank_proof_candidates


async def proof_planner(state: ProofAgentState) -> dict:
    revision_count = int(state.get("revision_count", 0))
    target_gap = next(
        (gap for gap in state.get("gaps", []) if gap.get("status") in {"MISSING", "WEAK"}),
        None,
    )
    capability = target_gap["requirement_id"] if target_gap else "role-specific proof"
    candidates = [
        ProofPlanCandidate(
            id="plan_a",
            title="Traceable Proof Compiler Demo",
            capability=capability,
            summary="Build a small workflow that emits inspectable traces, source evidence, and acceptance results.",
            reviewer_signal=8,
            estimated_complexity=5,
            estimated_build_time_hours=18,
            dependency_risk=3,
            demo_reliability=8,
            evidence_coverage=8,
            evidence_contract=EvidenceContract(
                must_produce=["deployed demo", "source repository", "run trace", "test results"],
                acceptance_criteria=[
                    "Every claim maps to evidence IDs",
                    "At least one failure state is visible",
                ],
                reviewer_can_inspect=["demo", "README", "tests", "trace output"],
            ),
        ),
        ProofPlanCandidate(
            id="plan_b",
            title="Targeted Evaluation Harness",
            capability=capability,
            summary="Build a fixture-based evaluator that proves the missing capability with repeatable test cases.",
            reviewer_signal=7,
            estimated_complexity=3,
            estimated_build_time_hours=10,
            dependency_risk=2,
            demo_reliability=9,
            evidence_coverage=7,
            evidence_contract=EvidenceContract(
                must_produce=["fixtures", "automated evaluation", "README evidence table"],
                acceptance_criteria=[
                    "Evaluator passes deterministic cases",
                    "Known limitation case is documented",
                ],
                reviewer_can_inspect=["test suite", "fixture data", "README"],
            ),
        ),
    ]
    if revision_count:
        candidates[0].evidence_contract.acceptance_criteria.append(
            "Measured success criterion added after critic revision"
        )
    ranked = rank_proof_candidates(candidates)
    selected = ranked[0]
    proof = ProofPlan(
        selected_candidate_id=selected.id,
        title=selected.title,
        selection_rationale=(
            "Selected by deterministic proof value: strong reviewer signal with lower complexity and dependency risk."
        ),
        candidate=selected,
    )
    event = trace_event(
        run_id=state["run_id"],
        node="proof_planner",
        actor="Proof Planner",
        action=f"create proof candidates revision {revision_count}",
        status="completed",
        output_summary=f"{len(ranked)} candidates ranked; selected {selected.id}",
    )
    return {
        "proof_candidates": [candidate.model_dump(mode="json") for candidate in ranked],
        "selected_proof": proof.model_dump(mode="json"),
        "current_stage": "proof_planning",
        "trace_events": state.get("trace_events", []) + [event],
    }


async def packet_builder(state: ProofAgentState) -> dict:
    selected = state.get("selected_proof") or {}
    candidate = selected.get("candidate") or {}
    contract = EvidenceContract.model_validate(candidate.get("evidence_contract", {}))
    gap = state.get("gaps", [{}])[0]
    packet = ProofPacket(
        gap=gap.get("why_it_matters", "A role-relevant proof gap remains."),
        proof_objective=candidate.get("summary", "Create an inspectable proof artifact."),
        existing_evidence=[
            claim.get("safe_wording", claim.get("claim", ""))
            for claim in state.get("verified_claims", [])
            if claim.get("supporting_evidence_ids")
        ],
        missing_observable_evidence=gap.get("missing_observables", []),
        evidence_contract=contract,
        build_specification=[
            "Implement the smallest workflow that proves the missing observable.",
            "Record trace output and failure behavior.",
            "Document source links and acceptance results.",
        ],
        acceptance_tests=contract.acceptance_criteria,
        demo_scenario=[
            "Run the happy path with realistic input.",
            "Run one failure case.",
            "Open trace and source evidence side by side.",
        ],
        reviewer_inspection_checklist=contract.reviewer_can_inspect,
        readme_draft="DRAFT FOR AFTER SUCCESSFUL IMPLEMENTATION: document the proof objective, architecture, evidence table, and limitations.",
        resume_bullet_draft="DRAFT FOR AFTER SUCCESSFUL IMPLEMENTATION: Built an inspectable proof artifact with tests, traces, and source evidence.",
        launch_post_draft="DRAFT FOR AFTER SUCCESSFUL IMPLEMENTATION: Shipped a small proof artifact with code, demo, trace, and acceptance tests.",
    )
    event = trace_event(
        run_id=state["run_id"],
        node="packet_builder",
        actor="Packet Builder",
        action="compile final proof packet",
        status="completed",
        output_summary="proof packet compiled",
    )
    return {
        "proof_packet": packet.model_dump(mode="json"),
        "status": "completed",
        "current_stage": "completed",
        "trace_events": state.get("trace_events", []) + [event],
    }


async def rejected_packet(state: ProofAgentState) -> dict:
    event = trace_event(
        run_id=state["run_id"],
        node="rejected_packet",
        actor="Packet Builder",
        action="return rejected proof plan",
        status="completed",
        output_summary="critic did not accept plan within revision limit",
    )
    return {
        "status": "partial",
        "current_stage": "rejected",
        "trace_events": state.get("trace_events", []) + [event],
    }

