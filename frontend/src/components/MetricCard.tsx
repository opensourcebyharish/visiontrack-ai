import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  icon: LucideIcon;
  accent?: "blue" | "green" | "amber" | "violet" | "red";
}

const accentMap: Record<
  NonNullable<MetricCardProps["accent"]>,
  { chip: string; line: string }
> = {
  blue: {
    chip: "bg-accent/10 text-accent ring-accent/25",
    line: "via-accent/60",
  },
  green: {
    chip: "bg-accent-green/10 text-accent-green ring-accent-green/25",
    line: "via-accent-green/60",
  },
  amber: {
    chip: "bg-accent-amber/10 text-accent-amber ring-accent-amber/25",
    line: "via-accent-amber/60",
  },
  violet: {
    chip: "bg-accent-violet/10 text-accent-violet ring-accent-violet/25",
    line: "via-accent-violet/60",
  },
  red: {
    chip: "bg-accent-red/10 text-accent-red ring-accent-red/25",
    line: "via-accent-red/60",
  },
};

export function MetricCard({
  label,
  value,
  unit,
  hint,
  icon: Icon,
  accent = "blue",
}: MetricCardProps) {
  const { chip, line } = accentMap[accent];

  return (
    <div className="panel-glass relative rounded-xl p-4 shadow-panel">
      {/* Per-accent hairline to give each metric a distinct identity. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-xl bg-gradient-to-r from-transparent ${line} to-transparent opacity-70`}
      />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">
          {label}
        </p>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset ${chip}`}>
          <Icon size={16} />
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-ink-primary">
          {value}
        </span>
        {unit && <span className="text-xs font-medium text-ink-muted">{unit}</span>}
      </div>
      {hint && <p className="mt-1.5 text-[11px] text-ink-muted/90">{hint}</p>}
    </div>
  );
}