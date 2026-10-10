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
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs font-medium text-slate-300">{label}</label>
        <span className="font-mono text-xs text-accent-soft">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={0.05}
        max={0.95}
        step={0.05}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-base-700 accent-accent disabled:opacity-50"
      />
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>0.05</span>
        <span>0.95</span>
      </div>
    </div>
  );
}
