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
    <div className="space-y-3 mb-6">
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
    <div className="flex items-center gap-x-5 gap-y-2 flex-wrap">
      <span className="w-16 text-[10px] font-mono uppercase text-ink/40 tracking-widest">
        {label}
      </span>
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
    <button onClick={onClick} className="flex items-center gap-1.5 group">
      <span
        className={`text-xs transition-colors ${active ? "text-accent font-semibold" : "text-ink/60 group-hover:text-ink"}`}
      >
        {label}
      </span>
      <span className="text-[10px] font-mono tabular text-ink/30 group-hover:text-ink/50">
        {String(count).padStart(2, "0")}
      </span>
    </button>
  );
}
