import { useState } from "react";
import { AlertCircle, Boxes, CheckCircle2, Hash, History as HistoryIcon, Layers, RefreshCw } from "lucide-react";
import { Card } from "../components/Card";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EventTable } from "../components/EventTable";
import { MetricCard } from "../components/MetricCard";
import { SessionTable } from "../components/SessionTable";
import { StatusIndicator } from "../components/StatusIndicator";
import { usePolling } from "../hooks/useApi";
import { api } from "../services/api";
import { formatNumber } from "../utils/format";

export function History() {
  const sessions = usePolling(() => api.sessions({ limit: 100 }), 5000);
  const [selected, setSelected] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const items = sessions.data?.items ?? [];
  const total = sessions.data?.total ?? 0;
  const listed = items.length;
  const completed = items.filter((item) => item.status === "completed").length;
  const processing = items.filter(
    (item) => item.status === "running" || item.status === "queued",
  ).length;
  const totalEvents = items.reduce((sum, item) => sum + item.event_count, 0);
  const totalTracks = items.reduce((sum, item) => sum + item.unique_tracks, 0);

  const hasList = !!sessions.data;
  const sessionsError = !!sessions.error && !sessions.data;

  const confirmDelete = async () => {
    const id = deleteTarget;
    setDeleteTarget(null);
    if (!id) return;
    setActionError(null);
    try {
      await api.deleteSession(id);
      if (selected === id) setSelected(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
    sessions.refresh();
  };

  return (
    <div className="space-y-5">
      {/* Page lead */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-soft/80">
            Detection &amp; session history
          </p>
          <h2 className="mt-1 text-xl font-semibold text-ink-primary">History</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Review every processing session and its recorded detections — filter, inspect and export
            the events stored in the local database.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasList ? (
            <>
              <StatusIndicator
                tone={processing > 0 ? "amber" : "slate"}
                label={
                  processing > 0
                    ? `${formatNumber(processing)} processing`
                    : "No active processing"
                }
                pulse={processing > 0}
              />
              <StatusIndicator tone="blue" label={`${formatNumber(total)} session(s)`} />
            </>
          ) : (
            <StatusIndicator
              tone={sessionsError ? "red" : "slate"}
              label={sessionsError ? "Data unavailable" : "Loading history…"}
            />
          )}
        </div>
      </div>

      {actionError && (
        <p
          role="alert"
          className="rounded-lg border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-sm text-accent-red"
        >
          Couldn&apos;t delete session: {actionError}
        </p>
      )}

      {sessionsError ? (
        <Card title="Session history">
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <AlertCircle size={40} className="text-accent-red" />
            <p className="text-sm font-medium text-ink-primary">Couldn&apos;t load session history</p>
            <p className="max-w-md text-xs text-ink-muted">{sessions.error}</p>
            <button
              onClick={() => sessions.refresh()}
              className="inline-flex items-center gap-2 rounded-lg border border-base-700/60 bg-space-800/70 px-3 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-white/5 hover:text-ink-primary"
            >
              <RefreshCw size={15} /> Retry
            </button>
          </div>
        </Card>
      ) : (
        <>
          {/* Summary from real listed session data */}
          {sessions.data ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Sessions"
                value={formatNumber(total)}
                icon={Layers}
                accent="blue"
                hint={listed < total ? `showing ${formatNumber(listed)} of ${formatNumber(total)}` : undefined}
              />
              <MetricCard
                label="Completed"
                value={formatNumber(completed)}
                icon={CheckCircle2}
                accent="green"
                hint="of listed sessions"
              />
              <MetricCard
                label="Detection events"
                value={formatNumber(totalEvents)}
                icon={Boxes}
                accent="violet"
                hint="across listed sessions"
              />
              <MetricCard
                label="Unique tracked"
                value={formatNumber(totalTracks)}
                icon={Hash}
                accent="amber"
                hint="across listed sessions"
              />
            </div>
          ) : (
            <Card title="Summary">
              <p className="py-6 text-center text-sm text-ink-muted">Loading session data…</p>
            </Card>
          )}

          <Card
            title="Session history"
            subtitle="All processing sessions with stored detection events"
            actions={<HistoryIcon size={15} className="text-cyan-soft/70" />}
          >
            <SessionTable
              sessions={items}
              loading={sessions.loading}
              onSelect={(id) => setSelected(id === selected ? null : id)}
              onStop={async (id) => {
                await api.stopSession(id);
                sessions.refresh();
              }}
              onDelete={(id) => setDeleteTarget(id)}
              emptyMessage="No sessions recorded yet."
            />
          </Card>

          <Card
            title={selected ? "Events for selected session" : "All detection events"}
            subtitle="Filter, review and export detections as CSV"
          >
            <EventTable
              sessions={items}
              fixedSessionId={selected ?? undefined}
              pageSize={20}
            />
          </Card>
        </>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete session?"
        confirmLabel="Delete"
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      >
        This permanently deletes the session, its processed video and all recorded
        detection events. This cannot be undone.
      </ConfirmDialog>
    </div>
  );
}