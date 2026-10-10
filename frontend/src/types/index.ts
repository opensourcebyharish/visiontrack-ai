// Shared TypeScript types mirroring the FastAPI schemas.

export type SessionStatus =
  | "created"
  | "queued"
  | "running"
  | "completed"
  | "cancelled"
  | "stopped"
  | "failed";

export interface UserSettings {
  confidence: number;
  iou: number;
  imgsz: number;
  model: string;
  classes: number[] | null;
  tracking_enabled: boolean;
  device: "auto" | "cpu" | "cuda";
  tracker: string;
  frame_interval: number;
  max_upload_mb: number;
  event_logging_enabled: boolean;
  log_all_detections: boolean;
  event_sample_interval: number;
  min_event_confidence: number;
  jpeg_quality: number;
  stream_fps: number;
  default_camera_index: number;
  camera_width: number;
  camera_height: number;
  data_retention_days: number;
  line_crossing_enabled: boolean;
  line_orientation: "horizontal" | "vertical";
  line_position: number;
  line_direction: "both" | "positive" | "negative";
}

export type UserSettingsUpdate = Partial<UserSettings>;

export interface HealthResponse {
  status: string;
  app: string;
  version: string;
  database: string;
  model_loaded: boolean;
  uptime_s: number;
}

export interface SystemInfo {
  app: string;
  version: string;
  python_version: string;
  platform: string;
  processor: string;
  cpu_count: number | null;
  device: string;
  cuda_available: boolean;
  cuda_device_name: string | null;
  torch_version: string;
  opencv_version: string;
  ultralytics_version: string;
  default_model: string;
  data_dir: string;
  max_concurrent_jobs: number;
  active_sessions: number;
  details: Record<string, unknown>;
}

export interface ModelInfo {
  name: string;
  path: string;
  available: boolean;
  is_default: boolean;
}

export interface ClassInfo {
  id: number;
  name: string;
}

export interface CameraInfo {
  index: number;
  name: string;
  available: boolean;
  width: number | null;
  height: number | null;
  fps: number | null;
  backend: string | null;
}

export interface LiveMetrics {
  status: string;
  fps: number | null;
  inference_ms: number | null;
  object_count: number;
  frame_index: number;
  processed_frames: number;
  total_frames: number;
  unique_tracks: number;
  event_count: number;
  class_counts: Record<string, number>;
  line_counts: Record<string, number>;
  detections: DetectionItem[];
  error: string | null;
  message: string | null;
}

export interface DetectionItem {
  class_id: number;
  class_name: string;
  confidence: number;
  track_id: number | null;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Session {
  id: string;
  name: string;
  source_type: "webcam" | "video";
  status: SessionStatus;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  error: string | null;
  message: string | null;
  total_frames: number;
  processed_frames: number;
  unique_tracks: number;
  event_count: number;
  avg_fps: number | null;
  avg_inference_ms: number | null;
  progress: number;
  config: Partial<UserSettings> & Record<string, unknown>;
  source_meta: Record<string, unknown>;
  class_counts: Record<string, number>;
  output_available: boolean;
  stream_available: boolean;
  download_url: string | null;
  stream_url: string | null;
}

export interface SessionListResponse {
  items: Session[];
  total: number;
}

export interface EventItem {
  id: number;
  session_id: string;
  created_at: string;
  frame_index: number | null;
  video_time_s: number | null;
  class_id: number | null;
  class_name: string | null;
  confidence: number | null;
  track_id: number | null;
  x1: number | null;
  y1: number | null;
  x2: number | null;
  y2: number | null;
  source_type: string | null;
  event_type: string;
}

export interface EventListResponse {
  items: EventItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface AnalyticsSummary {
  total_sessions: number;
  total_events: number;
  total_detections: number;
  total_unique_tracks: number;
  total_processed_frames: number;
  total_video_seconds: number;
  unique_classes: number;
  avg_fps: number | null;
  avg_inference_ms: number | null;
  sessions_by_status: Record<string, number>;
  has_data: boolean;
}

export interface ClassStatistic {
  class_id: number | null;
  class_name: string;
  event_count: number;
  unique_tracks: number;
  avg_confidence: number | null;
}

export interface TimeSeriesPoint {
  bucket: string;
  events: number;
}

export interface SessionComparison {
  session_id: string;
  name: string;
  source_type: string;
  status: SessionStatus;
  created_at: string;
  processed_frames: number;
  unique_tracks: number;
  event_count: number;
  avg_fps: number | null;
  avg_inference_ms: number | null;
}

export interface MetricPoint {
  frame_index: number | null;
  created_at: string;
  fps: number | null;
  inference_ms: number | null;
  object_count: number | null;
}

export interface UploadResponse {
  video_id: string;
  session: Session;
  filename: string;
  size_bytes: number;
  metadata: Record<string, unknown>;
}

export interface VideoStatusResponse {
  session: Session;
  progress: number;
  output_available: boolean;
  download_url: string | null;
}
