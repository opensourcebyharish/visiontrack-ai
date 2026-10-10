import { useId, useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { ClassInfo } from "../types";

interface ClassFilterProps {
  classes: ClassInfo[];
  selected: number[] | null;
  onChange: (selected: number[] | null) => void;
  disabled?: boolean;
}

export function ClassFilter({ classes, selected, onChange, disabled = false }: ClassFilterProps) {
  const [query, setQuery] = useState("");
  const labelId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return classes;
    return classes.filter(
      (item) => item.name.toLowerCase().includes(q) || String(item.id) === q,
    );
  }, [classes, query]);

  const selectedSet = new Set(selected ?? []);

  const toggle = (id: number) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const arr = Array.from(next).sort((a, b) => a - b);
    onChange(arr.length ? arr : null);
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p id={labelId} className="text-xs font-medium text-ink-secondary">
          Detection classes
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(null)}
          className="text-[11px] text-cyan-soft transition-colors hover:text-cyan-soft/90 hover:underline disabled:opacity-50"
        >
          Select all
        </button>
      </div>

      <div className="relative mb-2">
        <Search size={14} className="absolute left-2 top-2.5 text-cyan-soft/50" />
        <input
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search classes"
          aria-label="Search detection classes"
          className="w-full rounded-lg border border-base-700/60 bg-space-800/70 py-1.5 pl-7 pr-2 text-xs text-ink-primary placeholder:text-ink-muted transition-colors focus:border-cyan/50 focus:outline-none focus:ring-2 focus:ring-cyan/20 disabled:opacity-50"
        />
      </div>

      <div
        role="group"
        aria-labelledby={labelId}
        className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-base-700/60 bg-space-800/40 p-2"
      >
        {filtered.length === 0 && (
          <p className="px-1 py-2 text-xs text-ink-muted">No classes match.</p>
        )}
        {filtered.map((item) => (
          <label
            key={item.id}
            className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-ink-secondary transition-colors hover:bg-white/5"
          >
            <input
              type="checkbox"
              checked={selectedSet.has(item.id)}
              disabled={disabled}
              onChange={() => toggle(item.id)}
              className="accent-cyan size-3.5"
            />
            <span className="flex-1">{item.name}</span>
            <span className="font-mono text-[10px] text-ink-muted">{item.id}</span>
          </label>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-ink-muted">
        {selected ? `${selected.length} class(es) selected` : "All classes enabled"}
      </p>
    </div>
  );
}