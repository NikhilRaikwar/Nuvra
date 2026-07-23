import type { HiringStats, Job, SpeedrunFacets } from "./speedrun.functions";
import type { Profile, TargetRole } from "./profile";

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

export type BrowserJobSearch = {
  q?: string;
  fn?: string;
  sen?: string;
  emp?: string;
  loc?: string;
  remote?: boolean;
  comp?: number;
  portfolio?: string;
  cohort?: string;
  stealth?: "only" | "hide";
  scope?: "portfolio" | "everywhere";
  sort?: "new" | "comp" | "rel";
  page?: number;
};

export type LiveJobSearch = {
  jobs: Job[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets: SpeedrunFacets;
  scope: "portfolio" | "everywhere";
  beyondPortfolio: number;
  source: string;
};

export type ProfileJobDiscovery = {
  jobs: Job[];
  queries: string[];
};

const TARGET_ROLE_QUERIES: Record<TargetRole, string[]> = {
  "AI Engineer": ["agent", "AI engineer"],
  FDE: ["forward deployed engineer", "solutions engineer", "integration engineer"],
  "Full Stack": ["full stack", "product engineer"],
  Frontend: ["frontend", "react"],
  Backend: ["backend", "platform engineer"],
  Web3: ["blockchain", "solidity", "web3"],
  DevRel: ["developer relations", "developer advocate"],
  "Product Engineer": ["product engineer", "full stack"],
};

const RESUME_QUERY_SIGNALS = [
  {
    terms: ["agent", "llm", "rag", "openai", "anthropic", "inference"],
    query: "agent",
  },
  {
    terms: ["solidity", "defi", "onchain", "blockchain", "web3", "crypto"],
    query: "blockchain",
  },
  {
    terms: ["typescript", "react", "next", "node", "full stack", "frontend"],
    query: "full stack",
  },
  {
    terms: ["api", "integration", "customer", "deployment", "workflow"],
    query: "integration engineer",
  },
];

const DISCOVERY_KEYWORDS = [
  "agent",
  "ai",
  "llm",
  "machine learning",
  "forward deployed",
  "solutions",
  "integration",
  "full stack",
  "product engineer",
  "typescript",
  "react",
  "node",
  "backend",
  "web3",
  "blockchain",
  "solidity",
  "defi",
  "crypto",
];

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

function toJob(raw: RawJob): Job {
  const minimum = raw.comp_min == null ? null : compactMoney(raw.comp_min, raw.comp_currency);
  const maximum = raw.comp_max == null ? null : compactMoney(raw.comp_max, raw.comp_currency);
  const compensation =
    minimum || maximum
      ? `${minimum && maximum ? `${minimum}-${maximum}` : minimum || maximum}${raw.comp_period && raw.comp_period !== "year" ? ` / ${raw.comp_period}` : ""}`
      : "Comp not listed";

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
    compensation,
    scope: [raw.tier === "a16z" ? "a16z" : raw.tier, raw.cohort].filter(Boolean).join(" / "),
    publishedAt: raw.published_at,
    stealth: raw.stealth,
  };
}

async function request<T>(path: string, query: Record<string, string | number | undefined> = {}) {
  const params = new URLSearchParams({ source: SOURCE });
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }

  const response = await fetch(`${API_BASE}${path}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  const payload = (await response.json()) as T | { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(
      (payload as { error?: { message?: string } }).error?.message ||
        `Speedrun API request failed (${response.status}).`,
    );
  }
  return payload as T;
}

export async function fetchLiveJobs(input: BrowserJobSearch): Promise<LiveJobSearch> {
  const payload = await request<{
    jobs: RawJob[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
    facets: SpeedrunFacets;
    scope?: "portfolio" | "everywhere";
    beyond_portfolio?: number;
    source?: string;
  }>("/jobs", {
    ...input,
    remote: input.remote ? "1" : undefined,
    page: input.page ?? 0,
  });

  return {
    jobs: payload.jobs.map(toJob),
    total: payload.total,
    page: payload.page,
    pageSize: payload.page_size,
    totalPages: payload.total_pages,
    facets: payload.facets,
    scope: payload.scope || input.scope || "portfolio",
    beyondPortfolio: payload.beyond_portfolio || 0,
    source: payload.source || SOURCE,
  };
}

export async function fetchHiringStats(): Promise<HiringStats> {
  return request<HiringStats>("/stats/hiring");
}

function profileQueries(profile: Profile) {
  const text = [profile.identity, profile.resumeText, ...profile.targetRoles]
    .join(" ")
    .toLowerCase();
  const primaryTrackQueries = profile.targetRoles
    .map((role) => TARGET_ROLE_QUERIES[role]?.[0])
    .filter((query): query is string => Boolean(query));
  const secondaryTrackQueries = profile.targetRoles.flatMap((role) =>
    (TARGET_ROLE_QUERIES[role] || []).slice(1),
  );
  const inferred = RESUME_QUERY_SIGNALS.filter(({ terms }) =>
    terms.some((term) => text.includes(term)),
  ).map(({ query }) => query);

  // Give every selected track a first-pass query before spending calls on alternatives.
  return [...new Set([...primaryTrackQueries, ...inferred, ...secondaryTrackQueries])].slice(0, 6);
}

function profileRelevance(job: Job, profile: Profile) {
  const profileText = [profile.identity, profile.resumeText, ...profile.targetRoles]
    .join(" ")
    .toLowerCase();
  const jobText = [job.title, job.function, job.seniority || "", job.scope].join(" ").toLowerCase();
  const sharedKeywords = DISCOVERY_KEYWORDS.filter(
    (keyword) => profileText.includes(keyword) && jobText.includes(keyword),
  );
  const targetTitleHits = profile.targetRoles.filter((role) => {
    const roleTerms = TARGET_ROLE_QUERIES[role] || [];
    return roleTerms.some((term) => jobText.includes(term));
  }).length;

  return sharedKeywords.length * 12 + targetTitleHits * 18 + (job.remote ? 2 : 0);
}

/**
 * Discover candidates from the live board before asking the AI to rank them.
 * This avoids treating the currently visible, generic page as a user's shortlist.
 */
export async function fetchProfileJobs(profile: Profile): Promise<ProfileJobDiscovery> {
  const queries = profileQueries(profile);
  const searches = await Promise.all(
    queries.map((q) => fetchLiveJobs({ q, scope: "everywhere", sort: "rel" })),
  );
  const byId = new Map<string, Job>();
  for (const search of searches) {
    for (const job of search.jobs) byId.set(job.id, job);
  }

  if (byId.size < 20) {
    const fallback = await fetchLiveJobs({ scope: "everywhere", sort: "new" });
    for (const job of fallback.jobs) byId.set(job.id, job);
  }

  return {
    queries,
    jobs: [...byId.values()]
      .sort((a, b) => profileRelevance(b, profile) - profileRelevance(a, profile))
      .slice(0, 50),
  };
}
