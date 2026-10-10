type Tone = "green" | "amber" | "red" | "blue" | "slate" | "violet";

const toneClasses: Record<Tone, string> = {
  green: "bg-accent-green",
  amber: "bg-accent-amber",
  red: "bg-accent-red",
  blue: "bg-accent",
  slate: "bg-slate-500",
  violet: "bg-accent-violet",
};

interface StatusIndicatorProps {
  tone: Tone;
  label: string;
  pulse?: boolean;
}

export function StatusIndicator({ tone, label, pulse = false }: StatusIndicatorProps) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-base-700 bg-base-800 px-3 py-1 text-xs font-medium text-slate-300">
      <span className="relative flex h-2.5 w-2.5">
        {pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${toneClasses[tone]}`}
          />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${toneClasses[tone]}`} />
      </span>
      {label}
    </span>
  );
}
