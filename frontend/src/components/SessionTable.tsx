import { Download, ExternalLink, Square, Trash2 } from "lucide-react";
import type { Session } from "../types";
import { api } from "../services/api";
import { formatDateTime, formatDecimal, formatNumber } from "../utils/format";

interface SessionTableProps {
  sessions: Session[];
  onStop?: (id: string) => void;
  onDelete?: (id: string) => void;
  onSelect?: (id: string) => void;
  loading?: boolean;
  emptyMessage?: string;
}

const actionBtn =
  "rounded-md border border-base-700/60 bg-space-800/40 p-1.5 text-ink-secondary transition-colors hover:border-cyan/40 hover:bg-cyan-dim/30 hover:text-cyan-soft";

function statusBadge(status: string): string {
  switch (status) {
    case "running":
      return "border-accent-green/40 bg-accent-green/10 text-accent-green";
    case "queued":
    case "created":
      return "border-accent-amber/40 bg-accent-amber/10 text-accent-amber";
    case "completed":
      return "border-cyan/40 bg-cyan-dim text-cyan-soft";
    case "failed":
      return "border-accent-red/40 bg-accent-red/10 text-accent-red";
    default:
      return "border-base-700/60 bg-space-800/60 text-ink-muted";
  }
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
    return <p className="py-6 text-center text-sm text-ink-muted">Loading sessions…</p>;
  }
  if (sessions.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead>
          <tr className="border-b border-base-700/60 text-[11px] uppercase tracking-wider text-ink-muted">
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
              <tr key={session.id} className="border-b border-base-700/40 transition-colors hover:bg-base-700/20">
                <td className="max-w-[220px] truncate px-3 py-2 text-ink-primary">
                  <button
                    onClick={() => onSelect?.(session.id)}
                    className="truncate text-left transition-colors hover:text-cyan-soft"
                    title={session.name}
                  >
                    {session.name}
                  </button>
                </td>
                <td className="px-3 py-2 capitalize text-ink-muted">{session.source_type}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${statusBadge(
                      session.status,
                    )}`}
                  >
                    {session.status}
                    {session.status === "running" && session.progress > 0 && (
                      <span className="font-normal text-ink-muted">
                        {Math.round(session.progress * 100)}%
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-ink-secondary">
                  {formatNumber(session.processed_frames)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-ink-secondary">
                  {formatNumber(session.unique_tracks)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-ink-secondary">
                  {formatNumber(session.event_count)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-ink-secondary">
                  {formatDecimal(session.avg_fps, 1)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-ink-muted">
                  {formatDateTime(session.created_at)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    {isActive && onStop && (
                      <button
                        onClick={() => onStop(session.id)}
                        title="Stop"
                        aria-label={`Stop session ${session.name}`}
                        className={actionBtn}
                      >
                        <Square size={14} />
                      </button>
                    )}
                    {session.output_available && (
                      <a
                        href={api.downloadUrl(session.id)}
                        title="Download annotated video"
                        aria-label={`Download annotated video for ${session.name}`}
                        className={actionBtn}
                      >
                        <Download size={14} />
                      </a>
                    )}
                    {onSelect && (
                      <button
                        onClick={() => onSelect(session.id)}
                        title="View details"
                        aria-label={`View details for ${session.name}`}
                        className={actionBtn}
                      >
                        <ExternalLink size={14} />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(session.id)}
                        title="Delete session"
                        aria-label={`Delete session ${session.name}`}
                        className={`${actionBtn} text-accent-red hover:border-accent-red/40 hover:bg-accent-red/10 hover:text-accent-red`}
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