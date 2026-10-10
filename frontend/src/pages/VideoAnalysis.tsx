import { useCallback, useState } from "react";
import { Download, FileVideo } from "lucide-react";
import { Card } from "../components/Card";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EventTable } from "../components/EventTable";
import { PerformanceChart } from "../components/AnalyticsCharts";
import { SessionTable } from "../components/SessionTable";
import { StatusIndicator } from "../components/StatusIndicator";
import { UploadPanel } from "../components/UploadPanel";
import { useAsync, usePolling } from "../hooks/useApi";
import { api } from "../services/api";
import type { MetricPoint, UserSettings } from "../types";
import { formatDuration, formatNumber, statusColor } from "../utils/format";

export function VideoAnalysis() {
  const settingsState = useAsync<UserSettings>(() => api.settings());
  const sessions = usePolling(() => api.sessions({ source_type: "video", limit: 15 }), 3000);
  const [selected, setSelected] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const metrics = usePolling(
    () => (selected ? api.sessionMetrics(selected) : Promise.resolve([])),
    5000,
    !!selected,
  );

  const handleFinished = useCallback(() => {
    void sessions.refresh?.();
  }, [sessions]);

  const selectedSession = sessions.data?.items.find((item) => item.id === selected) ?? null;

  const jobsLoading = sessions.loading && !sessions.data;
  const jobsTotal = sessions.data?.total ?? 0;
  const activeJobs = (sessions.data?.items ?? []).filter(
    (item) => item.status === "running" || item.status === "queued",
  ).length;

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
    sessions.refresh?.();
  };

  return (
    <div className="space-y-5">
      {/* Page lead */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-soft/80">
            Video analysis workspace
          </p>
          <h2 className="mt-1 text-xl font-semibold text-ink-primary">Video analysis</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Upload recorded footage and run the YOLO detector with ByteTrack IDs over it. Frames are
            processed incrementally, so large files are never fully loaded into memory.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {jobsLoading ? (
            <StatusIndicator tone="slate" label="Loading jobs…" />
          ) : (
            <>
              <StatusIndicator
                tone={activeJobs > 0 ? "amber" : "slate"}
                label={
                  activeJobs > 0 ? `${formatNumber(activeJobs)} job(s) processing` : "No active jobs"
                }
              />
              <StatusIndicator tone="blue" label={`${formatNumber(jobsTotal)} video job(s)`} />
            </>
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

      <Card
        title="Upload a video for analysis"
        subtitle="Frames are processed incrementally — large files are never fully loaded into memory."
      >
        {settingsState.data ? (
          <UploadPanel settings={settingsState.data} onFinished={handleFinished} />
        ) : (
          <p className="py-6 text-center text-sm text-ink-muted">Loading configuration…</p>
        )}
      </Card>

      <Card
        title="Video processing jobs"
        subtitle="Click a session to inspect its performance and detections"
        actions={<FileVideo size={15} className="text-cyan-soft/70" />}
      >
        <SessionTable
          sessions={sessions.data?.items ?? []}
          loading={sessions.loading}
          onSelect={(id) => setSelected(id)}
          onStop={async (id) => {
            await api.stopSession(id);
            sessions.refresh?.();
          }}
          onDelete={(id) => setDeleteTarget(id)}
          emptyMessage="No videos processed yet. Upload one above."
        />
      </Card>

      {selectedSession && (
        <>
          <Card
            title={`Session detail · ${selectedSession.name}`}
            subtitle={selectedSession.error ?? selectedSession.message ?? undefined}
          >
            <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <Detail
                label="Status"
                value={selectedSession.status}
                valueClassName={`capitalize ${statusColor(selectedSession.status)}`}
              />
              <Detail label="Processed frames" value={formatNumber(selectedSession.processed_frames)} />
              <Detail label="Unique tracks" value={formatNumber(selectedSession.unique_tracks)} />
              <Detail label="Events" value={formatNumber(selectedSession.event_count)} />
              <Detail
                label="Avg FPS"
                value={selectedSession.avg_fps !== null ? selectedSession.avg_fps.toFixed(1) : "—"}
              />
              <Detail
                label="Avg inference"
                value={
                  selectedSession.avg_inference_ms !== null
                    ? `${selectedSession.avg_inference_ms.toFixed(0)} ms`
                    : "—"
                }
              />
              <Detail
                label="Duration"
                value={formatDuration(Number(selectedSession.source_meta?.duration_s ?? 0))}
              />
              <Detail
                label="Resolution"
                value={
                  selectedSession.source_meta?.width
                    ? `${String(selectedSession.source_meta.width)}×${String(
                        selectedSession.source_meta.height,
                      )}`
                    : "—"
                }
              />
            </dl>

            {selectedSession.output_available && selectedSession.download_url && (
              <div className="mt-4 space-y-2">
                <video
                  controls
                  preload="metadata"
                  src={api.downloadUrl(selectedSession.id)}
                  aria-label="Annotated video preview"
                  className="w-full rounded-lg border border-base-700/60 bg-black"
                />
                <a
                  href={api.downloadUrl(selectedSession.id)}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent-green/15 px-3 py-2 text-sm font-medium text-accent-green ring-1 ring-inset ring-accent-green/30 transition-colors hover:bg-accent-green/25"
                >
                  <Download size={15} /> Download annotated video
                </a>
              </div>
            )}
          </Card>

          <Card title="Performance over frames" subtitle="FPS and inference latency samples">
            <PerformanceChart data={(metrics.data as MetricPoint[]) ?? []} />
          </Card>

          <Card title="Detections for this session">
            <EventTable fixedSessionId={selected ?? undefined} pageSize={15} />
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

function Detail({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-base-700/60 bg-space-800/40 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-ink-muted">{label}</dt>
      <dd className={`mt-0.5 font-mono text-sm ${valueClassName ?? "text-ink-primary"}`}>{value}</dd>
    </div>
  );
}