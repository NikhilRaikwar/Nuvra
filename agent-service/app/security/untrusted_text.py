SUSPICIOUS_INSTRUCTION_TERMS = (
    "ignore previous",
    "ignore above",
    "system prompt",
    "developer instruction",
    "assistant instruction",
    "mark candidate",
)


def clean_untrusted_text(value: str, limit: int = 20_000) -> tuple[str, bool]:
    suspicious = False
    lines: list[str] = []
    for raw_line in value.replace("\r", "\n").split("\n"):
        line = " ".join(raw_line.split())
        if not line:
            continue
        lowered = line.lower()
        if any(term in lowered for term in SUSPICIOUS_INSTRUCTION_TERMS):
            suspicious = True
            continue
        lines.append(line)
    return "\n".join(lines)[:limit], suspicious

