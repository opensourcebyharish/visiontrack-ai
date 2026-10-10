import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  icon: LucideIcon;
  accent?: "blue" | "green" | "amber" | "violet" | "red";
}

const accentMap = {
  blue: "text-accent bg-accent/10",
  green: "text-accent-green bg-accent-green/10",
  amber: "text-accent-amber bg-accent-amber/10",
  violet: "text-accent-violet bg-accent-violet/10",
  red: "text-accent-red bg-accent-red/10",
};

export function MetricCard({
  label,
  value,
  unit,
  hint,
  icon: Icon,
  accent = "blue",
}: MetricCardProps) {
  return (
    <div className="rounded-xl border border-base-700 bg-base-850/70 p-4">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <span className={`rounded-lg p-2 ${accentMap[accent]}`}>
          <Icon size={16} />
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="font-mono text-2xl font-semibold text-slate-50">{value}</span>
        {unit && <span className="text-xs text-slate-400">{unit}</span>}
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
