import type { Job } from "./speedrun.functions";

type ProfileForFit = {
  identity: string;
  resumeText: string;
  targetRoles: string[];
};

export type EvidenceVerdict = "Apply Now" | "Build Proof First" | "Skip";

export type StableEvidenceFit = {
  score: number;
  verdict: EvidenceVerdict;
  matchedTracks: string[];
  sharedTerms: string[];
  missingTerms: string[];
  seniorityGap: boolean;
  profileEvidence: string;
  roleEvidence: string;
};

type Track = {
  query: string;
  terms: string[];
};

// These are search and classification terms, never evidence of a candidate's skill.
export const TARGET_ROLE_TRACKS: Record<string, Track> = {
  "AI Engineer": {
    query: "ai engineer",
    terms: ["ai engineer", "machine learning", "llm", "agentic", "ai platform"],
  },
  FDE: {
    query: "forward deployed",
    terms: ["forward deployed", "integration", "solutions engineer", "customer deployment"],
  },
  "Full Stack": {
    query: "full stack",
    terms: ["full stack", "fullstack"],
  },
  Frontend: {
    query: "frontend",
    terms: ["frontend", "front end", "ui engineer", "web engineer"],
  },
  Backend: {
    query: "backend",
    terms: ["backend", "back end", "platform engineer", "distributed systems"],
  },
  Web3: {
    query: "blockchain",
    terms: ["web3", "blockchain", "solidity", "defi", "crypto", "onchain", "smart contract"],
  },
  DevRel: {
    query: "developer advocate",
    terms: ["developer advocate", "developer relations", "devrel"],
  },
  "Product Engineer": {
    query: "product engineer",
    terms: ["product engineer", "product development"],
  },
};

const SKILL_TERMS: Array<{ term: string; weight: number }> = [
  { term: "solidity", weight: 8 },
  { term: "smart contract", weight: 8 },
  { term: "blockchain", weight: 7 },
  { term: "defi", weight: 7 },
  { term: "web3", weight: 7 },
  { term: "onchain", weight: 7 },
  { term: "llm", weight: 7 },
  { term: "rag", weight: 7 },
  { term: "retrieval", weight: 6 },
  { term: "inference", weight: 6 },
  { term: "prompt", weight: 5 },
  { term: "agent", weight: 5 },
  { term: "python", weight: 6 },
  { term: "typescript", weight: 6 },
  { term: "react", weight: 6 },
  { term: "node", weight: 6 },
  { term: "backend", weight: 5 },
  { term: "frontend", weight: 5 },
  { term: "full stack", weight: 6 },
  { term: "api", weight: 4 },
  { term: "integration", weight: 5 },
  { term: "deployment", weight: 5 },
  { term: "database", weight: 5 },
  { term: "postgres", weight: 6 },
  { term: "evaluation", weight: 5 },
  { term: "security", weight: 4 },
  { term: "developer relations", weight: 6 },
  { term: "documentation", weight: 5 },
  { term: "community", weight: 4 },
  { term: "product", weight: 3 },
];

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contains(text: string, phrase: string) {
  return ` ${text} `.includes(` ${normalize(phrase)} `);
}

function roleText(job: Job) {
  return normalize(
    [
      job.title,
      job.function,
      job.seniority || "",
      job.workplaceType || "",
      job.descriptionText || "",
    ].join(" "),
  );
}

function isSeniorRole(job: Job) {
  return /\b(senior|staff|principal|lead|manager|director|exec|founding)\b/i.test(
    job.seniority || "",
  );
}

function profileShowsSeniorEvidence(profile: ProfileForFit, facts: string[]) {
  const text = normalize([profile.identity, profile.resumeText, ...facts].join(" "));
  return (
    /\b\d{1,2}\+?\s*(years?|yrs?)\b/.test(text) ||
    /\b(senior|staff|principal|lead engineer|engineering lead|manager|director)\b/.test(text)
  );
}

function firstEvidenceLine(lines: string[], terms: string[]) {
  return (
    lines.find((line) => {
      const normalized = normalize(line);
      return terms.some((term) => contains(normalized, term));
    }) || ""
  );
}

function firstRoleLine(job: Job, terms: string[]) {
  const lines = [job.title, ...(job.descriptionText || "").split(/\n+/)].filter(Boolean);
  return firstEvidenceLine(lines, terms) || job.title;
}

export function matchedTargetTracks(job: Job, targetRoles: string[]) {
  const text = roleText(job);
  return targetRoles.filter((role) => {
    const track = TARGET_ROLE_TRACKS[role];
    return Boolean(track && track.terms.some((term) => contains(text, term)));
  });
}

/**
 * Numeric fit is intentionally deterministic: the same profile evidence and live job text
 * produce the same result. An LLM may help write surrounding copy, but never the score.
 */
export function calculateEvidenceFit({
  profile,
  facts,
  job,
}: {
  profile: ProfileForFit;
  facts: string[];
  job: Job;
}): StableEvidenceFit {
  const source = normalize([profile.identity, profile.resumeText, ...facts].join(" "));
  const role = roleText(job);
  const matchedTracks = matchedTargetTracks(job, profile.targetRoles);
  const profileTerms = SKILL_TERMS.filter(({ term }) => contains(source, term));
  const roleTerms = SKILL_TERMS.filter(({ term }) => contains(role, term));
  const shared = roleTerms.filter(({ term }) => profileTerms.some((item) => item.term === term));
  const sharedTerms = shared.map(({ term }) => term);
  const missingTerms = roleTerms
    .filter(({ term }) => !sharedTerms.includes(term))
    .map(({ term }) => term)
    .slice(0, 4);
  const seniorityGap = isSeniorRole(job) && !profileShowsSeniorEvidence(profile, facts);
  const hasShippedEvidence = facts.some((fact) =>
    /\b(built|developed|engineered|implemented|shipped|deployed)\b/i.test(fact),
  );

  let score =
    8 +
    Math.min(
      56,
      shared.reduce((total, item) => total + item.weight, 0),
    );
  if (sharedTerms.length >= 2) score += 8;
  if (hasShippedEvidence && sharedTerms.length > 0) score += 8;
  if (!sharedTerms.length) score = Math.min(score, 24);
  if (seniorityGap) score = Math.min(score, 44);
  score = Math.max(5, Math.min(88, Math.round(score)));

  const verdict: EvidenceVerdict =
    !matchedTracks.length || score < 38
      ? "Skip"
      : score >= 70 && !seniorityGap
        ? "Apply Now"
        : "Build Proof First";

  const profileEvidence =
    firstEvidenceLine(facts, sharedTerms) ||
    firstEvidenceLine([profile.identity, profile.resumeText], sharedTerms) ||
    "No direct profile evidence found";
  const roleEvidence = firstRoleLine(job, sharedTerms.length ? sharedTerms : missingTerms);

  return {
    score,
    verdict,
    matchedTracks,
    sharedTerms,
    missingTerms,
    seniorityGap,
    profileEvidence,
    roleEvidence,
  };
}
