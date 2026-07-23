import { createServerFn } from "@tanstack/react-start";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import {
  AI_OUTPUT_TOKEN_BUDGET,
  createOpenRouterGateway,
  DEFAULT_MODEL,
} from "./ai-gateway.server";
import { loadSpeedrunJob } from "./speedrun.functions";

const KindSchema = z.enum(["x_dm", "linkedin_dm", "email_note", "why_fit", "what_shipped"]);

const Input = z.object({
  jobId: z.string(),
  kind: KindSchema,
  profile: z.object({
    identity: z.string(),
    githubUrl: z.string(),
    portfolioUrl: z.string(),
    resumeText: z.string(),
    targetRoles: z.array(z.string()),
  }),
});

export type ApplicationDraft = {
  decision: "draft" | "not_recommended";
  subject: string;
  text: string;
  profileEvidence: string[];
  roleRequirements: string[];
};

const ApplicationDraftSchema = z.object({
  decision: z.enum(["draft", "not_recommended"]),
  subject: z.string(),
  text: z.string(),
  profileEvidence: z.array(z.string()),
  roleRequirements: z.array(z.string()),
});

const KIND_BRIEF: Record<z.infer<typeof KindSchema>, string> = {
  x_dm: "Cold X DM: no greeting line, 1-2 sentences, maximum 280 characters. Lead with one concrete proof point.",
  linkedin_dm:
    "Cold LinkedIn DM: 2-3 compact sentences. Mention one role-specific proof point, then ask for a brief conversation.",
  email_note:
    "Cold email: 4-6 sentences. Supply a precise subject line in the subject field. The body should make one clear, credible connection to the role.",
  why_fit:
    "Application-form answer to 'Why are you a fit?': 3-4 sentences, specific and direct. Do not use a greeting or sign-off.",
  what_shipped:
    "Application-form answer to 'What have you shipped?': 3-4 concise bullets. Every bullet must describe something supported by the profile.",
};

function cleanLines(lines: string[]) {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export const generateApplication = createServerFn({ method: "POST" })
  .validator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<ApplicationDraft> => {
    const job = await loadSpeedrunJob(data.jobId);
    if (job.status === "closed") {
      throw new Error("This role is no longer open on Speedrun.");
    }

    const gateway = createOpenRouterGateway();
    const model = gateway(DEFAULT_MODEL);

    const system = [
      "You are Nuvra's evidence-first application writer.",
      "Use only facts explicitly stated in the supplied builder profile and role description.",
      "Never invent an employer, project, repository, metric, customer, credential, seniority, or technology experience.",
      "Do not write generic outreach. Ban empty phrases such as 'I hope this finds you well', 'I am passionate about', 'excited to apply', 'synergy', or 'fast learner'.",
      "Every outreach draft must connect one stated role need to one stated profile fact.",
      "If the profile lacks credible evidence for the role, return decision 'not_recommended' with an honest short explanation, not an outreach message.",
      "For not_recommended, the subject must be empty and text must state the missing evidence plainly.",
      "For draft, return only the requested format in text. Do not add notes, labels, analysis, or citations inside the draft.",
      "profileEvidence and roleRequirements are audit notes for the UI, not part of the draft. Keep them factual and concise.",
    ].join(" ");

    const prompt = `REQUESTED FORMAT: ${KIND_BRIEF[data.kind]}

LIVE ROLE
Title: ${job.title}
Company: ${job.stealth ? "Stealth (do not name)" : job.company}
Function: ${job.function}
Location: ${job.location}
Workplace: ${job.workplaceType || "Not listed"}
Seniority: ${job.seniority || "Not listed"}
Role description:
${job.descriptionText?.slice(0, 12_000) || "(The source has not published a description.)"}

BUILDER PROFILE - THE ONLY SOURCE OF CANDIDATE FACTS
Identity: ${data.profile.identity || "(not provided)"}
GitHub: ${data.profile.githubUrl || "(none)"}
Portfolio: ${data.profile.portfolioUrl || "(none)"}
Selected tracks: ${data.profile.targetRoles.join(", ") || "(none)"}
Resume:
${data.profile.resumeText.slice(0, 7_000) || "(empty)"}

Before writing, identify only evidence actually present in the profile and only needs actually present in the role. Then return the structured response.`;

    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: ApplicationDraftSchema }),
        maxOutputTokens: AI_OUTPUT_TOKEN_BUDGET.applicationDraft,
        system,
        prompt,
      });

      const draft: ApplicationDraft = {
        decision: output.decision,
        subject: output.decision === "draft" ? output.subject.trim() : "",
        text: output.text.trim(),
        profileEvidence: cleanLines(output.profileEvidence),
        roleRequirements: cleanLines(output.roleRequirements),
      };

      if (!draft.text) {
        throw new Error("The writer returned an empty draft. Please try again.");
      }
      if (
        draft.decision === "draft" &&
        (!draft.profileEvidence.length || !draft.roleRequirements.length)
      ) {
        throw new Error("The writer could not ground a specific draft. Please try again.");
      }

      return draft;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        throw new Error("The writer returned an invalid structured draft. Please try again.");
      }
      throw error;
    }
  });
