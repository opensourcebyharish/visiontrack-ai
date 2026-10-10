import { useCallback, useEffect, useState } from "react";
import { Download, Filter, RefreshCw } from "lucide-react";
import { api } from "../services/api";
import type { EventListResponse, Session } from "../types";
import { formatDateTime } from "../utils/format";

interface EventTableProps {
  sessions?: Session[];
  fixedSessionId?: string;
  pageSize?: number;
}

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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {!fixedSessionId && (
          <div>
            <label className="mb-1 block text-xs text-slate-400">Session</label>
            <select
              value={sessionId}
              onChange={(event) => {
                setSessionId(event.target.value);
                setPage(0);
              }}
              className="rounded-lg border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-slate-200"
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
          <label className="mb-1 block text-xs text-slate-400">Class</label>
          <select
            value={className}
            onChange={(event) => {
              setClassName(event.target.value);
              setPage(0);
            }}
            className="rounded-lg border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-slate-200"
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
          <label className="mb-1 block text-xs text-slate-400">Min confidence</label>
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
            className="w-24 rounded-lg border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-slate-200"
          />
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-base-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-base-800"
        >
          <RefreshCw size={14} /> Refresh
        </button>
        <a
          href={api.eventsExportUrl(exportParams)}
          className="inline-flex items-center gap-2 rounded-lg border border-base-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-base-800"
        >
          <Download size={14} /> Export CSV
        </a>
        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
          <Filter size={13} /> {total} event(s)
        </span>
      </div>

      {error && (
        <p className="rounded-lg border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-base-700">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="bg-base-800/70 text-slate-400">
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
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  Loading events…
                </td>
              </tr>
            )}
            {!loading && (data?.items.length ?? 0) === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  No events recorded yet. Process a video or start a live capture.
                </td>
              </tr>
            )}
            {!loading &&
              data?.items.map((event) => (
                <tr key={event.id} className="border-t border-base-800">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">
                    {formatDateTime(event.created_at)}
                  </td>
                  <td className="px-3 py-2 text-slate-200">{event.class_name ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-400">
                    {event.event_type === "line_cross" ? "line cross" : "detection"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-300">
                    {event.confidence !== null ? event.confidence.toFixed(2) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-300">
                    {event.track_id ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-300">
                    {event.frame_index ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-500">
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

      <div className="flex items-center justify-end gap-2 text-xs text-slate-400">
        <button
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          className="rounded-md border border-base-700 px-2 py-1 disabled:opacity-40"
        >
          Prev
        </button>
        <span>
          Page {page + 1} / {maxPage + 1}
        </span>
        <button
          disabled={page >= maxPage}
          onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
          className="rounded-md border border-base-700 px-2 py-1 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
