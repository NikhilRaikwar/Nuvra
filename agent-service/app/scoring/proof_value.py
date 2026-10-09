from app.models.schemas import ProofPlanCandidate


def rank_proof_candidates(candidates: list[ProofPlanCandidate]) -> list[ProofPlanCandidate]:
    ranked: list[ProofPlanCandidate] = []
    for candidate in candidates:
        denominator = max(1.0, candidate.estimated_complexity * candidate.dependency_risk)
        proof_value = (
            candidate.reviewer_signal
            * candidate.evidence_coverage
            * max(candidate.demo_reliability, 0.1)
        ) / denominator
        ranked.append(candidate.model_copy(update={"proof_value": round(proof_value, 3)}))
    return sorted(ranked, key=lambda item: item.proof_value, reverse=True)

