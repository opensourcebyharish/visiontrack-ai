// Typed client for the VisionTrack AI REST API.

import type {
  AnalyticsSummary,
  CameraInfo,
  ClassInfo,
  ClassStatistic,
  EventListResponse,
  HealthResponse,
  LiveMetrics,
  MetricPoint,
  ModelInfo,
  Session,
  SessionComparison,
  SessionListResponse,
  SystemInfo,
  TimeSeriesPoint,
  UploadResponse,
  UserSettings,
  UserSettingsUpdate,
  VideoStatusResponse,
} from "../types";

const configuredBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const API_BASE =
  configuredBase && configuredBase.length > 0
    ? configuredBase
    : import.meta.env.DEV
      ? "http://127.0.0.1:8000"
      : "";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function extractDetail(payload: unknown): string {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) =>
          typeof item === "object" && item && "msg" in item
            ? String((item as { msg: unknown }).msg)
            : JSON.stringify(item),
        )
        .join("; ");
    }
    return JSON.stringify(detail);
  }
  return "Unexpected server error";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      ...init,
    });
  } catch {
    throw new ApiError(
      `Cannot reach the backend at ${API_BASE || window.location.origin}. Is it running?`,
      0,
    );
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      detail = extractDetail(await response.json());
    } catch {
      /* keep status text */
    }
    throw new ApiError(detail, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const apiBase = API_BASE;

export const api = {
  baseUrl: API_BASE,

  health: () => request<HealthResponse>("/health"),
  systemInfo: () => request<SystemInfo>("/system/info"),

  models: () => request<ModelInfo[]>("/models"),
  modelClasses: (model?: string) =>
    request<{ model: string; classes: ClassInfo[] }>(
      `/models/classes${model ? `?model=${encodeURIComponent(model)}` : ""}`,
    ),

  cameras: (probe = true) => request<CameraInfo[]>(`/cameras?probe=${probe}`),

  sessions: (params: Record<string, string | number> = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ).toString();
    return request<SessionListResponse>(`/sessions${query ? `?${query}` : ""}`);
  },
  session: (id: string) => request<Session>(`/sessions/${id}`),
  liveMetrics: (id: string) => request<LiveMetrics>(`/sessions/${id}/live`),
  createSession: (body: Record<string, unknown>) =>
    request<Session>("/sessions", { method: "POST", body: JSON.stringify(body) }),
  stopSession: (id: string) =>
    request<Session>(`/sessions/${id}/stop`, { method: "POST" }),
  deleteSession: (id: string) =>
    request<{ deleted: boolean }>(`/sessions/${id}`, { method: "DELETE" }),

  uploadVideo: async (file: File, extra: Record<string, string> = {}) => {
    const form = new FormData();
    form.append("file", file);
    Object.entries(extra).forEach(([k, v]) => form.append(k, v));
    const response = await fetch(`${API_BASE}/api/videos/upload`, {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      let detail = response.statusText;
      try {
        detail = extractDetail(await response.json());
      } catch {
        /* ignore */
      }
      throw new ApiError(detail, response.status);
    }
    return (await response.json()) as UploadResponse;
  },
  videoStatus: (id: string) => request<VideoStatusResponse>(`/videos/${id}/status`),
  reprocessVideo: (id: string) =>
    request<VideoStatusResponse>(`/videos/${id}/process`, { method: "POST" }),
  downloadUrl: (id: string) => `${API_BASE}/api/videos/${id}/download`,

  events: (params: Record<string, string | number> = {}) => {
    const query = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== "" && v !== undefined && v !== null)
        .map(([k, v]) => [k, String(v)]),
    ).toString();
    return request<EventListResponse>(`/events${query ? `?${query}` : ""}`);
  },
  eventClasses: () => request<{ classes: string[] }>("/events/classes"),
  eventsExportUrl: (params: Record<string, string | number> = {}) => {
    const query = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== "" && v !== undefined && v !== null)
        .map(([k, v]) => [k, String(v)]),
    ).toString();
    return `${API_BASE}/api/events/export${query ? `?${query}` : ""}`;
  },

  analyticsSummary: () => request<AnalyticsSummary>("/analytics/summary"),
  analyticsClasses: (limit = 25) =>
    request<ClassStatistic[]>(`/analytics/classes?limit=${limit}`),
  analyticsTimeseries: (bucket: "hour" | "day" = "hour") =>
    request<TimeSeriesPoint[]>(`/analytics/timeseries?bucket=${bucket}`),
  analyticsSessions: (limit = 20) =>
    request<SessionComparison[]>(`/analytics/sessions?limit=${limit}`),
  sessionMetrics: (id: string, limit = 500) =>
    request<MetricPoint[]>(`/analytics/sessions/${id}/metrics?limit=${limit}`),

  settings: () => request<UserSettings>("/settings"),
  updateSettings: (patch: UserSettingsUpdate) =>
    request<UserSettings>("/settings", {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
  resetSettings: () => request<UserSettings>("/settings/reset", { method: "POST" }),
  cleanup: () => request<Record<string, number>>("/settings/cleanup", { method: "POST" }),

  streamUrl: (id: string) => `${API_BASE}/api/stream/${id}`,
  frameUrl: (id: string) => `${API_BASE}/api/stream/${id}/frame`,
};
