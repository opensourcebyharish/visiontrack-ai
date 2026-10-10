import {
  Activity,
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
import { formatDecimal, formatNumber } from "../utils/format";

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

  return (
    <div className="space-y-5">
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
          accent="red"
          hint="Per frame"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Live annotated feed</h2>
            <StatusIndicator
              tone={active ? "green" : "slate"}
              label={active ? `${active.name} · ${active.source_type}` : "No active session"}
              pulse={!!active}
            />
          </div>
          <LiveVideoPanel
            sessionId={active?.id ?? null}
            active={!!active}
            status={active?.status}
            message={active?.message}
          />
        </div>

        <Card title="Current detections" subtitle={active ? "Live frame detections" : "Start a session to populate"}>
          {live.data ? (
            <DetectionOverlay detections={live.data.detections} />
          ) : (
            <p className="rounded-lg border border-dashed border-base-700 px-3 py-6 text-center text-xs text-slate-500">
              No live session. Use <span className="text-accent-soft">Live Detection</span> to
              start a webcam, or process a video under{" "}
              <span className="text-accent-soft">Video Analysis</span>.
            </p>
          )}
          {live.data && Object.keys(live.data.class_counts).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(live.data.class_counts).map(([name, count]) => (
                <span
                  key={name}
                  className="rounded-full border border-base-700 bg-base-800 px-2 py-0.5 text-[11px] text-slate-300"
                >
                  {name}: <span className="font-mono text-accent-soft">{count}</span>
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Recent sessions"
        subtitle="Latest captures and video analyses"
        actions={<Activity size={15} className="text-slate-500" />}
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
