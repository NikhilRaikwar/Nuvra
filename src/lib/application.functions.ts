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
  profileEvidence: z.array(z.string().min(4).max(180)).max(3),
  roleRequirements: z.array(z.string().min(4).max(180)).max(3),
});

const KIND_BRIEF: Record<z.infer<typeof KindSchema>, string> = {
  x_dm: "X DM: 2 sentences, 180-260 characters, no greeting or sign-off. Lead with one specific shipped project, then make one low-pressure ask.",
  linkedin_dm:
    "LinkedIn DM: 3 compact sentences, maximum 90 words. Mention one relevant project, connect it to the role, then ask for a brief conversation.",
  email_note:
    "Cold email: maximum 120 words in 3 short paragraphs. Supply a precise subject line. State one relevant shipped project and one concrete connection to the role.",
  why_fit:
    "Application-form answer to 'Why are you a fit?': 3 direct sentences, maximum 90 words. Do not use a greeting or sign-off.",
  what_shipped:
    "Application-form answer to 'What have you shipped?': exactly 3 concise bullets. Each bullet is maximum 22 words and must describe a project explicitly named in the profile.",
};

const MAX_DRAFT_CHARS: Record<z.infer<typeof KindSchema>, number> = {
  x_dm: 280,
  linkedin_dm: 620,
  email_note: 900,
  why_fit: 620,
  what_shipped: 650,
};

function cleanLines(lines: string[]) {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findGroundingIssue(
  draft: ApplicationDraft,
  profile: z.infer<typeof Input>["profile"],
  kind: z.infer<typeof KindSchema>,
) {
  if (draft.decision !== "draft") return null;

  if (draft.text.length > MAX_DRAFT_CHARS[kind]) {
    return `The ${KIND_BRIEF[kind].split(":")[0]} is longer than the allowed format.`;
  }

  const profileFacts = normalize([profile.identity, profile.resumeText].join("\n"));
  const unsupportedEvidence = draft.profileEvidence.find((item) => {
    const evidence = normalize(item);
    return evidence.length < 4 || !profileFacts.includes(evidence);
  });
  if (unsupportedEvidence) {
    return `The evidence '${unsupportedEvidence}' is not stated in the saved profile.`;
  }

  const profileTenure = new Set(
    [...profileFacts.matchAll(/\b\d{1,2}\+?\s*(?:years?|yrs?)(?:\s+of)?\s+experience\b/g)].map(
      (match) => normalize(match[0]),
    ),
  );
  const unsupportedTenure = [
    ...draft.text.matchAll(
      /\b(?:over|more than|at least)?\s*\d{1,2}\+?\s*(?:years?|yrs?)(?:\s+of)?\s+experience\b/gi,
    ),
  ].find((match) => !profileTenure.has(normalize(match[0])));
  if (unsupportedTenure) {
    return `The draft claims '${unsupportedTenure[0]}', but that tenure is not in the saved profile.`;
  }

  return null;
}

function notRecommended(reason: string): ApplicationDraft {
  const normalizedReason = reason.charAt(0).toLowerCase() + reason.slice(1);
  return {
    decision: "not_recommended",
    subject: "",
    text: `Nuvra will not generate this message because ${normalizedReason} Update the profile with verified evidence or choose a closer role.`,
    profileEvidence: [],
    roleRequirements: [],
  };
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
      "A role requirement is never evidence that the candidate has that experience. Do not copy requirements into profileEvidence or present them as candidate facts.",
      "profileEvidence must be direct, short quotations copied from the builder profile. Do not paraphrase it.",
      "Never claim years of experience unless the exact tenure is present in the builder profile.",
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
      for (let attempt = 0; attempt < 2; attempt++) {
        const { output } = await generateText({
          model,
          output: Output.object({ schema: ApplicationDraftSchema }),
          maxOutputTokens: AI_OUTPUT_TOKEN_BUDGET.applicationDraft,
          system,
          prompt:
            attempt === 0
              ? prompt
              : `${prompt}\n\nCORRECTION: Your first draft used unsupported evidence. Return only direct profile quotations in profileEvidence and remove every unsupported claim.`,
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
          if (attempt === 0) continue;
          return notRecommended("it could not verify a specific profile-to-role connection.");
        }

        const groundingIssue = findGroundingIssue(draft, data.profile, data.kind);
        if (!groundingIssue) return draft;
        if (attempt === 1) return notRecommended(groundingIssue);
      }

      return notRecommended("it could not verify a specific profile-to-role connection.");
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        throw new Error("The writer returned an invalid structured draft. Please try again.");
      }
      throw error;
    }
  });
