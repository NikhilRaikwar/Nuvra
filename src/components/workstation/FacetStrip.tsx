import type { SpeedrunFacets } from "@/lib/speedrun.functions";

type ActiveFilters = {
  fn?: string;
  loc?: string;
  sen?: string;
};

interface Props {
  facets: SpeedrunFacets;
  active: ActiveFilters;
  onChange: (patch: ActiveFilters) => void;
  total: number;
}

export function FacetStrip({ facets, active, onChange, total }: Props) {
  return (
    <div className="mb-6 border-y border-border-dim">
      <FacetRow
        label="Function"
        items={facets.fn}
        active={active.fn}
        allCount={total}
        onChange={(value) => onChange({ fn: value })}
      />
      <FacetRow
        label="Seniority"
        items={facets.sen}
        active={active.sen}
        allCount={total}
        onChange={(value) => onChange({ sen: value })}
      />
      <FacetRow
        label="Location"
        items={facets.loc.slice(0, 10)}
        active={active.loc}
        allCount={total}
        onChange={(value) => onChange({ loc: value })}
      />
    </div>
  );
}

function FacetRow({
  label,
  items,
  active,
  allCount,
  onChange,
}: {
  label: string;
  items: Array<{ v: string; n: number }>;
  active?: string;
  allCount: number;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 border-b border-border-dim py-3 last:border-b-0 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:items-center sm:gap-3">
      <span className="text-[10px] font-mono uppercase text-ink/40 tracking-widest">{label}</span>
      <div className="min-w-0 overflow-x-auto pb-1 [scrollbar-width:thin]">
        <div className="flex w-max min-w-full items-center gap-1.5 pr-3">
          <FacetButton
            label="All"
            count={allCount}
            active={!active}
            onClick={() => onChange(undefined)}
          />
          {items.map((item) => (
            <FacetButton
              key={item.v}
              label={item.v}
              count={item.n}
              active={active === item.v}
              onClick={() => onChange(active === item.v ? undefined : item.v)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FacetButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 flex items-center gap-1.5 border px-2.5 py-1.5 text-left transition-colors ${
        active
          ? "border-ink bg-ink text-cream-base"
          : "border-border-dim bg-cream-base hover:border-ink"
      }`}
    >
      <span className={`text-xs transition-colors ${active ? "font-semibold" : "text-ink/65"}`}>
        {label}
      </span>
      <span
        className={`text-[10px] font-mono tabular ${active ? "text-cream-base/55" : "text-ink/35"}`}
      >
        {String(count).padStart(2, "0")}
      </span>
    </button>
  );
}
