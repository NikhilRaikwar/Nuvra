import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { TopNav } from "@/components/workstation/TopNav";
import { profileIsReady, useProfile } from "@/lib/profile";
import { createProofRun, getProofRun, type ProofRunSnapshot } from "@/lib/proof-agent.functions";

export const Route = createFileRoute("/proof")({
  head: () => ({
    meta: [
      { title: "Proof Compiler - Nuvra" },
      {
        name: "description",
        content: "Compile an evidence-backed proof plan from an opportunity and builder profile.",
      },
    ],
  }),
  component: ProofPage,
});

function ProofPage() {
  const { profile, hydrated } = useProfile();
  const [opportunityText, setOpportunityText] = useState("");
  const [opportunityUrl, setOpportunityUrl] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const startRun = useServerFn(createProofRun);
  const loadRun = useServerFn(getProofRun);
  const ready =
    hydrated && profileIsReady(profile) && (opportunityText.trim() || opportunityUrl.trim());

  const runMutation = useMutation({
    mutationFn: () =>
      startRun({
        data: {
          opportunity: { text: opportunityText, url: opportunityUrl },
          profile,
        },
      }),
    onSuccess: (result) => setRunId(result.runId),
  });

  const runQuery = useQuery({
    queryKey: ["proof-run", runId],
    queryFn: () => loadRun({ data: { runId: runId || "" } }),
    enabled: Boolean(runId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && ["completed", "failed", "partial", "cancelled"].includes(status)
        ? false
        : 900;
    },
  });

  const snapshot = runQuery.data;

  return (
    <div className="min-h-screen bg-cream-base text-ink">
      <TopNav current="proof" />
      <main className="max-w-[1280px] mx-auto p-5 sm:p-8 lg:p-10 space-y-7">
        <header className="max-w-3xl">
          <p className="text-[10px] font-mono uppercase tracking-widest text-accent mb-2">
            Proof Compiler
          </p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Turn an opportunity into proof.
          </h1>
          <p className="mt-3 text-sm text-ink/60 leading-relaxed">
            Nuvra runs a stateful research workflow that inspects supplied evidence, records trace
            events, checks claims, finds gaps, and compiles a draft proof packet.
          </p>
        </header>

        <section className="grid grid-cols-12 gap-5">
          <div className="col-span-12 lg:col-span-5 border border-border-dim bg-cream-base p-5">
            <p className="text-[10px] font-mono uppercase tracking-widest text-ink/40 mb-3">
              Opportunity input
            </p>
            <input
              value={opportunityUrl}
              onChange={(event) => setOpportunityUrl(event.target.value)}
              placeholder="Optional public opportunity URL"
              className="w-full border border-border-dim bg-cream-surface/60 px-3 py-2 text-xs font-mono outline-none focus:border-ink"
            />
            <textarea
              value={opportunityText}
              onChange={(event) => setOpportunityText(event.target.value)}
              rows={8}
              placeholder="Paste the role or opportunity text"
              className="mt-3 w-full border border-border-dim bg-cream-surface/60 p-3 text-xs leading-relaxed font-mono outline-none focus:border-ink resize-none"
            />
            {!profileIsReady(profile) && (
              <p className="mt-3 text-xs text-ink/55">
                Complete your local profile on the radar before compiling proof.
              </p>
            )}
            <button
              onClick={() => runMutation.mutate()}
              disabled={!ready || runMutation.isPending}
              className="mt-4 bg-ink text-cream-base px-4 py-2 text-xs font-medium hover:bg-accent disabled:bg-ink/20 transition-colors"
            >
              {runMutation.isPending ? "Starting..." : "Compile proof"}
            </button>
            {runMutation.error && <ErrorText error={runMutation.error} />}
          </div>

          <div className="col-span-12 lg:col-span-7 border border-border-dim bg-cream-surface p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-[10px] font-mono uppercase tracking-widest text-ink/40">
                Agent trace
              </p>
              <span className="text-[10px] font-mono uppercase text-accent">
                {snapshot?.status || "idle"}
              </span>
            </div>
            <TraceList snapshot={snapshot} loading={runQuery.isFetching && !snapshot} />
          </div>
        </section>

        {snapshot && <RunSections snapshot={snapshot} />}
      </main>
    </div>
  );
}

function TraceList({ snapshot, loading }: { snapshot?: ProofRunSnapshot; loading: boolean }) {
  if (loading) return <p className="text-xs text-ink/50">Loading run state...</p>;
  const events = snapshot?.traceEvents || [];
  if (!events.length)
    return <p className="text-xs text-ink/50">Trace events appear after launch.</p>;
  return (
    <ol className="max-h-[360px] overflow-auto space-y-2">
      {events.slice(-18).map((event) => (
        <li key={event.event_id} className="border-l border-border-dim pl-3 text-xs">
          <div className="font-mono text-[10px] uppercase text-ink/45">
            {event.actor} / {event.status}
          </div>
          <p className="text-ink/80">{event.output_summary || event.action}</p>
        </li>
      ))}
    </ol>
  );
}

function RunSections({ snapshot }: { snapshot: ProofRunSnapshot }) {
  return (
    <div className="grid grid-cols-12 gap-5">
      <Panel title="Requirements" className="col-span-12 md:col-span-6">
        <SimpleList
          items={snapshot.requirements.map((item) => `${item.priority}: ${item.label}`)}
        />
      </Panel>
      <Panel title="Research Plan" className="col-span-12 md:col-span-6">
        <SimpleList items={snapshot.researchPlan.map((item) => item.question)} />
      </Panel>
      <Panel title="Sources Inspected" className="col-span-12 md:col-span-6">
        <SimpleList
          items={snapshot.sourcesInspected.map((item) => `${item.status}: ${item.summary}`)}
        />
      </Panel>
      <Panel title="Claim Court" className="col-span-12 md:col-span-6">
        <SimpleList
          items={snapshot.verifiedClaims.map((item) => `${item.verdict}: ${item.safe_wording}`)}
        />
      </Panel>
      <Panel title="Gap Matrix" className="col-span-12 md:col-span-6">
        <SimpleList items={snapshot.gaps.map((item) => `${item.status}: ${item.why_it_matters}`)} />
      </Panel>
      <Panel title="Critic History" className="col-span-12 md:col-span-6">
        <SimpleList
          items={snapshot.criticHistory.map(
            (item, index) => `${index + 1}. ${item.verdict} / score ${item.score}`,
          )}
        />
      </Panel>
      <Panel title="Final Proof Packet" className="col-span-12">
        {snapshot.proofPacket ? (
          <div className="grid gap-4 text-xs">
            <Block label="Gap" text={snapshot.proofPacket.gap} />
            <Block label="Objective" text={snapshot.proofPacket.proof_objective} />
            <Block
              label="Acceptance Tests"
              text={snapshot.proofPacket.acceptance_tests.join("\n")}
            />
            <Block label="README Draft" text={snapshot.proofPacket.readme_draft} />
            <Block label="Resume Bullet Draft" text={snapshot.proofPacket.resume_bullet_draft} />
          </div>
        ) : (
          <p className="text-xs text-ink/50">Packet appears after the critic accepts or rejects.</p>
        )}
      </Panel>
    </div>
  );
}

function Panel({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`border border-border-dim bg-cream-base p-5 ${className || ""}`}>
      <p className="text-[10px] font-mono uppercase tracking-widest text-ink/40 mb-3">{title}</p>
      {children}
    </section>
  );
}

function SimpleList({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-xs text-ink/50">Waiting for agent output.</p>;
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="text-xs leading-relaxed text-ink/75">
          <span className="text-accent mr-2">+</span>
          {item}
        </li>
      ))}
    </ul>
  );
}

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-ink/40 mb-1">{label}</p>
      <pre className="whitespace-pre-wrap border border-border-dim bg-cream-surface p-3 font-sans text-xs leading-relaxed">
        {text}
      </pre>
    </div>
  );
}

function ErrorText({ error }: { error: Error }) {
  return <p className="mt-3 text-xs text-accent">{error.message}</p>;
}
