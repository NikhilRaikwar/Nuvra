import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createOpenRouterGateway, DEFAULT_MODEL } from "./ai-gateway.server";
import { calculateEvidenceFit, TARGET_ROLE_TRACKS, type StableEvidenceFit } from "./evidence-fit";
import { loadProfileEvidence, type AgentProfile } from "./profile-evidence.server";
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

const RecruiterSummarySchema = z.object({
  summary: z.string().min(20).max(420),
});

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
      const { output } = await generateText({
        model,
        output: Output.object({ schema: RecruiterSummarySchema }),
        maxOutputTokens: 180,
        system: [
          "You are Nuvra's technical recruiter. Summarize an already-ranked live shortlist.",
          "Do not change the ranking, score, verdict, or claim unprovided experience.",
          "Be direct about seniority and domain gaps. Keep the summary under 70 words.",
        ].join(" "),
        prompt: `Selected tracks: ${data.profile.targetRoles.join(", ")}\n\nProfile evidence facts:\n${evidence.facts
          .map((fact) => `- ${fact}`)
          .join("\n")}\n\nAlready-ranked live Speedrun roles:\n${JSON.stringify(
          shortlisted.map(({ job, fit }) => ({
            title: job.title,
            company: job.stealth ? "Stealth" : job.company,
            evidenceScore: fit.score,
            sharedTerms: fit.sharedTerms,
            seniorityGap: fit.seniorityGap,
          })),
        )}`,
      });
      return { ...baseResult, summary: completeSummary(output.summary), source: "ai" };
    } catch (error) {
      console.warn("Recruiter summary unavailable; keeping deterministic live shortlist.", error);
      return {
        ...baseResult,
        summary: deterministicSummary(shortlisted, data.profile.targetRoles),
        source: "deterministic",
      };
    }
  });
