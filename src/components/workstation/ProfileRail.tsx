import { useRef, useState } from "react";
import { TARGET_ROLES, type Profile, type TargetRole } from "@/lib/profile";
import { extractPdfText } from "@/lib/pdf-extract";

interface Props {
  profile: Profile;
  onChange: (patch: Partial<Profile>) => void;
  ready: boolean;
  onScan: () => void;
  scanning: boolean;
  scanStage?: "scanning" | null;
}

export function ProfileRail({ profile, onChange, ready, onScan, scanning, scanStage }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pdfState, setPdfState] = useState<{
    name?: string;
    status: "idle" | "parsing" | "error";
    error?: string;
  }>({ status: "idle" });

  const handlePdf = async (file: File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setPdfState({ status: "error", error: "Not a PDF file" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPdfState({ status: "error", error: "Max 10MB" });
      return;
    }
    setPdfState({ status: "parsing", name: file.name });
    try {
      const text = await extractPdfText(file);
      const merged = profile.resumeText.trim() ? profile.resumeText.trim() + "\n\n" + text : text;
      onChange({ resumeText: merged });
      setPdfState({ status: "idle", name: file.name });
    } catch (error: unknown) {
      setPdfState({
        status: "error",
        error: error instanceof Error ? error.message : "Failed to parse PDF",
      });
    }
  };

  const toggleRole = (r: TargetRole) => {
    const has = profile.targetRoles.includes(r);
    onChange({
      targetRoles: has ? profile.targetRoles.filter((x) => x !== r) : [...profile.targetRoles, r],
    });
  };

  const coverage = computeCoverage(profile);

  return (
    <aside className="col-span-12 lg:col-span-4 border-r border-border-dim p-8 space-y-10 bg-cream-base">
      <section>
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-ink/40 mb-6">
          01 / Builder Profile
        </h2>
        <div className="space-y-5">
          <Field
            label="Identity"
            value={profile.identity}
            placeholder="Founder / Full-stack Engineer"
            onChange={(v) => onChange({ identity: v })}
          />
          <Field
            label="GitHub"
            mono
            value={profile.githubUrl}
            placeholder="https://github.com/handle"
            onChange={(v) => onChange({ githubUrl: v })}
          />
          <Field
            label="Portfolio"
            mono
            value={profile.portfolioUrl}
            placeholder="https://you.dev"
            onChange={(v) => onChange({ portfolioUrl: v })}
          />
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-medium text-ink/60 uppercase block">Resume</label>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-[10px] font-mono uppercase tracking-wider text-ink/60 hover:text-accent transition-colors border border-border-dim px-2 py-0.5"
              >
                {pdfState.status === "parsing" ? "Parsing…" : "+ Attach PDF"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handlePdf(f);
                  e.target.value = "";
                }}
              />
            </div>
            <textarea
              value={profile.resumeText}
              onChange={(e) => onChange({ resumeText: e.target.value })}
              placeholder="Paste plaintext resume — or attach a PDF above."
              rows={5}
              className="w-full bg-cream-surface/60 border border-border-dim p-3 text-xs leading-relaxed font-mono focus:outline-none focus:border-ink transition-colors placeholder:text-ink/25 resize-none"
            />
            <div className="mt-1 text-[10px] font-mono text-ink/30 flex justify-between">
              <span>
                {pdfState.status === "error" ? (
                  <span className="text-accent">{pdfState.error}</span>
                ) : pdfState.name ? (
                  `attached: ${pdfState.name}`
                ) : (
                  "stored locally, never uploaded"
                )}
              </span>
              <span>{profile.resumeText.length} chars</span>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-ink/40 mb-4">
          Target Roles
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {TARGET_ROLES.map((r) => {
            const on = profile.targetRoles.includes(r);
            return (
              <button
                key={r}
                onClick={() => toggleRole(r)}
                className={
                  on
                    ? "px-2.5 py-1 bg-ink text-cream-base text-[11px] font-medium transition-all"
                    : "px-2.5 py-1 border border-border-dim text-[11px] hover:border-ink transition-all"
                }
              >
                {r}
              </button>
            );
          })}
        </div>
      </section>

      <section className="p-5 bg-cream-surface border border-border-dim">
        <h3 className="text-xs font-semibold mb-3">Profile Signals</h3>
        <div className="space-y-3">
          {coverage.map((c) => (
            <div key={c.label}>
              <div className="flex justify-between items-end">
                <span className="text-[11px] font-mono">{c.label}</span>
                <span className="text-[10px] font-mono text-accent">{c.detail}</span>
              </div>
              <div className="h-[3px] bg-ink/5 w-full mt-1">
                <div
                  className="h-full bg-ink transition-all duration-500"
                  style={{ width: `${c.width}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-5 text-[11px] text-ink/60 leading-relaxed">
          {ready
            ? "Profile ready. Scan the radar and we'll rank the roles you can actually win."
            : "Add a resume paste and pick target roles to unlock role scoring."}
        </p>
      </section>

      <button
        onClick={onScan}
        disabled={!ready || scanning}
        className="w-full bg-ink text-cream-base py-3 text-xs font-semibold tracking-wide uppercase hover:bg-accent transition-colors disabled:bg-ink/20 disabled:cursor-not-allowed"
      >
        {scanStage === "scanning" ? "Recruiter is checking live roles..." : "Find my best roles"}
      </button>
    </aside>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange,
  mono,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="text-[11px] font-medium text-ink/60 uppercase mb-2 block">{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={
          "w-full bg-transparent border-b border-border-dim py-2 focus:outline-none focus:border-ink transition-colors placeholder:text-ink/25 text-sm " +
          (mono ? "font-mono" : "")
        }
      />
    </div>
  );
}

function computeCoverage(p: Profile) {
  const text = p.resumeText.toLowerCase();
  const signal = (label: string, keywords: string[]) => {
    const count = keywords.filter((keyword) => text.includes(keyword)).length;
    return {
      label,
      width: count ? Math.min(100, 25 + count * 25) : 8,
      detail: count ? `${count} terms found` : "No terms found",
    };
  };

  return [
    signal("AI / Infra", ["ai", "llm", "rag", "python", "gpu", "inference"]),
    signal("Full-stack Ship", ["react", "typescript", "next", "postgres", "node"]),
    signal("Product Design", ["design", "figma", "ux", "product", "swift"]),
  ];
}
