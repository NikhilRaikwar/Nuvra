import { createServerFn } from "@tanstack/react-start";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import {
  AI_OUTPUT_TOKEN_BUDGET,
  createOpenRouterGateway,
  DEFAULT_MODEL,
} from "./ai-gateway.server";
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

export const scoreRole = createServerFn({ method: "POST" })
  .validator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<FitReport> => {
    const job = await loadSpeedrunJob(data.jobId);
    if (job.status === "closed") {
      throw new Error("This role is no longer open on Speedrun.");
    }

    const gateway = createOpenRouterGateway();
    const model = gateway(DEFAULT_MODEL);

    const system = [
      "You are Nuvra, a startup-fit evaluator for high-agency builders.",
      "You are ruthless, specific, and grounded. Never invent projects, employers, or metrics not present in the profile.",
      "Never use a role requirement as proof of candidate experience. Every item in 'Why you match' must come from an explicit profile fact.",
      "If the profile is thin, say so plainly and reflect it in the score.",
      "The fit score measures demonstrated evidence, not potential. Do not award 90 or above without direct evidence of the required seniority and domain.",
      "Verdicts: 'Apply Now' >= 75 fit and no blocking gaps. 'Build Proof First' 45-74 with a shippable gap. 'Skip' < 45 or wrong domain.",
      "Stealth roles: evaluate on the role description only, never guess the company.",
    ].join(" ");

    const prompt = `ROLE
Company: ${job.stealth ? "Stealth" : job.company}
Title: ${job.title}
Location: ${job.location}
Comp: ${job.compensation}
Function: ${job.function}
Workplace: ${job.workplaceType || "Not listed"}
Seniority: ${job.seniority || "Not listed"}
Live job description (may be blank when the source does not publish it):
${job.descriptionText?.slice(0, 12_000) || "(not published by the source)"}

BUILDER
Identity: ${data.profile.identity || "(not provided)"}
GitHub: ${data.profile.githubUrl || "(none)"}
Portfolio: ${data.profile.portfolioUrl || "(none)"}
Target roles: ${data.profile.targetRoles.join(", ") || "(none)"}
Resume:
${data.profile.resumeText.slice(0, 6000) || "(empty)"}

Return a compact fit report. Keep each bullet under 14 words. Max 4 items per list.`;

    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: FitSchema }),
        maxOutputTokens: AI_OUTPUT_TOKEN_BUDGET.fitReport,
        system,
        prompt,
      });
      return {
        ...output,
        fitScore: Math.max(0, Math.min(100, Math.round(output.fitScore))),
      };
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        throw new Error("The model returned an invalid fit report. Please try again.");
      }
      throw error;
    }
  });
