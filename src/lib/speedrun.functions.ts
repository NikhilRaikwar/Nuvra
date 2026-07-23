import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const API_BASE = "https://speedrun-talent-network.com/api/v1";
const SOURCE = "nuvra";

type RawJob = {
  id: string;
  title: string;
  company: string;
  company_slug: string | null;
  company_url: string | null;
  url: string;
  location: string | null;
  workplace_type: string | null;
  employment_type: string | null;
  function: string | null;
  seniority: string | null;
  remote: boolean;
  comp_min: number | null;
  comp_max: number | null;
  comp_currency: string | null;
  comp_period: "year" | "hour" | "month" | "week" | "day" | null;
  published_at: string | null;
  stealth: boolean;
  cohort: string | null;
  tier: "speedrun" | "a16z" | "universe";
};

type RawJobDetail = RawJob & {
  status: "open" | "closed";
  comp_summary: string | null;
  apply: { kind: "onsite" | "external"; url: string } | null;
  description_text: string | null;
};

export type SpeedrunFacet = { v: string; n: number };

export type SpeedrunFacets = {
  fn: SpeedrunFacet[];
  sen: SpeedrunFacet[];
  emp: SpeedrunFacet[];
  loc: SpeedrunFacet[];
  cohort: SpeedrunFacet[];
  portfolio: SpeedrunFacet[];
  compAvailable: number;
  compHidden: number;
  stealth: number;
  named: number;
};

export type Job = {
  id: string;
  title: string;
  company: string;
  companySlug: string | null;
  companyUrl: string | null;
  canonicalUrl: string;
  location: string;
  workplaceType: string | null;
  employmentType: string | null;
  function: string;
  seniority: string | null;
  remote: boolean;
  compensation: string;
  scope: string;
  publishedAt: string | null;
  stealth: boolean;
  status?: "open" | "closed";
  descriptionText?: string | null;
};

export type HiringStats = {
  live_jobs: number;
  hiring_companies: number;
  remote_jobs: number;
  comp_posted: number;
  function_mix: Array<{ function: string; n: number }>;
  top_cities: Array<{ city: string; n: number }>;
};

const SearchInput = z.object({
  q: z.string().trim().max(120).optional(),
  fn: z.string().optional(),
  sen: z.string().optional(),
  emp: z.string().optional(),
  loc: z.string().optional(),
  remote: z.boolean().optional(),
  comp: z.number().int().min(0).optional(),
  portfolio: z.string().optional(),
  cohort: z.string().optional(),
  stealth: z.enum(["only", "hide"]).optional(),
  scope: z.enum(["portfolio", "everywhere"]).optional(),
  sort: z.enum(["rel", "new", "comp"]).optional(),
  page: z.number().int().min(0).max(200).default(0),
});

type SearchInput = z.infer<typeof SearchInput>;

const IdInput = z.object({ id: z.string().trim().min(1).max(200) });

function titleCase(value: string | null | undefined) {
  if (!value) return "Unclassified";
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function compactMoney(value: number, currency: string | null) {
  const symbol = currency === "USD" || !currency ? "$" : `${currency} `;
  if (value >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${symbol}${Math.round(value / 1_000)}k`;
  return `${symbol}${value}`;
}

function formatCompensation(job: RawJob, detailedSummary?: string | null) {
  if (detailedSummary) return detailedSummary;
  if (job.comp_min == null && job.comp_max == null) return "Comp not listed";
  const min = job.comp_min == null ? null : compactMoney(job.comp_min, job.comp_currency);
  const max = job.comp_max == null ? null : compactMoney(job.comp_max, job.comp_currency);
  const range = min && max ? `${min}-${max}` : min || max || "Comp not listed";
  const suffix = job.comp_period && job.comp_period !== "year" ? ` / ${job.comp_period}` : "";
  return `${range}${suffix}`;
}

function formatScope(job: RawJob) {
  const labels = [job.tier === "a16z" ? "a16z" : job.tier];
  if (job.cohort) labels.push(job.cohort);
  return labels.join(" / ");
}

function toJob(
  raw: RawJob,
  detail?: Pick<RawJobDetail, "status" | "description_text" | "comp_summary">,
): Job {
  return {
    id: raw.id,
    title: raw.title,
    company: raw.company,
    companySlug: raw.company_slug,
    companyUrl: raw.company_url,
    canonicalUrl: raw.url,
    location: raw.location || (raw.remote ? "Remote" : "Location not listed"),
    workplaceType: raw.workplace_type,
    employmentType: raw.employment_type,
    function: titleCase(raw.function),
    seniority: raw.seniority ? titleCase(raw.seniority) : null,
    remote: raw.remote,
    compensation: formatCompensation(raw, detail?.comp_summary),
    scope: formatScope(raw),
    publishedAt: raw.published_at,
    stealth: raw.stealth,
    status: detail?.status,
    descriptionText: detail?.description_text,
  };
}

async function apiRequest<T>(
  path: string,
  query: Record<string, string | number | undefined> = {},
) {
  const params = new URLSearchParams({ source: SOURCE });
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const response = await fetch(`${API_BASE}${path}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  const payload = (await response.json()) as T | { error?: { code?: string; message?: string } };
  if (!response.ok) {
    const message = (payload as { error?: { message?: string } }).error?.message;
    throw new Error(message || `Speedrun API request failed (${response.status}).`);
  }
  return payload as T;
}

export async function loadSpeedrunJob(id: string): Promise<Job> {
  const payload = await apiRequest<{ job: RawJobDetail }>(`/jobs/${encodeURIComponent(id)}`);
  return toJob(payload.job, payload.job);
}

export const searchJobs = createServerFn({ method: "GET" })
  .validator((input: unknown) => SearchInput.parse(input ?? {}))
  .handler(async ({ data }) => {
    const query: Record<string, string | number | undefined> = {
      q: data.q,
      fn: data.fn,
      sen: data.sen,
      emp: data.emp,
      loc: data.loc,
      remote: data.remote ? "1" : undefined,
      comp: data.comp,
      portfolio: data.portfolio,
      cohort: data.cohort,
      stealth: data.stealth,
      scope: data.scope,
      sort: data.sort,
      page: data.page,
    };
    const payload = await apiRequest<{
      jobs: RawJob[];
      total: number;
      page: number;
      page_size: number;
      total_pages: number;
      facets: SpeedrunFacets;
      scope?: "portfolio" | "everywhere";
      beyond_portfolio?: number;
      source?: string;
    }>("/jobs", query);

    return {
      jobs: payload.jobs.map((job) => toJob(job)),
      total: payload.total,
      page: payload.page,
      pageSize: payload.page_size,
      totalPages: payload.total_pages,
      facets: payload.facets,
      scope: payload.scope || data.scope || "portfolio",
      beyondPortfolio: payload.beyond_portfolio || 0,
      source: payload.source || SOURCE,
    };
  });

export const getJobDetail = createServerFn({ method: "GET" })
  .validator((input: unknown) => IdInput.parse(input))
  .handler(async ({ data }) => loadSpeedrunJob(data.id));

export const getHiringStats = createServerFn({ method: "GET" }).handler(async () => {
  const payload = await apiRequest<HiringStats>("/stats/hiring");
  return payload;
});
