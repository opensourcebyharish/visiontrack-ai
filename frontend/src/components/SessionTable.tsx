import { Download, ExternalLink, Square, Trash2 } from "lucide-react";
import type { Session } from "../types";
import { api } from "../services/api";
import { formatDateTime, formatDecimal, formatNumber, statusColor } from "../utils/format";

interface SessionTableProps {
  sessions: Session[];
  onStop?: (id: string) => void;
  onDelete?: (id: string) => void;
  onSelect?: (id: string) => void;
  loading?: boolean;
  emptyMessage?: string;
}

export function SessionTable({
  sessions,
  onStop,
  onDelete,
  onSelect,
  loading = false,
  emptyMessage = "No sessions yet.",
}: SessionTableProps) {
  if (loading) {
    return <p className="py-6 text-center text-sm text-slate-500">Loading sessions…</p>;
  }
  if (sessions.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead>
          <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-medium">Session</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 text-right font-medium">Frames</th>
            <th className="px-3 py-2 text-right font-medium">Unique</th>
            <th className="px-3 py-2 text-right font-medium">Events</th>
            <th className="px-3 py-2 text-right font-medium">FPS</th>
            <th className="px-3 py-2 font-medium">Created</th>
            <th className="px-3 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => {
            const isActive = session.status === "running" || session.status === "queued";
            return (
              <tr key={session.id} className="border-b border-base-800 hover:bg-base-800/50">
                <td className="max-w-[220px] truncate px-3 py-2 text-slate-200">
                  <button
                    onClick={() => onSelect?.(session.id)}
                    className="truncate text-left hover:text-accent-soft"
                    title={session.name}
                  >
                    {session.name}
                  </button>
                </td>
                <td className="px-3 py-2 capitalize text-slate-400">{session.source_type}</td>
                <td className={`px-3 py-2 font-medium capitalize ${statusColor(session.status)}`}>
                  {session.status}
                  {session.status === "running" && session.progress > 0 && (
                    <span className="ml-2 text-xs text-slate-500">
                      {Math.round(session.progress * 100)}%
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-300">
                  {formatNumber(session.processed_frames)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-300">
                  {formatNumber(session.unique_tracks)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-300">
                  {formatNumber(session.event_count)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-300">
                  {formatDecimal(session.avg_fps, 1)}
                </td>
                <td className="px-3 py-2 text-slate-400">{formatDateTime(session.created_at)}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    {isActive && onStop && (
                      <button
                        onClick={() => onStop(session.id)}
                        title="Stop"
                        className="rounded-md border border-base-700 p-1.5 text-slate-300 hover:bg-base-700"
                      >
                        <Square size={14} />
                      </button>
                    )}
                    {session.output_available && (
                      <a
                        href={api.downloadUrl(session.id)}
                        title="Download annotated video"
                        className="rounded-md border border-base-700 p-1.5 text-slate-300 hover:bg-base-700"
                      >
                        <Download size={14} />
                      </a>
                    )}
                    {onSelect && (
                      <button
                        onClick={() => onSelect(session.id)}
                        title="View details"
                        className="rounded-md border border-base-700 p-1.5 text-slate-300 hover:bg-base-700"
                      >
                        <ExternalLink size={14} />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(session.id)}
                        title="Delete session"
                        className="rounded-md border border-base-700 p-1.5 text-accent-red hover:bg-base-700"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
