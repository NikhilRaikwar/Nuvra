import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AGENT_SERVICE_URL = (process.env.AGENT_SERVICE_URL || "http://localhost:8000").replace(
  /\/$/,
  "",
);

const OpportunitySchema = z.object({
  url: z.string().url().optional().or(z.literal("")),
  text: z.string().max(50_000).default(""),
  speedrunJobId: z.string().max(200).optional(),
});

const ProfileSchema = z.object({
  identity: z.string().max(500),
  githubUrl: z.string().max(500),
  portfolioUrl: z.string().max(500),
  resumeText: z.string().max(50_000),
  targetRoles: z.array(z.string()).max(20),
});

const CreateRunInput = z.object({
  opportunity: OpportunitySchema,
  profile: ProfileSchema,
});

const RunIdInput = z.object({ runId: z.string().uuid() });

export type ProofRunStatus =
  "queued" | "running" | "completed" | "failed" | "partial" | "cancelled";

export type ProofTraceEvent = {
  event_id: string;
  node: string;
  actor: string;
  action: string;
  status: string;
  tool?: string | null;
  input_summary?: string | null;
  output_summary?: string | null;
  timestamp: string;
};

export type ProofRunSnapshot = {
  runId: string;
  status: ProofRunStatus;
  currentStage: string;
  requirements: Array<{ id: string; label: string; type: string; priority: string }>;
  researchPlan: Array<{ id: string; question: string; priority: string; searchTerms: string[] }>;
  sourcesInspected: Array<{
    id: string;
    source_type: string;
    source_url?: string;
    summary: string;
    status: string;
  }>;
  evidenceNodes: Array<{
    id: string;
    claim: string;
    evidence_type: string;
    final_strength: number;
    excerpt: string;
  }>;
  verifiedClaims: Array<{ id: string; claim: string; verdict: string; safe_wording: string }>;
  conflicts: Array<{ id: string; summary: string; severity: string }>;
  gaps: Array<{
    requirement_id: string;
    status: string;
    missing_observables: string[];
    why_it_matters: string;
  }>;
  proofCandidates: Array<{ id: string; title: string; proof_value: number; summary: string }>;
  criticHistory: Array<{
    verdict: string;
    weaknesses: string[];
    required_changes: string[];
    score: number;
  }>;
  proofPacket: null | {
    gap: string;
    proof_objective: string;
    existing_evidence: string[];
    missing_observable_evidence: string[];
    build_specification: string[];
    acceptance_tests: string[];
    demo_scenario: string[];
    reviewer_inspection_checklist: string[];
    readme_draft: string;
    resume_bullet_draft: string;
    launch_post_draft: string;
  };
  toolBudget: Record<string, number>;
  failures: Array<{ stage: string; message: string; recoverable: boolean }>;
  traceEvents: ProofTraceEvent[];
};

async function agentRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${AGENT_SERVICE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.detail || `Agent service request failed (${response.status}).`);
  }
  return payload as T;
}

export const createProofRun = createServerFn({ method: "POST" })
  .validator((input: unknown) => CreateRunInput.parse(input))
  .handler(async ({ data }) => {
    return agentRequest<{ runId: string; status: ProofRunStatus }>("/v1/runs", {
      method: "POST",
      body: JSON.stringify({
        opportunity: {
          ...data.opportunity,
          url: data.opportunity.url || null,
        },
        profile: data.profile,
      }),
    });
  });

export const getProofRun = createServerFn({ method: "GET" })
  .validator((input: unknown) => RunIdInput.parse(input))
  .handler(async ({ data }) => {
    return agentRequest<ProofRunSnapshot>(`/v1/runs/${encodeURIComponent(data.runId)}`);
  });
