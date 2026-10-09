from app.models.schemas import EvidenceContract, ProofPlanCandidate
from app.scoring.proof_value import rank_proof_candidates


def test_lower_risk_plan_can_win():
    contract = EvidenceContract()
    candidates = [
        ProofPlanCandidate(
            id="complex",
            title="Complex",
            capability="x",
            summary="x",
            reviewer_signal=9,
            estimated_complexity=9,
            estimated_build_time_hours=40,
            dependency_risk=8,
            demo_reliability=8,
            evidence_coverage=9,
            evidence_contract=contract,
        ),
        ProofPlanCandidate(
            id="focused",
            title="Focused",
            capability="x",
            summary="x",
            reviewer_signal=8,
            estimated_complexity=4,
            estimated_build_time_hours=12,
            dependency_risk=3,
            demo_reliability=8,
            evidence_coverage=8,
            evidence_contract=contract,
        ),
    ]
    assert rank_proof_candidates(candidates)[0].id == "focused"
