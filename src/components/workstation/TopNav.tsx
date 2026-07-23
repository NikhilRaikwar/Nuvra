import { Link } from "@tanstack/react-router";

export function TopNav({ current }: { current: "radar" | "role" }) {
  return (
    <nav className="h-14 border-b border-border-dim flex items-center justify-between px-4 sm:px-6 bg-cream-base/90 backdrop-blur-sm sticky top-0 z-50">
      <div className="flex items-center gap-4 sm:gap-6 min-w-0">
        <Link to="/" className="flex items-center gap-2 group shrink-0">
          <img src="/favicon.svg" alt="" className="w-5 h-5" />
          <span className="font-mono font-semibold tracking-tight text-sm">NUVRA</span>
        </Link>
        <div className="h-4 w-px bg-border-dim hidden sm:block" />
        <Link
          to="/app"
          className={
            current === "radar"
              ? "text-xs font-medium text-ink"
              : "text-xs font-medium text-ink/40 hover:text-ink transition-colors"
          }
        >
          Live Radar
        </Link>
      </div>
      <a
        href="https://speedrun-talent-network.com/developers"
        target="_blank"
        rel="noreferrer"
        className="text-[10px] sm:text-xs font-mono text-ink/40 hover:text-ink transition-colors"
      >
        DATA: SPEEDRUN -&gt;
      </a>
    </nav>
  );
}
