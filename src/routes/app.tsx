import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { FacetStrip } from "@/components/workstation/FacetStrip";
import { JobCard } from "@/components/workstation/JobCard";
import { ProfileRail } from "@/components/workstation/ProfileRail";
import { TopNav } from "@/components/workstation/TopNav";
import { useProfile } from "@/lib/profile";
import { recruitLiveRoles, type RecruiterResult } from "@/lib/recruiter.functions";
import { getHiringStats, searchJobs } from "@/lib/speedrun.functions";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Nuvra - Live Job Radar" },
      {
        name: "description",
        content: "Live startup roles from Speedrun, ranked against your builder profile.",
      },
    ],
  }),
  component: Workstation,
});

type Filters = {
  q?: string;
  fn?: string;
  sen?: string;
  loc?: string;
  remote?: boolean;
  scope?: "portfolio" | "everywhere";
  sort?: "new" | "comp" | "rel";
};

function Workstation() {
  const { profile, update, ready, hydrated } = useProfile();
  const [filters, setFilters] = useState<Filters>({ scope: "portfolio", sort: "new" });
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [agentResult, setAgentResult] = useState<RecruiterResult | null>(null);
  const [discoveryError, setDiscoveryError] = useState<Error | null>(null);
  const [scanStage, setScanStage] = useState<"scanning" | null>(null);
  const searchLiveJobs = useServerFn(searchJobs);
  const hiringStats = useServerFn(getHiringStats);
  const recruiter = useServerFn(recruitLiveRoles);

  const jobsQuery = useQuery({
    queryKey: ["speedrun-jobs", filters, page],
    queryFn: () => searchLiveJobs({ data: { ...filters, page } }),
  });

  const statsQuery = useQuery({
    queryKey: ["speedrun-hiring-stats"],
    queryFn: () => hiringStats(),
    staleTime: 5 * 60 * 1000,
  });

  const recruiterMutation = useMutation({
    mutationFn: () =>
      recruiter({
        data: {
          profile,
          preferences: { remote: filters.remote, scope: filters.scope },
        },
      }),
    onSuccess: (result) => {
      setAgentResult(result);
      setScanStage(null);
    },
    onError: (error) => {
      setDiscoveryError(
        error instanceof Error ? error : new Error("The recruiter scan could not finish."),
      );
      setScanStage(null);
    },
  });

  const activeJobs = useMemo(
    () => agentResult?.jobs || jobsQuery.data?.jobs || [],
    [agentResult, jobsQuery.data],
  );
  const signals = useMemo(
    () => Object.fromEntries((agentResult?.signals || []).map((signal) => [signal.jobId, signal])),
    [agentResult],
  );
  const rankedJobs = useMemo(() => {
    return [...activeJobs].sort(
      (a, b) => (signals[b.id]?.score ?? -1) - (signals[a.id]?.score ?? -1),
    );
  }, [activeJobs, signals]);

  const hasSignals = rankedJobs.some((job) => signals[job.id]);

  const updateFilters = (patch: Partial<Filters>) => {
    setPage(0);
    setAgentResult(null);
    setDiscoveryError(null);
    setFilters((previous) => ({ ...previous, ...patch }));
  };

  const runSearch = () =>
    updateFilters({ q: searchInput.trim() || undefined, sort: searchInput.trim() ? "rel" : "new" });

  const findBestRoles = async () => {
    setScanStage("scanning");
    setAgentResult(null);
    setDiscoveryError(null);
    recruiterMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-cream-base text-ink">
      <TopNav current="radar" />
      <main className="max-w-[1440px] mx-auto grid grid-cols-12 min-h-[calc(100vh-3.5rem)]">
        {hydrated && (
          <ProfileRail
            profile={profile}
            onChange={update}
            ready={ready}
            scanning={scanStage !== null || recruiterMutation.isPending}
            scanStage={scanStage}
            onScan={findBestRoles}
          />
        )}

        <section className="col-span-12 lg:col-span-8 p-5 sm:p-8 bg-cream-base/50 border-l-0 lg:border-l border-border-dim">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mb-7">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-ink/40 mb-1">
                02 / Live Job Radar
              </p>
              <h1 className="text-2xl font-semibold tracking-tight">
                {agentResult
                  ? `${agentResult.jobs.length} recruiter-shortlisted roles`
                  : jobsQuery.data
                    ? `${jobsQuery.data.total.toLocaleString()} live roles`
                    : "Reading the live network..."}
              </h1>
              <p className="mt-1 text-xs text-ink/55">
                {agentResult
                  ? `${agentResult.searchPlan.candidatesFound} candidates / ${agentResult.searchPlan.descriptionsRead} live descriptions checked / ${agentResult.searchPlan.queries.join(" / ")}`
                  : statsQuery.data
                    ? `${statsQuery.data.hiring_companies.toLocaleString()} hiring companies / ${statsQuery.data.remote_jobs.toLocaleString()} remote-open roles`
                    : "Fresh data from the Speedrun Talent Network"}
              </p>
            </div>
            <div className="text-left md:text-right space-y-0.5">
              <div className="text-[10px] font-mono text-accent uppercase">
                {hasSignals
                  ? agentResult?.source === "ai"
                    ? "RECRUITER AGENT / EVIDENCE RANKED"
                    : "RECRUITER AGENT / CONSERVATIVE FALLBACK"
                  : scanStage
                    ? "RECRUITER AGENT / LIVE SCAN"
                    : "LIVE API / UNSCORED"}
              </div>
              <div className="text-[10px] font-mono text-ink/30 uppercase">SOURCE: nuvra</div>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
            <input
              aria-label="Search live roles"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && runSearch()}
              placeholder="Search title, company, or location"
              className="w-full bg-cream-surface border border-border-dim px-3 py-2.5 text-sm outline-none focus:border-ink placeholder:text-ink/35"
            />
            <button
              onClick={runSearch}
              className="bg-ink text-cream-base px-4 py-2.5 text-xs font-semibold hover:bg-accent transition-colors"
            >
              Search roles
            </button>
          </div>

          <div className="flex gap-2 flex-wrap mb-6">
            <FilterToggle
              active={!!filters.remote}
              onClick={() => updateFilters({ remote: !filters.remote })}
            >
              Remote only
            </FilterToggle>
            <FilterToggle
              active={filters.scope === "everywhere"}
              onClick={() =>
                updateFilters({
                  scope: filters.scope === "everywhere" ? "portfolio" : "everywhere",
                })
              }
            >
              Include broader startup universe
            </FilterToggle>
            {(filters.q ||
              filters.fn ||
              filters.sen ||
              filters.loc ||
              filters.remote ||
              filters.scope === "everywhere" ||
              agentResult) && (
              <button
                onClick={() => {
                  setSearchInput("");
                  updateFilters({
                    q: undefined,
                    fn: undefined,
                    sen: undefined,
                    loc: undefined,
                    remote: false,
                    scope: "portfolio",
                    sort: "new",
                  });
                }}
                className="px-2.5 py-1 border border-border-dim text-[11px] text-ink/55 hover:border-ink hover:text-ink transition-colors"
              >
                {agentResult ? "Show all live roles" : "Clear filters"}
              </button>
            )}
          </div>

          {jobsQuery.data && (
            <FacetStrip
              facets={jobsQuery.data.facets}
              active={filters}
              total={jobsQuery.data.total}
              onChange={(patch) => updateFilters(patch)}
            />
          )}

          {!ready && (
            <div className="mb-6 p-4 border border-dashed border-border-dim bg-cream-surface/50 text-xs text-ink/60 leading-relaxed">
              <strong className="text-ink">Profile incomplete.</strong> Paste a resume and select
              target roles to run the recruiter agent. It reads live Speedrun postings server-side,
              then returns an evidence-backed shortlist.
            </div>
          )}

          {agentResult && (
            <div className="mb-6 p-3 border border-border-dim bg-cream-surface text-xs text-ink/70 leading-relaxed break-words">
              <span className="font-mono text-[10px] uppercase tracking-widest text-accent mr-2">
                {agentResult.source === "ai" ? "Recruiter brief" : "Conservative fallback"}
              </span>
              {agentResult.summary}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border-dim pt-2 text-[10px] font-mono text-ink/45">
                <span>
                  GitHub: {agentResult.profileSources.github.detail}
                  {agentResult.profileSources.github.deployedLinks
                    ? ` / ${agentResult.profileSources.github.deployedLinks} live links`
                    : ""}
                </span>
                <span>
                  Portfolio: {agentResult.profileSources.portfolio.detail}
                  {agentResult.profileSources.portfolio.deployedLinks
                    ? ` / ${agentResult.profileSources.portfolio.deployedLinks} project links`
                    : ""}
                </span>
              </div>
            </div>
          )}

          {jobsQuery.isError && (
            <div className="mb-6 p-4 border border-accent/30 bg-accent/5 text-sm text-ink">
              Could not load live roles: {jobsQuery.error.message}
            </div>
          )}

          {discoveryError && (
            <div className="mb-6 p-4 border border-accent/30 bg-accent/5 text-sm text-ink">
              Could not find profile-matched roles: {discoveryError.message}
            </div>
          )}

          <div className="grid gap-px bg-border-dim border border-border-dim">
            {!agentResult &&
              jobsQuery.isLoading &&
              Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="bg-cream-base p-6 h-40 animate-pulse" />
              ))}
            {rankedJobs.map((job, index) => (
              <JobCard
                key={job.id}
                job={job}
                signal={signals[job.id]}
                loading={recruiterMutation.isPending}
                index={index}
              />
            ))}
          </div>

          {jobsQuery.data && !agentResult && (
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-between items-center text-[10px] font-mono uppercase text-ink/40 tracking-widest">
              <span>
                Page {jobsQuery.data.page + 1} of {jobsQuery.data.totalPages} /{" "}
                {jobsQuery.data.pageSize} roles per page
              </span>
              <div className="flex items-center gap-4">
                {jobsQuery.data.page > 0 && (
                  <button
                    onClick={() => setPage((current) => Math.max(0, current - 1))}
                    className="text-ink hover:text-accent underline underline-offset-4"
                  >
                    &lt;- Previous 50
                  </button>
                )}
                {jobsQuery.data.page + 1 < jobsQuery.data.totalPages && (
                  <button
                    onClick={() => setPage((current) => current + 1)}
                    className="text-ink hover:text-accent underline underline-offset-4"
                  >
                    Next 50 -&gt;
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-border-dim min-h-12 flex flex-col sm:flex-row gap-1 items-center justify-between px-6 py-3 bg-cream-base text-[10px] font-mono text-ink/40">
        <span>NUVRA / NO LOGIN / LOCAL PROFILE</span>
        <a
          href="https://speedrun-talent-network.com/developers"
          target="_blank"
          rel="noreferrer"
          className="hover:text-ink"
        >
          LIVE DATA: SPEEDRUN TALENT NETWORK
        </a>
      </footer>
    </div>
  );
}

function FilterToggle({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? "px-2.5 py-1 bg-ink text-cream-base text-[11px]"
          : "px-2.5 py-1 border border-border-dim text-[11px] text-ink/65 hover:border-ink transition-colors"
      }
    >
      {children}
    </button>
  );
}
