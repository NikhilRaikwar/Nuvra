import { tool } from "ai";
import { z } from "zod";
import { enrichPublicProfile } from "./profile-enrichment.server";
import { type AgentProfile } from "./profile-evidence.server";
import { loadSpeedrunJob, searchSpeedrunJobs } from "./speedrun.functions";

export type RecruiterToolContext = {
  profile?: AgentProfile;
  facts?: string[];
};

export function createRecruiterTools(context: RecruiterToolContext = {}) {
  const searchRoles = tool({
    description:
      "Search live roles on the Speedrun Talent Network by keywords, remote preference, or scope.",
    inputSchema: z.object({
      query: z.string().describe("Search keywords for job title, skills, or target track"),
      remote: z.boolean().optional().describe("Filter only remote-open positions"),
      scope: z
        .enum(["portfolio", "everywhere"])
        .optional()
        .describe("Speedrun portfolio vs broader startup universe"),
    }),
    execute: async ({ query, remote, scope }) => {
      try {
        const result = await searchSpeedrunJobs({
          q: query,
          remote,
          scope,
          sort: "rel",
          page: 0,
        });
        return {
          totalFound: result.total,
          roles: result.jobs.slice(0, 6).map((job) => ({
            id: job.id,
            title: job.title,
            company: job.stealth ? "Stealth" : job.company,
            location: job.location,
            remote: job.remote,
            compensation: job.compensation,
            function: job.function,
            seniority: job.seniority,
          })),
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Failed to search Speedrun jobs.",
        };
      }
    },
  });

  const getRoleDetails = tool({
    description:
      "Fetch the verified live description and hiring details for a Speedrun job by its ID.",
    inputSchema: z.object({
      id: z.string().describe("The Speedrun job ID to load details for"),
    }),
    execute: async ({ id }) => {
      try {
        const job = await loadSpeedrunJob(id);
        const descriptionText = (job.descriptionText || "").slice(0, 6000);
        return {
          id: job.id,
          title: job.title,
          company: job.stealth ? "Stealth" : job.company,
          location: job.location,
          compensation: job.compensation,
          function: job.function,
          seniority: job.seniority,
          remote: job.remote,
          scope: job.scope,
          descriptionText,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : `Failed to load job details for ${id}.`,
        };
      }
    },
  });

  const getGitHubEvidence = tool({
    description:
      "Read-only query of candidate's verified GitHub repository facts, languages, and README proof.",
    inputSchema: z.object({
      keyword: z
        .string()
        .optional()
        .describe("Optional skill, framework, or repo term to filter facts"),
    }),
    execute: async ({ keyword }) => {
      try {
        const facts = context.facts || [];
        if (!facts.length) {
          return {
            facts: [],
            message: "No candidate profile facts currently loaded.",
          };
        }
        if (keyword && keyword.trim()) {
          const norm = keyword.toLowerCase().trim();
          const matched = facts.filter((fact) => fact.toLowerCase().includes(norm));
          return {
            matchedKeyword: keyword,
            facts: matched.length ? matched.slice(0, 6) : facts.slice(0, 6),
          };
        }
        return {
          facts: facts.slice(0, 10),
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Failed to retrieve GitHub evidence.",
        };
      }
    },
  });

  const fetchPortfolio = tool({
    description:
      "Safely inspect a public portfolio page to verify live projects and deployed links.",
    inputSchema: z.object({
      url: z
        .string()
        .url()
        .optional()
        .describe("Public HTTP(S) portfolio URL to inspect (defaults to candidate profile portfolio)"),
    }),
    execute: async ({ url }) => {
      try {
        const targetUrl = url || context.profile?.portfolioUrl;
        if (!targetUrl || !targetUrl.trim()) {
          return {
            message: "No portfolio URL provided in profile or arguments.",
          };
        }
        const enrichment = await enrichPublicProfile({
          githubUrl: "",
          portfolioUrl: targetUrl.trim(),
        });
        return {
          summary: enrichment.summary.portfolio,
          evidenceText: enrichment.evidenceText.slice(0, 3000),
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Failed to inspect portfolio page.",
        };
      }
    },
  });

  return {
    searchRoles,
    getRoleDetails,
    getGitHubEvidence,
    fetchPortfolio,
  };
}

const defaultTools = createRecruiterTools();

export const searchRolesTool = defaultTools.searchRoles;
export const getRoleDetailsTool = defaultTools.getRoleDetails;
export const getGitHubEvidenceTool = defaultTools.getGitHubEvidence;
export const fetchPortfolioTool = defaultTools.fetchPortfolio;

export const tools = defaultTools;
