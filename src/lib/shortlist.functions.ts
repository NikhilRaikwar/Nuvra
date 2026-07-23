import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  AI_OUTPUT_TOKEN_BUDGET,
  createOpenRouterGateway,
  DEFAULT_MODEL,
} from "./ai-gateway.server";

const ProfileSchema = z.object({
  identity: z.string().max(160),
  githubUrl: z.string().max(500),
  portfolioUrl: z.string().max(500),
  resumeText: z.string().max(15_000),
  targetRoles: z.array(z.string()).max(12),
});

const JobSchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  function: z.string(),
  seniority: z.string().nullable(),
  remote: z.boolean(),
  compensation: z.string(),
  scope: z.string(),
  stealth: z.boolean(),
});

const Input = z.object({
  profile: ProfileSchema,
  jobs: z.array(JobSchema).min(1).max(50),
});

export type ShortlistSignal = {
  jobId: string;
  score: number;
  label: "Strong signal" | "Worth a look" | "Stretch";
  reasons: string[];
};

export type ShortlistResult = {
  resumeSummary: string;
  signals: ShortlistSignal[];
  source: "ai" | "deterministic";
};

const ModelSignalSchema = z.object({
  jobId: z.string(),
  score: z.number(),
  label: z.enum(["Strong signal", "Worth a look", "Stretch"]),
  reasons: z.array(z.string()),
});

const ModelShortlistSchema = z.object({
  resumeSummary: z.string().min(20).max(420),
  signals: z.array(ModelSignalSchema),
});

function completeSummary(summary: string) {
  const clean = summary.replace(/\s+/g, " ").trim();
  if (clean.length <= 360) return clean;
  const cutoff = clean.slice(0, 360);
  const lastSentence = Math.max(cutoff.lastIndexOf(". "), cutoff.lastIndexOf("! "));
  const safeCutoff =
    lastSentence > 80
      ? cutoff.slice(0, lastSentence + 1)
      : cutoff.slice(0, cutoff.lastIndexOf(" "));
  return `${safeCutoff.trim()}...`;
}

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "been",
  "being",
  "build",
  "builder",
  "can",
  "company",
  "could",
  "developer",
  "engineer",
  "experience",
  "for",
  "from",
  "full",
  "have",
  "into",
  "job",
  "just",
  "more",
  "need",
  "not",
  "our",
  "role",
  "that",
  "the",
  "their",
  "this",
  "through",
  "use",
  "with",
  "you",
]);

const ROLE_KEYWORDS: Record<string, string[]> = {
  "AI Engineer": ["ai", "llm", "agent", "rag", "python", "model", "inference"],
  FDE: ["integration", "api", "customer", "deployment", "solution", "fullstack"],
  "Full Stack": ["react", "typescript", "node", "frontend", "backend", "fullstack"],
  Frontend: ["react", "typescript", "frontend", "ui", "design", "css"],
  Backend: ["backend", "api", "python", "node", "database", "distributed"],
  Web3: ["web3", "blockchain", "solidity", "defi", "crypto", "onchain"],
  DevRel: ["developer", "docs", "community", "sdk", "tutorial", "content"],
  "Product Engineer": ["product", "fullstack", "prototype", "customer", "react"],
};

function tokens(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9+#.]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 3 && !STOP_WORDS.has(word)),
  );
}

function matchedTerms(source: Set<string>, candidates: string[]) {
  return candidates.filter((candidate) => source.has(candidate.toLowerCase()));
}

function labelFor(score: number): ShortlistSignal["label"] {
  return score >= 70 ? "Strong signal" : score >= 45 ? "Worth a look" : "Stretch";
}

function normalizeScore(score: number) {
  // This score only orders live roles for review. It is not an application-readiness score.
  return Math.max(0, Math.min(85, Math.round(score)));
}

function rankDeterministically(data: z.infer<typeof Input>): ShortlistSignal[] {
  const builderText = [
    data.profile.identity,
    data.profile.githubUrl,
    data.profile.portfolioUrl,
    data.profile.resumeText,
  ].join(" ");
  const builderTerms = tokens(builderText);

  return data.jobs
    .map((job) => {
      const jobTerms = tokens(
        [job.title, job.function, job.seniority || "", job.location].join(" "),
      );
      const sharedTerms = [...jobTerms].filter((term) => builderTerms.has(term));
      const titleOverlap = Math.min(28, sharedTerms.length * 7);
      const selectedKeywords = data.profile.targetRoles.flatMap(
        (role) => ROLE_KEYWORDS[role] || [],
      );
      const builderRoleTerms = matchedTerms(builderTerms, selectedKeywords);
      const jobRoleTerms = matchedTerms(jobTerms, selectedKeywords);
      // A selected track is useful for finding roles, but never counts as candidate evidence.
      const roleScore = Math.min(30, Math.min(builderRoleTerms.length, jobRoleTerms.length) * 8);
      const shippingScore =
        matchedTerms(builderTerms, [
          "shipped",
          "deployed",
          "production",
          "github",
          "portfolio",
          "demo",
          "hackathon",
        ]).length * 4;
      const score = Math.max(
        5,
        Math.min(85, 12 + titleOverlap + roleScore + shippingScore + (job.remote ? 5 : 0)),
      );

      return {
        jobId: job.id,
        score,
        label: labelFor(score),
        reasons: [
          data.profile.targetRoles.some((role) =>
            (ROLE_KEYWORDS[role] || []).some((term) => jobTerms.has(term)),
          )
            ? `Target track aligns with ${job.function}`
            : `Live ${job.function.toLowerCase()} opening`,
          sharedTerms.length
            ? `Profile overlap: ${sharedTerms.slice(0, 3).join(", ")}`
            : "Open the role for a deeper evidence review",
          job.remote ? "Remote-open role" : `Location: ${job.location}`,
        ],
      };
    })
    .sort((a, b) => b.score - a.score);
}

export const shortlistJobs = createServerFn({ method: "POST" })
  .validator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<ShortlistResult> => {
    const fallback = rankDeterministically(data);
    const fallbackResult: ShortlistResult = {
      resumeSummary: "Live roles are ranked from your resume text and selected tracks.",
      signals: fallback,
      source: "deterministic",
    };

    try {
      const gateway = createOpenRouterGateway();
      const model = gateway(DEFAULT_MODEL);
      const candidates = data.jobs.map((job) => ({
        id: job.id,
        title: job.title,
        company: job.stealth ? "Stealth" : job.company,
        function: job.function,
        seniority: job.seniority,
        location: job.location,
        remote: job.remote,
        scope: job.scope,
      }));

      const { output } = await generateText({
        model,
        output: Output.object({ schema: ModelShortlistSchema }),
        maxOutputTokens: AI_OUTPUT_TOKEN_BUDGET.shortlist,
        system: [
          "You are Nuvra's resume-to-role matching agent.",
          "First read the resume and extract only evidenced skills, domains, seniority signals, and shipped work.",
          "Then rank the supplied live Speedrun roles for practical fit.",
          "Never invent experience, credentials, employers, metrics, or role requirements.",
          "Do not treat a role title, target track, or job requirement as proof of candidate experience.",
          "A strong signal requires clear resume evidence; otherwise prefer Worth a look or Stretch.",
        ].join(" "),
        prompt: `BUILDER PROFILE\nIdentity: ${data.profile.identity || "(not provided)"}\nSelected tracks: ${data.profile.targetRoles.join(", ") || "(none)"}\nGitHub: ${data.profile.githubUrl || "(none)"}\nPortfolio: ${data.profile.portfolioUrl || "(none)"}\nResume:\n${data.profile.resumeText.slice(0, 7000) || "(empty)"}\n\nLIVE SPEEDRUN ROLES (rank only these exact job IDs):\n${JSON.stringify(candidates)}`,
      });

      const knownIds = new Set(data.jobs.map((job) => job.id));
      const aiSignals = new Map(
        output.signals
          .filter((signal) => knownIds.has(signal.jobId))
          .map((signal) => [signal.jobId, signal]),
      );
      const signals = fallback
        .map((signal) => {
          const aiSignal = aiSignals.get(signal.jobId);
          return aiSignal
            ? {
                ...aiSignal,
                score: normalizeScore(aiSignal.score),
                reasons: aiSignal.reasons.slice(0, 3),
              }
            : signal;
        })
        .sort((a, b) => b.score - a.score);

      return { resumeSummary: completeSummary(output.resumeSummary), signals, source: "ai" };
    } catch (error) {
      console.warn("AI ranking unavailable; using deterministic profile ranking.", error);
      return fallbackResult;
    }
  });
