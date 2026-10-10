import { useMemo, useState } from "react";
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
        <label className="text-xs font-medium text-slate-300">Detection classes</label>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(null)}
          className="text-[11px] text-accent-soft hover:underline disabled:opacity-50"
        >
          Select all
        </button>
      </div>

      <div className="relative mb-2">
        <Search size={14} className="absolute left-2 top-2.5 text-slate-500" />
        <input
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search classes"
          className="w-full rounded-lg border border-base-700 bg-base-800 py-1.5 pl-7 pr-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-accent focus:outline-none disabled:opacity-50"
        />
      </div>

      <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-base-700 bg-base-800/60 p-2">
        {filtered.length === 0 && (
          <p className="px-1 py-2 text-xs text-slate-500">No classes match.</p>
        )}
        {filtered.map((item) => (
          <label
            key={item.id}
            className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-slate-300 hover:bg-base-700"
          >
            <input
              type="checkbox"
              checked={selectedSet.has(item.id)}
              disabled={disabled}
              onChange={() => toggle(item.id)}
              className="accent-accent"
            />
            <span className="flex-1">{item.name}</span>
            <span className="font-mono text-[10px] text-slate-500">{item.id}</span>
          </label>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        {selected ? `${selected.length} class(es) selected` : "All classes enabled"}
      </p>
    </div>
  );
}
