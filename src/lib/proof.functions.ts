import { createServerFn } from "@tanstack/react-start";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import {
  AI_OUTPUT_TOKEN_BUDGET,
  createOpenRouterGateway,
  DEFAULT_MODEL,
} from "./ai-gateway.server";
import { loadSpeedrunJob } from "./speedrun.functions";

const Input = z.object({
  jobId: z.string(),
  profile: z.object({
    identity: z.string(),
    githubUrl: z.string(),
    portfolioUrl: z.string(),
    resumeText: z.string(),
    targetRoles: z.array(z.string()),
  }),
  gaps: z.array(z.string()).default([]),
});

const ProofSchema = z.object({
  name: z.string(),
  tagline: z.string(),
  problem: z.string(),
  user: z.string(),
  features: z.array(z.string()),
  techStack: z.array(z.string()),
  demoFlow: z.array(z.string()),
  readmePitch: z.string(),
  resumeBullet: z.string(),
  launchTweet: z.string(),
  buildTime: z.string(),
});

export type ProofProject = z.infer<typeof ProofSchema>;

export const generateProof = createServerFn({ method: "POST" })
  .validator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<ProofProject> => {
    const job = await loadSpeedrunJob(data.jobId);
    if (job.status === "closed") {
      throw new Error("This role is no longer open on Speedrun.");
    }

    const gateway = createOpenRouterGateway();
    const model = gateway(DEFAULT_MODEL);

    const system =
      "You are Nuvra, generating a shippable weekend project that maps directly to a startup role. Concrete, minimal, and unmistakably credible. Never invent existing repos or credentials.";

    const prompt = `ROLE: ${job.title} @ ${job.stealth ? "Stealth" : job.company}
Function: ${job.function}
Workplace: ${job.workplaceType || "Not listed"}
Live job description:
${job.descriptionText?.slice(0, 12_000) || "(not published by the source)"}

BUILDER RESUME:
${data.profile.resumeText.slice(0, 4000) || "(empty)"}

GAPS TO CLOSE:
${data.gaps.map((g) => "- " + g).join("\n") || "- none flagged"}

Design ONE shippable project (3-5 days max) that closes those gaps and makes this builder unmistakably credible for the role. Be specific — real feature list, real demo flow, one-line resume bullet, one launch tweet.`;

    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: ProofSchema }),
        maxOutputTokens: AI_OUTPUT_TOKEN_BUDGET.proofProject,
        system,
        prompt,
      });
      return output;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        throw new Error("Could not generate proof project. Try again.");
      }
      throw error;
    }
  });
