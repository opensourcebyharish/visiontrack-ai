import { useId } from "react";

interface ConfidenceSliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label?: string;
}

export function ConfidenceSlider({
  value,
  onChange,
  disabled = false,
  label = "Confidence threshold",
}: ConfidenceSliderProps) {
  const inputId = useId();

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-xs font-medium text-ink-secondary">
          {label}
        </label>
        <span className="rounded-md bg-cyan/10 px-1.5 py-0.5 font-mono text-[11px] text-cyan-soft ring-1 ring-inset ring-cyan/20">
          {value.toFixed(2)}
        </span>
      </div>
      <input
        id={inputId}
        type="range"
        min={0.05}
        max={0.95}
        step={0.05}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-base-700/70 accent-cyan disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div className="mt-1 flex justify-between text-[10px] text-ink-muted">
        <span>0.05</span>
        <span>0.95</span>
      </div>
    </div>
  );
}