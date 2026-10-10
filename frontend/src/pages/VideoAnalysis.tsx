import { useCallback, useState } from "react";
import { FileVideo } from "lucide-react";
import { Card } from "../components/Card";
import { EventTable } from "../components/EventTable";
import { PerformanceChart } from "../components/AnalyticsCharts";
import { SessionTable } from "../components/SessionTable";
import { UploadPanel } from "../components/UploadPanel";
import { useAsync, usePolling } from "../hooks/useApi";
import { api } from "../services/api";
import type { MetricPoint, UserSettings } from "../types";
import { formatDuration, formatNumber } from "../utils/format";

export function VideoAnalysis() {
  const settingsState = useAsync<UserSettings>(() => api.settings());
  const sessions = usePolling(() => api.sessions({ source_type: "video", limit: 15 }), 3000);
  const [selected, setSelected] = useState<string | null>(null);

  const metrics = usePolling(
    () => (selected ? api.sessionMetrics(selected) : Promise.resolve([])),
    5000,
    !!selected,
  );

  const handleFinished = useCallback(() => {
    void sessions.refresh?.();
  }, [sessions]);

  const selectedSession = sessions.data?.items.find((item) => item.id === selected) ?? null;

  return (
    <div className="space-y-5">
      <Card
        title="Upload a video for analysis"
        subtitle="Frames are processed incrementally — large files are never fully loaded into memory."
      >
        {settingsState.data ? (
          <UploadPanel settings={settingsState.data} onFinished={handleFinished} />
        ) : (
          <p className="py-6 text-center text-sm text-slate-500">Loading configuration…</p>
        )}
      </Card>

      <Card
        title="Video processing jobs"
        subtitle="Click a session to inspect its performance and detections"
        actions={<FileVideo size={15} className="text-slate-500" />}
      >
        <SessionTable
          sessions={sessions.data?.items ?? []}
          loading={sessions.loading}
          onSelect={(id) => setSelected(id)}
          onStop={async (id) => {
            await api.stopSession(id);
            sessions.refresh?.();
          }}
          onDelete={async (id) => {
            if (!window.confirm("Delete this session and its events?")) return;
            await api.deleteSession(id);
            if (selected === id) setSelected(null);
            sessions.refresh?.();
          }}
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
              <Detail label="Status" value={selectedSession.status} />
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
          </Card>

          <Card title="Performance over frames" subtitle="FPS and inference latency samples">
            <PerformanceChart data={(metrics.data as MetricPoint[]) ?? []} />
          </Card>

          <Card title="Detections for this session">
            <EventTable fixedSessionId={selected ?? undefined} pageSize={15} />
          </Card>
        </>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-base-700 bg-base-800/60 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="font-mono text-sm capitalize text-slate-200">{value}</dd>
    </div>
  );
}
