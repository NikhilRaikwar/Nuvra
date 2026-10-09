import { createServerFn } from "@tanstack/react-start";
import { generateText, isStepCount } from "ai";
import { z } from "zod";
import {
  AI_OUTPUT_TOKEN_BUDGET,
  createOpenRouterGateway,
  DEFAULT_MODEL,
} from "./ai-gateway.server";
import { calculateEvidenceFit, TARGET_ROLE_TRACKS, type StableEvidenceFit } from "./evidence-fit";
import { loadProfileEvidence, type AgentProfile } from "./profile-evidence.server";
import { createRecruiterTools } from "./recruiter-tools";
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

export type AgentTraceStep = {
  tool: string;
  argsSummary: string;
  resultSummary: string;
};

export type RoleVerdict = {
  jobId: string;
  verdict: "Strong" | "Worth a look" | "Stretch" | "Skip" | string;
  reason: string;
};

export type RecruiterResult = {
  jobs: Job[];
  signals: ShortlistSignal[];
  summary: string;
  source: "ai" | "deterministic";
  profileSources: Awaited<ReturnType<typeof loadProfileEvidence>>["sources"];
  searchPlan: {
    queries: string[];
    candidatesFound: number;
    descriptionsRead: number;
    scope: "portfolio" | "everywhere";
    remoteOnly: boolean;
  };
  agentTrace?: AgentTraceStep[];
  verdicts?: RoleVerdict[];
};

type Candidate = {
  job: Job;
  queriedTracks: string[];
  fit: StableEvidenceFit;
};

function labelFor(score: number): ShortlistSignal["label"] {
  return score >= 70 ? "Strong signal" : score >= 45 ? "Worth a look" : "Stretch";
}

function publicJob(job: Job): Job {
  return { ...job, descriptionText: undefined };
}

function completeSummary(summary: string) {
  const clean = summary.replace(/\s+/g, " ").trim();
  if (clean.length <= 360) return clean;
  const cutoff = clean.slice(0, 360);
  const lastSentence = Math.max(cutoff.lastIndexOf(". "), cutoff.lastIndexOf("! "));
  return `${(lastSentence > 80 ? cutoff.slice(0, lastSentence + 1) : cutoff).trim()}...`;
}

function directSignal(candidate: Candidate): ShortlistSignal {
  const { fit } = candidate;
  return {
    jobId: candidate.job.id,
    score: fit.score,
    label: labelFor(fit.score),
    profileEvidence: fit.profileEvidence,
    roleEvidence: fit.roleEvidence,
    reasons: [
      `Selected track: ${fit.matchedTracks.join(", ")}`,
      fit.sharedTerms.length
        ? `Verified overlap: ${fit.sharedTerms.slice(0, 3).join(", ")}`
        : "No direct technical overlap was found",
      fit.seniorityGap
        ? "Seniority evidence gap - build proof before applying"
        : "Open the evidence report before applying",
    ],
  };
}

function buildSearchPlan(profile: AgentProfile) {
  return [...new Set(profile.targetRoles)]
    .map((role) => {
      const track = TARGET_ROLE_TRACKS[role];
      return track ? { role, query: track.query } : null;
    })
    .filter((entry): entry is { role: string; query: string } => Boolean(entry));
}

async function loadDetails(candidates: Candidate[]) {
  const details = new Map<string, Job>();
  for (let index = 0; index < candidates.length; index += 3) {
    const batch = candidates.slice(index, index + 3);
    const loaded = await Promise.all(
      batch.map(async ({ job }) => {
        try {
          return [job.id, await loadSpeedrunJob(job.id)] as const;
        } catch {
          // The board can briefly list an item whose detail has already been removed.
          // Do not shortlist a role that cannot be verified from its canonical detail endpoint.
          return null;
        }
      }),
    );
    for (const result of loaded) {
      if (result) details.set(result[0], result[1]);
    }
  }
  return details;
}

function deterministicSummary(candidates: Candidate[], targetRoles: string[]) {
  if (!candidates.length) {
    return `No verified live roles reached Nuvra's minimum evidence threshold for: ${targetRoles.join(
      ", ",
    )}. Add stronger proof, choose another selected track, or scan again after the board refreshes.`;
  }
  return `Shortlisted ${candidates.length} live Speedrun role${candidates.length === 1 ? "" : "s"} only from the selected tracks. Scores use saved profile evidence and the current job description; they do not change when a draft is generated.`;
}

function parseRoleVerdicts(text: string, shortlisted: Candidate[]): RoleVerdict[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return shortlisted.map((candidate) => {
    const id = candidate.job.id;
    const titleNorm = candidate.job.title.toLowerCase();
    const companyNorm = candidate.job.company.toLowerCase();

    const relevantLine = lines.find((line) => {
      const lower = line.toLowerCase();
      return (
        lower.includes(id.toLowerCase()) ||
        lower.includes(titleNorm) ||
        (!candidate.job.stealth && lower.includes(companyNorm))
      );
    });

    let verdict: RoleVerdict["verdict"] =
      candidate.fit.verdict === "Apply Now"
        ? "Strong"
        : candidate.fit.verdict === "Build Proof First"
          ? "Worth a look"
          : "Skip";
    let reason =
      candidate.fit.profileEvidence && candidate.fit.roleEvidence
        ? `Candidate fact: "${candidate.fit.profileEvidence}". Role fact: "${candidate.fit.roleEvidence}".`
        : `Verified track match: ${candidate.fit.matchedTracks.join(", ")}.`;

    if (relevantLine) {
      if (/\b(strong|top fit|apply now)\b/i.test(relevantLine)) {
        verdict = "Strong";
      } else if (/\b(worth a look|good fit|promising)\b/i.test(relevantLine)) {
        verdict = "Worth a look";
      } else if (/\b(stretch|reach)\b/i.test(relevantLine)) {
        verdict = "Stretch";
      } else if (/\b(skip|pass|mismatch)\b/i.test(relevantLine)) {
        verdict = "Skip";
      }
      reason = relevantLine.replace(/^[-*•0-9.)\s]+/, "").trim();
    }

    return {
      jobId: id,
      verdict,
      reason,
    };
  });
}

export const recruitLiveRoles = createServerFn({ method: "POST" })
  .validator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<RecruiterResult> => {
    const scope = data.preferences.scope || "portfolio";
    const remoteOnly = Boolean(data.preferences.remote);
    const plan = buildSearchPlan(data.profile);
    if (!plan.length) {
      throw new Error("Select at least one supported target role before starting the scan.");
    }

    const evidence = await loadProfileEvidence(data.profile);
    const searchAttempts = await Promise.allSettled(
      plan.map(({ query }) =>
        searchSpeedrunJobs({
          q: query,
          scope,
          remote: remoteOnly || undefined,
          sort: "rel",
          page: 0,
        }),
      ),
    );
    const candidatesById = new Map<string, { job: Job; queriedTracks: Set<string> }>();
    searchAttempts.forEach((attempt, index) => {
      if (attempt.status !== "fulfilled") return;
      for (const job of attempt.value.jobs) {
        const existing = candidatesById.get(job.id);
        if (existing) {
          existing.queriedTracks.add(plan[index].role);
        } else {
          candidatesById.set(job.id, { job, queriedTracks: new Set([plan[index].role]) });
        }
      }
    });

    if (!candidatesById.size) {
      throw new Error(
        "Speedrun did not return a live response for the selected role tracks. Please try again.",
      );
    }

    // The first pass only decides which current Speedrun roles deserve a description fetch.
    const initialCandidates: Candidate[] = [...candidatesById.values()]
      .map(({ job, queriedTracks }) => ({
        job,
        queriedTracks: [...queriedTracks],
        fit: calculateEvidenceFit({ profile: data.profile, facts: evidence.facts, job }),
      }))
      .sort((a, b) => b.fit.score - a.fit.score)
      .slice(0, 12);
    const details = await loadDetails(initialCandidates);

    // A role must still match a selected track after its live description is read.
    const shortlisted = initialCandidates
      .map((candidate) => {
        const job = details.get(candidate.job.id);
        return job
          ? {
              ...candidate,
              job,
              fit: calculateEvidenceFit({ profile: data.profile, facts: evidence.facts, job }),
            }
          : null;
      })
      .filter((candidate): candidate is Candidate => Boolean(candidate))
      .filter((candidate) => candidate.fit.matchedTracks.length > 0)
      .filter((candidate) => candidate.fit.verdict !== "Skip")
      .sort((a, b) => b.fit.score - a.fit.score)
      .slice(0, 8);
    const signals = shortlisted.map(directSignal);
    const searchPlan = {
      queries: plan.map(({ role, query }) => `${role}: ${query}`),
      candidatesFound: candidatesById.size,
      descriptionsRead: [...details.values()].filter((job) => Boolean(job.descriptionText)).length,
      scope,
      remoteOnly,
    } as const;

    const baseResult = {
      jobs: shortlisted.map((candidate) => publicJob(candidate.job)),
      signals,
      profileSources: evidence.sources,
      searchPlan,
    };

    try {
      const gateway = createOpenRouterGateway();
      const model = gateway(DEFAULT_MODEL);
      const tools = createRecruiterTools({
        profile: data.profile,
        facts: evidence.facts,
      });

      const { text, steps } = await generateText({
        model,
        tools,
        stopWhen: isStepCount(8),
        maxOutputTokens: AI_OUTPUT_TOKEN_BUDGET.fitReport,
        system: [
          "You are Nuvra's recruiter agent. Verify the shortlisted roles with tools before judging.",
          "For each role: confirm the description supports the fit (getRoleDetails), cross-check claimed skills against GitHub evidence (getGitHubEvidence).",
          "Output: verdict per role (Strong/Worth a look/Stretch/Skip) with one evidence-backed reason each.",
          "Rules: never invent experience. Every reason cites a candidate fact AND a role fact. Be direct about seniority gaps.",
        ].join(" "),
        prompt: `Profile facts:\n${evidence.facts
          .map((fact) => `- ${fact}`)
          .join("\n")}\n\nShortlisted roles:\n${JSON.stringify(
          shortlisted.map((c) => ({
            id: c.job.id,
            title: c.job.title,
            company: c.job.stealth ? "Stealth" : c.job.company,
            evidenceScore: c.fit.score,
          })),
        )}`,
      });

      const agentTrace: AgentTraceStep[] = steps.flatMap((step) =>
        (step.toolCalls || []).map((toolCall) => {
          const matchResult = step.toolResults?.find((tr) => tr.toolCallId === toolCall.toolCallId);
          const rawResult = matchResult ? matchResult.output : "";
          const resultStr =
            typeof rawResult === "string" ? rawResult : JSON.stringify(rawResult ?? "");
          return {
            tool: toolCall.toolName,
            argsSummary: JSON.stringify(toolCall.input || {}).slice(0, 160),
            resultSummary: resultStr.slice(0, 200),
          };
        }),
      );

      const verdicts = parseRoleVerdicts(text, shortlisted);

      return {
        ...baseResult,
        summary: completeSummary(text),
        source: "ai",
        agentTrace,
        verdicts,
      };
    } catch (error) {
      console.warn("Recruiter agent unavailable; keeping deterministic live shortlist.", error);
      return {
        ...baseResult,
        summary: deterministicSummary(shortlisted, data.profile.targetRoles),
        source: "deterministic",
        agentTrace: [],
        verdicts: shortlisted.map((c) => ({
          jobId: c.job.id,
          verdict:
            c.fit.verdict === "Apply Now"
              ? "Strong"
              : c.fit.verdict === "Build Proof First"
                ? "Worth a look"
                : "Skip",
          reason:
            c.fit.profileEvidence && c.fit.roleEvidence
              ? `Candidate fact: "${c.fit.profileEvidence}". Role fact: "${c.fit.roleEvidence}".`
              : "Deterministic fit from verified track match and skill overlap.",
        })),
      };
    }
  });
