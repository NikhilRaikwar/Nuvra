import { enrichPublicProfile, type ProfileEvidenceSummary } from "./profile-enrichment.server";

export type AgentProfile = {
  identity: string;
  githubUrl: string;
  portfolioUrl: string;
  resumeText: string;
  targetRoles: string[];
};

export type LoadedProfileEvidence = {
  sourceText: string;
  facts: string[];
  sources: ProfileEvidenceSummary;
};

const MAX_FACTS = 18;
const MAX_FACT_LENGTH = 260;
const COMMON_WORDS = new Set([
  "about",
  "across",
  "also",
  "and",
  "are",
  "as",
  "at",
  "built",
  "can",
  "for",
  "from",
  "have",
  "into",
  "more",
  "not",
  "of",
  "on",
  "or",
  "our",
  "that",
  "the",
  "their",
  "this",
  "to",
  "use",
  "using",
  "with",
  "work",
  "you",
  "your",
]);

function compact(value: string, maxLength = MAX_FACT_LENGTH) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength).trim();
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string) {
  return [
    ...new Set(
      normalize(value)
        .split(" ")
        .filter((word) => word.length > 2 && !COMMON_WORDS.has(word)),
    ),
  ];
}

function toFacts(sourceText: string) {
  const rawLines = sourceText
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9])/))
    .flatMap((line) => {
      const parts: string[] = [];
      let remaining = line.trim();
      while (remaining.length > MAX_FACT_LENGTH) {
        const cut = Math.max(remaining.lastIndexOf(" ", MAX_FACT_LENGTH), 1);
        parts.push(remaining.slice(0, cut));
        remaining = remaining.slice(cut).trim();
      }
      if (remaining) parts.push(remaining);
      return parts;
    })
    .map((line) => compact(line))
    .filter((line) => line.length >= 16);

  const uniqueFacts: string[] = [];
  for (const fact of rawLines) {
    if (!uniqueFacts.some((existing) => normalize(existing) === normalize(fact))) {
      uniqueFacts.push(fact);
    }
  }
  const projectFirst = [...uniqueFacts].sort((left, right) => {
    const leftProject =
      /\b(built|developed|engineered|implemented|shipped|deployed|repository|project|winner)\b/i.test(
        left,
      );
    const rightProject =
      /\b(built|developed|engineered|implemented|shipped|deployed|repository|project|winner)\b/i.test(
        right,
      );
    return Number(rightProject) - Number(leftProject);
  });
  return projectFirst.slice(0, MAX_FACTS);
}

export async function loadProfileEvidence(profile: AgentProfile): Promise<LoadedProfileEvidence> {
  const enrichment = await enrichPublicProfile(profile);
  const sourceText = [
    profile.identity.trim() ? `Identity: ${profile.identity.trim()}` : "",
    profile.resumeText.trim() ? `Saved resume: ${profile.resumeText.trim()}` : "",
    enrichment.evidenceText,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 15_000);

  return {
    sourceText,
    facts: toFacts(sourceText),
    sources: enrichment.summary,
  };
}

export function resolveEvidenceQuotes(claims: string[], facts: string[]) {
  const resolved: string[] = [];
  for (const claim of claims) {
    const normalizedClaim = normalize(claim);
    const claimTokens = tokens(claim);
    if (!normalizedClaim || !claimTokens.length) continue;

    let best: { fact: string; score: number } | null = null;
    for (const fact of facts) {
      const normalizedFact = normalize(fact);
      const factTokens = new Set(tokens(fact));
      const matches = claimTokens.filter((token) => factTokens.has(token)).length;
      const score = matches / claimTokens.length;
      const exact =
        normalizedFact.includes(normalizedClaim) || normalizedClaim.includes(normalizedFact);
      if (exact || !best || score > best.score) {
        best = { fact, score: exact ? 1 : score };
      }
    }

    if (best && best.score >= 0.5 && !resolved.includes(best.fact)) {
      resolved.push(best.fact);
    }
    if (resolved.length >= 3) break;
  }
  return resolved;
}

export function roleFactCandidates(description: string, title: string) {
  const facts = toFacts(description);
  return facts.length ? facts : [`Role: ${title}`];
}

export function pickProjectEvidence(facts: string[]) {
  return (
    facts.find((fact) =>
      /\b(built|developed|engineered|implemented|shipped|repository|project|deployed)\b/i.test(
        fact,
      ),
    ) ||
    facts[0] ||
    ""
  );
}
