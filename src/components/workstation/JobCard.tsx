import { Link } from "@tanstack/react-router";
import type { ShortlistSignal } from "@/lib/shortlist.functions";
import type { Job } from "@/lib/speedrun.functions";

interface Props {
  job: Job;
  signal?: ShortlistSignal;
  loading?: boolean;
  index: number;
}

export function JobCard({ job, signal, loading, index }: Props) {
  return (
    <article
      className="bg-cream-base p-6 hover:bg-cream-surface transition-colors group pr-fade-up"
      style={{ animationDelay: `${index * 35}ms` }}
    >
      <div className="flex justify-between items-start mb-4 gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[10px] font-mono text-accent uppercase tracking-wider">
              {job.scope} / {job.location}
            </span>
            {job.stealth && (
              <span className="text-[10px] font-mono uppercase text-ink/40 tracking-wider">
                STEALTH
              </span>
            )}
          </div>
          <h3 className="text-lg font-medium tracking-tight leading-tight">{job.title}</h3>
          <p className="text-sm text-ink/60 mt-0.5">
            <span className={job.stealth ? "italic" : ""}>{job.company}</span>
            <span className="text-ink/30"> / </span>
            {job.workplaceType || (job.remote ? "Remote" : "Workplace not listed")}
            {job.seniority ? ` / ${job.seniority}` : ""}
          </p>
        </div>
        <div className="text-right shrink-0">
          {loading ? (
            <div className="w-16 h-8 bg-ink/5 animate-pulse" />
          ) : signal ? (
            <>
              <div className="text-2xl font-mono tracking-tighter tabular">{signal.score}</div>
              <div className="text-[9px] font-mono uppercase text-ink/40">Discovery match</div>
            </>
          ) : (
            <div className="text-[10px] font-mono uppercase text-ink/30">Unranked</div>
          )}
        </div>
      </div>

      {signal && (
        <div className="py-3 border-y border-border-dim/70">
          <div className="flex items-center gap-3">
            <SignalPill label={signal.label} />
            <p className="text-[11px] text-ink/70 leading-snug line-clamp-2">
              {signal.reasons.join(" / ")}
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-between items-center gap-4 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          <span className="px-2 py-0.5 border border-border-dim text-[10px] font-mono">
            {job.compensation}
          </span>
          <span className="px-2 py-0.5 border border-border-dim text-[10px] font-mono">
            {job.function}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={job.canonicalUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-mono text-ink/50 hover:text-ink underline underline-offset-2"
          >
            listing -&gt;
          </a>
          <Link
            to="/role/$id"
            params={{ id: job.id }}
            className="bg-ink text-cream-base px-4 py-2 text-xs font-medium hover:bg-accent transition-colors"
          >
            Open evidence report -&gt;
          </Link>
        </div>
      </div>
    </article>
  );
}

function SignalPill({ label }: { label: ShortlistSignal["label"] }) {
  const classes =
    label === "Strong signal"
      ? "border-accent text-accent bg-accent/5"
      : label === "Worth a look"
        ? "border-ink text-ink bg-cream-surface"
        : "border-ink/20 text-ink/40 bg-transparent";
  return (
    <span
      className={`shrink-0 px-2 py-0.5 border text-[10px] font-mono uppercase tracking-wider ${classes}`}
    >
      {label}
    </span>
  );
}
