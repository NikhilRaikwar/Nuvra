import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  AI_OUTPUT_TOKEN_BUDGET,
  createOpenRouterGateway,
  DEFAULT_MODEL,
} from "./ai-gateway.server";
import type { ShortlistSignal } from "./shortlist.functions";
import { loadSpeedrunJob, searchSpeedrunJobs, type Job } from "./speedrun.functions";

const ProfileSchema = z.object({
  identity: z.string().max(160),
  githubUrl: z.string().max(500),
  portfolioUrl: z.string().max(500),
  resumeText: z.string().max(15_000),
  targetRoles: z.array(z.string()).max(12),
});

const Input = z.object({
  profile: ProfileSchema,
  preferences: z
    .object({
      remote: z.boolean().optional(),
      scope: z.enum(["portfolio", "everywhere"]).optional(),
    })
    .default({}),
});

const ModelSignalSchema = z.object({
  jobId: z.string(),
  score: z.number(),
  label: z.enum(["Strong signal", "Worth a look", "Stretch"]),
  profileEvidence: z.string().min(3).max(180),
  roleEvidence: z.string().min(3).max(180),
  reasons: z.array(z.string().min(3).max(140)).min(1).max(3),
});

const RecruiterOutputSchema = z.object({
  summary: z.string().min(20).max(420),
  signals: z.array(ModelSignalSchema).min(1).max(8),
});

export type RecruiterResult = {
  jobs: Job[];
  signals: ShortlistSignal[];
  summary: string;
  source: "ai" | "deterministic";
  searchPlan: {
    queries: string[];
    candidatesFound: number;
    descriptionsRead: number;
    scope: "portfolio" | "everywhere";
    remoteOnly: boolean;
  };
};

const TARGET_QUERIES: Record<string, string[]> = {
  "AI Engineer": ["agent", "AI engineer"],
  FDE: ["forward deployed engineer", "integration engineer"],
  "Full Stack": ["full stack", "product engineer"],
  Frontend: ["frontend", "react"],
  Backend: ["backend", "platform engineer"],
  Web3: ["blockchain", "solidity"],
  DevRel: ["developer relations", "developer advocate"],
  "Product Engineer": ["product engineer", "full stack"],
};

const RESUME_SIGNALS = [
  { query: "agent", terms: ["agent", "llm", "rag", "openai", "anthropic", "inference"] },
  { query: "blockchain", terms: ["solidity", "defi", "onchain", "blockchain", "web3", "crypto"] },
  { query: "full stack", terms: ["typescript", "react", "next", "node", "full stack", "frontend"] },
  {
    query: "integration engineer",
    terms: ["api", "integration", "customer", "deployment", "workflow"],
  },
];

const MATCHABLE_TERMS = [
  "agent",
  "ai",
  "llm",
  "python",
  "rag",
  "integration",
  "api",
  "full stack",
  "typescript",
  "react",
  "node",
  "backend",
  "web3",
  "blockchain",
  "solidity",
  "defi",
  "crypto",
  "developer",
  "community",
  "product",
];

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasSeniorEvidence(profile: z.infer<typeof ProfileSchema>) {
  const evidence = normalize([profile.identity, profile.resumeText].join(" "));
  return (
    /\b\d{1,2}\+?\s*(years?|yrs?)\b/.test(evidence) ||
    /\b(senior|staff|principal|lead engineer|engineering lead|manager|director)\b/.test(evidence)
  );
}

function isSeniorRole(job: Job) {
  return /\b(senior|staff|principal|lead|manager|director|exec|founding)\b/i.test(
    job.seniority || "",
  );
}

function buildSearchPlan(profile: z.infer<typeof ProfileSchema>) {
  const profileText = normalize([profile.identity, profile.resumeText].join(" "));
  const primaryTrackQueries = profile.targetRoles
    .map((role) => TARGET_QUERIES[role]?.[0])
    .filter((query): query is string => Boolean(query));
  const secondaryTrackQueries = profile.targetRoles.flatMap((role) =>
    (TARGET_QUERIES[role] || []).slice(1),
  );
  const resumeQueries = RESUME_SIGNALS.filter(({ terms }) =>
    terms.some((term) => profileText.includes(term)),
  ).map(({ query }) => query);
  return [...new Set([...primaryTrackQueries, ...resumeQueries, ...secondaryTrackQueries])].slice(
    0,
    6,
  );
}

function prefilter(profile: z.infer<typeof ProfileSchema>, job: Job) {
  const profileText = normalize([profile.identity, profile.resumeText].join(" "));
  const roleText = normalize([job.title, job.function, job.seniority || "", job.scope].join(" "));
  const matched = MATCHABLE_TERMS.filter(
    (term) => profileText.includes(term) && roleText.includes(term),
  );
  const targetHit = profile.targetRoles.some((role) =>
    (TARGET_QUERIES[role] || []).some((query) => roleText.includes(query)),
  );
  const seniorPenalty = isSeniorRole(job) && !hasSeniorEvidence(profile) ? 18 : 0;
  return {
    job,
    matched,
    score: Math.max(
      0,
      matched.length * 14 + (targetHit ? 9 : 0) + (job.remote ? 2 : 0) - seniorPenalty,
    ),
  };
}

async function loadDetails(jobs: Job[]) {
  const details: Job[] = [];
  for (let index = 0; index < jobs.length; index += 3) {
    const batch = jobs.slice(index, index + 3);
    const results = await Promise.all(batch.map((job) => loadSpeedrunJob(job.id).catch(() => job)));
    details.push(...results);
  }
  return details;
}

function labelFor(score: number): ShortlistSignal["label"] {
  return score >= 70 ? "Strong signal" : score >= 45 ? "Worth a look" : "Stretch";
}

function directSignal(
  candidate: ReturnType<typeof prefilter>,
  profile: z.infer<typeof ProfileSchema>,
): ShortlistSignal {
  const profileEvidence =
    candidate.matched.slice(0, 3).join(", ") || "No direct skill overlap found";
  const score = Math.min(64, Math.max(20, Math.round(24 + candidate.score)));
  return {
    jobId: candidate.job.id,
    score,
    label: labelFor(score),
    reasons: [
      `Resume overlap: ${profileEvidence}`,
      `Live role: ${candidate.job.title}`,
      isSeniorRole(candidate.job) && !hasSeniorEvidence(profile)
        ? "Senior evidence gap - build proof before applying"
        : "Open the evidence report before applying",
    ],
  };
}

function publicJob(job: Job): Job {
  return { ...job, descriptionText: undefined };
}

function evidenceIsGrounded(value: string, source: string) {
  const quote = normalize(value);
  return quote.length >= 3 && normalize(source).includes(quote);
}

function completeSummary(summary: string) {
  const clean = summary.replace(/\s+/g, " ").trim();
  if (clean.length <= 360) return clean;
  const cutoff = clean.slice(0, 360);
  const lastSentence = Math.max(cutoff.lastIndexOf(". "), cutoff.lastIndexOf("! "));
  return `${(lastSentence > 80 ? cutoff.slice(0, lastSentence + 1) : cutoff).trim()}...`;
}

export const recruitLiveRoles = createServerFn({ method: "POST" })
  .validator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<RecruiterResult> => {
    const scope = data.preferences.scope || "portfolio";
    const remoteOnly = Boolean(data.preferences.remote);
    const queries = buildSearchPlan(data.profile);
    if (!queries.length) {
      throw new Error(
        "Add a fuller resume or select at least one target role before starting the scan.",
      );
    }

    const searchAttempts = await Promise.allSettled(
      queries.map((q) =>
        searchSpeedrunJobs({ q, scope, remote: remoteOnly || undefined, sort: "rel", page: 0 }),
      ),
    );
    const searches = searchAttempts
      .filter(
        (
          attempt,
        ): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof searchSpeedrunJobs>>> =>
          attempt.status === "fulfilled",
      )
      .map((attempt) => attempt.value);
    if (!searches.length) {
      throw new Error("Speedrun did not return a live search response. Please try the scan again.");
    }
    const candidates = new Map<string, Job>();
    for (const search of searches) {
      for (const job of search.jobs) candidates.set(job.id, job);
    }

    if (candidates.size < 12) {
      const fallback = await searchSpeedrunJobs({
        scope,
        remote: remoteOnly || undefined,
        sort: "new",
        page: 0,
      });
      for (const job of fallback.jobs) candidates.set(job.id, job);
    }

    const prefiltered = [...candidates.values()]
      .map((job) => prefilter(data.profile, job))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
    const detailedJobs = await loadDetails(prefiltered.map((candidate) => candidate.job));
    const detailedById = new Map(detailedJobs.map((job) => [job.id, job]));
    const detailedCandidates = prefiltered.map((candidate) => ({
      ...candidate,
      job: detailedById.get(candidate.job.id) || candidate.job,
    }));
    const fallbackSignals = detailedCandidates
      .slice(0, 8)
      .map((candidate) => directSignal(candidate, data.profile));
    const searchPlan = {
      queries,
      candidatesFound: candidates.size,
      descriptionsRead: detailedCandidates.filter((candidate) =>
        Boolean(candidate.job.descriptionText),
      ).length,
      scope,
      remoteOnly,
    } as const;

    try {
      const gateway = createOpenRouterGateway();
      const model = gateway(DEFAULT_MODEL);
      const candidatesForModel = detailedCandidates.map(({ job }) => ({
        id: job.id,
        title: job.title,
        company: job.stealth ? "Stealth" : job.company,
        function: job.function,
        seniority: job.seniority,
        location: job.location,
        remote: job.remote,
        description: job.descriptionText?.slice(0, 2_800) || "Description not published by source",
      }));
      const { output } = await generateText({
        model,
        output: Output.object({ schema: RecruiterOutputSchema }),
        maxOutputTokens: AI_OUTPUT_TOKEN_BUDGET.shortlist,
        system: [
          "You are Nuvra's senior technical recruiter. You search live roles, reject weak matches, and explain evidence plainly.",
          "Assess demonstrated evidence only. Target roles, job requirements, and potential never count as candidate experience.",
          "Every profileEvidence and roleEvidence value must be a short exact phrase copied from the provided profile or role respectively.",
          "Strong signal requires explicit profile evidence and a close role need. Senior roles require explicit tenure or leadership evidence.",
          "Do not return 100. Use 75-85 only for unusually direct evidence; use 45-74 for roles worth pursuing with a credible gap.",
          "Return fewer roles rather than padding the shortlist. Never guess hidden companies or missing job details.",
        ].join(" "),
        prompt: `BUILDER PROFILE\nIdentity: ${data.profile.identity || "(not provided)"}\nTarget roles: ${data.profile.targetRoles.join(", ") || "(none)"}\nGitHub: ${data.profile.githubUrl || "(none)"}\nPortfolio: ${data.profile.portfolioUrl || "(none)"}\nResume:\n${data.profile.resumeText.slice(0, 7_000) || "(empty)"}\n\nLIVE SPEEDRUN ROLES WITH CURRENT DESCRIPTIONS:\n${JSON.stringify(candidatesForModel)}`,
      });

      const knownCandidates = new Map(
        detailedCandidates.map((candidate) => [candidate.job.id, candidate]),
      );
      const signals = output.signals
        .filter((signal) => {
          const candidate = knownCandidates.get(signal.jobId);
          if (!candidate) return false;
          const profileSource = [data.profile.identity, data.profile.resumeText].join(" ");
          const roleSource = [candidate.job.title, candidate.job.descriptionText || ""].join(" ");
          return (
            evidenceIsGrounded(signal.profileEvidence, profileSource) &&
            evidenceIsGrounded(signal.roleEvidence, roleSource)
          );
        })
        .map((signal) => {
          const candidate = knownCandidates.get(signal.jobId)!;
          const seniorCap =
            isSeniorRole(candidate.job) && !hasSeniorEvidence(data.profile) ? 64 : 85;
          const score = Math.max(0, Math.min(seniorCap, Math.round(signal.score)));
          return {
            ...signal,
            score,
            label: labelFor(score),
            reasons: signal.reasons.slice(0, 3),
          } satisfies ShortlistSignal;
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);

      if (!signals.length) {
        return {
          jobs: detailedCandidates.slice(0, 8).map((candidate) => publicJob(candidate.job)),
          signals: fallbackSignals,
          summary:
            "The recruiter read the live roles but could not verify enough exact evidence quotes. Showing a conservative shortlist for manual evidence review.",
          source: "deterministic",
          searchPlan,
        };
      }

      const jobs = signals
        .map((signal) => knownCandidates.get(signal.jobId)?.job)
        .filter((job): job is Job => Boolean(job))
        .map(publicJob);
      return {
        jobs,
        signals,
        summary: completeSummary(output.summary),
        source: "ai",
        searchPlan,
      };
    } catch (error) {
      console.warn(
        "Recruiter agent unavailable; returning conservative live-role shortlist.",
        error,
      );
      return {
        jobs: detailedCandidates.slice(0, 8).map((candidate) => publicJob(candidate.job)),
        signals: fallbackSignals,
        summary:
          "Live roles were searched directly through Speedrun. The model was unavailable, so this shortlist uses conservative resume-term overlap only.",
        source: "deterministic",
        searchPlan,
      };
    }
  });
