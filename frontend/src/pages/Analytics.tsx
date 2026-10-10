import { useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, BarChart3, Boxes, Clock, Gauge, Hash, Layers, RefreshCw } from "lucide-react";
import { Card } from "../components/Card";
import {
  ClassDistributionChart,
  EventsOverTimeChart,
  SessionComparisonChart,
} from "../components/AnalyticsCharts";
import { MetricCard } from "../components/MetricCard";
import { StatusIndicator } from "../components/StatusIndicator";
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
  const summaryLoading = summary.loading && !summary.data;

  const sessionsByStatus = summary.data?.sessions_by_status ?? {};
  const completed = sessionsByStatus.completed ?? 0;
  const processing = (sessionsByStatus.running ?? 0) + (sessionsByStatus.queued ?? 0);
  const classCount = classes.data?.length ?? 0;

  let leadPills: ReactNode;
  if (hasData) {
    leadPills = (
      <>
        <StatusIndicator tone="violet" label={`${formatNumber(classCount)} class(es) detected`} />
        <StatusIndicator tone="green" label={`${formatNumber(completed)} completed`} />
        <StatusIndicator
          tone={processing > 0 ? "amber" : "slate"}
          label={processing > 0 ? `${formatNumber(processing)} processing` : "No active processing"}
          pulse={processing > 0}
        />
      </>
    );
  } else if (summary.error) {
    leadPills = <StatusIndicator tone="red" label="Data unavailable" />;
  } else {
    leadPills = (
      <StatusIndicator tone="slate" label={summaryLoading ? "Loading analytics…" : "No data yet"} />
    );
  }

  const lead = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-soft/80">
          Performance &amp; detection analytics
        </p>
        <h2 className="mt-1 text-xl font-semibold text-ink-primary">Analytics</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Live metrics, detection activity and per-class breakdowns derived from events actually
          stored in the local database.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{leadPills}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      {lead}

      {!hasData && summary.error && (
        <Card title="Analytics">
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <AlertCircle size={40} className="text-accent-red" />
            <p className="text-sm font-medium text-ink-primary">Couldn&apos;t load analytics</p>
            <p className="max-w-md text-xs text-ink-muted">{summary.error}</p>
            <button
              onClick={() => summary.refresh()}
              className="inline-flex items-center gap-2 rounded-lg border border-base-700/60 bg-space-800/70 px-3 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-white/5 hover:text-ink-primary"
            >
              <RefreshCw size={15} /> Retry
            </button>
          </div>
        </Card>
      )}

      {!hasData && !summary.error && summaryLoading && (
        <Card title="Analytics">
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <BarChart3 size={40} className="text-cyan-soft/40" />
            <p className="text-sm text-ink-muted">Loading analytics…</p>
          </div>
        </Card>
      )}

      {!hasData && !summary.error && !summaryLoading && (
        <Card title="Analytics">
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <BarChart3 size={40} className="text-ink-muted/60" />
            <p className="text-sm font-medium text-ink-primary">No analytics data yet</p>
            <p className="max-w-md text-xs text-ink-muted">
              Process a video or start a live capture. Charts are generated from detections actually
              stored in the local SQLite database.
            </p>
          </div>
        </Card>
      )}

      {hasData && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              label="Sessions"
              value={formatNumber(summary.data?.total_sessions ?? 0)}
              icon={Layers}
              accent="blue"
              hint={`${formatNumber(completed)} completed`}
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
              value={summary.data?.avg_fps != null ? formatDecimal(summary.data.avg_fps, 1) : "—"}
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
              accent="amber"
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
              subtitle="Detections recorded per time bucket"
              actions={
                <div
                  role="group"
                  aria-label="Time bucket"
                  className="flex overflow-hidden rounded-lg border border-base-700/60 bg-space-800/50 p-0.5"
                >
                  {(["hour", "day"] as const).map((option) => (
                    <button
                      key={option}
                      onClick={() => setBucket(option)}
                      aria-pressed={bucket === option}
                      className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/40 ${
                        bucket === option
                          ? "bg-cyan/15 text-cyan-soft"
                          : "text-ink-muted hover:text-ink-primary"
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
        </>
      )}
    </div>
  );
}