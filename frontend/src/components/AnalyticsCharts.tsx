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
  backgroundColor: "#141926",
  border: "1px solid #232b3e",
  borderRadius: 8,
  color: "#e2e8f0",
  fontSize: 12,
};

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
        <CartesianGrid strokeDasharray="3 3" stroke="#232b3e" />
        <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={54} />
        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#1a2030" }} />
        <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
        <Bar dataKey="events" name="Events" fill="#4f8cff" radius={[4, 4, 0, 0]} />
        <Bar dataKey="tracks" name="Unique tracks" fill="#31c48d" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EventsOverTimeChart({ data }: { data: TimeSeriesPoint[] }) {
  if (data.length === 0) {
    return <EmptyChart message="No events over time yet." />;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
        <defs>
          <linearGradient id="eventsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f8cff" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#4f8cff" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#232b3e" />
        <XAxis dataKey="bucket" tick={{ fill: "#94a3b8", fontSize: 10 }} />
        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Area
          type="monotone"
          dataKey="events"
          name="Events"
          stroke="#4f8cff"
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
        <CartesianGrid strokeDasharray="3 3" stroke="#232b3e" />
        <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#1a2030" }} />
        <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
        <Bar dataKey="events" name="Events" fill="#9b7bff" radius={[4, 4, 0, 0]} />
        <Bar dataKey="tracks" name="Unique tracks" fill="#31c48d" radius={[4, 4, 0, 0]} />
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
        <CartesianGrid strokeDasharray="3 3" stroke="#232b3e" />
        <XAxis dataKey="frame_index" tick={{ fill: "#94a3b8", fontSize: 11 }} />
        <YAxis yAxisId="left" tick={{ fill: "#94a3b8", fontSize: 11 }} />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fill: "#94a3b8", fontSize: 11 }}
        />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
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
    <div className="grid h-[220px] place-items-center rounded-lg border border-dashed border-base-700 text-sm text-slate-500">
      {message}
    </div>
  );
}
