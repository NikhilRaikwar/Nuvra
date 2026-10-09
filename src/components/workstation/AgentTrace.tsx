import { useState } from "react";
import { ChevronDown, ChevronUp, Terminal } from "lucide-react";
import type { AgentTraceStep, RoleVerdict } from "@/lib/recruiter.functions";

interface Props {
  trace?: AgentTraceStep[];
  verdicts?: RoleVerdict[];
  className?: string;
}

export function AgentTrace({ trace, verdicts, className = "" }: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  if (!trace || trace.length === 0) {
    return null;
  }

  return (
    <div
      className={`border border-border-dim bg-cream-surface text-xs text-ink/80 transition-all ${className}`}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-cream-base/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-accent" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-accent font-semibold">
            Agent Verification Trace
          </span>
          <span className="px-1.5 py-0.2 border border-border-dim text-[10px] font-mono text-ink/50 bg-cream-base">
            {trace.length} {trace.length === 1 ? "tool call" : "tool calls"}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[10px] font-mono text-ink/50">
          <span>{isOpen ? "Collapse trace" : "Expand trace"}</span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border-dim p-3 space-y-2.5">
          <p className="text-[11px] text-ink/60 leading-relaxed font-sans">
            The recruiter agent adaptively inspected job descriptions and verified candidate
            evidence before formulating role-specific verdicts:
          </p>

          <div className="space-y-2">
            {trace.map((step, index) => {
              const isExpanded = expandedStep === index;
              return (
                <div
                  key={index}
                  className="p-2.5 border border-border-dim/70 bg-cream-base text-[11px] font-mono rounded-none"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] text-ink/40 font-mono">
                        {(index + 1).toString().padStart(2, "0")}
                      </span>
                      <span className="px-1.5 py-0.5 border border-accent/40 text-[10px] font-mono text-accent bg-accent/5 font-medium">
                        {step.tool}
                      </span>
                      <span className="text-ink/65 break-all line-clamp-1 max-w-md">
                        {step.argsSummary}
                      </span>
                    </div>
                    {step.resultSummary && step.resultSummary.length > 80 && (
                      <button
                        type="button"
                        onClick={() => setExpandedStep(isExpanded ? null : index)}
                        className="text-[9px] text-ink/50 hover:text-accent underline underline-offset-2 shrink-0 font-mono"
                      >
                        {isExpanded ? "Show less" : "Full result"}
                      </button>
                    )}
                  </div>

                  <div className="text-[10px] text-ink/55 bg-cream-surface/80 p-2 border border-border-dim/40 leading-relaxed break-words whitespace-pre-wrap">
                    {isExpanded ? step.resultSummary : step.resultSummary.slice(0, 160)}
                    {!isExpanded && step.resultSummary.length > 160 && "..."}
                  </div>
                </div>
              );
            })}
          </div>

          {verdicts && verdicts.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border-dim space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-widest text-ink/40 mb-1">
                Agent Verdicts Summary
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {verdicts.map((v) => (
                  <div
                    key={v.jobId}
                    className="p-2 border border-border-dim/60 bg-cream-base/50 text-[10px]"
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span
                        className={`px-1 py-0.2 border text-[9px] font-mono uppercase ${
                          v.verdict === "Strong"
                            ? "border-accent text-accent bg-accent/5"
                            : v.verdict === "Worth a look"
                              ? "border-ink text-ink bg-cream-surface"
                              : "border-ink/20 text-ink/40"
                        }`}
                      >
                        {v.verdict}
                      </span>
                      <span className="font-mono text-ink/40 truncate">{v.jobId}</span>
                    </div>
                    <p className="text-[10px] text-ink/70 line-clamp-2">{v.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
