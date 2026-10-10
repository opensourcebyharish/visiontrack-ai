import { useState } from "react";
import { BarChart3, Boxes, Clock, Gauge, Hash, Layers } from "lucide-react";
import { Card } from "../components/Card";
import {
  ClassDistributionChart,
  EventsOverTimeChart,
  SessionComparisonChart,
} from "../components/AnalyticsCharts";
import { MetricCard } from "../components/MetricCard";
import { usePolling } from "../hooks/useApi";
import { api } from "../services/api";
import { formatDecimal, formatDuration, formatNumber } from "../utils/format";

export function Analytics() {
  const [bucket, setBucket] = useState<"hour" | "day">("hour");
  const summary = usePolling(() => api.analyticsSummary(), 6000);
  const classes = usePolling(() => api.analyticsClasses(15), 6000);
  const timeseries = usePolling(() => api.analyticsTimeseries(bucket), 6000);
  const sessions = usePolling(() => api.analyticsSessions(12), 6000);

  const hasData = summary.data?.has_data ?? false;

  if (!hasData && !summary.loading) {
    return (
      <Card title="Analytics">
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <BarChart3 size={40} className="text-slate-600" />
          <p className="text-sm text-slate-300">No analytics data yet</p>
          <p className="max-w-md text-xs text-slate-500">
            Process a video or start a live capture. Charts are generated from detections
            actually stored in the local SQLite database.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Sessions"
          value={formatNumber(summary.data?.total_sessions ?? 0)}
          icon={Layers}
          accent="blue"
          hint={`${summary.data?.sessions_by_status?.completed ?? 0} completed`}
        />
        <MetricCard
          label="Detection events"
          value={formatNumber(summary.data?.total_events ?? 0)}
          icon={Boxes}
          accent="violet"
          hint="Sampled detection rows"
        />
        <MetricCard
          label="Unique tracked objects"
          value={formatNumber(summary.data?.total_unique_tracks ?? 0)}
          icon={Hash}
          accent="green"
          hint="Across all sessions"
        />
        <MetricCard
          label="Processed frames"
          value={formatNumber(summary.data?.total_processed_frames ?? 0)}
          icon={BarChart3}
          accent="amber"
        />
        <MetricCard
          label="Average FPS"
          value={
            summary.data?.avg_fps != null ? formatDecimal(summary.data.avg_fps, 1) : "—"
          }
          unit="fps"
          icon={Gauge}
          accent="green"
        />
        <MetricCard
          label="Average inference"
          value={
            summary.data?.avg_inference_ms != null
              ? formatDecimal(summary.data.avg_inference_ms, 0)
              : "—"
          }
          unit="ms"
          icon={Clock}
          accent="red"
          hint={`Video time: ${formatDuration(summary.data?.total_video_seconds)}`}
        />
      </div>

      <Card
        title="Class-wise detection distribution"
        subtitle="Event counts vs unique tracked objects per class"
      >
        <ClassDistributionChart data={classes.data ?? []} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Detection events over time"
          actions={
            <div className="flex overflow-hidden rounded-lg border border-base-700">
              {(["hour", "day"] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setBucket(option)}
                  className={`px-3 py-1 text-xs capitalize ${
                    bucket === option ? "bg-accent/20 text-accent-soft" : "text-slate-400"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          }
        >
          <EventsOverTimeChart data={timeseries.data ?? []} />
        </Card>

        <Card title="Session comparison" subtitle="Events, unique tracks and frames per session">
          <SessionComparisonChart data={sessions.data ?? []} />
        </Card>
      </div>
    </div>
  );
}
