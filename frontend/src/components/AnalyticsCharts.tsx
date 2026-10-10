import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ClassStatistic, MetricPoint, SessionComparison, TimeSeriesPoint } from "../types";

const tooltipStyle = {
  backgroundColor: "rgba(13, 20, 34, 0.94)",
  border: "1px solid rgba(148, 163, 184, 0.2)",
  borderRadius: 10,
  color: "#e2e8f0",
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
};

// Append units to series tooltips so chart values are unambiguous.
const tooltipFormatter = (value: unknown, name: unknown): [string, string] => {
  const label = String(name);
  const suffix = label === "FPS" ? " fps" : label === "Inference (ms)" ? " ms" : "";
  return [`${String(value)}${suffix}`, label];
};

const legendStyle = { fontSize: 12, color: "#cbd5e1" };

export function ClassDistributionChart({ data }: { data: ClassStatistic[] }) {
  if (data.length === 0) {
    return <EmptyChart message="No class detections recorded yet." />;
  }
  const chartData = data.slice(0, 12).map((item) => ({
    name: item.class_name,
    events: item.event_count,
    tracks: item.unique_tracks,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
        <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={54} />
        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(148, 163, 184, 0.08)" }} formatter={tooltipFormatter} />
        <Legend wrapperStyle={legendStyle} iconSize={10} />
        <Bar dataKey="events" name="Events" fill="#22d3ee" radius={[4, 4, 0, 0]} />
        <Bar dataKey="tracks" name="Unique tracks" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EventsOverTimeChart({ data }: { data: TimeSeriesPoint[] }) {
  if (data.length === 0) {
    return <EmptyChart message="No events over time yet." />;
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
        <defs>
          <linearGradient id="eventsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
        <XAxis dataKey="bucket" tick={{ fill: "#94a3b8", fontSize: 10 }} minTickGap={16} />
        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
        <Area
          type="monotone"
          dataKey="events"
          name="Events"
          stroke="#22d3ee"
          fill="url(#eventsFill)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SessionComparisonChart({ data }: { data: SessionComparison[] }) {
  if (data.length === 0) {
    return <EmptyChart message="No sessions to compare yet." />;
  }
  const chartData = data
    .slice(0, 10)
    .reverse()
    .map((item) => ({
      name: item.name.length > 14 ? `${item.name.slice(0, 14)}…` : item.name,
      events: item.event_count,
      tracks: item.unique_tracks,
      frames: item.processed_frames,
    }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
        <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(148, 163, 184, 0.08)" }} formatter={tooltipFormatter} />
        <Legend wrapperStyle={legendStyle} iconSize={10} />
        <Bar dataKey="events" name="Events" fill="#22d3ee" radius={[4, 4, 0, 0]} />
        <Bar dataKey="tracks" name="Unique tracks" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="frames" name="Frames" fill="#f5a524" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PerformanceChart({ data }: { data: MetricPoint[] }) {
  if (data.length === 0) {
    return <EmptyChart message="No performance samples for this session yet." />;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
        <XAxis dataKey="frame_index" tick={{ fill: "#94a3b8", fontSize: 11 }} />
        <YAxis yAxisId="left" unit=" fps" tick={{ fill: "#94a3b8", fontSize: 11 }} />
        <YAxis
          yAxisId="right"
          orientation="right"
          unit=" ms"
          tick={{ fill: "#94a3b8", fontSize: 11 }}
        />
        <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
        <Legend wrapperStyle={legendStyle} iconSize={10} />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="fps"
          name="FPS"
          stroke="#31c48d"
          dot={false}
          strokeWidth={2}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="inference_ms"
          name="Inference (ms)"
          stroke="#f5a524"
          dot={false}
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="grid h-[220px] place-items-center rounded-lg border border-dashed border-base-700/60 text-sm text-ink-muted">
      {message}
    </div>
  );
}