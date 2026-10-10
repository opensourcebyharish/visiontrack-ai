import {
  Activity,
  AlertCircle,
  Boxes,
  Clock,
  Gauge,
  Hash,
  Layers,
} from "lucide-react";
import { Card } from "../components/Card";
import { DetectionOverlay } from "../components/DetectionOverlay";
import { LiveVideoPanel } from "../components/LiveVideoPanel";
import { MetricCard } from "../components/MetricCard";
import { SessionTable } from "../components/SessionTable";
import { StatusIndicator } from "../components/StatusIndicator";
import { usePolling } from "../hooks/useApi";
import { api } from "../services/api";
import { formatDecimal, formatDuration, formatNumber } from "../utils/format";

export function Overview() {
  const sessions = usePolling(() => api.sessions({ limit: 8 }), 4000);
  const active =
    sessions.data?.items.find((item) => item.status === "running") ?? null;
  const live = usePolling(
    () => (active ? api.liveMetrics(active.id) : Promise.resolve(null)),
    1000,
    !!active,
  );
  const summary = usePolling(() => api.analyticsSummary(), 5000);

  const fps = live.data?.fps ?? active?.avg_fps ?? summary.data?.avg_fps ?? null;
  const inference =
    live.data?.inference_ms ??
    active?.avg_inference_ms ??
    summary.data?.avg_inference_ms ??
    null;
  const objects = live.data?.object_count;
  const uniqueTracks = live.data?.unique_tracks ?? summary.data?.total_unique_tracks ?? 0;

  const summaryRows = [
    { label: "Processed frames", value: formatNumber(summary.data?.total_processed_frames) },
    { label: "Unique tracks", value: formatNumber(summary.data?.total_unique_tracks) },
    { label: "Video processed", value: formatDuration(summary.data?.total_video_seconds) },
    { label: "Distinct classes", value: formatNumber(summary.data?.unique_classes) },
    { label: "Avg FPS", value: formatDecimal(summary.data?.avg_fps, 1) },
    {
      label: "Avg inference",
      value:
        summary.data?.avg_inference_ms != null
          ? `${formatDecimal(summary.data.avg_inference_ms, 0)} ms`
          : "—",
    },
  ];

  const backendDown =
    !sessions.data && !!sessions.error && !summary.data && !!summary.error;

  return (
    <div className="space-y-5">
      {backendDown && (
        <p
          role="status"
          className="inline-flex items-center gap-2 rounded-lg border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-sm text-accent-red"
        >
          <AlertCircle size={15} />
          Backend unreachable — metrics refresh automatically when it reconnects.
        </p>
      )}

      {/* Page lead */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-soft/80">
            Real-time vision intelligence
          </p>
          <h2 className="mt-1 text-xl font-semibold text-ink-primary">Detection overview</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Live object detection, tracking and counting — refreshed in real time from the local
            inference engine.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusIndicator
            tone={active ? "green" : "slate"}
            label={active ? "Live session" : "No active session"}
            pulse={!!active}
          />
          <StatusIndicator
            tone="blue"
            label={`${formatNumber(summary.data?.total_sessions)} session(s)`}
          />
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Current FPS"
          value={fps !== null ? formatDecimal(fps, 1) : "—"}
          unit="fps"
          icon={Gauge}
          accent="green"
          hint={active ? "Live capture" : "Session average"}
        />
        <MetricCard
          label="Objects in frame"
          value={objects !== undefined ? formatNumber(objects) : "—"}
          icon={Boxes}
          accent="blue"
          hint={active ? "Current frame" : "No active session"}
        />
        <MetricCard
          label="Unique tracked"
          value={formatNumber(uniqueTracks)}
          icon={Hash}
          accent="violet"
          hint={active ? "This session" : "All sessions"}
        />
        <MetricCard
          label="Detection events"
          value={formatNumber(summary.data?.total_events ?? 0)}
          icon={Layers}
          accent="amber"
          hint="Sampled rows in database"
        />
        <MetricCard
          label="Inference latency"
          value={inference !== null ? formatDecimal(inference, 0) : "—"}
          unit="ms"
          icon={Clock}
          accent="amber"
          hint="Per frame"
        />
      </div>

      {/* Live monitoring */}
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink-secondary">Live annotated feed</h3>
            {active && (
              <span className="truncate font-mono text-[11px] text-ink-muted">
                {active.name} · {active.source_type}
              </span>
            )}
          </div>
          <LiveVideoPanel
            sessionId={active?.id ?? null}
            active={!!active}
            status={active?.status}
            message={active?.message}
          />
        </div>

        <Card
          title="Current detections"
          subtitle={active ? "Live frame detections" : "Start a session to populate"}
        >
          {live.data ? (
            <DetectionOverlay detections={live.data.detections} />
          ) : (
            <p className="rounded-lg border border-dashed border-base-700/60 px-3 py-6 text-center text-xs text-ink-muted">
              No live session. Use <span className="text-cyan-soft">Live Detection</span> to start
              a webcam, or process a video under{" "}
              <span className="text-cyan-soft">Video Analysis</span>.
            </p>
          )}
          {live.data && Object.keys(live.data.class_counts).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(live.data.class_counts).map(([name, count]) => (
                <span
                  key={name}
                  className="rounded-full border border-base-700/60 bg-space-800/70 px-2 py-0.5 text-[11px] text-ink-secondary"
                >
                  {name}: <span className="font-mono text-cyan-soft">{count}</span>
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Processing summary */}
      <Card title="Processing summary" subtitle="Across all stored sessions">
        {summary.loading && !summary.data ? (
          <p className="py-4 text-sm text-ink-muted">Loading summary…</p>
        ) : (
          <dl className="space-y-2.5">
            {summaryRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3">
                <dt className="text-xs text-ink-muted">{row.label}</dt>
                <dd className="font-mono text-sm tabular-nums text-ink-primary">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      {/* Recent sessions */}
      <Card
        title="Recent sessions"
        subtitle="Latest captures and video analyses"
        actions={<Activity size={15} className="text-cyan-soft/70" />}
      >
        <SessionTable
          sessions={sessions.data?.items ?? []}
          loading={sessions.loading}
          emptyMessage="No sessions yet. Start a live capture or upload a video."
        />
      </Card>
    </div>
  );
}