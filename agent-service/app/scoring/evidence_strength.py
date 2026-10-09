BASE_EVIDENCE_WEIGHT = {
    "test": 1.00,
    "code": 0.90,
    "deployment": 0.85,
    "commit": 0.80,
    "architecture": 0.70,
    "documentation": 0.55,
    "profile_claim": 0.30,
}


def clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def score_evidence_strength(
    evidence_type: str,
    relevance_score: float,
    *,
    corroboration_bonus: float = 0.0,
    contradiction_penalty: float = 0.0,
    self_reported: bool = False,
) -> tuple[float, float]:
    base = BASE_EVIDENCE_WEIGHT.get(evidence_type, 0.25)
    self_report_penalty = 0.15 if self_reported else 0.0
    final = clamp(base * clamp(relevance_score) + corroboration_bonus - contradiction_penalty - self_report_penalty)
    return base, final

