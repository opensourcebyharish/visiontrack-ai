import { useCallback, useEffect, useState } from "react";
import { Download, Filter, RefreshCw, X } from "lucide-react";
import { api } from "../services/api";
import type { EventListResponse, Session } from "../types";
import { formatDateTime } from "../utils/format";

interface EventTableProps {
  sessions?: Session[];
  fixedSessionId?: string;
  pageSize?: number;
}

const control =
  "rounded-lg border border-base-700/60 bg-space-800/70 px-2 py-1.5 text-xs text-ink-primary transition-colors focus:border-cyan/50 focus:outline-none focus:ring-2 focus:ring-cyan/20";

// Highlight a control when it carries an active (non-default) filter value.
const activeFilterClass = "!border-cyan/50 ring-1 ring-cyan/25";

export function EventTable({ sessions = [], fixedSessionId, pageSize = 25 }: EventTableProps) {
  const [data, setData] = useState<EventListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<string[]>([]);

  const [sessionId, setSessionId] = useState(fixedSessionId ?? "");
  const [className, setClassName] = useState("");
  const [minConfidence, setMinConfidence] = useState("");
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.events({
        session_id: sessionId,
        class_name: className,
        min_confidence: minConfidence,
        limit: pageSize,
        offset: page * pageSize,
      });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [sessionId, className, minConfidence, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api
      .eventClasses()
      .then((result) => setClasses(result.classes))
      .catch(() => setClasses([]));
  }, [data]);

  useEffect(() => {
    setSessionId(fixedSessionId ?? "");
  }, [fixedSessionId]);

  const exportParams: Record<string, string> = {};
  if (sessionId) exportParams.session_id = sessionId;
  if (className) exportParams.class_name = className;
  if (minConfidence) exportParams.min_confidence = minConfidence;

  const total = data?.total ?? 0;
  const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);

  // In fixed-session mode the session filter comes from the parent and is not
  // user-settable here, so "clear" only resets the class/confidence filters.
  const filtersActive = fixedSessionId
    ? Boolean(className || minConfidence)
    : Boolean(sessionId || className || minConfidence);

  const clearFilters = () => {
    if (!fixedSessionId) setSessionId("");
    setClassName("");
    setMinConfidence("");
    setPage(0);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {!fixedSessionId && (
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-secondary">Session</label>
            <select
              value={sessionId}
              onChange={(event) => {
                setSessionId(event.target.value);
                setPage(0);
              }}
              className={`${control} ${sessionId ? activeFilterClass : ""}`}
            >
              <option value="">All sessions</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-secondary">Class</label>
          <select
            value={className}
            onChange={(event) => {
              setClassName(event.target.value);
              setPage(0);
            }}
            className={`${control} ${className ? activeFilterClass : ""}`}
          >
            <option value="">All classes</option>
            {classes.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-secondary">
            Min confidence
          </label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={minConfidence}
            onChange={(event) => {
              setMinConfidence(event.target.value);
              setPage(0);
            }}
            placeholder="0.0"
            className={`w-24 ${control} ${minConfidence ? activeFilterClass : ""}`}
          />
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-base-700/60 bg-space-800/40 px-3 py-1.5 text-xs text-ink-secondary transition-colors hover:bg-white/5 hover:text-ink-primary"
        >
          <RefreshCw size={14} /> Refresh
        </button>
        <a
          href={api.eventsExportUrl(exportParams)}
          className="inline-flex items-center gap-2 rounded-lg border border-cyan/30 bg-cyan-dim px-3 py-1.5 text-xs text-cyan-soft transition-colors hover:bg-cyan/10"
        >
          <Download size={14} /> Export CSV
        </a>
        {filtersActive && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-2 rounded-lg border border-cyan/30 bg-cyan-dim px-3 py-1.5 text-xs text-cyan-soft transition-colors hover:bg-cyan/10"
          >
            <X size={14} /> Clear filters
          </button>
        )}
        <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
          <Filter size={13} className={filtersActive ? "text-cyan-soft" : ""} /> {total} event(s)
        </span>
      </div>

      {error && (
        <p className="rounded-lg border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-base-700/60">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="bg-space-800/50 text-ink-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Class</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 text-right font-medium">Conf</th>
              <th className="px-3 py-2 text-right font-medium">Track</th>
              <th className="px-3 py-2 text-right font-medium">Frame</th>
              <th className="px-3 py-2 font-medium">BBox</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-ink-muted">
                  Loading events…
                </td>
              </tr>
            )}
            {!loading && (data?.items.length ?? 0) === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-ink-muted">
                  No events recorded yet. Process a video or start a live capture.
                </td>
              </tr>
            )}
            {!loading &&
              data?.items.map((event) => (
                <tr key={event.id} className="border-t border-base-700/40">
                  <td className="whitespace-nowrap px-3 py-2 text-ink-muted">
                    {formatDateTime(event.created_at)}
                  </td>
                  <td className="px-3 py-2 text-ink-primary">{event.class_name ?? "—"}</td>
                  <td className="px-3 py-2 text-ink-muted">
                    {event.event_type === "line_cross" ? "line cross" : "detection"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-ink-secondary">
                    {event.confidence !== null ? event.confidence.toFixed(2) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-ink-secondary">
                    {event.track_id ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-ink-secondary">
                    {event.frame_index ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-ink-muted">
                    {event.x1 !== null
                      ? `${Math.round(event.x1)},${Math.round(event.y1 ?? 0)} → ${Math.round(
                          event.x2 ?? 0,
                        )},${Math.round(event.y2 ?? 0)}`
                      : "—"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 text-xs text-ink-secondary">
        <button
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          aria-label="Previous page"
          className="rounded-md border border-base-700/60 px-2 py-1 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Prev
        </button>
        <span>
          Page {page + 1} / {maxPage + 1}
        </span>
        <button
          disabled={page >= maxPage}
          onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
          aria-label="Next page"
          className="rounded-md border border-base-700/60 px-2 py-1 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}