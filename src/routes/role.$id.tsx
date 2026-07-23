import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { TopNav } from "@/components/workstation/TopNav";
import { useProfile, profileIsReady, type Profile } from "@/lib/profile";
import { generateApplication, type ApplicationDraft } from "@/lib/application.functions";
import { generateProof, type ProofProject } from "@/lib/proof.functions";
import { scoreRole, type FitReport } from "@/lib/scoring.functions";
import { getJobDetail, type Job } from "@/lib/speedrun.functions";

export const Route = createFileRoute("/role/$id")({
  head: () => ({
    meta: [
      { title: "Evidence Report - Nuvra" },
      { name: "description", content: "A grounded evidence report for a live Speedrun role." },
    ],
  }),
  component: RolePage,
});

function RolePage() {
  const { id } = Route.useParams();
  const { profile, hydrated } = useProfile();
  const getJob = useServerFn(getJobDetail);
  const jobQuery = useQuery({
    queryKey: ["speedrun-job", id],
    queryFn: () => getJob({ data: { id } }),
  });

  if (jobQuery.isLoading) {
    return <LoadingState />;
  }

  if (jobQuery.isError || !jobQuery.data) {
    return (
      <ErrorState
        message={jobQuery.error?.message || "This role could not be loaded from Speedrun."}
      />
    );
  }

  const job = jobQuery.data;
  const ready = hydrated && profileIsReady(profile);

  return (
    <div className="min-h-screen bg-cream-base text-ink">
      <TopNav current="role" />
      <main className="max-w-[1200px] mx-auto p-5 sm:p-8 lg:p-10 space-y-9">
        <RoleHeader job={job} />
        {job.status === "closed" ? (
          <ClosedRole />
        ) : !ready ? (
          <ProfileGate />
        ) : (
          <RoleWorkspace job={job} profile={profile} />
        )}
      </main>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="min-h-screen bg-cream-base text-ink">
      <TopNav current="role" />
      <main className="max-w-[1200px] mx-auto p-10">
        <div className="h-48 border border-border-dim bg-cream-surface animate-pulse" />
      </main>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-cream-base text-ink">
      <TopNav current="role" />
      <main className="max-w-[700px] mx-auto p-10 text-center">
        <p className="text-[10px] font-mono uppercase tracking-widest text-accent">
          Live role unavailable
        </p>
        <h1 className="mt-3 text-2xl font-semibold">Could not load this evidence report.</h1>
        <p className="mt-3 text-sm text-ink/60">{message}</p>
        <Link
          to="/app"
          className="inline-block mt-6 bg-ink text-cream-base px-4 py-2 text-xs font-medium hover:bg-accent transition-colors"
        >
          Back to the live radar
        </Link>
      </main>
    </div>
  );
}

function RoleHeader({ job }: { job: Job }) {
  return (
    <header className="pr-fade-up">
      <Link
        to="/app"
        className="text-[11px] font-mono uppercase text-ink/40 hover:text-ink tracking-widest"
      >
        Back to live radar
      </Link>
      <div className="mt-4 flex flex-col md:flex-row md:items-end md:justify-between gap-5">
        <div>
          <div className="text-[10px] font-mono text-accent uppercase tracking-wider mb-2">
            {job.scope} / {job.location} / {job.function}
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
            {job.title}
          </h1>
          <p className={`text-lg text-ink/70 mt-1 ${job.stealth ? "italic" : ""}`}>{job.company}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="px-2.5 py-1 border border-border-dim text-[11px] font-mono">
            {job.compensation}
          </span>
          <a
            href={job.canonicalUrl}
            target="_blank"
            rel="noreferrer"
            className="bg-ink text-cream-base px-4 py-2 text-xs font-medium hover:bg-accent transition-colors"
          >
            Read live job description -&gt;
          </a>
        </div>
      </div>
      <div className="mt-5 flex gap-x-5 gap-y-2 flex-wrap text-[11px] font-mono uppercase tracking-wider text-ink/45">
        <span>{job.workplaceType || (job.remote ? "Remote" : "Workplace not listed")}</span>
        {job.employmentType && <span>{job.employmentType}</span>}
        {job.seniority && <span>{job.seniority}</span>}
        {job.publishedAt && <span>Published {new Date(job.publishedAt).toLocaleDateString()}</span>}
      </div>
      <p className="mt-5 max-w-3xl text-sm text-ink/62 leading-relaxed">
        {job.descriptionText
          ? "This report uses the current Speedrun description as evidence. Read the complete live post and apply through the canonical listing above."
          : "Speedrun has not published a description for this role. Review the live listing for any updates."}
      </p>
    </header>
  );
}

function ProfileGate() {
  return (
    <div className="border border-dashed border-border-dim bg-cream-surface/50 p-8 text-center">
      <p className="text-[10px] font-mono uppercase text-accent tracking-widest mb-2">
        Profile required
      </p>
      <p className="text-sm text-ink/70 max-w-md mx-auto">
        Add a resume or GitHub URL and select target roles first. The agent is grounded only in the
        profile you provide.
      </p>
      <Link
        to="/app"
        className="inline-block mt-4 bg-ink text-cream-base px-4 py-2 text-xs font-medium hover:bg-accent transition-colors"
      >
        Complete my profile
      </Link>
    </div>
  );
}

function ClosedRole() {
  return (
    <div className="border border-border-dim bg-cream-surface p-8 text-center">
      <p className="text-[10px] font-mono uppercase text-accent tracking-widest mb-2">
        Role closed
      </p>
      <p className="text-sm text-ink/70">
        Speedrun reports that this role is no longer open. Return to the radar for current openings.
      </p>
      <Link
        to="/app"
        className="inline-block mt-4 bg-ink text-cream-base px-4 py-2 text-xs font-medium hover:bg-accent transition-colors"
      >
        View live roles
      </Link>
    </div>
  );
}

function RoleWorkspace({ job, profile }: { job: Job; profile: Profile }) {
  const score = useServerFn(scoreRole);
  const proof = useServerFn(generateProof);
  const fitQuery = useQuery({
    queryKey: ["agent-fit", job.id, profile.resumeText.slice(0, 500), profile.targetRoles],
    queryFn: () => score({ data: { jobId: job.id, profile } }),
  });
  const proofMutation = useMutation({
    mutationFn: () => proof({ data: { jobId: job.id, profile, gaps: fitQuery.data?.gaps || [] } }),
  });

  return (
    <div className="grid grid-cols-12 gap-7">
      <div className="col-span-12 lg:col-span-7 space-y-7">
        <FitReportCard report={fitQuery.data} loading={fitQuery.isLoading} error={fitQuery.error} />
        <ProofCard
          project={proofMutation.data}
          loading={proofMutation.isPending}
          error={proofMutation.error}
          onGenerate={() => proofMutation.mutate()}
          disabled={!fitQuery.data}
        />
      </div>
      <div className="col-span-12 lg:col-span-5">
        <ApplicationWriter job={job} profile={profile} />
      </div>
    </div>
  );
}

function FitReportCard({
  report,
  loading,
  error,
}: {
  report?: FitReport;
  loading: boolean;
  error: Error | null;
}) {
  return (
    <section className="border border-border-dim bg-cream-base p-6 pr-fade-up">
      <div className="flex items-start justify-between mb-6 gap-6">
        <div>
          <p className="text-[10px] font-mono uppercase text-ink/40 tracking-widest mb-1">
            01 / Evidence fit report
          </p>
          <p className="text-sm text-ink/70 max-w-md leading-relaxed">
            {loading
              ? "Reading the live role against your profile..."
              : report?.headline || "A grounded role analysis will appear here."}
          </p>
        </div>
        <div className="text-right shrink-0">
          {loading ? (
            <div className="w-24 h-14 bg-ink/5 animate-pulse" />
          ) : (
            report && <ScoreMark report={report} />
          )}
        </div>
      </div>
      {error && <AgentError error={error} />}
      {report && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <BulletBlock label="Why you match" items={report.matches} accent />
          <BulletBlock label="Risks" items={report.risks} />
          <BulletBlock label="Proof gaps" items={report.gaps} />
          <BulletBlock label="Projects to mention" items={report.projectsToMention} />
          <div className="md:col-span-2 border-t border-border-dim pt-4">
            <p className="text-[10px] font-mono uppercase text-ink/40 tracking-widest mb-2">
              Application angle
            </p>
            <p className="text-sm text-ink/80 leading-relaxed">{report.applicationAngle}</p>
          </div>
        </div>
      )}
    </section>
  );
}

function ScoreMark({ report }: { report: FitReport }) {
  const styles =
    report.verdict === "Apply Now"
      ? "text-accent"
      : report.verdict === "Skip"
        ? "text-ink/35"
        : "text-ink";
  return (
    <>
      <div className={`text-5xl font-mono tabular tracking-tighter ${styles}`}>
        {report.fitScore}
        <span className="text-2xl text-ink/40">%</span>
      </div>
      <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-ink/45">
        Evidence fit / {report.verdict}
      </div>
    </>
  );
}

function BulletBlock({
  label,
  items,
  accent,
}: {
  label: string;
  items: string[];
  accent?: boolean;
}) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-[10px] font-mono uppercase text-ink/40 tracking-widest mb-2">{label}</p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-xs leading-relaxed">
            <span className={accent ? "text-accent shrink-0" : "text-ink/30 shrink-0"}>
              {accent ? "+" : "->"}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProofCard({
  project,
  loading,
  error,
  onGenerate,
  disabled,
}: {
  project?: ProofProject;
  loading: boolean;
  error: Error | null;
  onGenerate: () => void;
  disabled: boolean;
}) {
  return (
    <section className="border border-ink/20 bg-cream-surface p-6 pr-fade-up">
      <div className="flex items-start justify-between gap-5 mb-4">
        <div>
          <p className="text-[10px] font-mono uppercase text-ink/45 tracking-widest mb-1">
            02 / Proof project
          </p>
          <h2 className="text-xl font-semibold tracking-tight">
            {project ? project.name : "Close the most important evidence gap"}
          </h2>
          {project && <p className="text-sm italic text-ink/70 mt-1">{project.tagline}</p>}
        </div>
        <button
          onClick={onGenerate}
          disabled={disabled || loading}
          className="shrink-0 bg-ink text-cream-base px-4 py-2 text-xs font-medium hover:bg-accent transition-colors disabled:bg-ink/20"
        >
          {loading ? "Generating..." : project ? "Regenerate" : "Generate brief"}
        </button>
      </div>
      {disabled && !loading && (
        <p className="text-xs text-ink/55">
          The proof brief unlocks after the agent completes the fit report.
        </p>
      )}
      {error && <AgentError error={error} />}
      {project && <ProofProjectView project={project} />}
    </section>
  );
}

function ProofProjectView({ project }: { project: ProofProject }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs mt-6">
      <MetaLine label="Problem" value={project.problem} />
      <MetaLine label="User" value={project.user} />
      <MetaLine label="Build time" value={project.buildTime} />
      <MetaLine label="Tech" value={project.techStack.join(" / ")} mono />
      <div className="md:col-span-2">
        <p className="text-[10px] font-mono uppercase text-ink/40 tracking-widest mb-2">
          Feature list
        </p>
        <ul className="space-y-1">
          {project.features.map((feature) => (
            <li key={feature}>
              <span className="text-accent mr-2">+</span>
              {feature}
            </li>
          ))}
        </ul>
      </div>
      <div className="md:col-span-2">
        <p className="text-[10px] font-mono uppercase text-ink/40 tracking-widest mb-2">
          Demo flow
        </p>
        <ol className="space-y-1 list-decimal list-inside">
          {project.demoFlow.map((step) => (
            <li key={step} className="marker:text-ink/30">
              {step}
            </li>
          ))}
        </ol>
      </div>
      <CopyBlock label="README pitch" text={project.readmePitch} />
      <CopyBlock label="Resume bullet" text={project.resumeBullet} />
      <div className="md:col-span-2">
        <CopyBlock label="Launch post" text={project.launchTweet} />
      </div>
    </div>
  );
}

function MetaLine({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase text-ink/40 tracking-widest mb-1">{label}</p>
      <p className={`text-xs text-ink/80 leading-relaxed ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

const APP_KINDS = [
  { key: "x_dm", label: "X DM" },
  { key: "linkedin_dm", label: "LinkedIn DM" },
  { key: "email_note", label: "Cold email" },
  { key: "why_fit", label: "Why fit?" },
  { key: "what_shipped", label: "What shipped?" },
] as const;

type ApplicationKind = (typeof APP_KINDS)[number]["key"];

function ApplicationWriter({ job, profile }: { job: Job; profile: Profile }) {
  const [kind, setKind] = useState<ApplicationKind>("x_dm");
  const [drafts, setDrafts] = useState<Record<string, ApplicationDraft>>({});
  const [minimized, setMinimized] = useState<Partial<Record<ApplicationKind, boolean>>>({});
  const [copied, setCopied] = useState(false);
  const createDraft = useServerFn(generateApplication);
  const mutation = useMutation({
    mutationFn: (nextKind: ApplicationKind) =>
      createDraft({ data: { jobId: job.id, kind: nextKind, profile } }),
    onSuccess: (result, nextKind) => setDrafts((current) => ({ ...current, [nextKind]: result })),
  });
  const draft = drafts[kind];
  const isMinimized = minimized[kind] || false;
  const activeLabel = APP_KINDS.find((option) => option.key === kind)?.label || "Draft";
  const toggleMinimized = () => setMinimized((current) => ({ ...current, [kind]: !current[kind] }));

  return (
    <section className="lg:sticky lg:top-20 border border-border-dim bg-cream-base p-6 pr-fade-up">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[10px] font-mono uppercase text-ink/40 tracking-widest">
          03 / Application writer
        </p>
        <button
          type="button"
          onClick={toggleMinimized}
          aria-label={isMinimized ? `Expand ${activeLabel} draft` : `Minimize ${activeLabel} draft`}
          title={isMinimized ? `Expand ${activeLabel} draft` : `Minimize ${activeLabel} draft`}
          className="grid size-7 place-items-center border border-border-dim text-ink/55 hover:border-ink hover:text-ink transition-colors"
        >
          {isMinimized ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </button>
      </div>
      <div className="flex flex-wrap gap-1 mb-4">
        {APP_KINDS.map((option) => (
          <button
            key={option.key}
            onClick={() => {
              setKind(option.key);
              setCopied(false);
            }}
            className={
              kind === option.key
                ? "px-2.5 py-1 bg-ink text-cream-base text-[11px] font-medium inline-flex items-center gap-1.5"
                : "px-2.5 py-1 border border-border-dim text-[11px] hover:border-ink transition-colors inline-flex items-center gap-1.5"
            }
          >
            {option.label}
            {drafts[option.key] && (
              <span
                aria-label="Draft generated"
                className={
                  kind === option.key
                    ? "size-1 rounded-full bg-accent"
                    : "size-1 rounded-full bg-ink/40"
                }
              />
            )}
          </button>
        ))}
      </div>
      {isMinimized ? (
        <button
          type="button"
          onClick={toggleMinimized}
          aria-expanded="false"
          className="w-full border border-border-dim bg-cream-surface px-3 py-2.5 text-left text-xs text-ink/60 hover:border-ink hover:text-ink transition-colors flex items-center justify-between gap-3"
        >
          <span className="truncate">
            {draft
              ? `${activeLabel}: ${draft.text.replace(/\s+/g, " ")}`
              : `${activeLabel} draft minimized`}
          </span>
          <span className="shrink-0 font-mono text-[10px] uppercase text-ink/40">Expand</span>
        </button>
      ) : (
        <>
          <div className="min-h-[220px] bg-cream-surface border border-border-dim p-4 text-sm leading-relaxed whitespace-pre-wrap">
            {mutation.isPending
              ? "Reading the live role and your profile evidence..."
              : draft?.text || "Choose a format and generate a grounded draft."}
          </div>
          {draft && (
            <div className="mt-3 border border-border-dim bg-cream-surface/60 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span
                  className={
                    draft.decision === "draft"
                      ? "text-[10px] font-mono uppercase tracking-widest text-accent"
                      : "text-[10px] font-mono uppercase tracking-widest text-ink/50"
                  }
                >
                  {draft.decision === "draft" ? "Evidence-grounded draft" : "Not recommended"}
                </span>
                {draft.subject && (
                  <span className="text-[11px] text-ink/55">Subject: {draft.subject}</span>
                )}
              </div>
              <DraftEvidence label="Profile evidence used" items={draft.profileEvidence} />
              <DraftEvidence label="Role requirements used" items={draft.roleRequirements} />
            </div>
          )}
          {mutation.error && <AgentError error={mutation.error} />}
          <div className="mt-3 flex justify-between items-center gap-3">
            <button
              onClick={() => mutation.mutate(kind)}
              disabled={mutation.isPending}
              className="bg-ink text-cream-base px-3 py-1.5 text-[11px] font-medium hover:bg-accent disabled:bg-ink/20 transition-colors"
            >
              {draft ? "Regenerate" : "Generate draft"}
            </button>
            <button
              onClick={() => {
                if (!draft || draft.decision !== "draft") return;
                const copyText = draft.subject
                  ? `Subject: ${draft.subject}\n\n${draft.text}`
                  : draft.text;
                navigator.clipboard.writeText(copyText);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1400);
              }}
              disabled={!draft || draft.decision !== "draft"}
              className="text-[11px] font-mono uppercase text-ink/55 hover:text-accent disabled:text-ink/25"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-4 text-[10px] font-mono text-ink/30 leading-relaxed">
            Uses the live role description and only facts in your saved profile. Unrelated roles are
            flagged instead of receiving a generic message.
          </p>
        </>
      )}
    </section>
  );
}

function DraftEvidence({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-ink/40 mb-1.5">{label}</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item} className="text-[11px] text-ink/65 leading-relaxed">
            <span className="text-accent mr-1.5">+</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-mono uppercase text-ink/40 tracking-widest">{label}</p>
        <button
          onClick={() => {
            navigator.clipboard.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          }}
          className="text-[10px] font-mono uppercase text-ink/40 hover:text-accent"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="text-xs bg-cream-base border border-border-dim p-3 leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}

function AgentError({ error }: { error: Error }) {
  return (
    <p className="mt-4 border-l-2 border-accent pl-3 text-xs text-ink/65 leading-relaxed">
      {error.message}
    </p>
  );
}
