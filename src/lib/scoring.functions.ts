import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { calculateEvidenceFit, type EvidenceVerdict } from "./evidence-fit";
import { loadProfileEvidence } from "./profile-evidence.server";
import { loadSpeedrunJob } from "./speedrun.functions";

const ProfileSchema = z.object({
  identity: z.string(),
  githubUrl: z.string(),
  portfolioUrl: z.string(),
  resumeText: z.string(),
  targetRoles: z.array(z.string()),
});

const Input = z.object({
  jobId: z.string(),
  profile: ProfileSchema,
});

const FitSchema = z.object({
  fitScore: z.number(),
  verdict: z.enum(["Apply Now", "Build Proof First", "Skip"]),
  headline: z.string(),
  matches: z.array(z.string()),
  risks: z.array(z.string()),
  gaps: z.array(z.string()),
  projectsToMention: z.array(z.string()),
  applicationAngle: z.string(),
});

export type FitReport = z.infer<typeof FitSchema>;

function compact(value: string, length = 150) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length).trim()}...` : clean;
}

function formatTerm(term: string) {
  return term === "api" || term === "llm" || term === "rag" || term === "defi"
    ? term.toUpperCase()
    : term;
}

function fallbackProjectFacts(facts: string[]) {
  const projectFacts = facts.filter((fact) =>
    /\b(built|developed|engineered|implemented|shipped|deployed|project|repository)\b/i.test(fact),
  );
  return (projectFacts.length ? projectFacts : facts).slice(0, 4).map((fact) => compact(fact, 175));
}

function headlineFor({
  verdict,
  seniorityGap,
  matchedTracks,
  sharedTerms,
}: {
  verdict: EvidenceVerdict;
  seniorityGap: boolean;
  matchedTracks: string[];
  sharedTerms: string[];
}) {
  if (!matchedTracks.length) return "Role does not match the selected target tracks";
  if (seniorityGap) return "Relevant evidence exists, but required seniority is not documented";
  if (!sharedTerms.length) return "Selected track matches, but direct profile evidence is limited";
  if (verdict === "Apply Now") return "Strong direct overlap in the current role requirements";
  return "Relevant evidence exists; close the named gaps before applying";
}

function buildFitReport(fit: ReturnType<typeof calculateEvidenceFit>, facts: string[]): FitReport {
  const shared = fit.sharedTerms.map(formatTerm);
  const missing = fit.missingTerms.map(formatTerm);
  const matches = [
    ...(fit.matchedTracks.length ? [`Selected track: ${fit.matchedTracks.join(", ")}`] : []),
    ...(shared.length ? [`Direct technical overlap: ${shared.join(", ")}`] : []),
    ...(fit.profileEvidence !== "No direct profile evidence found"
      ? [`Profile evidence: ${compact(fit.profileEvidence)}`]
      : []),
  ].slice(0, 4);
  const risks = [
    ...(fit.seniorityGap ? ["No explicit seniority, leadership, or tenure evidence found"] : []),
    ...(!shared.length
      ? ["No direct technical overlap between saved evidence and the live post"]
      : []),
    ...(missing.length ? [`Live post also mentions: ${missing.join(", ")}`] : []),
  ].slice(0, 4);
  const gaps = [
    ...missing.map((term) => `Show concrete evidence for ${term}`),
    ...(fit.seniorityGap ? ["Show scope, ownership, or years of comparable work"] : []),
  ].slice(0, 4);
  const projectsToMention = fallbackProjectFacts(facts);

  return {
    fitScore: fit.score,
    verdict: fit.verdict,
    headline: headlineFor(fit),
    matches: matches.length ? matches : ["No direct evidence was found in the saved profile"],
    risks: risks.length ? risks : ["Review the live role requirements before applying"],
    gaps: gaps.length ? gaps : ["Use the live role requirements to verify your application claims"],
    projectsToMention,
    applicationAngle:
      fit.verdict === "Skip"
        ? "Do not force an application. Choose a closer selected track or add verifiable evidence first."
        : `Lead with ${compact(fit.profileEvidence, 115)}. Do not claim experience beyond the saved evidence.`,
  };
}

export const scoreRole = createServerFn({ method: "POST" })
  .validator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<FitReport> => {
    const job = await loadSpeedrunJob(data.jobId);
    if (job.status === "closed") {
      throw new Error("This role is no longer open on Speedrun.");
    }
    const evidence = await loadProfileEvidence(data.profile);
    const fit = calculateEvidenceFit({ profile: data.profile, facts: evidence.facts, job });
    return buildFitReport(fit, evidence.facts);
  });
